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
  if (minutes === undefined || minutes === null || isNaN(minutes) || minutes <= 0) {
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
 * Format ISO timestamp into local 24-hour "HH:mm".
 */
export function formatTime(isoString) {
  if (!isoString) return '--:--';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '--:--';
  }
}

/**
 * Format date string (YYYY-MM-DD) into readable display date (e.g. "01 Oct 2026").
 */
export function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const monthIndex = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, monthIndex, day);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
      }
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/**
 * Format price and currency using standard browser internationalization.
 * Supports any currency (e.g. INR, USD, EUR) without hardcoding symbols.
 */
export function formatPrice(amount, currency = 'INR') {
  if (amount === undefined || amount === null || isNaN(amount)) return 'N/A';
  const num = Number(amount);
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

/**
 * Calculates calendar day difference between departure and arrival timestamps.
 * Returns 0 if same day, 1 if next day, 2 if two days later, etc.
 */
export function getDayOffset(departureIso, arrivalIso) {
  if (!departureIso || !arrivalIso) return 0;
  try {
    const dep = new Date(departureIso);
    const arr = new Date(arrivalIso);
    if (isNaN(dep.getTime()) || isNaN(arr.getTime())) return 0;

    const depDate = new Date(dep.getFullYear(), dep.getMonth(), dep.getDate());
    const arrDate = new Date(arr.getFullYear(), arr.getMonth(), arr.getDate());
    const diffMs = arrDate.getTime() - depDate.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
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
 */
export function getPriceLabel(journey) {
  if (!journey) return 'Total Fare';

  const modes = Array.isArray(journey.transportModes) ? journey.transportModes : [];
  const isOnlyRoad = modes.length === 1 && (modes[0] === 'road' || modes[0] === 'car');
  const hasRoad = modes.includes('road') || modes.includes('car');
  const isMultiModal = (journey.numberOfTransfers > 0) || modes.length > 1;

  if (isOnlyRoad) {
    return 'Estimated driving cost';
  }
  if (isMultiModal && (hasRoad || journey.pricing?.containsEstimatedComponents)) {
    return 'Estimated total';
  }
  if (journey.metadata?.isEstimatedPrice || journey.pricing?.type === 'estimated') {
    return 'Estimated fare';
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
