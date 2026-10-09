import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { httpFetch } from '../transport/httpClient.js';

/**
 * AOPAY Railway Data & Booking Provider Adapter
 *
 * Implements:
 * - Secondary provider fallback for train schedules, availability, and fares
 * - Booking preparation & compliance handoff (authorized only)
 * - Strict authorization checks: never attempts unauthorized calls
 * - Isolated interface allowing provider replacement without touching recovery logic
 */
export class AOPAYAdapter {
  constructor(options = {}) {
    this.name = 'AOPAY';
    this.code = 'AOPAY';
    this.apiKey = options.apiKey || config.providers.aopay?.apiKey || null;
    this.baseUrl = (options.baseUrl || config.providers.aopay?.baseUrl || 'https://api.aopay.in/v1').replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs || config.providers.aopay?.timeoutMs || 5000;
    this.enabled = options.enabled ?? (config.providers.aopay?.enabled ?? false);
  }

  /**
   * Verifies if production access and valid API credentials are configured.
   */
  isAuthorized() {
    return Boolean(this.enabled && this.apiKey && this.apiKey.trim().length > 5);
  }

  getHeaders() {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey?.trim()}`,
      'X-Partner-Id': 'yatrai-platform',
    };
  }

  /**
   * Train schedule search fallback.
   */
  async searchTrains(fromCode, toCode, date) {
    if (!this.isAuthorized()) {
      return {
        success: false,
        authorized: false,
        trains: [],
        reason: 'AOPAY_UNAUTHORIZED_OR_DISABLED',
      };
    }

    try {
      const url = `${this.baseUrl}/rail/trains/search?from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}&date=${encodeURIComponent(date)}`;
      const res = await httpFetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
        timeoutMs: this.timeoutMs,
        provider: 'aopay',
      });
      return {
        success: true,
        authorized: true,
        trains: res.data?.trains || res.data?.data || [],
      };
    } catch (err) {
      logger.warn(`[AOPAYAdapter] searchTrains failed: ${err.message}`);
      return {
        success: false,
        authorized: true,
        trains: [],
        error: err.message,
      };
    }
  }

  /**
   * Seat availability fallback.
   */
  async checkAvailability(trainNumber, fromCode, toCode, date, travelClass = '3A', quota = 'GN') {
    if (!this.isAuthorized()) {
      return {
        success: false,
        authorized: false,
        normalizedStatus: 'UNKNOWN',
        reason: 'AOPAY_UNAUTHORIZED_OR_DISABLED',
      };
    }

    try {
      const url = `${this.baseUrl}/rail/trains/${encodeURIComponent(trainNumber)}/availability`;
      const res = await httpFetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ from: fromCode, to: toCode, date, class: travelClass, quota }),
        timeoutMs: this.timeoutMs,
        provider: 'aopay',
      });

      const raw = res.data;
      const statusStr = (raw?.status || raw?.availability || '').toUpperCase();
      let normalizedStatus = 'UNKNOWN';
      if (statusStr.includes('AVAILABLE') || statusStr.includes('AVL')) normalizedStatus = 'AVAILABLE';
      else if (statusStr.includes('RAC')) normalizedStatus = 'RAC';
      else if (statusStr.includes('WL') || statusStr.includes('WAITLIST')) normalizedStatus = 'WAITLISTED';
      else if (statusStr.includes('NOT AVAILABLE') || statusStr.includes('REGRET')) normalizedStatus = 'NOT_AVAILABLE';

      return {
        success: true,
        authorized: true,
        provider: this.name,
        trainNumber,
        travelClass,
        quota,
        normalizedStatus,
        originalStatus: statusStr,
        seatsAvailable: raw?.seats ?? null,
      };
    } catch (err) {
      return {
        success: false,
        authorized: true,
        normalizedStatus: 'UNKNOWN',
        error: err.message,
      };
    }
  }

  /**
   * Fare inquiry fallback.
   */
  async getFare(trainNumber, fromCode, toCode, travelClass = '3A') {
    if (!this.isAuthorized()) {
      return {
        success: false,
        authorized: false,
        reason: 'AOPAY_UNAUTHORIZED_OR_DISABLED',
      };
    }

    try {
      const url = `${this.baseUrl}/rail/fare?train=${encodeURIComponent(trainNumber)}&from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}&class=${encodeURIComponent(travelClass)}`;
      const res = await httpFetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
        timeoutMs: this.timeoutMs,
        provider: 'aopay',
      });

      const fare = Number(res.data?.fare || res.data?.amount);
      if (!isNaN(fare) && fare > 0) {
        return {
          success: true,
          authorized: true,
          provider: this.name,
          baseFare: fare,
          totalFare: fare,
          currency: 'INR',
          isEstimated: false,
        };
      }
    } catch (err) {
      logger.debug(`[AOPAYAdapter] getFare failed: ${err.message}`);
    }

    return {
      success: false,
      authorized: true,
      reason: 'FARE_UNAVAILABLE',
    };
  }

  /**
   * Retrieves train schedule fallback (null if unsupported or unauthorized).
   */
  async getTrainSchedule(trainNumber) {
    if (!this.isAuthorized()) return null;
    return null;
  }

  /**
   * Booking handoff preparation (NEVER initiated during route search).
   * Verifies prerequisites before allowing booking handoff.
   */
  async prepareBooking(journey, passengerDetails) {
    // 1. Never allow booking an itinerary with multiple train changes as a single ticket under IRCTC regulations
    if (journey.numberOfTransfers > 0 || (journey.legs && journey.legs.length > 1)) {
      return {
        allowed: false,
        singleTicketSupported: false,
        canAutoBook: false,
        reason: 'MULTI_LEG_SEPARATE_BOOKING_REQUIRED',
        complianceNotice: 'Multi-leg journeys require independent bookings for each train segment under Indian Railways regulations.',
        message: 'Multi-leg journeys require independent bookings for each train segment.',
        legs: journey.legs.map((l) => ({
          sequence: l.sequence,
          trainNumber: l.vehicle?.identifier || l.service?.number || l.trainNumber,
          from: l.origin?.name || l.origin,
          to: l.destination?.name || l.destination,
        })),
      };
    }

    // 2. Check provider authorization for direct booking
    if (!this.isAuthorized()) {
      return {
        allowed: false,
        canAutoBook: false,
        singleTicketSupported: false,
        reason: 'BOOKING_UNSUPPORTED',
        complianceNotice: 'Direct railway booking is currently unavailable through this integration. Please use authorized IRCTC channels.',
        message: 'Direct railway booking is currently unavailable through this integration. Please use authorized IRCTC channels.',
      };
    }

    return {
      allowed: true,
      canAutoBook: true,
      singleTicketSupported: true,
      bookingIntentId: `BK-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      provider: this.name,
      journeyId: journey.id || journey._id,
      passengerCount: Array.isArray(passengerDetails) ? passengerDetails.length : 1,
    };
  }
}

export const aopayAdapter = new AOPAYAdapter();
export default aopayAdapter;
