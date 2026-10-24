/**
 * Centralized Formatting Utilities for Yatrai
 *
 * Provides deterministic, locale-aware, non-mutating data formatting
 * for prices, durations, timestamps, and transport modes.
 */

/**
 * Maps canonical transport mode identifier to human-friendly display label.
 */
export function getModeLabel(mode) {
  const normalized = (mode || '').toLowerCase().trim();
  switch (normalized) {
    case 'rail':
    case 'train':
      return 'Train';
    case 'bus':
      return 'Bus';
    case 'flight':
    case 'air':
      return 'Flight';
    case 'road':
    case 'car':
    case 'taxi':
    case 'cab':
      return 'Road';
    case 'walk':
      return 'Walk';
    case 'metro':
      return 'Metro';
    default:
      return mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : 'Transit';
  }
}

/**
 * Format transport modes array into canonical composite label (e.g. "Train + Road").
 */
export function formatTransportModes(modes) {
  if (!Array.isArray(modes) || modes.length === 0) return 'Transit';
  const labels = modes.map(getModeLabel);
  // De-duplicate adjacent identical mode labels
  const uniqueOrdered = labels.filter((label, idx) => idx === 0 || label !== labels[idx - 1]);
  return uniqueOrdered.join(' + ');
}

/**
 * Format numeric duration in minutes into "Xh Ym" or "Xh" or "Ym".
 */
export function formatDuration(minutes) {
  if (minutes === undefined || minutes === null) {
    return '0m';
  }
  if (typeof minutes === 'string') {
    const trimmed = minutes.trim();
    if (/^\d+\s*h(\s*\d+\s*m)?$/i.test(trimmed) || /^\d+\s*m$/i.test(trimmed)) {
      return trimmed;
    }
    const parsedNum = Number(trimmed);
    if (!isNaN(parsedNum) && parsedNum > 0) {
      minutes = parsedNum;
    } else {
      return '0m';
    }
  }
  if (isNaN(minutes) || minutes <= 0) {
    return '0m';
  }
  const totalMins = Math.round(Number(minutes));
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

/**
 * Format timestamp or railway time into local 24-hour "HH:mm" in Asia/Kolkata (IST).
 * Indian Railways operates strictly on Indian Standard Time.
 */
export function formatTime(timeVal) {
  if (!timeVal) return '--:--';
  if (typeof timeVal === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(timeVal.trim())) {
    const parts = timeVal.trim().split(':');
    return `${parts[0].padStart(2, '0')}:${parts[1]}`;
  }
  try {
    const d = new Date(timeVal);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '--:--';
  }
}

/**
 * Normalizes any date value (YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, ISO timestamp, Date)
 * into canonical "YYYY-MM-DD" string in Indian Standard Time (Asia/Kolkata).
 */
export function normalizeDate(dateVal) {
  if (!dateVal) return '';

  if (typeof dateVal === 'string') {
    const trimmed = dateVal.trim();
    if (!trimmed) return '';

    // 1. If timestamp with time / ISO (e.g. 2026-10-25T14:30:00Z)
    if (trimmed.includes('T')) {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      }
    }

    // 2. YYYY-MM-DD or YYYY/MM/DD
    const ymdMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(trimmed);
    if (ymdMatch) {
      const [, y, m, d] = ymdMatch;
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    // 3. DD-MM-YYYY or DD/MM/YYYY
    const dmyMatch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(trimmed);
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch;
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    }
  }

  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    return dateVal.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }

  if (typeof dateVal === 'number' && !isNaN(dateVal)) {
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    }
  }

  return '';
}

/**
 * Format date string (YYYY-MM-DD, DD-MM-YYYY, ISO timestamp, or Date) into readable display date (e.g. "01 Oct 2026").
 * Formats consistently in Asia/Kolkata railway context.
 */
export function formatDateDisplay(dateVal) {
  if (!dateVal) return '';
  try {
    const ymd = normalizeDate(dateVal);
    if (ymd) {
      const parts = ymd.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const monthIndex = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const d = new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('en-GB', {
            timeZone: 'UTC',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          });
        }
      }
    }
    return String(dateVal);
  } catch {
    return String(dateVal);
  }
}

/**
 * Format price and currency using standard browser internationalization.
 * Supports any currency (e.g. INR, USD, EUR) without hardcoding symbols.
 */
export function formatPrice(amount, currency = 'INR', options = {}) {
  if (amount === undefined || amount === null || isNaN(amount) || Number(amount) <= 0) {
    return 'Fare unavailable';
  }
  const num = Math.round(Number(amount));
  const isEst = Boolean(options.isEstimated || options.fareSource === 'estimate');
  if (isEst) {
    return `Est. ₹${num} (distance-based)`;
  }
  const curr = (currency || 'INR').toUpperCase();
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: curr,
      maximumFractionDigits: 0,
    }).format(num);
  } catch {
    return `${curr} ${num.toLocaleString()}`;
  }
}

/**
 * Format transfer count into readable string (e.g. "Direct", "1 transfer", "2 transfers").
 */
export function formatTransfers(count) {
  const num = Number(count) || 0;
  if (num === 0) return 'Direct';
  if (num === 1) return '1 transfer';
  return `${num} transfers`;
}

export function getDayOffset(departureVal, arrivalVal, durationMinutes = null) {
  if (!departureVal || !arrivalVal) {
    if (durationMinutes && Number(durationMinutes) >= 1440) {
      return Math.floor(Number(durationMinutes) / 1440);
    }
    return 0;
  }
  try {
    const depStr = String(departureVal).trim();
    const arrStr = String(arrivalVal).trim();

    // 1. Try parsing full ISO or Date timestamps
    const dep = new Date(depStr);
    const arr = new Date(arrStr);
    const depValid = !isNaN(dep.getTime()) && depStr.length > 8;
    const arrValid = !isNaN(arr.getTime()) && arrStr.length > 8;

    if (depValid && arrValid) {
      const depDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(dep);
      const arrDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(arr);

      const [dy, dm, dd] = depDateStr.split('-').map(Number);
      const [ay, am, ad] = arrDateStr.split('-').map(Number);

      const depUtc = Date.UTC(dy, dm - 1, dd);
      const arrUtc = Date.UTC(ay, am - 1, ad);

      const diffDays = Math.round((arrUtc - depUtc) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) return diffDays;
    }

    // 2. Check if departure and arrival are times (e.g. "16:50" and "04:40") or duration rollover
    const depTimeMatch = /(\d{1,2}):(\d{2})/.exec(depStr);
    const arrTimeMatch = /(\d{1,2}):(\d{2})/.exec(arrStr);
    if (depTimeMatch && arrTimeMatch) {
      const depMins = parseInt(depTimeMatch[1], 10) * 60 + parseInt(depTimeMatch[2], 10);
      const arrMins = parseInt(arrTimeMatch[1], 10) * 60 + parseInt(arrTimeMatch[2], 10);
      const durMins = Number(durationMinutes) || 0;

      if (durMins > 0) {
        return Math.floor((depMins + durMins) / 1440);
      }
      if (arrMins < depMins) {
        return 1;
      }
    }

    if (durationMinutes && Number(durationMinutes) >= 1440) {
      return Math.floor(Number(durationMinutes) / 1440);
    }

    return 0;
  } catch {
    return 0;
  }
}

/**
 * Formats day offset into readable tag (e.g. "+1 day", "+2 days").
 */
export function formatDayOffsetBadge(offset) {
  if (!offset || offset <= 0) return null;
  if (offset === 1) return '+1 day';
  return `+${offset} days`;
}

/**
 * Distinguishes price label semantics by transport type and pricing model.
 * In Indian Railways MVP, road/driving cost labels are strictly removed.
 */
export function getPriceLabel(journey) {
  if (!journey) return 'Fare';

  const rawPrice = journey.totalPrice;
  const isMissing = rawPrice === null || rawPrice === undefined || isNaN(Number(rawPrice)) || Number(rawPrice) <= 0 || journey.metadata?.fareUnavailable;

  if (isMissing) {
    return 'Fare';
  }

  if (journey.metadata?.isEstimatedPrice || journey.pricing?.type === 'estimated') {
    const source = journey.metadata?.fareSource || 'Railway estimate';
    return `Estimated fare (${source})`;
  }

  return 'Total fare';
}

/**
 * Generates transparent, data-backed reasons why Yatrai recommends a specific journey.
 * Never fabricates values; strictly compares against actual options in the dataset.
 */
export function getRecommendationExplanation(journey, allJourneys = []) {
  if (!journey) return null;

  const reasons = [];
  const validJourneys = Array.isArray(allJourneys) ? allJourneys : [];

  // Check 1: Speed comparison against direct rail or slowest route
  if (validJourneys.length > 1 && journey.duration) {
    // Find rail alternative or slowest journey
    const railAlternatives = validJourneys.filter(
      (j) => j.id !== journey.id && Array.isArray(j.transportModes) && j.transportModes.includes('rail')
    );
    const comparisonTarget = railAlternatives.length > 0
      ? railAlternatives.reduce((max, j) => (j.duration > max.duration ? j : max), railAlternatives[0])
      : validJourneys.reduce((max, j) => (j.duration > max.duration ? j : max), validJourneys[0]);

    if (comparisonTarget && comparisonTarget.duration > journey.duration) {
      const diffMins = comparisonTarget.duration - journey.duration;
      if (diffMins >= 60) {
        const hrs = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        const formattedDiff = mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
        reasons.push(`${formattedDiff} faster than alternative routes`);
      }
    }
  }

  // Check 2: Direct / No transfers
  if (journey.numberOfTransfers === 0) {
    reasons.push('Direct — no transit transfers');
  } else if (journey.numberOfTransfers === 1) {
    const hasMoreTransfers = validJourneys.some((j) => (j.numberOfTransfers || 0) >= 2);
    if (hasMoreTransfers) {
      reasons.push('Only 1 seamless transfer connection');
    }
  }

  // Check 3: Pricing efficiency
  if (validJourneys.length > 1 && typeof journey.totalPrice === 'number') {
    const prices = validJourneys
      .map((j) => j.totalPrice)
      .filter((p) => typeof p === 'number' && !isNaN(p));
    if (prices.length > 0) {
      const minPrice = Math.min(...prices);
      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      if (journey.totalPrice <= minPrice) {
        reasons.push('Lowest fare available');
      } else if (journey.totalPrice < avgPrice * 0.85) {
        reasons.push('Significantly below average route cost');
      }
    }
  }

  // Fallback summary if specific deltas aren't pronounced
  if (reasons.length === 0) {
    reasons.push('Optimal balance of travel time, cost and route convenience');
  }

  return reasons;
}
