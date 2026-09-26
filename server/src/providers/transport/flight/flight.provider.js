import config from '../../../config/index.js';
import { BaseTransportProvider } from '../interface.js';
import { httpFetch } from '../httpClient.js';
import { ProviderError } from '../errors.js';

/**
 * Flight Transport Provider Adapter
 * Connects to commercial flight search gateways (e.g. Amadeus, IndiGo, Aviation API).
 *
 * Owns:
 * - Flight API authentication & headers
 * - IATA/City query parameter translation
 * - Response schema validation & flight schedule verification
 * - Fare extraction and leg formatting
 */
export class FlightTransportProvider extends BaseTransportProvider {
  constructor(options = {}) {
    super({
      name: 'Commercial Aviation Provider (Flight GDS)',
      code: 'FLIGHT-GDS',
      mode: 'flight',
      enabled: options.enabled ?? config.providers.flight.enabled,
      timeoutMs: options.timeoutMs ?? config.providers.flight.timeoutMs,
    });
    this.apiUrl = options.apiUrl || config.providers.flight.apiUrl || null;
    this.apiKey = options.apiKey || config.providers.flight.apiKey || null;
    this.fetchFn = options.fetchFn || globalThis.fetch;
  }

  /**
   * Validates external flight API response structure.
   */
  validateResponse(rawResponse) {
    super.validateResponse(rawResponse);

    // Accept either { flights: [...] }, { itineraries: [...] }, { data: [...] }, or direct array
    const flightList = Array.isArray(rawResponse)
      ? rawResponse
      : Array.isArray(rawResponse.flights)
        ? rawResponse.flights
        : Array.isArray(rawResponse.itineraries)
          ? rawResponse.itineraries
          : Array.isArray(rawResponse.data)
            ? rawResponse.data
            : null;

    if (!flightList) {
      throw new ProviderError('Flight provider returned payload missing flight schedule records.', {
        provider: 'flight',
        code: 'PROVIDER_MALFORMED_RESPONSE',
        statusCode: 502,
        retryable: false,
        details: rawResponse,
      });
    }

    // Validate structure of individual flight items
    for (let i = 0; i < flightList.length; i++) {
      const flight = flightList[i];
      if (!flight.flightNumber && !flight.number && !flight.id && !flight.code) {
        throw new ProviderError(`Flight item at index ${i} missing flight identifier.`, {
          provider: 'flight',
          code: 'PROVIDER_MALFORMED_RESPONSE',
          statusCode: 502,
          retryable: false,
        });
      }
      if (!flight.departureTime || !flight.arrivalTime) {
        throw new ProviderError(`Flight item at index ${i} missing schedule timestamps.`, {
          provider: 'flight',
          code: 'PROVIDER_MALFORMED_RESPONSE',
          statusCode: 502,
          retryable: false,
        });
      }
    }
  }

  /**
   * Searches for flights matching the origin and destination.
   *
   * @param {Object} request
   * @param {Object} [options]
   * @returns {Promise<Object>} Common Provider Result Envelope
   */
  async search(request, options = {}) {
    if (!this.isEnabled()) {
      return this.unavailable('Flight provider is disabled in configuration');
    }

    const apiUrl = options.apiUrl || this.apiUrl;
    const apiKey = options.apiKey || this.apiKey;
    const fetchFn = options.fetchFn || this.fetchFn;

    // Check if external API credentials exist
    if (!apiUrl && !options.mockData) {
      return this.unavailable(
        'Flight provider is not configured. Set FLIGHT_API_URL and FLIGHT_API_KEY environment variables.'
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
          origin: fromCity,
          destination: toCity,
          departureDate: travelDateStr,
          adults: String(passengers || 1),
        });

        const headers = { Accept: 'application/json' };
        if (apiKey) {
          headers.Authorization = `Bearer ${apiKey}`;
        }

        const endpointUrl = `${apiUrl.replace(/\/$/, '')}/flights/search?${queryParams.toString()}`;

        const res = await httpFetch(endpointUrl, {
          method: 'GET',
          headers,
          timeoutMs: options.timeoutMs || this.timeoutMs,
          provider: 'flight',
          fetchFn,
        });
        rawResponse = res.data;
      }

      this.validateResponse(rawResponse);

      const flightList = Array.isArray(rawResponse)
        ? rawResponse
        : rawResponse.flights || rawResponse.itineraries || rawResponse.data || [];

      if (flightList.length === 0) {
        return this.empty(rawResponse, { durationMs: Date.now() - startTime });
      }

      // Convert valid flight items into provider candidates
      const candidates = [];
      const parsedDepDate = departureDate instanceof Date ? departureDate : new Date(departureDate);
      const year = !isNaN(parsedDepDate.getTime()) ? parsedDepDate.getUTCFullYear() : 2026;
      const month = !isNaN(parsedDepDate.getTime()) ? parsedDepDate.getUTCMonth() : 9;
      const day = !isNaN(parsedDepDate.getTime()) ? parsedDepDate.getUTCDate() : 1;

      for (const item of flightList) {
        const flightNumber = String(
          item.flightNumber || item.number || item.code || item.id || '6E-101'
        );
        const airline = item.airline || item.operator || 'National Air';
        const cabinClass = item.cabinClass || item.class || 'Economy';

        // Parse timestamps (either ISO date strings or HH:mm time of day)
        let depTime;
        let arrTime;

        if (item.departureTime.includes('T')) {
          depTime = new Date(item.departureTime);
        } else {
          const [dHour, dMin] = item.departureTime.split(':').map((n) => parseInt(n, 10));
          depTime = new Date(Date.UTC(year, month, day, dHour || 9, dMin || 0, 0));
        }

        if (item.arrivalTime.includes('T')) {
          arrTime = new Date(item.arrivalTime);
        } else {
          const [aHour, aMin] = item.arrivalTime.split(':').map((n) => parseInt(n, 10));
          const dayOffset = (aHour || 0) < (depTime.getUTCHours() || 0) ? 1 : 0;
          arrTime = new Date(Date.UTC(year, month, day + dayOffset, aHour || 11, aMin || 0, 0));
        }

        const durationMinutes = Math.max(
          1,
          Math.round((arrTime.getTime() - depTime.getTime()) / 60000)
        );
        const distanceKm = Number(item.distance) || 850;
        const baseFare = Number(item.price || item.fare) || 4500;
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
          numberOfTransfers: Number(item.stops || 0),
          transportModes: ['flight'],
          status: 'scheduled',
          source: 'flight',
          providerCode: this.code,
          metadata: {
            source: 'flight',
            provider: this.name,
            flightNumber,
            airline,
            aircraft: item.aircraft || 'Airbus A320',
          },
          legs: [
            {
              sequence: 1,
              origin: origin.id || origin._id,
              destination: destination.id || destination._id,
              mode: 'flight',
              providerCode: this.code,
              departureTime: depTime,
              arrivalTime: arrTime,
              duration: durationMinutes,
              distance: distanceKm,
              price: totalFare,
              currency: (item.currency || 'INR').toUpperCase(),
              vehicle: {
                type: 'Flight',
                identifier: flightNumber,
              },
              service: {
                name: `${airline} ${flightNumber}`,
                operator: airline,
                class: cabinClass,
              },
              booking: {
                status: item.bookingStatus || 'available',
                reference: item.bookingCode || `PNR-${flightNumber}`,
              },
              metadata: {
                terminal: item.terminal || 'T3',
                gate: item.gate || null,
                baggage: item.baggage || '15kg check-in, 7kg cabin',
              },
            },
          ],
        });
      }

      return this.success(candidates, rawResponse, {
        durationMs: Date.now() - startTime,
        flightCount: candidates.length,
      });
    } catch (err) {
      if (err instanceof ProviderError) {
        return this.failed(err, rawResponse, { durationMs: Date.now() - startTime });
      }
      return this.failed(
        new ProviderError(err.message, {
          provider: 'flight',
          code: 'PROVIDER_ERROR',
          statusCode: 500,
        }),
        rawResponse,
        { durationMs: Date.now() - startTime }
      );
    }
  }
}

export const flightTransportProvider = new FlightTransportProvider();
export default flightTransportProvider;
