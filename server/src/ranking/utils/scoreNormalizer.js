/**
 * Reusable Score Normalization Utilities
 *
 * Converts raw multi-dimensional metrics (minutes, INR, transfer counts)
 * into standard, unitless [0.0, 1.0] scales for composite ranking.
 */

/**
 * Normalizes a metric where lower values represent better outcomes
 * (e.g. shorter duration, lower fare, fewer transfers).
 *
 * Best value (min) -> 1.0
 * Worst value (max) -> 0.0
 * Equal values (max === min) -> 1.0
 *
 * @param {number|null|undefined} value
 * @param {number} min
 * @param {number} max
 * @returns {number} Normalized score in [0.0, 1.0]
 */
export function normalizeLowerIsBetter(value, min, max) {
  if (value === null || value === undefined || typeof value !== 'number' || isNaN(value)) {
    return 0.0;
  }

  // Guard against non-numeric or inverted bounds
  if (isNaN(min) || isNaN(max) || max < min) {
    return 1.0;
  }

  // Equal-value edge case: all journeys possess the exact same metric
  if (max === min) {
    return 1.0;
  }

  // Clamp within bounds to prevent out-of-range anomalies
  const clamped = Math.min(max, Math.max(min, value));
  const score = (max - clamped) / (max - min);

  // Guard against floating point imprecision
  return Math.max(0.0, Math.min(1.0, Math.round(score * 10000) / 10000));
}

/**
 * Normalizes a metric where higher values represent better outcomes.
 *
 * Best value (max) -> 1.0
 * Worst value (min) -> 0.0
 * Equal values (max === min) -> 1.0
 *
 * @param {number|null|undefined} value
 * @param {number} min
 * @param {number} max
 * @returns {number} Normalized score in [0.0, 1.0]
 */
export function normalizeHigherIsBetter(value, min, max) {
  if (value === null || value === undefined || typeof value !== 'number' || isNaN(value)) {
    return 0.0;
  }

  if (isNaN(min) || isNaN(max) || max < min) {
    return 1.0;
  }

  if (max === min) {
    return 1.0;
  }

  const clamped = Math.min(max, Math.max(min, value));
  const score = (clamped - min) / (max - min);

  return Math.max(0.0, Math.min(1.0, Math.round(score * 10000) / 10000));
}

/**
 * Computes minimum and maximum values across an array of numbers,
 * safely ignoring null, undefined, and non-numeric entries.
 *
 * @param {Array<*>} items
 * @param {Function} extractor - (item) => number
 * @returns {{ min: number, max: number, validCount: number, allEqual: boolean }}
 */
export function getMetricBounds(items, extractor) {
  let min = Infinity;
  let max = -Infinity;
  let validCount = 0;

  for (const item of items) {
    const val = typeof extractor === 'function' ? extractor(item) : item;
    if (typeof val === 'number' && !isNaN(val)) {
      if (val < min) min = val;
      if (val > max) max = val;
      validCount++;
    }
  }

  if (validCount === 0) {
    return { min: 0, max: 0, validCount: 0, allEqual: true };
  }

  return {
    min,
    max,
    validCount,
    allEqual: min === max,
  };
}

export default {
  normalizeLowerIsBetter,
  normalizeHigherIsBetter,
  getMetricBounds,
};
