import config from '../../../config/index.js';
import { BaseTransportProvider } from '../interface.js';
import { httpFetch } from '../httpClient.js';
import { ProviderError } from '../errors.js';

/**
 * Road Transport Provider (Driving Routing Adapter)
 * Connects to Open Source Routing Machine (OSRM) or configured road routing engine.
 *
 * Translates origin/destination geographic coordinates into driving routes,
 * distances, travel durations, and transit cost estimates.
 */
export class RoadTransportProvider extends BaseTransportProvider {
  constructor(options = {}) {
    super({
      name: 'Road Routing Provider (OSRM)',
      code: 'OSRM',
      mode: 'road',
      enabled: options.enabled ?? config.providers.road.enabled,
      timeoutMs: options.timeoutMs ?? config.providers.road.timeoutMs,
    });
    this.apiUrl =
      options.apiUrl || config.providers.road.apiUrl || 'https://router.project-osrm.org';
    this.apiKey = options.apiKey || config.providers.road.apiKey || null;
    this.fetchFn = options.fetchFn || globalThis.fetch;
  }

  /**
   * Extracts [longitude, latitude] coordinates from a canonical location object.
   */
  extractCoordinates(loc) {
    if (!loc) return null;
    if (Array.isArray(loc.coordinates) && loc.coordinates.length === 2) {
      return loc.coordinates;
    }
    if (
      loc.location &&
      Array.isArray(loc.location.coordinates) &&
      loc.location.coordinates.length === 2
    ) {
      return loc.location.coordinates;
    }
    if (typeof loc.longitude === 'number' && typeof loc.latitude === 'number') {
      return [loc.longitude, loc.latitude];
    }
    return null;
  }

  /**
   * Validates OSRM driving response structure.
   */
  validateResponse(rawResponse) {
    super.validateResponse(rawResponse);

    if (rawResponse.code !== 'Ok' && rawResponse.code !== 'NoRoute') {
      throw new ProviderError(
        `Road provider returned error code: ${rawResponse.code || 'UNKNOWN'}`,
        {
          provider: 'road',
          code: 'PROVIDER_MALFORMED_RESPONSE',
          statusCode: 502,
          retryable: false,
          details: rawResponse,
        }
      );
    }

    if (
      rawResponse.code === 'Ok' &&
      (!Array.isArray(rawResponse.routes) || rawResponse.routes.length === 0)
    ) {
      throw new ProviderError('Road provider response missing routes array.', {
        provider: 'road',
        code: 'PROVIDER_MALFORMED_RESPONSE',
        statusCode: 502,
        retryable: false,
      });
    }
  }

  /**
   * Searches for driving route candidates between origin and destination.
   *
   * @param {Object} request
   * @param {Object} [options]
   * @returns {Promise<Object>} Common Provider Result Envelope
   */
  async search(request, options = {}) {
    if (!this.isEnabled()) {
      return this.unavailable('Road provider is disabled in configuration');
    }

    const { origin, destination, departureDate } = request || {};
    const fetchFn = options.fetchFn || this.fetchFn;

    const originCoords = this.extractCoordinates(origin);
    const destCoords = this.extractCoordinates(destination);

    if (!originCoords || !destCoords) {
      return this.empty(
        { reason: 'Missing geographic coordinates on origin or destination' },
        { originHasCoords: Boolean(originCoords), destHasCoords: Boolean(destCoords) }
      );
    }

    const [lon1, lat1] = originCoords;
    const [lon2, lat2] = destCoords;

    if (!options.mockData && !options.fetchFn && process.env.NODE_ENV === 'test') {
      return this.unavailable('Road live routing service disabled in offline test suite');
    }

    const endpointUrl = `${this.apiUrl.replace(/\/$/, '')}/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false&steps=false`;

    const startTime = Date.now();
    let rawResponse = null;

    try {
      if (options.mockData) {
        rawResponse = options.mockData;
      } else {
        const headers = { Accept: 'application/json' };
        if (this.apiKey) {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        const res = await httpFetch(endpointUrl, {
          method: 'GET',
          headers,
          timeoutMs: options.timeoutMs || this.timeoutMs,
          provider: 'road',
          fetchFn,
        });

        rawResponse = res.data;
      }
      this.validateResponse(rawResponse);

      if (
        rawResponse.code === 'NoRoute' ||
        !rawResponse.routes ||
        rawResponse.routes.length === 0
      ) {
        return this.empty(rawResponse, { durationMs: Date.now() - startTime });
      }

      const primaryRoute = rawResponse.routes[0];
      const durationMinutes = Math.max(1, Math.round((primaryRoute.duration || 0) / 60));
      const distanceKm = Math.max(1, Math.round((primaryRoute.distance || 0) / 1000));

      // Calculate departure and arrival timestamps
      const depDate =
        departureDate instanceof Date ? departureDate : new Date(departureDate || Date.now());
      const baseDepTime = !isNaN(depDate.getTime()) ? depDate : new Date();
      // Default to 08:00 AM on departure date if hour is 00:00
      const depYear = baseDepTime.getUTCFullYear();
      const depMonth = baseDepTime.getUTCMonth();
      const depDay = baseDepTime.getUTCDate();
      const depTime = new Date(Date.UTC(depYear, depMonth, depDay, 8, 0, 0));
      const arrTime = new Date(depTime.getTime() + durationMinutes * 60000);

      // Estimated road transit cost (approx. INR 12 per km base taxi / fuel rate)
      const estimatedPrice = Math.max(100, Math.round(distanceKm * 12));

      const candidate = {
        origin: origin.id || origin._id,
        destination: destination.id || destination._id,
        departureTime: depTime,
        arrivalTime: arrTime,
        duration: durationMinutes,
        totalDistance: distanceKm,
        totalPrice: estimatedPrice,
        currency: 'INR',
        numberOfTransfers: 0,
        transportModes: ['road'],
        status: 'scheduled',
        source: 'road',
        providerCode: this.code,
        metadata: {
          source: 'road',
          isMock: false,
          provider: this.name,
          routingEngine: 'OSRM Driving',
        },
        legs: [
          {
            sequence: 1,
            origin: origin.id || origin._id,
            destination: destination.id || destination._id,
            mode: 'road',
            providerCode: this.code,
            departureTime: depTime,
            arrivalTime: arrTime,
            duration: durationMinutes,
            distance: distanceKm,
            price: estimatedPrice,
            currency: 'INR',
            vehicle: {
              type: 'Car / Cab',
              identifier: 'Road Transit',
            },
            service: {
              name: 'Highway Driving Route',
              operator: 'Road Transit Service',
              class: 'Standard',
            },
            booking: {
              status: 'available',
              reference: 'ROAD-DIRECT',
            },
            metadata: {
              weight: primaryRoute.weight,
            },
          },
        ],
      };

      return this.success([candidate], rawResponse, {
        durationMs: Date.now() - startTime,
        distanceKm,
        durationMinutes,
      });
    } catch (err) {
      if (err instanceof ProviderError) {
        return this.failed(err, rawResponse, { durationMs: Date.now() - startTime });
      }
      return this.failed(
        new ProviderError(err.message, {
          provider: 'road',
          code: 'PROVIDER_ERROR',
          statusCode: 500,
        }),
        rawResponse,
        { durationMs: Date.now() - startTime }
      );
    }
  }
}

export const roadTransportProvider = new RoadTransportProvider();
export default roadTransportProvider;
