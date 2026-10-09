import railRadarAdapter from '../../providers/rail/railRadar.adapter.js';
import aopayAdapter from '../../providers/rail/aopay.adapter.js';
import logger from '../../utils/logger.js';

/**
 * Normalized Availability Status Enums
 */
export const AVAILABILITY_STATUS = {
  AVAILABLE: 'AVAILABLE',
  RAC: 'RAC',
  WAITLISTED: 'WAITLISTED',
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  NOT_RUNNING: 'NOT_RUNNING',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Journey-Level Bookability Status Enums
 */
export const JOURNEY_AVAILABILITY = {
  AVAILABILITY_VERIFIED: 'AVAILABILITY_VERIFIED',
  RAC_AVAILABLE: 'RAC_AVAILABLE',
  WAITLIST_ONLY: 'WAITLIST_ONLY',
  NOT_BOOKABLE: 'NOT_BOOKABLE',
  UNKNOWN: 'UNKNOWN',
};

/**
 * AvailabilityService
 *
 * Implements Section 7:
 * - Independent validation of every train leg
 * - Normalized statuses: AVAILABLE, RAC, WAITLISTED, NOT_AVAILABLE, NOT_RUNNING, UNKNOWN
 * - Journey-level availability aggregation
 * - Short-lived caching and request deduplication
 */
export class AvailabilityService {
  constructor(dependencies = {}) {
    this.railRadar = dependencies.railRadar || railRadarAdapter;
    this.aopay = dependencies.aopay || aopayAdapter;
    this.cache = new Map();
    this.cacheTtlMs = 2 * 60 * 1000; // 2 minutes
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
  }) {
    const num = String(trainNumber || '').trim();
    const from = String(fromCode || '').trim().toUpperCase();
    const to = String(toCode || '').trim().toUpperCase();
    const dateStr = date ? String(date).slice(0, 10) : new Date().toISOString().slice(0, 10);

    const cacheKey = `${num}:${from}:${to}:${dateStr}:${travelClass}:${quota}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    let result = null;

    // 1. Primary provider: RailRadar
    try {
      result = await this.railRadar.getAvailability(num, from, to, dateStr, travelClass, quota);
    } catch (err) {
      logger.debug(`[AvailabilityService] RailRadar availability check failed: ${err.message}`);
    }

    // 2. Secondary fallback: AOPAY (if authorized and primary was unknown)
    if ((!result || result.normalizedStatus === AVAILABILITY_STATUS.UNKNOWN) && this.aopay.isAuthorized()) {
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
        lastUpdated: new Date().toISOString(),
        isLive: false,
      };
    }

    this.cache.set(cacheKey, { data: result, expiresAt: Date.now() + this.cacheTtlMs });
    return result;
  }

  /**
   * Normalizes raw availability string to canonical enum.
   */
  normalizeAvailabilityStatus(raw) {
    if (!raw) return AVAILABILITY_STATUS.UNKNOWN;
    const str = String(raw).toUpperCase();
    if (str.includes('AVAILABLE') || str.includes('AVL') || str.includes('CURR_AVBL')) return AVAILABILITY_STATUS.AVAILABLE;
    if (str.includes('RAC')) return AVAILABILITY_STATUS.RAC;
    if (str.includes('WL') || str.includes('WAITLIST') || str.includes('GNWL')) return AVAILABILITY_STATUS.WAITLISTED;
    if (str.includes('REGRET') || str.includes('NOT AVAILABLE') || str.includes('TRAIN CANCELLED')) return AVAILABILITY_STATUS.NOT_AVAILABLE;
    if (str.includes('NOT RUNNING')) return AVAILABILITY_STATUS.NOT_RUNNING;
    return AVAILABILITY_STATUS.UNKNOWN;
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
        legStatuses: [],
        reason: 'NO_LEGS',
      };
    }

    const legStatuses = legs.map((leg) => {
      const avail = leg.availability || leg.booking?.availability || {};
      const status =
        avail.normalizedStatus ||
        avail.status ||
        (leg.booking?.status === 'available' ? AVAILABILITY_STATUS.AVAILABLE : AVAILABILITY_STATUS.UNKNOWN);
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
      (l) => l.status === AVAILABILITY_STATUS.NOT_AVAILABLE || l.status === AVAILABILITY_STATUS.NOT_RUNNING
    );
    if (hasUnavailable) {
      return {
        status: JOURNEY_AVAILABILITY.NOT_BOOKABLE,
        journeyStatus: JOURNEY_AVAILABILITY.NOT_BOOKABLE,
        isBookable: false,
        hasUnavailableLeg: true,
        legStatuses,
        reason: 'ONE_OR_MORE_LEGS_UNAVAILABLE',
      };
    }

    // Check if any leg is waitlisted
    const hasWaitlist = legStatuses.some((l) => l.status === AVAILABILITY_STATUS.WAITLISTED);
    if (hasWaitlist) {
      return {
        status: JOURNEY_AVAILABILITY.WAITLIST_ONLY,
        journeyStatus: JOURNEY_AVAILABILITY.WAITLIST_ONLY,
        isBookable: options.allowWaitlist ?? false,
        hasUnavailableLeg: false,
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
      legStatuses,
      reason: 'ALL_LEGS_AVAILABLE',
    };
  }
}

export const availabilityService = new AvailabilityService();
export default availabilityService;
