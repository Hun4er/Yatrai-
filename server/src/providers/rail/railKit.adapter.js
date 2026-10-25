import fs from 'fs';
import { toRailKitDate, formatJourneyDate, isIrctcMaintenanceWindow } from '../../utils/railwayTime.js';
import { normalizeSeatAvailability, AVAILABILITY_STATUS } from '../../services/rail/availabilityNorm.js';
import { classifyError, ERROR_CLASS } from '../../utils/errorClassifier.js';
import logger from '../../utils/logger.js';
import config from '../../config/index.js';
import persistentCacheService, { CACHE_TTL_CONFIG } from '../../services/rail/persistentCache.service.js';
import apiUsageService from '../../services/rail/apiUsage.service.js';
import { getCurrentBudgetTracker } from '../../services/rail/requestBudget.js';

/**
 * RailKit Provider Adapter
 *
 * Connects to the RailKit REST API (https://api.railkit.in) for:
 *   - Seat availability  GET /api/v1/seats/:trainNo/:from/:to/:date/:coach/:quota
 *   - Fare lookup        GET /api/v1/fare/:trainNo/:date/:from/:to/:class/:quota
 *   - Station lookup     GET /api/v1/stations/:code  (for code validation)
 *
 * Auth: X-API-Key header.  Key read from process.env.RAILKIT_API_KEY only.
 * Dates: RailKit requires DD-MM-YYYY.  All internal dates are YYYY-MM-DD.
 *        toRailKitDate() is the ONLY place that conversion happens.
 *
 * Budget:
 *   - In-memory cache per [trainNo:from:to:date:class:quota], 5-min TTL
 *   - In-flight deduplication (same key -> single HTTP request)
 *   - Max concurrent requests: adaptive starting at 4; halves on 429 down to min 1
 *   - Monthly usage counter logged at INFO level
 *   - Retry up to 2 times on TRANSIENT errors with backoff + jitter; never on 4xx/auth
 */

// Config constants
const BASE_URL = (process.env.RAILKIT_API_URL || 'https://api.railkit.in').replace(/\/$/, '');
const TIMEOUT_MS = parseInt(process.env.RAILKIT_TIMEOUT_MS || '8000', 10);
const CACHE_TTL_MS = parseInt(process.env.RAILKIT_CACHE_TTL_MS || '300000', 10); // 5 min
const DEFAULT_MAX_CONCURRENT = 4;
// Station code validation cache (24-h TTL)
const STATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Station code format: 2-5 uppercase letters only
const STATION_CODE_RE = /^[A-Z]{2,5}$/;

export class RailKitAdapter {
  constructor(options = {}) {
    this.name = 'RailKit';
    this.code = 'RAILKIT';
    this._fetchFn = options?.fetchFn || null;
    this._disablePersistentCache = Boolean(options?.disablePersistentCache);

    // Cache: cacheKey -> { data, expiresAt }
    this._cache = new Map();
    // In-flight deduplication: cacheKey -> Promise
    this._inFlight = new Map();
    // Station validation cache: stationCode -> { valid, reason, expiresAt }
    this._stationCache = new Map();

    // Adaptive concurrency semaphore (starts at 4; on 429 halves down to min 1)
    this._maxConcurrent = options?.maxConcurrent || DEFAULT_MAX_CONCURRENT;
    this._activeRequests = 0;
    this._concurrencyQueue = [];

    // Cache observability metrics
    this._metrics = {
      hits: 0,
      misses: 0,
      inFlightCoalesced: 0,
      upstreamRequests: 0,
      upstreamErrors: 0,
      rateLimits: 0,
      lastReset: new Date().toISOString(),
    };

    // Monthly request counter (resets on process restart)
    this._monthlyCount = 0;
    this._monthStart = new Date().toISOString().slice(0, 7); // YYYY-MM

    // Read API key once; never expose in logs
    this._apiKey = (process.env.RAILKIT_API_KEY || '').trim() || null;
    if (!this._apiKey) {
      logger.warn('[RailKitAdapter] RAILKIT_API_KEY is not set — requests will fail.');
    }
  }

  // Internal helpers

  _headers() {
    const key = (process.env.RAILKIT_API_KEY || this._apiKey || '').trim() || null;
    const h = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (key) h['X-API-Key'] = key;
    return h;
  }

  _isValidCodeFormat(code) {
    return typeof code === 'string' && STATION_CODE_RE.test(code.trim().toUpperCase());
  }

  _normalizeCode(code) {
    return String(code || '').trim().toUpperCase();
  }

  _normalizeTrainNo(trainNo) {
    const s = String(trainNo || '').trim().replace(/\D/g, '');
    return s.padStart(5, '0').slice(-5);
  }

  async _recordRequest() {
    const limit = config.apiQuota?.monthlyLimit || 10000;
    const usage = await apiUsageService.recordRequest('railkit', limit);
    this._monthlyCount = usage.rawCount ?? usage.count;
    logger.info(`[RailKitAdapter] Outbound request #${usage.count} (raw: ${usage.rawCount}, offset: ${usage.usageOffset}, ${usage.percentage}% of quota)`);
    return usage;
  }

  async syncUsage() {
    try {
      const limit = config.apiQuota?.monthlyLimit || 10000;
      const usage = await apiUsageService.getUsage('railkit', limit);
      if (usage && typeof usage.rawCount === 'number') {
        this._monthlyCount = usage.rawCount;
        logger.info(`[RailKitAdapter] Synced persistent usage counter from database: raw=${this._monthlyCount}, total=${usage.count} (offset=${usage.usageOffset})`);
      } else if (usage && typeof usage.count === 'number') {
        this._monthlyCount = usage.count;
      }
    } catch (err) {
      logger.debug(`[RailKitAdapter] Failed to sync usage counter: ${err.message}`);
    }
  }

  /**
   * Cached + deduplicated fetch with MongoDB persistence, in-flight coalescing,
   * and atomic budget reservation for outbound availability calls.
   */
  async _cachedFetch(cacheKey, ttlMs, requestFn, category = 'availability', options = {}) {
    const now = Date.now();
    const tracker = options?.budgetTracker || getCurrentBudgetTracker();

    // 1. Check L1 Memory cache
    const cached = this._cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      this._metrics.hits++;
      if (tracker) tracker.recordCacheHit();
      return cached.data;
    }

    // 2. Check L2 Persistent cache (MongoDB)
    if (!this._disablePersistentCache) {
      const persistent = await persistentCacheService.get(cacheKey);
      if (persistent !== null && persistent !== undefined) {
        this._metrics.hits++;
        this._cache.set(cacheKey, { data: persistent, expiresAt: now + ttlMs, fetchedAt: now });
        if (tracker) tracker.recordCacheHit();
        return persistent;
      }
    }

    // 3. In-flight promise coalescing
    if (this._inFlight.has(cacheKey)) {
      this._metrics.inFlightCoalesced++;
      if (tracker) tracker.deduplicatedCount++;
      return this._inFlight.get(cacheKey);
    }

    this._metrics.misses++;

    // 4. Budget check & Atomic Reservation (Availability / Recovery / Direct / Static / Timetable)
    let reservation = null;
    if (category === 'availability') {
      if (tracker && typeof tracker.reserve === 'function') {
        const budgetCategory = options?.isRecovery !== false ? 'recovery' : 'direct';
        reservation = tracker.reserve(budgetCategory);
        if (!reservation) {
          logger.info(`[RailKitAdapter] Budget limit reached for ${budgetCategory}. Outbound call skipped for ${cacheKey}`);
          return null;
        }
      }
    } else if (
      category === 'timetable' ||
      category === 'static' ||
      category === 'trainsBetween' ||
      category === 'station' ||
      category === 'trainInfo'
    ) {
      if (tracker && typeof tracker.reserve === 'function') {
        reservation = tracker.reserve('static', options);
        if (!reservation) {
          logger.info(`[RailKitAdapter] Static allowance limit reached for ${options?.tier || 'tier1'}. Outbound call skipped for ${cacheKey}`);
          return null;
        }
      }
    }

    const promise = (async () => {
      await this._acquireSlot();
      try {
        const data = await requestFn();
        reservation?.commit();

        if (data !== null && data !== undefined) {
          // Rule: Error/failed availability calls cached at most 30 seconds
          const effectiveTtl = (category === 'availability' && (data?.status === 'error' || data?.normalizedStatus === 'ERROR' || data?.success === false))
            ? 30_000
            : ttlMs;
          this._cache.set(cacheKey, { data, expiresAt: Date.now() + effectiveTtl });
          await persistentCacheService.set(cacheKey, data, category, effectiveTtl);
        } else {
          await persistentCacheService.setNegative(cacheKey);
        }
        return data;
      } catch (err) {
        reservation?.commit();
        if (err.status === 404 || err.status === 400) {
          await persistentCacheService.setNegative(cacheKey, { error: err.message, status: err.status });
        }
        throw err;
      } finally {
        this._releaseSlot();
        this._inFlight.delete(cacheKey);
      }
    })();

    this._inFlight.set(cacheKey, promise);
    return promise;
  }

  _acquireSlot() {
    return new Promise((resolve) => {
      if (this._activeRequests < this._maxConcurrent) {
        this._activeRequests++;
        resolve();
      } else {
        this._concurrencyQueue.push(resolve);
      }
    });
  }

  _releaseSlot() {
    const next = this._concurrencyQueue.shift();
    if (next) {
      next();
    } else {
      this._activeRequests = Math.max(0, this._activeRequests - 1);
    }
  }

  /**
   * Fetch with timeout + retry up to 2 times on TRANSIENT error.
   * Never retries on 400/404/AUTH_QUOTA/NOT_BOOKABLE.
   */
  async _fetch(url, attempt = 1, options = {}) {
    const redactedUrl = url.replace(/X-API-Key=[^&]+/i, 'X-API-Key=[REDACTED]');
    logger.info(`[DIAGNOSTIC - RAILKIT REQUEST] Attempt ${attempt} | URL: ${redactedUrl}`);

    const isLiveAllowed = process.env.LIVE_REQUESTS_ALLOWED === 'true';
    if (!isLiveAllowed) {
      const err = new Error(
        `[RailKitAdapter] Outbound live request BLOCKED: LIVE_REQUESTS_ALLOWED is false. Attempted URL: ${redactedUrl}. Outbound calls are refused unless LIVE_REQUESTS_ALLOWED=true.`
      );
      err.code = 'LIVE_REQUESTS_BLOCKED';
      err.status = 403;
      logger.warn(err.message);
      throw err;
    }

    // SINGLE COUNTING POINT: Count every outbound RailKit HTTP request exactly once
    await this._recordRequest();

    const stackLines = (new Error().stack || '').split('\n').slice(2, 6).map((s) => s.trim());
    const caller = stackLines.join(' | ');
    const endpointPath = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
    const auditRecord = {
      timestamp: new Date().toISOString(),
      attempt,
      url: redactedUrl,
      endpoint: endpointPath,
      caller,
      budgetCheckBefore: false,
      budgetCheckAfter: false,
      hasTracker: false,
    };
    try {
      fs.appendFileSync('railkit_audit.log', JSON.stringify(auditRecord) + '\n');
    } catch {
      // Ignore audit logging file write errors
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res;
    let resBodyText = '';
    const fetchFunc = this._fetchFn || globalThis.fetch;
    let fetchErr = null;

    try {
      this._metrics.upstreamRequests++;
      res = await fetchFunc(url, { headers: this._headers(), signal: controller.signal });
      if (typeof res.text === 'function') {
        resBodyText = await res.text().catch((e) => `[Failed to read body: ${e.message}]`);
      }
      logger.info(`[DIAGNOSTIC - RAILKIT RESPONSE] URL: ${redactedUrl} | HTTP Status: ${res.status} | Body: ${resBodyText}`);
    } catch (err) {
      fetchErr = err;
      this._metrics.upstreamErrors++;
      logger.error(`[DIAGNOSTIC - RAILKIT FETCH ERROR] URL: ${redactedUrl} | Attempt ${attempt} | Error: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }

    // Classify error using canonical classifier
    const statusCode = res?.status || fetchErr?.status || null;
    const classified = classifyError({
      status: statusCode,
      error: fetchErr,
      body: resBodyText,
    });

    // Check if error state
    const isErrorState = fetchErr || !res?.ok;
    if (isErrorState) {
      this._metrics.upstreamErrors++;
      // Only TRANSIENT is retried, max 2 retries (attempt 1 and 2)
      if (classified.errorClass === ERROR_CLASS.TRANSIENT && attempt <= 2) {
        if (statusCode === 429) {
          this._metrics.rateLimits++;
          this._maxConcurrent = Math.max(1, Math.floor(this._maxConcurrent / 2));
          logger.warn(`[RailKitAdapter] HTTP 429 Rate Limit. Halving adaptive concurrency to ${this._maxConcurrent}`);
        }

        let delayMs = attempt === 1 ? 500 : 1500;
        const jitter = Math.floor(Math.random() * (attempt === 1 ? 200 : 300));
        delayMs += jitter;

        if (statusCode === 429 && res?.headers?.get) {
          const retryAfter = res.headers.get('retry-after');
          if (retryAfter) {
            const sec = parseInt(retryAfter, 10);
            if (!isNaN(sec) && sec > 0) delayMs = Math.max(delayMs, sec * 1000);
          }
        }

        // Every attempt goes through the ledger / reserve
        const tracker = options?.budgetTracker || getCurrentBudgetTracker();
        if (tracker && typeof tracker.reserve === 'function') {
          const ok = tracker.reserve('recovery', options);
          if (!ok) {
            logger.warn(`[RailKitAdapter] Reserve or cap empty for retry. Stopping retry for ${redactedUrl}`);
            const err = Object.assign(new Error(`RailKit retry halted: budget cap/reserve empty`), {
              status: statusCode,
              errorClass: classified.errorClass,
              body: resBodyText,
            });
            throw err;
          }
        }

        logger.info(`[RailKitAdapter] TRANSIENT error (attempt ${attempt}), retrying in ${delayMs}ms...`);
        await new Promise((r) => setTimeout(r, delayMs));
        return this._fetch(url, attempt + 1, options);
      }

      const err = Object.assign(new Error(`RailKit HTTP ${statusCode || 'Error'}: ${classified.reason || fetchErr?.message}`), {
        status: statusCode,
        body: resBodyText,
        errorClass: classified.errorClass,
        reason: classified.reason,
      });
      logger.error(`[DIAGNOSTIC - RAILKIT NON-OK RESPONSE] URL: ${redactedUrl} | Status: ${statusCode} | Body: ${resBodyText}`);
      throw err;
    }

    try {
      return JSON.parse(resBodyText);
    } catch (parseErr) {
      logger.error(`[DIAGNOSTIC - RAILKIT JSON PARSE ERROR] URL: ${redactedUrl} | Error: ${parseErr.message} | Raw: ${resBodyText}`);
      throw parseErr;
    }
  }



  /**
   * Validate station code format. Format check only (saves budget).
   */
  async validateStation(code) {
    const upper = this._normalizeCode(code);
    if (!this._isValidCodeFormat(upper)) {
      return { valid: false, reason: `Invalid station code format: "${code}" (must be 2-5 uppercase letters)` };
    }
    const now = Date.now();
    const cached = this._stationCache.get(upper);
    if (cached && cached.expiresAt > now) return { valid: cached.valid, reason: cached.reason };
    const result = { valid: true };
    this._stationCache.set(upper, { ...result, expiresAt: now + STATION_CACHE_TTL_MS });
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Official RailKit SDK Methods (https://railkit.in/docs)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 1. Seat Availability (https://railkit.in/docs/seat-availability)
   * SDK: getAvailability(trainNo: string, fromStnCode: string, toStnCode: string, date: string, coach: string, quota: string)
   * REST: GET /api/v1/seats/:trainNo/:fromStnCode/:toStnCode/:date/:coach/:quota
   *
   * @param {string} trainNo - 5-digit train number
   * @param {string} fromStnCode - Origin station code
   * @param {string} toStnCode - Destination station code
   * @param {string|Date} date - Journey date (accepts DD-MM-YYYY or YYYY-MM-DD or Date)
   * @param {string} coach - 1A, 2A, 3A, 3E, CC, EC, EA, FC, SL, 2S, etc.
   * @param {string} quota - GN, TQ, PT, LD, DF, FT, LB, etc.
   */
  async getAvailability(trainNo, fromStnCode, toStnCode, date, coach = '3A', quota = 'GN', options = {}) {
    // Support object argument if passed
    if (typeof trainNo === 'object' && trainNo !== null) {
      options = trainNo.options || trainNo;
      ({
        trainNo,
        fromStnCode = trainNo.from || trainNo.fromCode,
        toStnCode = trainNo.to || trainNo.toCode,
        date = trainNo.departureDate || trainNo.journeyDate,
        coach = trainNo.travelClass || trainNo.class || '3A',
        quota = trainNo.quota || 'GN',
      } = trainNo);
    }

    const num = this._normalizeTrainNo(trainNo);
    const fromCode = this._normalizeCode(fromStnCode);
    const toCode = this._normalizeCode(toStnCode);
    const internalDate = formatJourneyDate(date); // ensure YYYY-MM-DD for internal consistency
    const rkDate = toRailKitDate(internalDate);    // DD-MM-YYYY required by RailKit

    // Guard: IRCTC Maintenance Window (23:45 - 00:15 IST)
    // Make no availability calls; never cache or count as availability result
    if (isIrctcMaintenanceWindow()) {
      return {
        status: 'error',
        success: false,
        provider: 'RailKit',
        trainNo: num,
        trainNumber: num,
        fromCode,
        fromStnCode: fromCode,
        toCode,
        toStnCode: toCode,
        date: internalDate,
        travelClass: coach,
        coach,
        quota,
        normalizedStatus: AVAILABILITY_STATUS.UNKNOWN,
        originalStatus: 'MAINTENANCE_WINDOW',
        statusText: 'IRCTC maintenance window, reopens 00:15',
        availabilityText: 'IRCTC maintenance window, reopens 00:15',
        message: 'IRCTC maintenance window, reopens 00:15',
        seatsAvailable: null,
        isAvailable: false,
        isMaintenanceWindow: true,
        lastUpdated: new Date().toISOString(),
        isLive: false,
      };
    }

    // Validate station codes
    for (const [code, label] of [[fromCode, 'from'], [toCode, 'to']]) {
      const v = await this.validateStation(code);
      if (!v.valid) {
        logger.debug(`[RailKitAdapter] Invalid ${label} station: ${v.reason}`);
        return this._unknownAvailability(num, fromCode, toCode, internalDate, coach, quota, v.reason);
      }
    }

    if (!rkDate) {
      return this._unknownAvailability(num, fromCode, toCode, internalDate, coach, quota, 'Invalid date');
    }

    const tracker = options?.budgetTracker || getCurrentBudgetTracker();
    if (tracker && typeof tracker.canMakeAvailabilityRequest === 'function' && !tracker.canMakeAvailabilityRequest()) {
      logger.info(`[RailKitAdapter] Budget limit reached. Skipping availability for ${num} ${fromCode}->${toCode}`);
      return this._errorAvailability(num, fromCode, toCode, internalDate, coach, quota, 'BUDGET_EXHAUSTED');
    }

    const cacheKey = `avail:rk:${num}:${fromCode}:${toCode}:${internalDate}:${coach}:${quota}`;
    const url = `${BASE_URL}/api/v1/seats/${num}/${fromCode}/${toCode}/${rkDate}/${coach}/${quota}`;

    try {
      const json = await this._cachedFetch(
        cacheKey,
        CACHE_TTL_CONFIG.availability,
        () => this._fetch(url, 1, { ...options, budgetTracker: tracker }),
        'availability',
        { ...options, budgetTracker: tracker }
      );

      if (json === null) {
        logger.debug(`[RailKitAdapter] getAvailability: budget exhausted or blocked for ${num} ${fromCode}->${toCode}`);
        return {
          ...this._errorAvailability(num, fromCode, toCode, internalDate, coach, quota, 'BUDGET_EXHAUSTED'),
          isBudgetExhausted: true,
          isUnchecked: true,
          normalizedStatus: 'UNCHECKED',
        };
      }

      if (!json || !json.data) {
        logger.debug(`[RailKitAdapter] getAvailability: empty response for ${num} ${fromCode}->${toCode}`);
        return this._errorAvailability(num, fromCode, toCode, internalDate, coach, quota, 'Empty response');
      }

      // Find entry for the queried date; fall back to first
      const availList = Array.isArray(json.data.availability) ? json.data.availability : [];
      const entry = availList.find((a) => {
        if (!a?.date || !rkDate) return false;
        if (a.date === rkDate) return true;
        const normA = a.date.split('-').map(Number).join('-');
        const normB = rkDate.split('-').map(Number).join('-');
        return normA === normB;
      }) || availList[0] || null;

      // Extract the most specific IRCTC raw status string from entry:
      const rawStatus = entry?.rawStatus || entry?.availabilityText || entry?.status || entry?.currentStatus || '';
      const predictionPercentage = entry?.predictionPercentage ?? (entry?.prediction ? parseInt(entry.prediction, 10) : null) ?? null;
      let normalized = normalizeSeatAvailability(rawStatus, {
        availabilityText: entry?.availabilityText,
        predictionPercentage,
      });

      // Extra safeguard: If entry explicitly specifies RAC in availabilityText or rawStatus, ensure RAC is normalized
      if (
        normalized.normalizedStatus !== AVAILABILITY_STATUS.AVAILABLE &&
        (String(entry?.availabilityText || '').includes('RAC') || String(entry?.rawStatus || '').includes('RAC'))
      ) {
        normalized = {
          normalizedStatus: AVAILABILITY_STATUS.RAC,
          rawStatus: entry?.rawStatus || entry?.availabilityText || rawStatus,
          seatsAvailable: normalized.seatsAvailable,
          racPosition: normalized.racPosition || normalized.seatsAvailable,
          isAvailable: false,
        };
      }

      // Extract fare if provided in the seats response
      // RailKit format: { baseFare, reservationCharge, superfastCharge, serviceTax, totalFare }
      const rawFare = json.data.fare || null;
      let parsedFare = null;
      if (rawFare && typeof rawFare.totalFare === 'number') {
        const baseFare = typeof rawFare.baseFare === 'number' ? rawFare.baseFare : rawFare.totalFare;
        const reservation = typeof rawFare.reservationCharge === 'number'
          ? rawFare.reservationCharge
          : (typeof rawFare.reservation === 'number' ? rawFare.reservation : null);
        const superfast = typeof rawFare.superfastCharge === 'number'
          ? rawFare.superfastCharge
          : (typeof rawFare.superfast === 'number' ? rawFare.superfast : null);
        const catering = typeof rawFare.cateringCharge === 'number'
          ? rawFare.cateringCharge
          : (typeof rawFare.catering === 'number' ? rawFare.catering : null);
        const gst = typeof rawFare.serviceTax === 'number'
          ? rawFare.serviceTax
          : (typeof rawFare.gst === 'number' ? rawFare.gst : null);
        const dynamicFare = typeof rawFare.dynamicFare === 'number' ? rawFare.dynamicFare : null;

        parsedFare = {
          baseFare,
          reservation,
          reservationCharge: reservation,
          superfast,
          superfastCharge: superfast,
          catering,
          cateringCharge: catering,
          gst,
          serviceTax: gst,
          dynamicFare,
          totalFare: rawFare.totalFare,
        };

        // Cache this fare under the fare key so fareLookup does NOT make an extra HTTP request!
        const fareCacheKey = `fare:rk:${num}:${fromCode}:${toCode}:${internalDate}:${coach}:${quota}`;
        const fareData = {
          status: 'ok',
          provider: 'RailKit',
          trainNo: num,
          trainNumber: num,
          trainName: json.data.train?.trainName || null,
          fromStation: fromCode,
          fromStnCode: fromCode,
          toStation: toCode,
          toStnCode: toCode,
          date: internalDate,
          travelClass: coach,
          class: coach,
          quota,
          distance: json.data.train?.distance ? Number(json.data.train.distance) : null,
          baseFare: parsedFare.baseFare,
          totalFare: parsedFare.totalFare,
          fareBreakup: parsedFare,
          isEstimated: false,
          source: 'RailKit',
        };
        this._cache.set(fareCacheKey, { data: fareData, expiresAt: Date.now() + CACHE_TTL_CONFIG.fare });
        await persistentCacheService.set(fareCacheKey, fareData, 'fare', CACHE_TTL_CONFIG.fare);
      }

      const dateStrip = availList.map((a) => {
        const norm = normalizeSeatAvailability(a.rawStatus || a.availabilityText || a.status, {
          availabilityText: a.availabilityText,
          predictionPercentage: a.predictionPercentage,
        });
        const cleanDate = formatJourneyDate(a.date) || a.date;
        const isConfirmed = norm.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE;
        return {
          date: cleanDate,
          status: a.status,
          availabilityText: a.availabilityText,
          rawStatus: a.rawStatus,
          predictionPercentage: a.predictionPercentage ?? null,
          canBook: a.canBook ?? false,
          normalizedStatus: norm.normalizedStatus,
          bestTier: norm.normalizedStatus,
          confirmed: isConfirmed,
          class: coach,
        };
      });

      logger.debug(
        `[RailKitAdapter] Avail ${num} ${fromCode}->${toCode} ${rkDate}: raw="${rawStatus}" -> "${normalized.normalizedStatus}" (fare: ${parsedFare?.totalFare ?? 'none'})`
      );

      return {
        status: 'ok',
        success: true,
        provider: 'RailKit',
        trainNo: num,
        trainNumber: num,
        fromCode,
        fromStnCode: fromCode,
        toCode,
        toStnCode: toCode,
        date: internalDate,
        travelClass: coach,
        coach,
        quota,
        normalizedStatus: normalized.normalizedStatus,
        rawStatus,
        statusText: entry?.availabilityText || rawStatus,
        availabilityText: entry?.availabilityText || null,
        seatsAvailable: entry?.availableSeats ?? normalized.seatsAvailable,
        waitlistPosition: normalized.waitlistPosition ?? null,
        racPosition: normalized.racPosition ?? null,
        isAvailable: normalized.isAvailable,
        canBook: entry?.canBook ?? normalized.isAvailable,
        prediction: entry?.prediction || null,
        predictionPercentage: predictionPercentage ?? normalized.predictionPercentage ?? null,
        isLive: true,
        fare: parsedFare,
        totalFare: parsedFare?.totalFare ?? null,
        fareBreakup: parsedFare,
        dates: dateStrip,
        queryTimestamp: new Date().toISOString(),
      };
    } catch (err) {
      const httpStatus = err.status;
      logger.error(`[DIAGNOSTIC - RAILKIT getAvailability ERROR] Train ${num} ${fromCode}->${toCode} date=${internalDate} HTTP ${httpStatus || 'none'}: ${err.message} | body: ${err.body || 'none'}`);
      let errRes;
      if (httpStatus === 400 || httpStatus === 404) {
        logger.debug(`[RailKitAdapter] getAvailability HTTP ${httpStatus} for ${num}: ${err.body || err.message}`);
        errRes = this._errorAvailability(num, fromCode, toCode, internalDate, coach, quota, `HTTP ${httpStatus}`);
      } else if (httpStatus === 429) {
        logger.warn(`[RailKitAdapter] Rate limited (429) for ${num} ${fromCode}->${toCode}`);
        errRes = this._errorAvailability(num, fromCode, toCode, internalDate, coach, quota, 'RATE_LIMITED');
      } else {
        logger.warn(`[RailKitAdapter] getAvailability error for ${num}: ${err.message}`);
        errRes = this._errorAvailability(num, fromCode, toCode, internalDate, coach, quota, err.message);
      }
      // Cache failed calls for at most 30 seconds
      this._cache.set(cacheKey, { data: errRes, expiresAt: Date.now() + 30_000 });
      return errRes;
    }
  }

  /**
   * 2. Fare Lookup (https://railkit.in/docs/fare-lookup)
   * SDK: fareLookup(trainNo: string, fromStnCode: string, toStnCode: string, date: string, travelClass: string, quota: string)
   * REST: GET /api/v1/fare/:trainNo/:date/:fromStation/:toStation/:class/:quota
   *
   * @param {string} trainNo - 5-digit train number
   * @param {string} fromStnCode - Origin station code
   * @param {string} toStnCode - Destination station code
   * @param {string|Date} date - Journey date (DD-MM-YYYY or YYYY-MM-DD or Date)
   * @param {string} travelClass - 1A, 2A, 3A, 3E, CC, EC, EA, FC, SL, 2S, etc.
   * @param {string} quota - GN, TQ, PT, LD, DF, FT, LB, etc.
   */
  async fareLookup(trainNo, fromStnCode, toStnCode, date, travelClass = '3A', quota = 'GN') {
    // Support object argument if passed
    if (typeof trainNo === 'object' && trainNo !== null) {
      ({
        trainNo,
        fromStnCode = trainNo.from || trainNo.fromCode || trainNo.fromStation,
        toStnCode = trainNo.to || trainNo.toCode || trainNo.toStation,
        date = trainNo.departureDate || trainNo.journeyDate,
        travelClass = trainNo.travelClass || trainNo.class || trainNo.coach || '3A',
        quota = trainNo.quota || 'GN',
      } = trainNo);
    }

    const num = this._normalizeTrainNo(trainNo);
    const fromCode = this._normalizeCode(fromStnCode);
    const toCode = this._normalizeCode(toStnCode);
    const internalDate = formatJourneyDate(date);
    const rkDate = toRailKitDate(internalDate);

    if (!rkDate) {
      return this._unknownFare(num, fromCode, toCode, internalDate, travelClass, quota, 'Invalid date');
    }

    for (const [code, label] of [[fromCode, 'from'], [toCode, 'to']]) {
      const v = await this.validateStation(code);
      if (!v.valid) {
        return this._unknownFare(num, fromCode, toCode, internalDate, travelClass, quota, v.reason);
      }
    }

    const cacheKey = `fare:rk:${num}:${fromCode}:${toCode}:${internalDate}:${travelClass}:${quota}`;
    const cached = this._cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug(`[RailKitAdapter] Fare cache hit for ${num} ${fromCode}->${toCode} ${rkDate}`);
      return cached.data;
    }

    // Exact REST route per documentation: /api/v1/fare/:trainNo/:date/:fromStation/:toStation/:class/:quota
    const url = `${BASE_URL}/api/v1/fare/${num}/${rkDate}/${fromCode}/${toCode}/${travelClass}/${quota}`;

    try {
      const json = await this._cachedFetch(cacheKey, CACHE_TTL_CONFIG.fare, () => this._fetch(url), 'fare');

      if (!json || !json.data) {
        return this._unknownFare(num, fromCode, toCode, internalDate, travelClass, quota, 'Empty response');
      }

      const d = json.data;
      const fb = d.fareBreakup || d.fare || {};
      const totalFare = typeof d.totalFare === 'number'
        ? d.totalFare
        : (typeof fb.totalFare === 'number' ? fb.totalFare : null);
      const baseFare = typeof d.baseFare === 'number'
        ? d.baseFare
        : (typeof fb.baseFare === 'number' ? fb.baseFare : totalFare);

      if (totalFare === null && baseFare === null) {
        return this._unknownFare(num, fromCode, toCode, internalDate, travelClass, quota, 'No fare in response');
      }

      const reservation = d.reservation ?? d.reservationCharge ?? fb.reservationCharge ?? null;
      const superfast = d.superfast ?? d.superfastCharge ?? fb.superfastCharge ?? null;
      const catering = d.catering ?? d.cateringCharge ?? fb.cateringCharge ?? null;
      const gst = d.gst ?? d.serviceTax ?? fb.serviceTax ?? null;
      const dynamicFare = d.dynamicFare ?? fb.dynamicFare ?? null;

      logger.debug(`[RailKitAdapter] Fare ${num} ${fromCode}->${toCode} ${rkDate}: total=${totalFare}`);

      return {
        status: 'ok',
        success: true,
        provider: 'RailKit',
        trainNo: num,
        trainNumber: num,
        trainName: d.trainName || null,
        fromStation: fromCode,
        fromStnCode: fromCode,
        toStation: toCode,
        toStnCode: toCode,
        date: internalDate,
        travelClass,
        class: travelClass,
        quota,
        distance: d.distance ? Number(d.distance) : null,
        baseFare,
        totalFare,
        fareBreakup: {
          baseFare: d.baseFare ?? fb.baseFare ?? baseFare,
          reservation,
          reservationCharge: reservation,
          superfast,
          superfastCharge: superfast,
          catering,
          cateringCharge: catering,
          gst,
          serviceTax: gst,
          dynamicFare,
          fuelAmount: d.fuelAmount ?? 0,
          tatkalFare: d.tatkalFare ?? 0,
          concession: d.concession ?? 0,
          otherCharge: d.otherCharge ?? 0,
          totalFare,
        },
        isEstimated: false,
        source: 'RailKit',
      };
    } catch (err) {
      const httpStatus = err.status;
      logger.error(`[DIAGNOSTIC - RAILKIT fareLookup ERROR] Train ${num} ${fromCode}->${toCode} date=${internalDate} HTTP ${httpStatus || 'none'}: ${err.message} | body: ${err.body || 'none'}`);
      if (httpStatus === 400 || httpStatus === 404) {
        return this._unknownFare(num, fromCode, toCode, internalDate, travelClass, quota, `HTTP ${httpStatus}`);
      }
      if (httpStatus === 429) {
        logger.warn(`[RailKitAdapter] Rate limited (429) on fare for ${num}`);
        return this._errorFare(num, fromCode, toCode, internalDate, travelClass, quota, 'RATE_LIMITED');
      }
      logger.warn(`[RailKitAdapter] fareLookup error for ${num}: ${err.message}`);
      return this._errorFare(num, fromCode, toCode, internalDate, travelClass, quota, err.message);
    }
  }

  /**
   * Alias for fareLookup for backwards compatibility.
   */
  async getFare(trainNo, from, to, date, travelClass = '3A', quota = 'GN') {
    return this.fareLookup(trainNo, from, to, date, travelClass, quota);
  }

  /**
   * 3. Train Search Between Stations (https://railkit.in/docs/train-search)
   * SDK: searchTrainBetweenStations(fromStnCode: string, toStnCode: string, date?: string)
   * REST: GET /api/v1/trains/between/:fromStnCode/:toStnCode?date=DD-MM-YYYY
   */
  async searchTrainBetweenStations(fromStnCode, toStnCode, date, options = {}) {
    if (typeof date === 'object' && date !== null && !(date instanceof Date)) {
      options = date;
      date = options.date || options.departureDate || null;
    }
    const fromCode = this._normalizeCode(fromStnCode);
    const toCode = this._normalizeCode(toStnCode);
    const internalDate = date ? formatJourneyDate(date) : '';
    const rkDate = internalDate ? toRailKitDate(internalDate) : '';

    const cacheKey = `trains:between:${fromCode}:${toCode}:${rkDate || 'all'}`;
    const url = `${BASE_URL}/api/v1/trains/between/${fromCode}/${toCode}${rkDate ? `?date=${rkDate}` : ''}`;

    try {
      const json = await this._cachedFetch(cacheKey, CACHE_TTL_CONFIG.timetable, () => this._fetch(url), 'timetable', options);
      if (json === null) {
        return {
          status: 'not_checked',
          success: false,
          provider: 'RailKit',
          data: [],
          reason: 'STATIC_BUDGET_EXHAUSTED',
          isBudgetExhausted: true,
        };
      }
      const isFromCache = this.hasCachedSearch(fromCode, toCode, date);
      return {
        status: 'ok',
        success: Boolean(json?.success),
        provider: 'RailKit',
        data: Array.isArray(json?.data) ? json.data : [],
        cacheHit: Boolean(isFromCache || json?._fromCache),
      };
    } catch (err) {
      const isNoTrains =
        err.status === 404 ||
        (err.status === 400 && /no trains found/i.test(err.body || err.message));
      if (isNoTrains) {
        logger.info(`[RailKitAdapter] searchTrainBetweenStations: 0 trains found between ${fromCode} and ${toCode}`);
        return {
          status: 'ok',
          success: true,
          provider: 'RailKit',
          data: [],
        };
      }
      logger.warn(`[RailKitAdapter] searchTrainBetweenStations error: ${err.message}`);
      return { status: 'error', success: false, provider: 'RailKit', data: [], error: err.message };
    }
  }

  /**
   * 4. Station Timetable (https://railkit.in/docs/station-timetable)
   * SDK: trainTimetableAtStation(stationCode: string, date?: string)
   * REST: GET /api/v1/stations/:stationCode/timetable?date=DD-MM-YYYY
   */
  async trainTimetableAtStation(stationCode, date) {
    const code = this._normalizeCode(stationCode);
    const internalDate = date ? formatJourneyDate(date) : '';
    const rkDate = internalDate ? toRailKitDate(internalDate) : '';

    const cacheKey = `stn:timetable:${code}:${rkDate || 'all'}`;
    const url = `${BASE_URL}/api/v1/stations/${code}/timetable${rkDate ? `?date=${rkDate}` : ''}`;

    try {
      const json = await this._cachedFetch(cacheKey, CACHE_TTL_CONFIG.timetable, () => this._fetch(url), 'timetable');
      return { status: 'ok', success: Boolean(json?.success), data: json?.data || [] };
    } catch (err) {
      return { status: 'error', success: false, data: [], error: err.message };
    }
  }

  async getStationTimetable(stationCode, date) {
    return this.trainTimetableAtStation(stationCode, date);
  }

  /**
   * 5. Train Info (https://railkit.in/docs/train-info)
   * SDK: getTrainInfo(trainNumber: string)
   * REST: GET /api/v1/trains/:trainNumber/info
   */
  async getTrainInfo(trainNumber) {
    const num = this._normalizeTrainNo(trainNumber);
    const cacheKey = `train:info:${num}`;
    const url = `${BASE_URL}/api/v1/trains/${num}/info`;

    try {
      const json = await this._cachedFetch(cacheKey, 24 * 60 * 60 * 1000, () => this._fetch(url), 'static');
      return { status: 'ok', success: Boolean(json?.success), data: json?.data || null };
    } catch (err) {
      return { status: 'error', success: false, data: null, error: err.message };
    }
  }

  async trainSchedule(trainNumber) {
    return this.getTrainInfo(trainNumber);
  }

  hasCachedSearch(fromCode, toCode, date) {
    const internalDate = date ? formatJourneyDate(date) : '';
    const rkDate = internalDate ? toRailKitDate(internalDate) : '';
    const from = this._normalizeCode(fromCode);
    const to = this._normalizeCode(toCode);
    const cacheKey = `trains:between:${from}:${to}:${rkDate || 'all'}`;
    const cached = this._cache.get(cacheKey);
    return Boolean(cached && cached.expiresAt > Date.now());
  }

  hasCachedInfo(trainNumber) {
    const num = this._normalizeTrainNo(trainNumber);
    const cacheKey = `train:info:${num}`;
    const cached = this._cache.get(cacheKey);
    return Boolean(cached && cached.expiresAt > Date.now());
  }

  /**
   * 6. Station By Code (https://railkit.in/docs/station-by-code)
   * SDK: stationByCode(stationCode: string)
   * REST: GET /api/v1/stations/:stationCode
   */
  async stationByCode(stationCode) {
    const code = this._normalizeCode(stationCode);
    const cacheKey = `stn:code:${code}`;
    const url = `${BASE_URL}/api/v1/stations/${code}`;

    try {
      const json = await this._cachedFetch(cacheKey, 24 * 60 * 60 * 1000, () => this._fetch(url), 'static');
      return { status: 'ok', success: Boolean(json?.success), data: json?.data || null };
    } catch (err) {
      return { status: 'error', success: false, data: null, error: err.message };
    }
  }

  async getStation(stationCode) {
    return this.stationByCode(stationCode);
  }

  /**
   * 7. Station Search by Name (https://railkit.in/docs/station-search)
   * SDK: stationsByName(name: string)
   * REST: GET /api/v1/stations/search?name=...
   */
  async stationsByName(name) {
    const q = String(name || '').trim();
    const url = `${BASE_URL}/api/v1/stations/search?name=${encodeURIComponent(q)}`;
    try {
      const json = await this._cachedFetch(`stn:name:${q}`, 24 * 60 * 60 * 1000, () => this._fetch(url), 'static');
      return { status: 'ok', success: Boolean(json?.success), data: json?.data || [] };
    } catch (err) {
      return { status: 'error', success: false, data: [], error: err.message };
    }
  }

  /**
   * 8. Train Search by Name (https://railkit.in/docs/train-name-search)
   * SDK: trainsByName(name: string)
   * REST: GET /api/v1/trains/search?name=...
   */
  async trainsByName(name) {
    const q = String(name || '').trim();
    const url = `${BASE_URL}/api/v1/trains/search?name=${encodeURIComponent(q)}`;
    try {
      const json = await this._cachedFetch(`train:name:${q}`, 24 * 60 * 60 * 1000, () => this._fetch(url), 'static');
      return { status: 'ok', success: Boolean(json?.success), data: json?.data || [] };
    } catch (err) {
      return { status: 'error', success: false, data: [], error: err.message };
    }
  }

  /**
   * 9. Train by Number (https://railkit.in/docs/train-by-number)
   * SDK: trainByNumber(trainNumber: string)
   * REST: GET /api/v1/trains/:trainNumber
   */
  async trainByNumber(trainNumber) {
    const num = this._normalizeTrainNo(trainNumber);
    const url = `${BASE_URL}/api/v1/trains/${num}`;
    try {
      const json = await this._cachedFetch(`train:num:${num}`, 24 * 60 * 60 * 1000, () => this._fetch(url), 'static');
      return { status: 'ok', success: Boolean(json?.success), data: json?.data || null };
    } catch (err) {
      return { status: 'error', success: false, data: null, error: err.message };
    }
  }

  /**
   * 10. PNR Status (https://railkit.in/docs/pnr-status)
   * SDK: checkPNRStatus(pnr: string)
   * REST: GET /api/v1/pnr/:pnr
   */
  async checkPNRStatus(pnr) {
    const cleanPnr = String(pnr || '').trim().replace(/\D/g, '');
    const url = `${BASE_URL}/api/v1/pnr/${cleanPnr}`;
    const cacheKey = `railkit:pnr:${cleanPnr}`;
    try {
      const json = await this._cachedFetch(
        cacheKey,
        CACHE_TTL_CONFIG.pnr,
        () => this._fetch(url),
        'pnr'
      );
      return { status: 'ok', success: Boolean(json?.success), data: json?.data || null };
    } catch (err) {
      return { status: 'error', success: false, data: null, error: err.message };
    }
  }

  async checkPNR(pnr) {
    return this.checkPNRStatus(pnr);
  }

  /**
   * 11. Live Train Tracking (https://railkit.in/docs/live-tracking)
   * SDK: trackTrain(trainNumber: string, date: string)
   * REST: GET /api/v1/trains/:trainNumber/live/:date
   */
  async trackTrain(trainNumber, date) {
    const num = this._normalizeTrainNo(trainNumber);
    const rkDate = toRailKitDate(formatJourneyDate(date));
    const url = `${BASE_URL}/api/v1/trains/${num}/live/${rkDate}`;
    const cacheKey = `railkit:live:${num}:${rkDate}`;
    try {
      const json = await this._cachedFetch(
        cacheKey,
        CACHE_TTL_CONFIG.live,
        () => this._fetch(url),
        'live'
      );
      return { status: 'ok', success: Boolean(json?.success), data: json?.data || null };
    } catch (err) {
      return { status: 'error', success: false, data: null, error: err.message };
    }
  }

  /**
   * 12. Cancelled Trains List (https://railkit.in/docs/cancelled-trains)
   * SDK: cancelList()
   * REST: GET /api/v1/trains/cancelled
   */
  async cancelList(date = null) {
    const internalDate = date ? formatJourneyDate(date) : '';
    const rkDate = internalDate ? toRailKitDate(internalDate) : '';
    const url = `${BASE_URL}/api/v1/trains/cancelled${rkDate ? `?date=${rkDate}` : ''}`;
    const cacheKey = `railkit:cancelled:${rkDate || 'all'}`;
    try {
      const json = await this._cachedFetch(
        cacheKey,
        CACHE_TTL_CONFIG.cancelled,
        () => this._fetch(url),
        'cancelled'
      );
      return { status: 'ok', success: Boolean(json?.success), data: json?.data || {} };
    } catch (err) {
      return { status: 'error', success: false, data: {}, error: err.message };
    }
  }

  async getCancelledTrains(date) {
    return this.cancelList(date);
  }

  // Error/unknown result factories

  _unknownAvailability(num, from, to, date, travelClass, quota, reason) {
    return {
      status: 'unknown',
      success: false,
      provider: 'RailKit',
      trainNo: num,
      trainNumber: num,
      fromCode: from,
      fromStnCode: from,
      toCode: to,
      toStnCode: to,
      date,
      travelClass,
      coach: travelClass,
      quota,
      normalizedStatus: AVAILABILITY_STATUS.UNKNOWN,
      rawStatus: 'UNKNOWN',
      statusText: 'UNKNOWN',
      availabilityText: null,
      seatsAvailable: null,
      isAvailable: false,
      canBook: false,
      isLive: false,
      fare: null,
      fareBreakup: null,
      queryTimestamp: new Date().toISOString(),
      reason,
    };
  }

  _errorAvailability(num, from, to, date, travelClass, quota, reason) {
    const reasonStr = String(reason || 'ERROR');
    return {
      status: 'error',
      success: false,
      provider: 'RailKit',
      trainNo: num,
      trainNumber: num,
      fromCode: from,
      fromStnCode: from,
      toCode: to,
      toStnCode: to,
      date,
      travelClass,
      coach: travelClass,
      quota,
      normalizedStatus: AVAILABILITY_STATUS.UNKNOWN,
      isError: true,
      rawStatus: reasonStr,
      statusText: "couldn't check — tap to retry",
      availabilityText: "couldn't check — tap to retry",
      seatsAvailable: null,
      isAvailable: false,
      canBook: false,
      isLive: false,
      fare: null,
      fareBreakup: null,
      queryTimestamp: new Date().toISOString(),
      reason: reasonStr,
      errorCode: reasonStr,
    };
  }

  _unknownFare(num, from, to, date, travelClass, quota, reason) {
    return {
      status: 'unknown',
      success: false,
      provider: 'RailKit',
      trainNo: num,
      trainNumber: num,
      trainName: null,
      fromStation: from,
      fromStnCode: from,
      toStation: to,
      toStnCode: to,
      date,
      travelClass,
      class: travelClass,
      quota,
      distance: null,
      baseFare: null,
      totalFare: null,
      fareBreakup: null,
      isEstimated: false,
      source: 'RailKit',
      reason,
    };
  }

  _errorFare(num, from, to, date, travelClass, quota, reason) {
    return { ...this._unknownFare(num, from, to, date, travelClass, quota, reason), status: 'error' };
  }

  getStats() {
    const raw = this._monthlyCount || 0;
    const offset = Number(config.apiQuota?.usageOffset || 0);
    const quota = Number(config.apiQuota?.monthlyLimit || 10000);
    const total = raw + offset;
    const percentage = Math.round((total / quota) * 100);
    const totalLookups = (this._metrics?.hits || 0) + (this._metrics?.misses || 0);
    const hitRatio = totalLookups > 0 ? Number(((this._metrics?.hits || 0) / totalLookups).toFixed(4)) : 0;

    return {
      provider: 'RailKit',
      rawOutboundRequests: raw,
      usageOffset: offset,
      totalOutboundRequests: total,
      outboundRequests: total,
      monthlyRequests: total,
      quotaLimit: quota,
      percentage,
      monthStart: this._monthStart,
      cacheSize: this._cache.size,
      inFlightCount: this._inFlight.size,
      activeRequests: this._activeRequests,
      queuedRequests: this._concurrencyQueue.length,
      cacheMetrics: {
        hits: this._metrics?.hits || 0,
        misses: this._metrics?.misses || 0,
        inFlightCoalesced: this._metrics?.inFlightCoalesced || 0,
        upstreamRequests: this._metrics?.upstreamRequests || 0,
        upstreamErrors: this._metrics?.upstreamErrors || 0,
        rateLimits: this._metrics?.rateLimits || 0,
        hitRatio,
        persistentL1Size: this._cache.size,
      },
    };
  }

  async clearCache() {
    this._cache.clear();
    this._inFlight.clear();
    this._stationCache.clear();
    await persistentCacheService.clearAll();
    logger.info('[RailKitAdapter] Cache completely cleared');
  }
}

/**
 * Deterministic RailKit cache key builder.
 * Generates canonical, normalized keys incorporating all response-affecting parameters.
 */
export function buildRailKitCacheKey(type, params = {}) {
  switch (type) {
    case 'availability': {
      const num = String(params.trainNo || '').trim().replace(/\D/g, '').padStart(5, '0').slice(-5);
      const from = String(params.from || '').trim().toUpperCase();
      const to = String(params.to || '').trim().toUpperCase();
      const date = String(params.date || '').trim();
      const coach = String(params.coach || '3A').trim().toUpperCase();
      const quota = String(params.quota || 'GN').trim().toUpperCase();
      return `railkit:availability:${num}:${from}:${to}:${date}:${coach}:${quota}`;
    }
    case 'fare': {
      const num = String(params.trainNo || '').trim().replace(/\D/g, '').padStart(5, '0').slice(-5);
      const from = String(params.from || '').trim().toUpperCase();
      const to = String(params.to || '').trim().toUpperCase();
      const date = String(params.date || '').trim();
      const coach = String(params.travelClass || params.coach || '3A').trim().toUpperCase();
      const quota = String(params.quota || 'GN').trim().toUpperCase();
      return `railkit:fare:${num}:${from}:${to}:${date}:${coach}:${quota}`;
    }
    case 'search': {
      const from = String(params.from || '').trim().toUpperCase();
      const to = String(params.to || '').trim().toUpperCase();
      const date = String(params.date || '').trim();
      return `railkit:search:${from}:${to}:${date || 'all'}`;
    }
    case 'timetable': {
      const stn = String(params.station || '').trim().toUpperCase();
      const date = String(params.date || '').trim();
      return `railkit:timetable:${stn}:${date || 'all'}`;
    }
    case 'station': {
      const code = String(params.code || params.query || '').trim().toUpperCase();
      return `railkit:station:${code}`;
    }
    case 'schedule':
    case 'trainInfo': {
      const num = String(params.trainNo || params.trainNumber || '').trim().replace(/\D/g, '').padStart(5, '0').slice(-5);
      return `railkit:schedule:${num}`;
    }
    case 'pnr': {
      const pnr = String(params.pnr || '').trim().replace(/\D/g, '');
      return `railkit:pnr:${pnr}`;
    }
    case 'live': {
      const num = String(params.trainNo || '').trim().replace(/\D/g, '').padStart(5, '0').slice(-5);
      const date = String(params.date || '').trim();
      return `railkit:live:${num}:${date}`;
    }
    default:
      return `railkit:${type}:${JSON.stringify(params)}`;
  }
}

export const railKitAdapter = new RailKitAdapter();
export default railKitAdapter;

// SDK-compatible standalone function exports (matches https://railkit.in/docs)
export function configure(apiKey) {
  if (apiKey) {
    process.env.RAILKIT_API_KEY = apiKey;
    railKitAdapter._apiKey = apiKey;
  }
}

export const clearCache = () => railKitAdapter.clearCache();

export const getAvailability = (...args) => railKitAdapter.getAvailability(...args);
export const fareLookup = (...args) => railKitAdapter.fareLookup(...args);
export const searchTrainBetweenStations = (...args) => railKitAdapter.searchTrainBetweenStations(...args);
export const trainTimetableAtStation = (...args) => railKitAdapter.trainTimetableAtStation(...args);
export const stationByCode = (...args) => railKitAdapter.stationByCode(...args);
export const stationsByName = (...args) => railKitAdapter.stationsByName(...args);
export const getTrainInfo = (...args) => railKitAdapter.getTrainInfo(...args);
export const trainByNumber = (...args) => railKitAdapter.trainByNumber(...args);
export const trainsByName = (...args) => railKitAdapter.trainsByName(...args);
export const checkPNRStatus = (...args) => railKitAdapter.checkPNRStatus(...args);
export const trackTrain = (...args) => railKitAdapter.trackTrain(...args);
export const cancelList = (...args) => railKitAdapter.cancelList(...args);

/**
 * Normalizes a train item returned by RailKit into canonical format
 * expected by DirectJourneyService and JourneyRecoveryService.
 */
export function normalizeRailKitTrain(rkTrain, defaultFrom = '', defaultTo = '') {
  if (!rkTrain) return null;
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
  if (rkTrain.durationMinutes) {
    durationMinutes = rkTrain.durationMinutes;
  } else if (typeof rkTrain.duration === 'number') {
    durationMinutes = rkTrain.duration;
  } else if (rkTrain.travel_time) {
    const m = String(rkTrain.travel_time).match(/(\d+):(\d+)/);
    if (m) durationMinutes = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  const fromCode = rkTrain.from_stn_code || rkTrain.from?.code || rkTrain.fromCode || defaultFrom;
  const toCode = rkTrain.to_stn_code || rkTrain.to?.code || rkTrain.toCode || defaultTo;
  const fromName = rkTrain.from_stn_name || rkTrain.source_stn_name || rkTrain.from?.name || fromCode;
  const toName = rkTrain.to_stn_name || rkTrain.dstn_stn_name || rkTrain.to?.name || toCode;
  const trainNum = String(rkTrain.train_number || rkTrain.train_no || rkTrain.trainNumber || rkTrain.number || '');
  let trainName = rkTrain.train_name || rkTrain.trainName || rkTrain.name || 'Express';
  trainName = String(trainName).replace(/\bEXPRES\b/gi, 'EXPRESS').trim();

  let classes = [];
  const rawClasses = rkTrain.classes_of_travel || rkTrain.classes || rkTrain.train_type || [];
  if (Array.isArray(rawClasses)) {
    classes = rawClasses.map((c) => String(c).trim().toUpperCase());
  } else if (typeof rawClasses === 'string') {
    classes = rawClasses.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
  }

  const departureTime = rkTrain.from_time || rkTrain.departureTime || rkTrain.from?.departure || '06:00';
  const arrivalTime = rkTrain.to_time || rkTrain.arrivalTime || rkTrain.to?.arrival || '18:00';

  return {
    train: {
      number: trainNum,
      name: trainName,
      runDays,
      classes,
    },
    trainNumber: trainNum,
    trainName,
    classes,
    classes_of_travel: rkTrain.classes_of_travel || classes.join(','),
    departureTime,
    arrivalTime,
    fromCode,
    toCode,
    from: {
      code: fromCode,
      name: fromName,
      departure: departureTime,
      day: 1,
    },
    to: {
      code: toCode,
      name: toName,
      arrival: arrivalTime,
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

