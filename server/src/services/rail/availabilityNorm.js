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
 * Shared Strict Availability Normalization Function
 * Used consistently across direct and recovered journeys.
 *
 * Rules:
 * 1. Check negative/unavailable statuses BEFORE positive substring matches (e.g. "NOT AVAILABLE" must never match "AVAILABLE").
 * 2. Parse documented availability values: AVAILABLE-0042, AVAILABLE-0018, RAC 12, GNWL24/WL11, NOT AVAILABLE.
 * 3. Empty, timeout, unsupported, or unparsed statuses normalize strictly to UNKNOWN.
 *
 * @param {string} rawStatus
 * @returns {{ normalizedStatus: string, rawStatus: string, seatsAvailable: number|null, isAvailable: boolean }}
 */
export function normalizeSeatAvailability(rawStatus) {
  if (!rawStatus) {
    return {
      normalizedStatus: AVAILABILITY_STATUS.UNKNOWN,
      rawStatus: '',
      seatsAvailable: null,
      isAvailable: false,
    };
  }

  const trimmed = String(rawStatus).trim();
  const raw = trimmed.toUpperCase();

  // 1. Check negative/unavailable statuses FIRST (Crucial: never let "NOT AVAILABLE" or "NOT_AVAILABLE" match "AVAILABLE")
  if (
    raw.includes('NOT AVAILABLE') ||
    raw.includes('NOT_AVAILABLE') ||
    raw.includes('NOT-AVAILABLE') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('REGRET') ||
    raw.includes('CANCELLED') ||
    raw.includes('CANCELED') ||
    raw.includes('DEPARTED') ||
    raw.includes('CLASS NOT EXIST') ||
    raw.includes('NO ROOM') ||
    raw.includes('NOT RUNNING') ||
    raw.includes('NOT_RUNNING') ||
    raw === 'NAV'
  ) {
    return {
      normalizedStatus: AVAILABILITY_STATUS.UNAVAILABLE,
      rawStatus: trimmed,
      seatsAvailable: 0,
      isAvailable: false,
    };
  }

  // 2. Waitlist statuses (GNWL, RLWL, PQWL, TQWL, RSWL, WAITLIST, WL)
  if (
    raw.includes('WAITLIST') ||
    raw.includes('WL') ||
    /\b(GNWL|RLWL|PQWL|TQWL|RSWL)\b/.test(raw)
  ) {
    return {
      normalizedStatus: AVAILABILITY_STATUS.WAITLIST,
      rawStatus: trimmed,
      seatsAvailable: 0,
      isAvailable: false,
    };
  }

  // 3. RAC statuses
  if (raw.includes('RAC')) {
    return {
      normalizedStatus: AVAILABILITY_STATUS.RAC,
      rawStatus: trimmed,
      seatsAvailable: null,
      isAvailable: false,
    };
  }

  // 4. Available statuses (AVAILABLE-0042, AVAILABLE-0018, CURR_AVBL, AVL)
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

  // 5. Default fallback: UNKNOWN
  return {
    normalizedStatus: AVAILABILITY_STATUS.UNKNOWN,
    rawStatus: trimmed,
    seatsAvailable: null,
    isAvailable: false,
  };
}

export default {
  AVAILABILITY_STATUS,
  JOURNEY_AVAILABILITY,
  normalizeSeatAvailability,
};
