/**
 * Error Classifier Utility for Resilient Rail Fetching (Phase 2)
 *
 * Categorizes all provider and internal errors into four canonical classes:
 * - TRANSIENT: 429, 5xx, timeouts, socket/network disconnects (Eligible for retry).
 * - NOT_BOOKABLE: Chart prepared, departed, booking closed/not open, class not offered.
 * - PARAM: 400, 404, bad query parameters.
 * - AUTH_QUOTA: 401, 403, quota exhaustion, blocked calls.
 */

export const ERROR_CLASS = Object.freeze({
  TRANSIENT: 'TRANSIENT',
  NOT_BOOKABLE: 'NOT_BOOKABLE',
  PARAM: 'PARAM',
  AUTH_QUOTA: 'AUTH_QUOTA',
});

export const NOT_BOOKABLE_REASONS = Object.freeze({
  CHART_PREPARED: 'CHART_PREPARED',
  TRAIN_DEPARTED: 'TRAIN_DEPARTED',
  BOOKING_CLOSED: 'BOOKING_CLOSED',
  BOOKING_NOT_OPEN: 'BOOKING_NOT_OPEN',
  CLASS_NOT_OFFERED: 'CLASS_NOT_OFFERED',
  NOT_INTERMEDIATE_STATION: 'NOT_INTERMEDIATE_STATION',
});

/**
 * Classifies an HTTP status, error object, or raw provider payload.
 *
 * @param {object} params
 * @param {number} [params.status] - HTTP status code
 * @param {Error|object} [params.error] - Error instance or thrown object
 * @param {string|object} [params.body] - Raw response body or parsed JSON
 * @param {string} [params.rawStatus] - IRCTC status string (e.g. "TRAIN DEPARTED", "REGRET")
 * @returns {{ errorClass: string, reason: string|null, isTransient: boolean, userMessage: string }}
 */
export function classifyError({ status, error, body, rawStatus } = {}) {
  const statusCode = status || error?.status || error?.statusCode || null;
  const rawMsg = [
    typeof body === 'string' ? body : JSON.stringify(body || {}),
    error?.message || '',
    rawStatus || '',
  ].join(' ').toUpperCase();

  // 1. AUTH_QUOTA
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    error?.code === 'AUTH_QUOTA' ||
    error?.code === 'LIVE_REQUESTS_BLOCKED' ||
    /INVALID\s*API\s*KEY|UNAUTHORIZED|FORBIDDEN|QUOTA|PLAN\s*EXPIRED/i.test(rawMsg)
  ) {
    return {
      errorClass: ERROR_CLASS.AUTH_QUOTA,
      reason: 'AUTH_QUOTA',
      isTransient: false,
      userMessage: 'Service quota reached or provider authentication failed',
    };
  }

  // 2. NOT_BOOKABLE (Business rules: train is not bookable, not an API crash)
  if (
    /CHART\s*(PREPARED|ING|ED|DONE)/i.test(rawMsg) ||
    /CHARTING\s*DONE/i.test(rawMsg)
  ) {
    return {
      errorClass: ERROR_CLASS.NOT_BOOKABLE,
      reason: NOT_BOOKABLE_REASONS.CHART_PREPARED,
      isTransient: false,
      userMessage: 'Chart prepared',
    };
  }

  if (
    /TRAIN\s*DEPARTED|HAS\s*DEPARTED/i.test(rawMsg)
  ) {
    return {
      errorClass: ERROR_CLASS.NOT_BOOKABLE,
      reason: NOT_BOOKABLE_REASONS.TRAIN_DEPARTED,
      isTransient: false,
      userMessage: 'Departed',
    };
  }

  if (/BOOKING\s*NOT\s*OPEN|ADVANCE\s*RESERVATION\s*PERIOD/i.test(rawMsg)) {
    return {
      errorClass: ERROR_CLASS.NOT_BOOKABLE,
      reason: NOT_BOOKABLE_REASONS.BOOKING_NOT_OPEN,
      isTransient: false,
      userMessage: 'Booking not open',
    };
  }

  if (
    /BOOKING\s*CLOSED|NO\s*MORE\s*BOOKING/i.test(rawMsg) ||
    rawStatus === 'REGRET' ||
    rawMsg.includes('REGRET')
  ) {
    return {
      errorClass: ERROR_CLASS.NOT_BOOKABLE,
      reason: NOT_BOOKABLE_REASONS.BOOKING_CLOSED,
      isTransient: false,
      userMessage: 'Booking closed',
    };
  }

  if (
    /CLASS\s*(DOES\s*NOT\s*EXIST|NOT\s*OFFERED|NOT\s*AVAILABLE\s*FOR\s*THIS\s*TRAIN)/i.test(rawMsg) ||
    error?.code === 'CLASS_NOT_OFFERED'
  ) {
    return {
      errorClass: ERROR_CLASS.NOT_BOOKABLE,
      reason: NOT_BOOKABLE_REASONS.CLASS_NOT_OFFERED,
      isTransient: false,
      userMessage: 'Not offered on this train',
    };
  }

  if (
    /NOT\s*AN\s*INTERMEDIATE\s*STATION/i.test(rawMsg)
  ) {
    return {
      errorClass: ERROR_CLASS.NOT_BOOKABLE,
      reason: NOT_BOOKABLE_REASONS.NOT_INTERMEDIATE_STATION,
      isTransient: false,
      userMessage: 'Route not serviced by train',
    };
  }

  // 3. TRANSIENT (429, 5xx, timeouts, network issues)
  if (
    statusCode === 429 ||
    (statusCode >= 500 && statusCode < 600) ||
    error?.name === 'AbortError' ||
    /ABORTED|TIMEOUT|ETIMEDOUT|ECONNRESET|ECONNREFUSED|SOCKET|NETWORK\s*ERROR|FETCH\s*FAILED/i.test(rawMsg)
  ) {
    return {
      errorClass: ERROR_CLASS.TRANSIENT,
      reason: statusCode === 429 ? 'RATE_LIMITED' : (statusCode >= 500 ? `HTTP_${statusCode}` : 'NETWORK_TIMEOUT'),
      isTransient: true,
      userMessage: statusCode === 429 ? 'Rate limited — retrying' : 'Temporary provider delay',
    };
  }

  // 4. PARAM (400, 404, bad arguments)
  if (statusCode === 400 || statusCode === 404) {
    return {
      errorClass: ERROR_CLASS.PARAM,
      reason: `HTTP_${statusCode}`,
      isTransient: false,
      userMessage: 'Invalid search parameter or route not found',
    };
  }

  // Fallback: Default to TRANSIENT if unknown network error, else PARAM
  const isNetworkLike = /FAILED|ERROR|REFUSED/i.test(rawMsg);
  return {
    errorClass: isNetworkLike ? ERROR_CLASS.TRANSIENT : ERROR_CLASS.PARAM,
    reason: isNetworkLike ? 'UNKNOWN_TRANSIENT' : 'UNKNOWN_ERROR',
    isTransient: isNetworkLike,
    userMessage: "couldn't check — tap to retry",
  };
}

export default {
  ERROR_CLASS,
  NOT_BOOKABLE_REASONS,
  classifyError,
};
