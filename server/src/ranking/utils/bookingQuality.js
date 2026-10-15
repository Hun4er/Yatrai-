import config from '../../config/index.js';

export const BOOKING_QUALITY_TIERS = {
  ALL_AVAILABLE: 4,       // All legs confirmed AVAILABLE
  ALL_AVAILABLE_RAC: 3,   // All legs either AVAILABLE or RAC
  MANAGEABLE_WAITLIST: 2, // Legs have waitlist, but within feasible threshold
  DEEP_WAITLIST: 1,       // Any leg has waitlist beyond threshold or REGRET
  UNKNOWN: 0,
};

/**
 * Parses numeric waitlist position from raw status string (e.g. "GNWL34/WL19" -> 19, "WL 4" -> 4).
 */
export function parseWaitlistPosition(rawStatus = '') {
  if (!rawStatus) return 999;
  const str = String(rawStatus).toUpperCase();
  // Match "/WL19", "WL 19", "WL19", "/RAC 2", "RAC 2"
  const slashMatch = str.match(/\/(?:WL|RAC)?\s*(\d+)/i);
  if (slashMatch) {
    return parseInt(slashMatch[1], 10);
  }
  const match = str.match(/(?:WL|RAC)\s*(\d+)/i) || str.match(/(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 999;
}

/**
 * Checks if a waitlist status is unlikely / deep based on configurable thresholds.
 */
export function isUnlikelyWaitlist(rawStatus = '') {
  if (!rawStatus) return false;
  const str = String(rawStatus).toUpperCase();
  const pos = parseWaitlistPosition(str);
  const thresholds = config.waitlistThresholds || {
    maxGnwlFeasible: 10,
    maxRlwlFeasible: 20,
    maxPqwlFeasible: 10,
    maxDefaultWlFeasible: 10,
  };

  if (str.includes('RLWL')) return pos > thresholds.maxRlwlFeasible;
  if (str.includes('PQWL')) return pos > thresholds.maxPqwlFeasible;
  if (str.includes('GNWL')) return pos > thresholds.maxGnwlFeasible;
  return pos > thresholds.maxDefaultWlFeasible;
}

/**
 * Evaluates booking quality for a journey across all its legs.
 */
export function evaluateJourneyBookingQuality(journey) {
  const legs = Array.isArray(journey.legs) && journey.legs.length > 0
    ? journey.legs
    : [journey];

  let hasDeepWaitlist = false;
  let hasAnyWaitlist = false;
  let hasRac = false;
  let maxWlPos = 0;

  for (const leg of legs) {
    const avail = leg.availability || leg.booking?.availability || {};
    const norm = String(avail.normalizedStatus || avail.status || '').toUpperCase();
    const raw = String(avail.rawStatus || avail.statusText || avail.availabilityText || '').toUpperCase();

    if (norm === 'WAITLIST' || raw.includes('WL')) {
      hasAnyWaitlist = true;
      const pos = parseWaitlistPosition(raw);
      if (pos > maxWlPos) maxWlPos = pos;
      if (isUnlikelyWaitlist(raw) || norm === 'REGRET' || norm === 'NOT_AVAILABLE') {
        hasDeepWaitlist = true;
      }
    } else if (norm === 'RAC' || raw.includes('RAC')) {
      hasRac = true;
    }
  }

  let tier = BOOKING_QUALITY_TIERS.ALL_AVAILABLE;
  if (hasDeepWaitlist) {
    tier = BOOKING_QUALITY_TIERS.DEEP_WAITLIST;
  } else if (hasAnyWaitlist) {
    tier = BOOKING_QUALITY_TIERS.MANAGEABLE_WAITLIST;
  } else if (hasRac) {
    tier = BOOKING_QUALITY_TIERS.ALL_AVAILABLE_RAC;
  }

  return {
    tier,
    maxWaitlistPosition: maxWlPos,
    isUnlikely: hasDeepWaitlist,
    isAllAvailable: tier === BOOKING_QUALITY_TIERS.ALL_AVAILABLE,
    isAvailableOrRac: tier >= BOOKING_QUALITY_TIERS.ALL_AVAILABLE_RAC,
  };
}

export default {
  BOOKING_QUALITY_TIERS,
  parseWaitlistPosition,
  isUnlikelyWaitlist,
  evaluateJourneyBookingQuality,
};
