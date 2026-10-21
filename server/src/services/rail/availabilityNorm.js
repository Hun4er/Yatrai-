/**
 * Normalized Availability Status Enums
 */
export const AVAILABILITY_STATUS = {
  AVAILABLE: 'AVAILABLE',
  RAC: 'RAC',
  WAITLIST: 'WAITLIST',
  WAITLISTED: 'WAITLIST', // backward compatibility alias
  UNAVAILABLE: 'UNAVAILABLE',
  NOT_AVAILABLE: 'UNAVAILABLE', // backward compatibility alias
  NOT_RUNNING: 'UNAVAILABLE',
  ERROR: 'ERROR',
  UNKNOWN: 'UNKNOWN', // backward compatibility alias
};

/**
 * Journey-Level Bookability Status Enums
 */
export const JOURNEY_AVAILABILITY = {
  AVAILABILITY_VERIFIED: 'AVAILABILITY_VERIFIED',
  RAC_AVAILABLE: 'RAC_AVAILABLE',
  WAITLIST_ONLY: 'WAITLIST_ONLY',
  NOT_BOOKABLE: 'NOT_BOOKABLE',
  ERROR: 'ERROR',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Shared Strict Availability Normalization Function
 * Used consistently across direct and recovered journeys.
 *
 * Rules:
 * 1. Check call failures and errors first -> ERROR.
 * 2. Check negative/unavailable statuses BEFORE positive substring matches (e.g. "NOT AVAILABLE" must never match "AVAILABLE").
 * 3. Parse documented and live IRCTC availability values defensively:
 *    AVAILABLE-0042, AVAILABLE-0018, CURR_AVBL, AVL 12, RAC 3, RAC 38/RAC 11,
 *    WL 11, GNWL360/WL11, RLWL, PQWL, TQWL, RSWL, NOT AVAILABLE, REGRET, CHART PREPARED, TRAIN DEPARTED.
 * 4. Empty, timeout, unsupported, or unparsed statuses normalize strictly to ERROR (or UNKNOWN for legacy callers).
 *
 * @param {string|object} rawStatusInput
 * @param {object} [options]
 * @returns {{ normalizedStatus: string, rawStatus: string, seatsAvailable: number|null, waitlistPosition?: number|null, racPosition?: number|null, predictionPercentage?: number|null, isAvailable: boolean, reason?: string, errorCode?: string }}
 */
export function normalizeSeatAvailability(rawStatusInput, options = {}) {
  // Support passing object with rawStatus, availabilityText, predictionPercentage, error, etc.
  let rawStatus = rawStatusInput;
  let predictionPct = options?.predictionPercentage ?? null;

  if (typeof rawStatusInput === 'object' && rawStatusInput !== null) {
    if (rawStatusInput.isError || rawStatusInput.error || rawStatusInput.errorCode) {
      return {
        normalizedStatus: AVAILABILITY_STATUS.ERROR,
        rawStatus: String(rawStatusInput.rawStatus || rawStatusInput.error || 'ERROR').trim(),
        seatsAvailable: null,
        isAvailable: false,
        reason: rawStatusInput.reason || rawStatusInput.errorCode || 'CALL_FAILED',
        errorCode: rawStatusInput.errorCode || 'CALL_FAILED',
      };
    }
    rawStatus = rawStatusInput.rawStatus || rawStatusInput.availabilityText || rawStatusInput.status || '';
    if (predictionPct === null && typeof rawStatusInput.predictionPercentage === 'number') {
      predictionPct = rawStatusInput.predictionPercentage;
    }
  }

  if (options?.isError || options?.error) {
    return {
      normalizedStatus: AVAILABILITY_STATUS.ERROR,
      rawStatus: String(rawStatus || options?.error || 'ERROR').trim(),
      seatsAvailable: null,
      isAvailable: false,
      reason: options?.errorCode || options?.reason || 'CALL_FAILED',
      errorCode: options?.errorCode || 'CALL_FAILED',
    };
  }

  if (rawStatus === null || rawStatus === undefined || String(rawStatus).trim() === '') {
    return {
      normalizedStatus: AVAILABILITY_STATUS.UNKNOWN,
      rawStatus: '',
      seatsAvailable: null,
      isAvailable: false,
      reason: 'EMPTY_STATUS',
      errorCode: 'EMPTY_STATUS',
    };
  }

  const trimmed = String(rawStatus).trim();
  const raw = trimmed.toUpperCase();

  // 1. Explicit error shapes
  if (
    raw === 'ERROR' ||
    raw === 'RATE_LIMITED' ||
    raw === 'TIMEOUT' ||
    raw === 'CALL_FAILED' ||
    raw.startsWith('HTTP 4') ||
    raw.startsWith('HTTP 5')
  ) {
    return {
      normalizedStatus: AVAILABILITY_STATUS.ERROR,
      rawStatus: trimmed,
      seatsAvailable: null,
      isAvailable: false,
      reason: raw,
      errorCode: raw,
    };
  }

  // 2. Negative/unavailable statuses FIRST (Crucial: never let "NOT AVAILABLE" match "AVAILABLE")
  if (
    raw.includes('NOT AVAILABLE') ||
    raw.includes('NOT_AVAILABLE') ||
    raw.includes('NOT-AVAILABLE') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('REGRET') ||
    raw.includes('CANCELLED') ||
    raw.includes('CANCELED') ||
    raw.includes('DEPARTED') ||
    raw.includes('CHART PREPARED') ||
    raw.includes('CLASS NOT EXIST') ||
    raw.includes('NO ROOM') ||
    raw.includes('NOT RUNNING') ||
    raw.includes('NOT_RUNNING') ||
    raw === 'NAV'
  ) {
    let reason = 'NOT AVAILABLE';
    if (raw.includes('REGRET')) reason = 'REGRET';
    else if (raw.includes('CHART PREPARED')) reason = 'CHART PREPARED';
    else if (raw.includes('DEPARTED')) reason = 'TRAIN DEPARTED';
    else if (raw.includes('CANCELLED') || raw.includes('CANCELED')) reason = 'CANCELLED';

    return {
      normalizedStatus: AVAILABILITY_STATUS.UNAVAILABLE,
      rawStatus: trimmed,
      seatsAvailable: 0,
      isAvailable: false,
      reason,
    };
  }

  // 3. RAC statuses (Reservation Against Cancellation)
  if (raw.includes('RAC')) {
    let racPosition = null;
    // Format "RAC 38/RAC 11" -> current position is 11
    const slashMatch = /RAC\s*\d+\s*\/\s*(?:RAC\s*)?(\d+)/i.exec(raw);
    if (slashMatch) {
      racPosition = parseInt(slashMatch[1], 10);
    } else {
      const racMatch = /RAC\s*(\d+)/i.exec(raw) || /RAC(\d+)/i.exec(raw);
      if (racMatch) {
        racPosition = parseInt(racMatch[1], 10);
      }
    }
    return {
      normalizedStatus: AVAILABILITY_STATUS.RAC,
      rawStatus: trimmed,
      seatsAvailable: racPosition,
      racPosition,
      isAvailable: false,
    };
  }

  // 4. Waitlist statuses (GNWL, RLWL, PQWL, TQWL, RSWL, WAITLIST, WL)
  if (
    raw.includes('WAITLIST') ||
    raw.includes('WL') ||
    /\b(GNWL|RLWL|PQWL|TQWL|RSWL)\b/.test(raw)
  ) {
    let waitlistPosition = null;
    // In IRCTC notation "GNWL360/WL11" or "GNWL 15 / WL 8", second number is current waitlist position
    const slashMatch = /(?:GNWL|RLWL|PQWL|TQWL|RSWL|WL)\s*\d+\s*\/\s*(?:WL\s*)?(\d+)/i.exec(raw);
    if (slashMatch) {
      waitlistPosition = parseInt(slashMatch[1], 10);
    } else {
      const wlMatch = /(?:WL|WAITLIST)\s*(\d+)/i.exec(raw) ||
                      /(?:WL|WAITLIST)-?(\d+)/i.exec(raw) ||
                      /(?:GNWL|RLWL|PQWL|TQWL|RSWL)\s*(\d+)/i.exec(raw);
      if (wlMatch) {
        waitlistPosition = parseInt(wlMatch[1], 10);
      }
    }

    // Try extracting prediction percentage from string if not provided in options
    if (predictionPct === null) {
      const pctMatch = /(\d{1,3})%\s*(?:Chance)?/i.exec(trimmed);
      if (pctMatch) {
        predictionPct = parseInt(pctMatch[1], 10);
      }
    }

    return {
      normalizedStatus: AVAILABILITY_STATUS.WAITLIST,
      rawStatus: trimmed,
      seatsAvailable: 0,
      waitlistPosition,
      predictionPercentage: predictionPct,
      isAvailable: false,
    };
  }

  // 5. Available statuses (AVAILABLE-0042, AVAILABLE-0018, CURR_AVBL, AVL 12)
  if (
    raw.includes('AVAILABLE') ||
    raw.includes('CURR_AVBL') ||
    raw.includes('AVL')
  ) {
    let seatsAvailable = null;
    const countMatch = /(\d+)/.exec(raw);
    if (countMatch) {
      seatsAvailable = parseInt(countMatch[1], 10);
    }
    return {
      normalizedStatus: AVAILABILITY_STATUS.AVAILABLE,
      rawStatus: trimmed,
      seatsAvailable,
      isAvailable: true,
    };
  }

  // 6. Default fallback for unknown/unparseable statuses -> ERROR
  return {
    normalizedStatus: AVAILABILITY_STATUS.ERROR,
    rawStatus: trimmed,
    seatsAvailable: null,
    isAvailable: false,
    reason: 'UNPARSEABLE',
    errorCode: 'UNPARSEABLE',
  };
}

export default {
  AVAILABILITY_STATUS,
  JOURNEY_AVAILABILITY,
  normalizeSeatAvailability,
};
