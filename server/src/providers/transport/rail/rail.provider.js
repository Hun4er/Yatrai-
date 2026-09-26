import config from '../../../config/index.js';
import { BaseTransportProvider } from '../interface.js';
import { httpFetch } from '../httpClient.js';
import { ProviderError } from '../errors.js';

/**
 * Rail Transport Provider Adapter
 * Connects to Indian Railways / IRCTC or configured external rail scheduling gateway.
 *
 * Owns:
 * - Rail API authentication & headers
 * - Station query parameter translation
 * - Response schema validation & timing verification
 * - Fare extraction and leg formatting
 */
export class RailTransportProvider extends BaseTransportProvider {
  constructor(options = {}) {
    super({
      name: 'Indian Railways Provider (IRCTC)',
      code: 'IRCTC',
      mode: 'rail',
      enabled: options.enabled ?? config.providers.rail.enabled,
      timeoutMs: options.timeoutMs ?? config.providers.rail.timeoutMs,
    });
    this.apiUrl = options.apiUrl || config.providers.rail.apiUrl || null;
    this.apiKey = options.apiKey || config.providers.rail.apiKey || null;
    this.fetchFn = options.fetchFn || globalThis.fetch;
  }

  /**
   * Validates external rail API response structure.
   */
  validateResponse(rawResponse) {
    super.validateResponse(rawResponse);

    // Accept either { trains: [...] } or direct array
    const trains = Array.isArray(rawResponse)
      ? rawResponse
      : Array.isArray(rawResponse.trains)
        ? rawResponse.trains
        : Array.isArray(rawResponse.data)
          ? rawResponse.data
          : null;

    if (!trains) {
      throw new ProviderError('Rail provider returned payload missing train schedule records.', {
        provider: 'rail',
        code: 'PROVIDER_MALFORMED_RESPONSE',
        statusCode: 502,
        retryable: false,
        details: rawResponse,
      });
    }

    // Validate structure of individual train items
    for (let i = 0; i < trains.length; i++) {
      const train = trains[i];
      if (!train.trainNumber && !train.number && !train.id) {
        throw new ProviderError(`Rail item at index ${i} missing train identifier.`, {
          provider: 'rail',
          code: 'PROVIDER_MALFORMED_RESPONSE',
          statusCode: 502,
          retryable: false,
        });
      }
      if (!train.departureTime || !train.arrivalTime) {
        throw new ProviderError(`Rail item at index ${i} missing schedule timestamps.`, {
          provider: 'rail',
          code: 'PROVIDER_MALFORMED_RESPONSE',
          statusCode: 502,
          retryable: false,
        });
      }
    }
  }

  /**
   * Searches for train routes matching the origin and destination.
   *
   * @param {Object} request
   * @param {Object} [options]
   * @returns {Promise<Object>} Common Provider Result Envelope
   */
  async search(request, options = {}) {
    if (!this.isEnabled()) {
      return this.unavailable('Rail provider is disabled in configuration');
    }

    const apiUrl = options.apiUrl || this.apiUrl;
    const apiKey = options.apiKey || this.apiKey;
    const fetchFn = options.fetchFn || this.fetchFn;

    // Check if external API credentials exist
    if (!apiUrl && !options.mockData) {
      return this.unavailable(
        'Rail provider is not configured. Set RAIL_API_URL and RAIL_API_KEY environment variables.'
      );
    }

    const { origin, destination, departureDate, passengers = 1 } = request || {};
    const fromStation = origin.name || origin.city || 'ORIGIN';
    const toStation = destination.name || destination.city || 'DESTINATION';
    const travelDateStr =
      departureDate instanceof Date
        ? departureDate.toISOString().slice(0, 10)
        : String(departureDate || '').slice(0, 10);

    const startTime = Date.now();
    let rawResponse = null;

    try {
      if (options.mockData) {
        rawResponse = options.mockData;
      } else {
        const queryParams = new URLSearchParams({
          from: fromStation,
          to: toStation,
          date: travelDateStr,
        });

        const headers = { Accept: 'application/json' };
        if (apiKey) {
          headers['X-API-Key'] = apiKey;
        }

        const endpointUrl = `${apiUrl.replace(/\/$/, '')}/trains/between-stations?${queryParams.toString()}`;

        const res = await httpFetch(endpointUrl, {
          method: 'GET',
          headers,
          timeoutMs: options.timeoutMs || this.timeoutMs,
          provider: 'rail',
          fetchFn,
        });
        rawResponse = res.data;
      }

      this.validateResponse(rawResponse);

      const trainList = Array.isArray(rawResponse)
        ? rawResponse
        : rawResponse.trains || rawResponse.data || [];

      if (trainList.length === 0) {
        return this.empty(rawResponse, { durationMs: Date.now() - startTime });
      }

      // Convert valid train items into provider candidates
      const candidates = [];
      const parsedDepDate = departureDate instanceof Date ? departureDate : new Date(departureDate);
      const year = !isNaN(parsedDepDate.getTime()) ? parsedDepDate.getUTCFullYear() : 2026;
      const month = !isNaN(parsedDepDate.getTime()) ? parsedDepDate.getUTCMonth() : 9;
      const day = !isNaN(parsedDepDate.getTime()) ? parsedDepDate.getUTCDate() : 1;

      for (const item of trainList) {
        const trainNum = String(item.trainNumber || item.number || '12001');
        const trainName = item.trainName || item.name || 'Express Train';

        // Parse timestamps (either ISO date strings or HH:mm time of day)
        let depTime;
        let arrTime;

        if (item.departureTime.includes('T')) {
          depTime = new Date(item.departureTime);
        } else {
          const [dHour, dMin] = item.departureTime.split(':').map((n) => parseInt(n, 10));
          depTime = new Date(Date.UTC(year, month, day, dHour || 6, dMin || 0, 0));
        }

        if (item.arrivalTime.includes('T')) {
          arrTime = new Date(item.arrivalTime);
        } else {
          const [aHour, aMin] = item.arrivalTime.split(':').map((n) => parseInt(n, 10));
          // If arrival hour < departure hour, train arrives next calendar day
          const dayOffset = (aHour || 0) < (depTime.getUTCHours() || 0) ? 1 : 0;
          arrTime = new Date(Date.UTC(year, month, day + dayOffset, aHour || 14, aMin || 0, 0));
        }

        const durationMinutes = Math.max(
          1,
          Math.round((arrTime.getTime() - depTime.getTime()) / 60000)
        );
        const distanceKm = Number(item.distance) || 750;
        const baseFare = Number(item.price || item.fare) || 1250;
        const totalFare = baseFare * Number(passengers || 1);

        candidates.push({
          origin: origin.id || origin._id,
          destination: destination.id || destination._id,
          departureTime: depTime,
          arrivalTime: arrTime,
          duration: durationMinutes,
          totalDistance: distanceKm,
          totalPrice: totalFare,
          currency: (item.currency || 'INR').toUpperCase(),
          numberOfTransfers: 0,
          transportModes: ['rail'],
          status: 'scheduled',
          source: 'rail',
          providerCode: this.code,
          metadata: {
            source: 'rail',
            provider: this.name,
            trainNumber: trainNum,
            trainName: trainName,
          },
          legs: [
            {
              sequence: 1,
              origin: origin.id || origin._id,
              destination: destination.id || destination._id,
              mode: 'rail',
              providerCode: this.code,
              departureTime: depTime,
              arrivalTime: arrTime,
              duration: durationMinutes,
              distance: distanceKm,
              price: totalFare,
              currency: (item.currency || 'INR').toUpperCase(),
              vehicle: {
                type: 'Train',
                identifier: trainNum,
              },
              service: {
                name: trainName,
                operator: item.operator || 'Indian Railways',
                class: item.class || '3A',
              },
              booking: {
                status: item.bookingStatus || 'available',
                reference: item.pnr || `IRCTC-${trainNum}`,
              },
              metadata: {
                classes: item.classes || ['SL', '3A', '2A'],
              },
            },
          ],
        });
      }

      return this.success(candidates, rawResponse, {
        durationMs: Date.now() - startTime,
        trainCount: candidates.length,
      });
    } catch (err) {
      if (err instanceof ProviderError) {
        return this.failed(err, rawResponse, { durationMs: Date.now() - startTime });
      }
      return this.failed(
        new ProviderError(err.message, {
          provider: 'rail',
          code: 'PROVIDER_ERROR',
          statusCode: 500,
        }),
        rawResponse,
        { durationMs: Date.now() - startTime }
      );
    }
  }
}

export const railTransportProvider = new RailTransportProvider();
export default railTransportProvider;
