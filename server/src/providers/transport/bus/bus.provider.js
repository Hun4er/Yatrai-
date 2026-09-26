import config from '../../../config/index.js';
import { BaseTransportProvider } from '../interface.js';
import { httpFetch } from '../httpClient.js';
import { ProviderError } from '../errors.js';

/**
 * Bus Transport Provider Adapter
 * Connects to intercity bus ticketing gateways (e.g. RedBus / State Road Transport).
 *
 * Owns:
 * - Bus API authentication & headers
 * - City / terminal query formatting
 * - Response schema validation & timing verification
 * - Fare extraction and leg formatting
 */
export class BusTransportProvider extends BaseTransportProvider {
  constructor(options = {}) {
    super({
      name: 'Intercity Bus Provider (RedBus / State Roadways)',
      code: 'REDBUS',
      mode: 'bus',
      enabled: options.enabled ?? config.providers.bus.enabled,
      timeoutMs: options.timeoutMs ?? config.providers.bus.timeoutMs,
    });
    this.apiUrl = options.apiUrl || config.providers.bus.apiUrl || null;
    this.apiKey = options.apiKey || config.providers.bus.apiKey || null;
    this.fetchFn = options.fetchFn || globalThis.fetch;
  }

  /**
   * Validates external bus API response structure.
   */
  validateResponse(rawResponse) {
    super.validateResponse(rawResponse);

    const busList = Array.isArray(rawResponse)
      ? rawResponse
      : Array.isArray(rawResponse.buses)
        ? rawResponse.buses
        : Array.isArray(rawResponse.data)
          ? rawResponse.data
          : null;

    if (!busList) {
      throw new ProviderError('Bus provider returned payload missing bus schedule records.', {
        provider: 'bus',
        code: 'PROVIDER_MALFORMED_RESPONSE',
        statusCode: 502,
        retryable: false,
        details: rawResponse,
      });
    }

    for (let i = 0; i < busList.length; i++) {
      const bus = busList[i];
      if (!bus.operator && !bus.operatorName && !bus.serviceName) {
        throw new ProviderError(`Bus item at index ${i} missing operator name.`, {
          provider: 'bus',
          code: 'PROVIDER_MALFORMED_RESPONSE',
          statusCode: 502,
          retryable: false,
        });
      }
      if (!bus.departureTime || !bus.arrivalTime) {
        throw new ProviderError(`Bus item at index ${i} missing schedule timestamps.`, {
          provider: 'bus',
          code: 'PROVIDER_MALFORMED_RESPONSE',
          statusCode: 502,
          retryable: false,
        });
      }
    }
  }

  /**
   * Searches for bus routes matching origin and destination.
   *
   * @param {Object} request
   * @param {Object} [options]
   * @returns {Promise<Object>} Common Provider Result Envelope
   */
  async search(request, options = {}) {
    if (!this.isEnabled()) {
      return this.unavailable('Bus provider is disabled in configuration');
    }

    const apiUrl = options.apiUrl || this.apiUrl;
    const apiKey = options.apiKey || this.apiKey;
    const fetchFn = options.fetchFn || this.fetchFn;

    if (!apiUrl && !options.mockData) {
      return this.unavailable(
        'Bus provider is not configured. Set BUS_API_URL and BUS_API_KEY environment variables.'
      );
    }

    const { origin, destination, departureDate, passengers = 1 } = request || {};
    const fromCity = origin.city || origin.name || 'ORIGIN';
    const toCity = destination.city || destination.name || 'DESTINATION';
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
          from: fromCity,
          to: toCity,
          date: travelDateStr,
        });

        const headers = { Accept: 'application/json' };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const endpointUrl = `${apiUrl.replace(/\/$/, '')}/buses/search?${queryParams.toString()}`;

        const res = await httpFetch(endpointUrl, {
          method: 'GET',
          headers,
          timeoutMs: options.timeoutMs || this.timeoutMs,
          provider: 'bus',
          fetchFn,
        });
        rawResponse = res.data;
      }

      this.validateResponse(rawResponse);

      const busList = Array.isArray(rawResponse)
        ? rawResponse
        : rawResponse.buses || rawResponse.data || [];

      if (busList.length === 0) {
        return this.empty(rawResponse, { durationMs: Date.now() - startTime });
      }

      const candidates = [];
      const parsedDepDate = departureDate instanceof Date ? departureDate : new Date(departureDate);
      const year = !isNaN(parsedDepDate.getTime()) ? parsedDepDate.getUTCFullYear() : 2026;
      const month = !isNaN(parsedDepDate.getTime()) ? parsedDepDate.getUTCMonth() : 9;
      const day = !isNaN(parsedDepDate.getTime()) ? parsedDepDate.getUTCDate() : 1;

      for (const item of busList) {
        const operatorName = item.operator || item.operatorName || 'Intercity Bus Service';
        const busType = item.busType || item.type || 'AC Semi-Sleeper';

        let depTime;
        let arrTime;

        if (item.departureTime.includes('T')) {
          depTime = new Date(item.departureTime);
        } else {
          const [dHour, dMin] = item.departureTime.split(':').map((n) => parseInt(n, 10));
          depTime = new Date(Date.UTC(year, month, day, dHour || 18, dMin || 0, 0));
        }

        if (item.arrivalTime.includes('T')) {
          arrTime = new Date(item.arrivalTime);
        } else {
          const [aHour, aMin] = item.arrivalTime.split(':').map((n) => parseInt(n, 10));
          const dayOffset = (aHour || 0) < (depTime.getUTCHours() || 0) ? 1 : 0;
          arrTime = new Date(Date.UTC(year, month, day + dayOffset, aHour || 6, aMin || 0, 0));
        }

        const durationMinutes = Math.max(
          1,
          Math.round((arrTime.getTime() - depTime.getTime()) / 60000)
        );
        const distanceKm = Number(item.distance) || 450;
        const baseFare = Number(item.price || item.fare) || 850;
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
          transportModes: ['bus'],
          status: 'scheduled',
          source: 'bus',
          providerCode: this.code,
          metadata: {
            source: 'bus',
            provider: this.name,
            operator: operatorName,
            busType,
          },
          legs: [
            {
              sequence: 1,
              origin: origin.id || origin._id,
              destination: destination.id || destination._id,
              mode: 'bus',
              providerCode: this.code,
              departureTime: depTime,
              arrivalTime: arrTime,
              duration: durationMinutes,
              distance: distanceKm,
              price: totalFare,
              currency: (item.currency || 'INR').toUpperCase(),
              vehicle: {
                type: 'Bus',
                identifier: item.busNumber || operatorName,
              },
              service: {
                name: operatorName,
                operator: operatorName,
                class: busType,
              },
              booking: {
                status: item.availableSeats ? 'available' : 'unknown',
                reference: item.id || `BUS-${Date.now()}`,
              },
              metadata: {
                amenities: item.amenities || ['Water', 'Charging Point'],
              },
            },
          ],
        });
      }

      return this.success(candidates, rawResponse, {
        durationMs: Date.now() - startTime,
        busCount: candidates.length,
      });
    } catch (err) {
      if (err instanceof ProviderError) {
        return this.failed(err, rawResponse, { durationMs: Date.now() - startTime });
      }
      return this.failed(
        new ProviderError(err.message, {
          provider: 'bus',
          code: 'PROVIDER_ERROR',
          statusCode: 500,
        }),
        rawResponse,
        { durationMs: Date.now() - startTime }
      );
    }
  }
}

export const busTransportProvider = new BusTransportProvider();
export default busTransportProvider;
