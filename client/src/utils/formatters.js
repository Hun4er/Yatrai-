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
