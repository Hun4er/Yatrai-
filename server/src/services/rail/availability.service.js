import railRadarAdapter from '../../providers/rail/railRadar.adapter.js';
import aopayAdapter from '../../providers/rail/aopay.adapter.js';
import { formatJourneyDate } from '../../utils/railwayTime.js';
import logger from '../../utils/logger.js';
import {
  AVAILABILITY_STATUS,
  JOURNEY_AVAILABILITY,
  normalizeSeatAvailability,
} from './availabilityNorm.js';

export { AVAILABILITY_STATUS, JOURNEY_AVAILABILITY, normalizeSeatAvailability };

/**
 * AvailabilityService
 *
 * Implements Section 7:
 * - Independent validation of every train leg
 * - Normalized statuses: AVAILABLE, RAC, WAITLIST, UNAVAILABLE, UNKNOWN
 * - Strict confirmed availability enforcement
 * - Journey-level availability aggregation
 * - Short-lived caching and request deduplication
 */
export class AvailabilityService {
  constructor(dependencies = {}) {
    this._railRadar = dependencies.railRadar;
    this._aopay = dependencies.aopay;
    this.cache = new Map();
    this.cacheTtlMs = 5 * 60 * 1000; // 5 minutes
  }

  get railRadar() {
    return this._railRadar || railRadarAdapter;
  }

  get aopay() {
    return this._aopay || aopayAdapter;
  }

  /**
   * Validates a single train leg availability.
   *
   * @param {Object} legParams
   * @param {string} legParams.trainNumber
   * @param {string} legParams.fromCode
   * @param {string} legParams.toCode
   * @param {string|Date} legParams.date
   * @param {string} [legParams.travelClass='3A']
   * @param {string} [legParams.quota='GN']
   * @returns {Promise<Object>} Normalized leg availability
   */
  async checkLegAvailability({
    trainNumber,
    fromCode,
    toCode,
    date,
    travelClass = '3A',
    quota = 'GN',
    budgetTracker = null,
    isRecovery = true,
  }) {
    const num = String(trainNumber || '').trim();
    const from = String(fromCode || '').trim().toUpperCase();
    const to = String(toCode || '').trim().toUpperCase();
    const dateStr = formatJourneyDate(date) || (typeof date === 'string' ? date.slice(0, 10) : new Date().toISOString().slice(0, 10));

    const cacheKey = this.buildCacheKey(num, from, to, dateStr, travelClass, quota);
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      if (budgetTracker) budgetTracker.recordCacheHit();
      return cached.data;
    }

    if (budgetTracker && isRecovery && !budgetTracker.canMakeRecoveryRequest()) {
      return {
        success: false,
        provider: 'RailRadar',
        trainNumber: num,
        travelClass,
        quota,
        normalizedStatus: AVAILABILITY_STATUS.UNKNOWN,
        originalStatus: 'UNKNOWN',
        seatsAvailable: null,
        isAvailable: false,
        lastUpdated: new Date().toISOString(),
        isLive: false,
        isBudgetExhausted: true,
        reason: 'BUDGET_EXHAUSTED',
      };
    }

    let result = null;

    // 1. Primary provider: RailRadar
    try {
      result = await this.railRadar.getAvailability(num, from, to, dateStr, travelClass, quota, {
        budgetTracker,
        isRecovery,
      });
    } catch (err) {
      logger.debug(`[AvailabilityService] RailRadar availability check failed: ${err.message}`);
    }

    // 2. Secondary fallback: AOPAY (if authorized and primary was unknown)
    if ((!result || result.normalizedStatus === AVAILABILITY_STATUS.UNKNOWN) && this.aopay?.isAuthorized?.()) {
      try {
        const aopayRes = await this.aopay.checkAvailability(num, from, to, dateStr, travelClass, quota);
        if (aopayRes && aopayRes.normalizedStatus !== AVAILABILITY_STATUS.UNKNOWN) {
          result = aopayRes;
        }
      } catch (err) {
        logger.debug(`[AvailabilityService] AOPAY availability fallback failed: ${err.message}`);
      }
    }

    // 3. Fallback normalization if still null or unknown
    if (!result) {
      result = {
        success: false,
        provider: 'RailRadar',
        trainNumber: num,
        travelClass,
        quota,
        normalizedStatus: AVAILABILITY_STATUS.UNKNOWN,
        originalStatus: 'UNKNOWN',
        seatsAvailable: null,
        isAvailable: false,
        lastUpdated: new Date().toISOString(),
        isLive: false,
      };
    }

    this.cache.set(cacheKey, { data: result, expiresAt: Date.now() + this.cacheTtlMs });
    return result;
  }

  /**
   * Builds distinct cache key separating train number, origin, destination, date, class, and quota.
   */
  buildCacheKey(trainNumber, fromCode, toCode, date, travelClass = '3A', quota = 'GN') {
    const num = String(trainNumber || '').trim();
    const from = String(fromCode || '').trim().toUpperCase();
    const to = String(toCode || '').trim().toUpperCase();
    const dateStr = formatJourneyDate(date) || (typeof date === 'string' ? date.slice(0, 10) : new Date().toISOString().slice(0, 10));
    return `avail:${num}:${from}:${to}:${dateStr}:${travelClass}:${quota}`;
  }

  /**
   * Normalizes raw availability string to canonical enum.
   */
  normalizeAvailabilityStatus(raw) {
    return normalizeSeatAvailability(raw).normalizedStatus;
  }

  /**
   * Evaluates whole journey availability across all its legs.
   *
   * Crucial Business Logic:
   * Leg 1: AVAILABLE + Leg 2: NOT_AVAILABLE => Journey: NOT_BOOKABLE
   * All legs: AVAILABLE => Journey: AVAILABILITY_VERIFIED
   *
   * @param {Array<Object>} legs
   * @param {Object} options
   * @returns {Object} Aggregated journey availability evaluation
   */
  evaluateJourneyAvailability(legs = [], options = {}) {
    if (!Array.isArray(legs) || legs.length === 0) {
      return {
        status: JOURNEY_AVAILABILITY.UNKNOWN,
        journeyStatus: JOURNEY_AVAILABILITY.UNKNOWN,
        isBookable: false,
        hasUnavailableLeg: false,
        isConfirmedAvailable: false,
        legStatuses: [],
        reason: 'NO_LEGS',
      };
    }

    const legStatuses = legs.map((leg) => {
      const avail = leg.availability || leg.booking?.availability || {};
      const rawStatus =
        avail.normalizedStatus ||
        avail.status ||
        (leg.booking?.status === 'available' ? AVAILABILITY_STATUS.AVAILABLE : AVAILABILITY_STATUS.UNKNOWN);
      const status = normalizeSeatAvailability(rawStatus).normalizedStatus;
      return {
        sequence: leg.sequence || 1,
        trainNumber: leg.vehicle?.identifier || leg.service?.number || leg.trainNumber,
        status,
        seatsAvailable: avail.seatsAvailable ?? null,
        isLive: Boolean(avail.isLive),
      };
    });

    // Check if any leg is completely unavailable or not running
    const hasUnavailable = legStatuses.some(
      (l) => l.status === AVAILABILITY_STATUS.UNAVAILABLE || l.status === AVAILABILITY_STATUS.NOT_AVAILABLE || l.status === AVAILABILITY_STATUS.NOT_RUNNING
    );
    if (hasUnavailable) {
      return {
        status: JOURNEY_AVAILABILITY.NOT_BOOKABLE,
        journeyStatus: JOURNEY_AVAILABILITY.NOT_BOOKABLE,
        isBookable: false,
        hasUnavailableLeg: true,
        isConfirmedAvailable: false,
        legStatuses,
        reason: 'ONE_OR_MORE_LEGS_UNAVAILABLE',
      };
    }

    // Check if any leg is waitlisted
    const hasWaitlist = legStatuses.some(
      (l) => l.status === AVAILABILITY_STATUS.WAITLIST || l.status === AVAILABILITY_STATUS.WAITLISTED
    );
    if (hasWaitlist) {
      return {
        status: JOURNEY_AVAILABILITY.WAITLIST_ONLY,
        journeyStatus: JOURNEY_AVAILABILITY.WAITLIST_ONLY,
        isBookable: options.allowWaitlist ?? false,
        hasUnavailableLeg: false,
        isConfirmedAvailable: false,
        legStatuses,
        reason: 'LEGS_WAITLISTED',
      };
    }

    // Check if any leg is RAC
    const hasRac = legStatuses.some((l) => l.status === AVAILABILITY_STATUS.RAC);
    if (hasRac) {
      return {
        status: JOURNEY_AVAILABILITY.RAC_AVAILABLE,
        journeyStatus: JOURNEY_AVAILABILITY.RAC_AVAILABLE,
        isBookable: options.allowRac ?? true,
        hasUnavailableLeg: false,
        isConfirmedAvailable: false,
        legStatuses,
        reason: 'LEGS_RAC',
      };
    }

    // Check if any leg is unknown
    const hasUnknown = legStatuses.some((l) => l.status === AVAILABILITY_STATUS.UNKNOWN);
    if (hasUnknown) {
      return {
        status: JOURNEY_AVAILABILITY.UNKNOWN,
        journeyStatus: JOURNEY_AVAILABILITY.UNKNOWN,
        isBookable: false,
        hasUnavailableLeg: false,
        isConfirmedAvailable: false,
        legStatuses,
        reason: 'AVAILABILITY_UNVERIFIED',
      };
    }

    // All legs are strictly confirmed available
    return {
      status: JOURNEY_AVAILABILITY.AVAILABILITY_VERIFIED,
      journeyStatus: JOURNEY_AVAILABILITY.AVAILABILITY_VERIFIED,
      isBookable: true,
      hasUnavailableLeg: false,
      isConfirmedAvailable: true,
      legStatuses,
      reason: 'ALL_LEGS_AVAILABLE',
    };
  }
}

export const availabilityService = new AvailabilityService();
export default availabilityService;
