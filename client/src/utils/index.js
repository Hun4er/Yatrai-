/**
 * Utility Functions
 */

/**
 * Format ISO date string into readable local time.
 */
export function formatTimestamp(isoString) {
  if (!isoString) return '—';
  try {
    return new Date(isoString).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
}
