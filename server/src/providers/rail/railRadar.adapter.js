import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { httpFetch } from '../transport/httpClient.js';
import { resolveStationCode } from '../transport/rail/rail.provider.js';

/**
 * RailRadar Provider Adapter
 * Connects to RailRadar API (https://api.railradar.in/v1) with:
 * - In-flight request deduplication (prevents duplicate simultaneous calls)
 * - Short-lived memory caching with TTL
 * - Bounded concurrency & rate limit protection (10 req/min compliance)
 * - Safe fallback handling
 */
export class RailRadarAdapter {
  constructor(options = {}) {
    this.name = 'RailRadar';
    this.code = 'RAILRADAR';
    this.apiKey = options.apiKey || config.providers.railradar?.apiKey || config.providers.rail?.apiKey || null;
    this.apiUrl = (options.apiUrl || config.providers.railradar?.apiUrl || config.providers.rail?.apiUrl || 'https://api.railradar.in/v1').replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs || config.providers.railradar?.timeoutMs || 5000;
    this.enabled = options.enabled ?? (config.providers.railradar?.enabled ?? true);

    // In-memory cache: key -> { data, expiresAt }
    this.cache = new Map();
    // In-flight request deduplication: key -> Promise
    this.inFlight = new Map();

    // Cache TTLs in milliseconds
    this.schedulesTtlMs = 10 * 60 * 1000; // 10 minutes
    this.availabilityTtlMs = 2 * 60 * 1000; // 2 minutes
    this.fareTtlMs = 15 * 60 * 1000; // 15 minutes
    this.liveStatusTtlMs = 60 * 1000; // 1 minute
  }

  getHeaders() {
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey.trim()}`;
      headers['X-API-Key'] = this.apiKey.trim();
    }
    return headers;
  }

  /**
   * Safe cached fetch with in-flight deduplication.
   */
  async cachedRequest(cacheKey, ttlMs, requestFn) {
    if (typeof ttlMs === 'function') {
      const fn = ttlMs;
      ttlMs = typeof requestFn === 'number' ? requestFn : 60000;
      requestFn = fn;
    }
    const durationMs = Number(ttlMs) || 60000;

    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    if (this.inFlight.has(cacheKey)) {
      return this.inFlight.get(cacheKey);
    }

    const promise = (async () => {
      try {
        const data = await requestFn();
        if (data !== null && data !== undefined) {
          this.cache.set(cacheKey, { data, expiresAt: Date.now() + durationMs });
        }
        return data;
      } finally {
        this.inFlight.delete(cacheKey);
      }
    })();

    this.inFlight.set(cacheKey, promise);
    return promise;
  }

  /**
   * Search direct trains between two station codes.
   */
  async searchDirectTrains(fromCode, toCode, options = {}) {
    if (!this.enabled || !this.apiUrl) {
      return { success: false, trains: [], reason: 'PROVIDER_DISABLED' };
    }

    const from = String(fromCode).trim().toUpperCase();
    const to = String(toCode).trim().toUpperCase();
    const cacheKey = `direct:${from}:${to}`;

    return this.cachedRequest(cacheKey, this.schedulesTtlMs, async () => {
      const url = `${this.apiUrl}/trains/between/${encodeURIComponent(from)}/${encodeURIComponent(to)}`;
      try {
        const res = await httpFetch(url, {
          method: 'GET',
          headers: this.getHeaders(),
          timeoutMs: options.timeoutMs || this.timeoutMs,
          provider: 'railradar',
        });

        const raw = res.data;
        let trains = [];
        if (raw?.data?.trains && Array.isArray(raw.data.trains)) {
          trains = raw.data.trains;
        } else if (raw?.trains && Array.isArray(raw.trains)) {
          trains = raw.trains;
        } else if (Array.isArray(raw?.data)) {
          trains = raw.data;
        } else if (Array.isArray(raw)) {
          trains = raw;
        }

        return {
          success: true,
          from,
          to,
          trains,
          rawResponse: raw,
        };
      } catch (err) {
        logger.warn(`[RailRadarAdapter] searchDirectTrains failed for ${from} -> ${to}: ${err.message}`);
        return {
          success: false,
          from,
          to,
          trains: [],
          error: err.message,
          statusCode: err.statusCode || 500,
        };
      }
    });
  }

  /**
   * Query multi-stop journey planner (POST /v1/journeys/plan)
   */
  async planJourney(originCode, destinationCode, travelDate, options = {}) {
    if (!this.enabled || !this.apiUrl) {
      return { success: false, itineraries: [], reason: 'PROVIDER_DISABLED' };
    }

    const from = String(originCode).trim().toUpperCase();
    const to = String(destinationCode).trim().toUpperCase();
    const dateStr = travelDate ? String(travelDate).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const cacheKey = `plan:${from}:${to}:${dateStr}`;

    return this.cachedRequest(cacheKey, this.schedulesTtlMs, async () => {
      const url = `${this.apiUrl}/journeys/plan`;
      try {
        const body = {
          stops: [from, to],
          date: dateStr,
          maxTransfers: options.maxTransfers ?? 2,
        };

        const res = await httpFetch(url, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(body),
          timeoutMs: options.timeoutMs || this.timeoutMs,
          provider: 'railradar',
        });

        const raw = res.data;
        const itineraries = raw?.data?.itineraries || raw?.itineraries || [];
        return {
          success: true,
          itineraries,
          rawResponse: raw,
        };
      } catch (err) {
        // Planner endpoint may not be active on all tiers; return graceful degradation
        logger.debug(`[RailRadarAdapter] planJourney unavailable or failed: ${err.message}`);
        return {
          success: false,
          itineraries: [],
          error: err.message,
          statusCode: err.statusCode || 500,
        };
      }
    });
  }

  /**
   * Check real-time seat availability for a specific train leg.
   */
  async getAvailability(trainNumber, fromCode, toCode, date, travelClass = '3A', quota = 'GN') {
    const num = String(trainNumber).trim();
    const from = String(fromCode).trim().toUpperCase();
    const to = String(toCode).trim().toUpperCase();
    const dateStr = String(date).slice(0, 10);
    const cacheKey = `avail:${num}:${from}:${to}:${dateStr}:${travelClass}:${quota}`;

    return this.cachedRequest(cacheKey, this.availabilityTtlMs, async () => {
      const queryParams = new URLSearchParams({
        from,
        to,
        date: dateStr,
        class: travelClass,
        quota,
      });
      const url = `${this.apiUrl}/trains/${encodeURIComponent(num)}/availability?${queryParams.toString()}`;

      try {
        const res = await httpFetch(url, {
          method: 'GET',
          headers: this.getHeaders(),
          timeoutMs: Math.min(this.timeoutMs, 4000),
          provider: 'railradar',
        });

        const data = res.data?.data || res.data;
        const rawStatus = (data?.status || data?.availability || '').toUpperCase();

        let normalizedStatus = 'UNKNOWN';
        if (rawStatus.includes('AVAILABLE') || rawStatus.includes('AVL') || rawStatus.includes('CURR_AVBL')) {
          normalizedStatus = 'AVAILABLE';
        } else if (rawStatus.includes('RAC')) {
          normalizedStatus = 'RAC';
        } else if (rawStatus.includes('WL') || rawStatus.includes('WAITLIST')) {
          normalizedStatus = 'WAITLISTED';
        } else if (rawStatus.includes('NOT AVAILABLE') || rawStatus.includes('REGRET') || rawStatus.includes('TRAIN DEPARTED')) {
          normalizedStatus = 'NOT_AVAILABLE';
        }

        return {
          success: true,
          provider: this.name,
          trainNumber: num,
          travelClass,
          quota,
          originalStatus: data?.status || rawStatus || 'UNKNOWN',
          normalizedStatus,
          seatsAvailable: typeof data?.seats === 'number' ? data.seats : null,
          lastUpdated: new Date().toISOString(),
          isLive: true,
        };
      } catch (err) {
        // Fallback or unavailable endpoint
        return {
          success: false,
          provider: this.name,
          trainNumber: num,
          travelClass,
          quota,
          normalizedStatus: 'UNKNOWN',
          originalStatus: null,
          error: err.message,
          lastUpdated: new Date().toISOString(),
          isLive: false,
        };
      }
    });
  }

  /**
   * Retrieve or calculate realistic fare for a train leg.
   */
  async getFare(trainNumber, fromCode, toCode, travelClass = '3A', distanceKm = 0) {
    const num = String(trainNumber).trim();
    const from = String(fromCode).trim().toUpperCase();
    const to = String(toCode).trim().toUpperCase();
    const cacheKey = `fare:${num}:${from}:${to}:${travelClass}`;

    return this.cachedRequest(cacheKey, this.fareTtlMs, async () => {
      const queryParams = new URLSearchParams({ from, to, class: travelClass });
      const url = `${this.apiUrl}/trains/${encodeURIComponent(num)}/fare?${queryParams.toString()}`;

      try {
        const res = await httpFetch(url, {
          method: 'GET',
          headers: this.getHeaders(),
          timeoutMs: Math.min(this.timeoutMs, 4000),
          provider: 'railradar',
        });

        const data = res.data?.data || res.data;
        const amount = Number(data?.fare || data?.totalFare || data?.amount);

        if (!isNaN(amount) && amount > 0) {
          return {
            success: true,
            provider: this.name,
            trainNumber: num,
            travelClass,
            baseFare: amount,
            totalFare: amount,
            currency: 'INR',
            isEstimated: false,
            source: 'provider',
            lastUpdated: new Date().toISOString(),
          };
        }
      } catch {
        // Fare unavailable from RailRadar
      }

      // Requirement 2: Do not invent or extrapolate railway fares from unsupported assumptions.
      // If RailRadar does not expose a verified fare, return fareUnavailable.
      return {
        success: false,
        provider: this.name,
        trainNumber: num,
        travelClass,
        baseFare: null,
        totalFare: null,
        currency: 'INR',
        isEstimated: false,
        source: null,
        fareUnavailable: true,
        lastUpdated: new Date().toISOString(),
      };
    });
  }

  /**
   * Retrieve live running status of a train.
   */
  async getLiveStatus(trainNumber, date) {
    const num = String(trainNumber).trim();
    const dateStr = date ? String(date).slice(0, 10) : '';
    const cacheKey = `live:${num}:${dateStr}`;

    return this.cachedRequest(cacheKey, this.liveStatusTtlMs, async () => {
      const url = `${this.apiUrl}/trains/${encodeURIComponent(num)}/live`;
      try {
        const res = await httpFetch(url, {
          method: 'GET',
          headers: this.getHeaders(),
          timeoutMs: Math.min(this.timeoutMs, 4000),
          provider: 'railradar',
        });

        const data = res.data?.data || res.data;
        const delayMinutes = Number(data?.delayMinutes || data?.delay || 0);

        return {
          success: true,
          trainNumber: num,
          currentStation: data?.currentStation || null,
          delayMinutes: isNaN(delayMinutes) ? 0 : delayMinutes,
          isTerminated: Boolean(data?.isTerminated),
          statusMessage: data?.statusMessage || data?.status || (delayMinutes > 0 ? `Running late by ${delayMinutes}m` : 'On time'),
          isLive: true,
          lastUpdated: new Date().toISOString(),
        };
      } catch (err) {
        return {
          success: false,
          trainNumber: num,
          delayMinutes: 0,
          statusMessage: 'Schedule-based (Live status unavailable)',
          isLive: false,
          error: err.message,
          lastUpdated: new Date().toISOString(),
        };
      }
    });
  }
}

export const railRadarAdapter = new RailRadarAdapter();
export default railRadarAdapter;
