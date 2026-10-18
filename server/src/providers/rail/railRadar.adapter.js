import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { httpFetch } from '../transport/httpClient.js';
import { resolveStationCode } from '../transport/rail/rail.provider.js';
import { findVerifiedDirectTrains } from '../../services/rail/verifiedTrainData.js';
import { normalizeSeatAvailability, AVAILABILITY_STATUS } from '../../services/rail/availabilityNorm.js';
import { formatJourneyDate } from '../../utils/railwayTime.js';
import railKitAdapter from './railKit.adapter.js';
import persistentCacheService from '../../services/rail/persistentCache.service.js';

/**
 * Normalizes a train item returned by RailKit into canonical format
 * expected by DirectJourneyService and JourneyRecoveryService.
 */
export function normalizeRailKitTrain(rkTrain, defaultFrom = '', defaultTo = '') {
  const dayNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  let runDays = [];
  if (typeof rkTrain.running_days === 'string' && rkTrain.running_days.length === 7) {
    runDays = rkTrain.running_days
      .split('')
      .map((flag, idx) => (flag === '1' ? dayNames[idx] : null))
      .filter(Boolean);
  } else if (Array.isArray(rkTrain.runDays)) {
    runDays = rkTrain.runDays;
  }

  let durationMinutes = null;
  if (rkTrain.travel_time) {
    const m = String(rkTrain.travel_time).match(/(\d+):(\d+)/);
    if (m) durationMinutes = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  const fromCode = rkTrain.from_stn_code || defaultFrom;
  const toCode = rkTrain.to_stn_code || defaultTo;
  const fromName = rkTrain.from_stn_name || rkTrain.source_stn_name || fromCode;
  const toName = rkTrain.to_stn_name || rkTrain.dstn_stn_name || toCode;
  const trainNum = String(rkTrain.train_no || rkTrain.trainNumber || rkTrain.number || '');
  const trainName = rkTrain.train_name || rkTrain.trainName || rkTrain.name || 'Express';

  return {
    train: {
      number: trainNum,
      name: trainName,
      runDays,
    },
    trainNumber: trainNum,
    trainName,
    from: {
      code: fromCode,
      name: fromName,
      departure: rkTrain.from_time || rkTrain.departureTime || '06:00',
      day: 1,
    },
    to: {
      code: toCode,
      name: toName,
      arrival: rkTrain.to_time || rkTrain.arrivalTime || '18:00',
      day: 1,
    },
    durationMinutes,
    duration: durationMinutes,
    distance: Number(rkTrain.distance) || 500,
    distanceKm: Number(rkTrain.distance) || 500,
    runDays,
    source: 'railkit',
    raw: rkTrain,
  };
}

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
    this.options = options;
    this.name = 'RailRadar';
    this.code = 'RAILRADAR';
    this.apiKey = options.apiKey || config.providers.railradar?.apiKey || config.providers.rail?.apiKey || null;
    this.apiUrl = (options.apiUrl || config.providers.railradar?.apiUrl || 'https://api.railradar.in/v1').replace(/\/$/, '');
    this.enabled = options.enabled ?? (config.providers.railradar?.enabled ?? true);
    this.enableAvailabilityEndpoint = options.enableAvailabilityEndpoint ?? (config.providers.railradar?.enableAvailabilityEndpoint ?? true);

    // In-memory cache: key -> { data, expiresAt }
    this.cache = new Map();
    // In-flight request deduplication: key -> Promise
    this.inFlight = new Map();
    // Injectable HTTP fetch client for testability and isolation
    this.httpFetch = options.httpFetch || httpFetch;

    // Cache TTLs in milliseconds (2 hours for schedules to protect low 100/mo quota)
    this.schedulesTtlMs = 2 * 60 * 60 * 1000;
    this.availabilityTtlMs = options.availabilityTtlMs || config.providers.railradar?.availabilityTtlMs || 5 * 60 * 1000; // 5 minutes
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

    // Feature flags: RailRadar seat-availability endpoint
    this.enableAvailabilityEndpoint = Boolean(options.enableAvailabilityEndpoint ?? config.providers.railradar?.enableAvailabilityEndpoint ?? true);
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
  async cachedRequest(cacheKey, ttlMs, requestFn, options = {}) {
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
      if (options?.budgetTracker) {
        options.budgetTracker.recordCacheHit();
      }
      return cached.data;
    }

    const isMockFetch = Boolean(this.options?.httpFetch);
    if (!isMockFetch) {
      const persistent = await persistentCacheService.get(cacheKey);
      if (persistent !== null && persistent !== undefined) {
        this.cache.set(cacheKey, { data: persistent, expiresAt: now + durationMs });
        this.quotaStats.cacheHits++;
        if (options?.budgetTracker) {
          options.budgetTracker.recordCacheHit();
        }
        return persistent;
      }
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
          if (!isMockFetch) {
            await persistentCacheService.set(cacheKey, data, 'timetable', cacheTtl);
          }
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
      // 0. If configured API key is a RailKit key, prioritize RailKit live train search
      if (this.apiKey?.startsWith('railkit_') || config.providers?.railkit?.apiKey) {
        try {
          const rkRes = await railKitAdapter.searchTrainBetweenStations(from, to, travelDate);
          if (rkRes?.success && Array.isArray(rkRes.data) && rkRes.data.length > 0) {
            const mappedTrains = rkRes.data.map((t) => normalizeRailKitTrain(t, from, to));
            logger.info(`[RailRadarAdapter] Resolved ${mappedTrains.length} live trains from RailKit for ${from} -> ${to}`);
            return {
              success: true,
              from,
              to,
              trains: mappedTrains,
              source: 'railkit',
              isRailKit: true,
            };
          }
        } catch (rkErr) {
          logger.debug(`[RailRadarAdapter] Primary RailKit search attempt: ${rkErr.message}`);
        }
      }

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

      // 2. Per-search request budget check
      const budgetTracker = options.budgetTracker;
      if (budgetTracker) {
        const isRecovery = options.isRecovery !== false;
        const canQuery = isRecovery ? budgetTracker.canMakeRecoveryRequest() : budgetTracker.canMakeDirectRequest();
        if (!canQuery) {
          logger.info(`[RailRadarAdapter] Request budget exhausted for ${from} -> ${to}. Checking verified schedules...`);
          const verified = findVerifiedDirectTrains(from, to, travelDate);
          if (verified.length > 0) {
            return {
              success: true,
              from,
              to,
              trains: verified,
              source: 'verified_schedule',
              isVerifiedSchedule: true,
              budgetExhausted: true,
            };
          }
          return {
            success: false,
            from,
            to,
            trains: [],
            statusCode: 429,
            error: 'Request budget exhausted for current search.',
            isBudgetExhausted: true,
          };
        }
      }

      // 3. Provider rate limit budget gate: prevent bursting above 10 req/min
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
          const jitter = Math.floor(Math.random() * 50);
          await new Promise((resolve) => setTimeout(resolve, budget.waitMs + jitter));
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

      if (budgetTracker) {
        budgetTracker.recordOutboundRequest({
          isRecovery: options.isRecovery !== false,
          endpoint: '/trains/between',
          queryKey: cacheKey,
        });
      }

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

        // Seamless RailKit live search integration for anywhere in India
        try {
          const rkRes = await railKitAdapter.searchTrainBetweenStations(from, to, travelDate);
          if (rkRes?.success && Array.isArray(rkRes.data) && rkRes.data.length > 0) {
            const mappedTrains = rkRes.data.map((t) => normalizeRailKitTrain(t, from, to));
            logger.info(`[RailRadarAdapter] Resolved ${mappedTrains.length} live trains from RailKit for ${from} -> ${to}`);
            return {
              success: true,
              from,
              to,
              trains: mappedTrains,
              source: 'railkit',
              isRailKit: true,
            };
          }
        } catch (rkErr) {
          logger.debug(`[RailRadarAdapter] RailKit fallback search failed: ${rkErr.message}`);
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
    }, options);
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
   * Documented RailRadar endpoint: GET /v1/trains/{number}/seats
   * Query parameters: source, destination, journeyDate, classCode, quotaCode
   * Response structure: data.avlDayList[] with availablityDate and availablityStatus
   */
  async getAvailability(trainNumber, fromCode, toCode, date, travelClass = '3A', quota = 'GN', options = {}) {
    const num = String(trainNumber || '').trim();
    const from = String(fromCode || '').trim().toUpperCase();
    const to = String(toCode || '').trim().toUpperCase();
    const targetDateStr = formatJourneyDate(date);
    const classCode = String(travelClass || '3A').trim().toUpperCase();
    const quotaCode = String(quota || 'GN').trim().toUpperCase();

    if (!targetDateStr) {
      return {
        success: false,
        provider: this.name,
        trainNumber: num,
        fromStation: from,
        toStation: to,
        journeyDate: '',
        travelClass: classCode,
        quota: quotaCode,
        normalizedStatus: AVAILABILITY_STATUS.UNKNOWN,
        originalStatus: null,
        seatsAvailable: null,
        isAvailable: false,
        lastUpdated: new Date().toISOString(),
        isLive: false,
        error: 'INVALID_JOURNEY_DATE',
      };
    }

    const cacheKey = `avail:${num}:${from}:${to}:${targetDateStr}:${classCode}:${quotaCode}`;

    // Fast return if availability endpoint is explicitly disabled
    if (!this.enableAvailabilityEndpoint) {
      return {
        success: false,
        provider: this.name,
        trainNumber: num,
        fromStation: from,
        toStation: to,
        journeyDate: targetDateStr,
        travelClass: classCode,
        quota: quotaCode,
        normalizedStatus: AVAILABILITY_STATUS.UNKNOWN,
        originalStatus: null,
        seatsAvailable: null,
        isAvailable: false,
        lastUpdated: new Date().toISOString(),
        isLive: false,
        error: 'ENDPOINT_DISABLED',
      };
    }

    const budgetTracker = options.budgetTracker;
    const isRecovery = options.isRecovery !== false;
    if (budgetTracker) {
      const canQuery = isRecovery ? budgetTracker.canMakeRecoveryRequest() : budgetTracker.canMakeDirectRequest();
      if (!canQuery) {
        return {
          success: false,
          provider: this.name,
          trainNumber: num,
          fromStation: from,
          toStation: to,
          journeyDate: targetDateStr,
          travelClass: classCode,
          quota: quotaCode,
          normalizedStatus: AVAILABILITY_STATUS.UNKNOWN,
          originalStatus: null,
          seatsAvailable: null,
          isAvailable: false,
          lastUpdated: new Date().toISOString(),
          isLive: false,
          isBudgetExhausted: true,
        };
      }
    }

    return this.cachedRequest(cacheKey, this.availabilityTtlMs, async () => {
      const queryParams = new URLSearchParams({
        source: from,
        destination: to,
        journeyDate: targetDateStr,
        classCode,
        quotaCode,
      });
      const url = `${this.apiUrl}/trains/${encodeURIComponent(num)}/seats?${queryParams.toString()}`;

      if (budgetTracker) {
        const allowed = budgetTracker.recordOutboundRequest({
          isRecovery,
          endpoint: '/trains/seats',
          queryKey: cacheKey,
        });
        if (!allowed) {
          return {
            success: false,
            provider: this.name,
            trainNumber: num,
            fromStation: from,
            toStation: to,
            journeyDate: targetDateStr,
            travelClass: classCode,
            quota: quotaCode,
            normalizedStatus: AVAILABILITY_STATUS.UNKNOWN,
            originalStatus: null,
            seatsAvailable: null,
            isAvailable: false,
            lastUpdated: new Date().toISOString(),
            isLive: false,
            isBudgetExhausted: true,
          };
        }
      }

      try {
        const res = await this.httpFetch(url, {
          method: 'GET',
          headers: this.getHeaders(),
          timeoutMs: Math.min(this.timeoutMs, 4000),
          provider: 'railradar',
          budgetTracker,
          isRecovery,
        });

        const rawData = res.data;
        const payload = rawData?.data || rawData || {};
        const avlList = Array.isArray(payload.calendar)
          ? payload.calendar
          : (Array.isArray(payload.avlDayList)
              ? payload.avlDayList
              : (Array.isArray(payload.availabilityList)
                  ? payload.availabilityList
                  : (Array.isArray(payload.seats) ? payload.seats : [])));

        let matchedEntry = null;
        if (avlList.length > 0) {
          matchedEntry = avlList.find((entry) => {
            const entryDateStr = formatJourneyDate(
              entry?.date || entry?.rawDate || entry?.availablityDate || entry?.availabilityDate
            );
            return entryDateStr === targetDateStr;
          });
        }

        // Provider uses "status" in live calendar and "availablityStatus" in documented IRCTC avlDayList
        const rawStatus = matchedEntry
          ? (matchedEntry.status || matchedEntry.availablityStatus || matchedEntry.availabilityStatus || '')
          : (payload.status || payload.availablityStatus || payload.availabilityStatus || '');

        if (!rawStatus) {
          return {
            success: false,
            provider: this.name,
            trainNumber: num,
            fromStation: from,
            toStation: to,
            journeyDate: targetDateStr,
            travelClass: classCode,
            quota: quotaCode,
            normalizedStatus: AVAILABILITY_STATUS.UNKNOWN,
            originalStatus: null,
            seatsAvailable: null,
            isAvailable: false,
            lastUpdated: new Date().toISOString(),
            isLive: true,
            source: 'railradar_seats_api',
            error: 'NO_MATCHING_DATE_IN_AVL_DAY_LIST',
          };
        }

        const norm = normalizeSeatAvailability(rawStatus);
        const seatsCount = typeof matchedEntry?.availableSeats === 'number'
          ? matchedEntry.availableSeats
          : norm.seatsAvailable;

        return {
          success: true,
          provider: this.name,
          trainNumber: num,
          fromStation: from,
          toStation: to,
          journeyDate: targetDateStr,
          travelClass: classCode,
          quota: quotaCode,
          normalizedStatus: norm.normalizedStatus,
          originalStatus: norm.rawStatus,
          seatsAvailable: seatsCount,
          isAvailable: norm.isAvailable,
          reasonType: matchedEntry?.reasonType || null,
          currentBkgFlag: matchedEntry?.currentBkgFlag || null,
          lastUpdated: new Date().toISOString(),
          providerTimestamp: payload.lastUpdated || payload.timestamp || new Date().toISOString(),
          isLive: true,
          source: 'railradar_seats_api',
          rawEntry: matchedEntry || null,
        };
      } catch (err) {
        logger.warn(
          `[RailRadarAdapter] getAvailability failed for ${num} (${from} -> ${to}): ${err.message}`
        );
        let errorCode = 'PROVIDER_ERROR';
        const status = err.statusCode || err.response?.status || err.status;
        if (status === 429) errorCode = 'RATE_LIMITED';
        else if (status === 401 || status === 403) errorCode = 'UNSUPPORTED_ENDPOINT';
        else if (status >= 500) errorCode = 'SERVER_ERROR';
        else if (err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '')) errorCode = 'TIMEOUT';

        return {
          success: false,
          provider: this.name,
          trainNumber: num,
          fromStation: from,
          toStation: to,
          journeyDate: targetDateStr,
          travelClass: classCode,
          quota: quotaCode,
          normalizedStatus: AVAILABILITY_STATUS.UNKNOWN,
          originalStatus: null,
          seatsAvailable: null,
          isAvailable: false,
          error: err.message,
          errorCode,
          statusCode: status || 500,
          lastUpdated: new Date().toISOString(),
          isLive: false,
        };
      }
    }, options);
  }

  /**
   * Retrieve or calculate realistic fare for a train leg.
   */
  async getFare(trainNumber, fromCode, toCode, travelClass = '3A', distanceKm = 0, options = {}) {
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

    const budgetTracker = options.budgetTracker;
    const isRecovery = options.isRecovery !== false;
    if (budgetTracker) {
      const canQuery = isRecovery ? budgetTracker.canMakeRecoveryRequest() : budgetTracker.canMakeDirectRequest();
      if (!canQuery) {
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
          isBudgetExhausted: true,
        };
      }
    }

    return this.cachedRequest(cacheKey, this.fareTtlMs, async () => {
      const queryParams = new URLSearchParams({ from, to, class: travelClass });
      const url = `${this.apiUrl}/trains/${encodeURIComponent(num)}/fare?${queryParams.toString()}`;

      if (budgetTracker) {
        const allowed = budgetTracker.recordOutboundRequest({
          isRecovery,
          endpoint: '/trains/fare',
          queryKey: cacheKey,
        });
        if (!allowed) {
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
            isBudgetExhausted: true,
          };
        }
      }

      try {
        const res = await httpFetch(url, {
          method: 'GET',
          headers: this.getHeaders(),
          timeoutMs: Math.min(this.timeoutMs, 4000),
          provider: 'railradar',
          budgetTracker,
          isRecovery,
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
    }, options);
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
        try {
          const rkLive = await railKitAdapter.trackTrain(num, dateStr);
          if (rkLive?.success && rkLive.data) {
            const data = rkLive.data;
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
          }
        } catch {
          // RailKit tracking fallback error
        }

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
