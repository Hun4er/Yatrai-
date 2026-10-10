import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { httpFetch } from '../transport/httpClient.js';
import { resolveStationCode } from '../transport/rail/rail.provider.js';
import { findVerifiedDirectTrains } from '../../services/rail/verifiedTrainData.js';

/**
 * RailRadar Provider Adapter
 * Connects to RailRadar API (https://api.railradar.in/v1) with:
 * - In-flight request deduplication (prevents duplicate simultaneous calls)
 * - Short-lived memory caching with TTL
 * - Bounded concurrency & rate limit protection (10 req/min compliance)
 * - Monthly quota tracking (100 req/month limit)
 * - Verified schedule repository fallback upon provider quota exhaustion
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

    // Cache TTLs in milliseconds (2 hours for schedules to protect low 100/mo quota)
    this.schedulesTtlMs = 2 * 60 * 60 * 1000;
    this.availabilityTtlMs = 2 * 60 * 1000; // 2 minutes
    this.fareTtlMs = 15 * 60 * 1000; // 15 minutes
    this.liveStatusTtlMs = 60 * 1000; // 1 minute

    // Provider Request Budget & Rate Limiter (RailRadar basic tier: 10 req/min, 100 req/mo)
    this.requestTimestamps = [];
    this.maxRequestsPerMinute = 8;
    this.isMonthlyQuotaExhausted = false;
    this.quotaStats = {
      limitMonth: 100,
      remainingMonth: null,
      limitMin: 10,
      remainingMin: null,
      totalCalls: 0,
      cacheHits: 0,
      rateLimits429: 0,
    };

    // Feature flags: RailRadar v1 basic tier does not expose real-time seat availability or standard tariff endpoints.
    this.enableAvailabilityEndpoint = Boolean(options.enableAvailabilityEndpoint ?? config.providers.railradar?.enableAvailabilityEndpoint ?? false);
    this.enableFareEndpoint = Boolean(options.enableFareEndpoint ?? config.providers.railradar?.enableFareEndpoint ?? false);
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
   * Checks current request budget against 10 req/min limit.
   */
  checkRateLimitBudget() {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter((ts) => now - ts < 60000);
    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
      return { allowed: false, waitMs: 60000 - (now - this.requestTimestamps[0]) };
    }
    return { allowed: true, waitMs: 0 };
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
      this.quotaStats.cacheHits++;
      return cached.data;
    }

    if (this.inFlight.has(cacheKey)) {
      return this.inFlight.get(cacheKey);
    }

    const promise = (async () => {
      try {
        const data = await requestFn();
        if (data !== null && data !== undefined) {
          // If request was unsuccessful, only cache for 5s to avoid duplicate bursts while allowing fast recovery
          const cacheTtl = data?.success === false ? 5000 : durationMs;
          this.cache.set(cacheKey, { data, expiresAt: Date.now() + cacheTtl });
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
    const travelDate = options.date || options.departureDate || '';
    const cacheKey = `direct:${from}:${to}`;

    return this.cachedRequest(cacheKey, this.schedulesTtlMs, async () => {
      // 1. If monthly quota is already known to be exhausted, avoid wasted 429 network roundtrips
      if (this.isMonthlyQuotaExhausted) {
        logger.info(`[RailRadarAdapter] RailRadar monthly quota exhausted. Resolving from verified schedules for ${from} -> ${to}`);
        const verified = findVerifiedDirectTrains(from, to, travelDate);
        if (verified.length > 0) {
          return {
            success: true,
            from,
            to,
            trains: verified,
            source: 'verified_schedule',
            isVerifiedSchedule: true,
            quotaExhausted: true,
          };
        }
        return {
          success: false,
          from,
          to,
          trains: [],
          statusCode: 429,
          error: 'Monthly quota exceeded. Maximum 100 requests per month.',
          isMonthlyQuota: true,
        };
      }

      // 2. Budget gate: prevent bursting above 10 req/min
      const budget = this.checkRateLimitBudget();
      if (!budget.allowed) {
        logger.warn(`[RailRadarAdapter] Rate limit budget reached (${this.maxRequestsPerMinute} req/min). Checking verified schedules...`);
        const verified = findVerifiedDirectTrains(from, to, travelDate);
        if (verified.length > 0) {
          return {
            success: true,
            from,
            to,
            trains: verified,
            source: 'verified_schedule',
            isVerifiedSchedule: true,
          };
        }
        if (budget.waitMs > 0 && budget.waitMs < 2000) {
          await new Promise((resolve) => setTimeout(resolve, budget.waitMs));
        } else {
          return {
            success: false,
            from,
            to,
            trains: [],
            statusCode: 429,
            error: 'Local rate limit protection engaged. Please wait shortly before retrying.',
            retryAfterMs: budget.waitMs,
          };
        }
      }

      const url = `${this.apiUrl}/trains/between/${encodeURIComponent(from)}/${encodeURIComponent(to)}`;
      this.requestTimestamps.push(Date.now());
      this.quotaStats.totalCalls++;

      try {
        const res = await httpFetch(url, {
          method: 'GET',
          headers: this.getHeaders(),
          timeoutMs: options.timeoutMs || this.timeoutMs,
          provider: 'railradar',
        });

        if (res.headers) {
          const remMonth = res.headers.get('x-ratelimit-remaining-month');
          if (remMonth !== null && remMonth !== undefined) {
            this.quotaStats.remainingMonth = Number(remMonth);
            this.isMonthlyQuotaExhausted = (this.quotaStats.remainingMonth === 0);
          }
          const remMin = res.headers.get('x-ratelimit-remaining-min');
          if (remMin !== null && remMin !== undefined) {
            this.quotaStats.remainingMin = Number(remMin);
          }
        }

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
        this.quotaStats.rateLimits429++;

        // Only classify as monthly exhaustion if explicitly stated or header confirmed 0 remaining
        const isMonthly =
          err.code === 'PROVIDER_MONTHLY_QUOTA_EXHAUSTED' ||
          err.details?.isMonthlyQuota ||
          /monthly quota/i.test(err.message || '') ||
          (this.quotaStats.remainingMonth !== null && this.quotaStats.remainingMonth === 0);

        if (isMonthly) {
          this.isMonthlyQuotaExhausted = true;
          this.quotaStats.remainingMonth = 0;
        }

        // Seamless verified timetable fallback on ANY failure (including transient 429 rate limits)
        const verified = findVerifiedDirectTrains(from, to, travelDate);
        if (verified.length > 0) {
          logger.info(`[RailRadarAdapter] Resolved ${verified.length} verified trains for ${from} -> ${to} despite upstream error (${err.message})`);
          return {
            success: true,
            from,
            to,
            trains: verified,
            source: 'verified_schedule',
            isVerifiedSchedule: true,
            quotaExhausted: Boolean(isMonthly),
          };
        }

        return {
          success: false,
          from,
          to,
          trains: [],
          error: err.message,
          statusCode: err.statusCode || 500,
          isMonthlyQuota: Boolean(isMonthly),
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

    // Fast return if availability endpoint is not exposed on RailRadar tier
    if (!this.enableAvailabilityEndpoint) {
      return {
        success: false,
        provider: this.name,
        trainNumber: num,
        travelClass,
        quota,
        normalizedStatus: 'UNKNOWN',
        originalStatus: null,
        seatsAvailable: null,
        lastUpdated: new Date().toISOString(),
        isLive: false,
      };
    }

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

    // Fast return if fare endpoint is not exposed on RailRadar tier
    if (!this.enableFareEndpoint) {
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
    }

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
