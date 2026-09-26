/**
 * Deterministic Multi-Criteria Tie-Breaker
 *
 * Provides stable, reproducible sorting across multiple criteria.
 * Guarantees that equal-value items resolve through secondary and tertiary metrics,
 * with the original sequence index serving as the definitive final tie-breaker.
 */

/**
 * Creates a comparator function from a sequence of criteria definitions.
 *
 * Each criterion definition:
 * {
 *   extractor: (journey) => value,
 *   direction: 'asc' | 'desc' (default: 'asc'),
 *   nullsLast: boolean (default: true)
 * }
 *
 * @param {Array<Object>} criteriaList
 * @returns {Function} (a, b) => number
 */
export function createTieBreaker(criteriaList) {
  return function compare(a, b) {
    for (const criterion of criteriaList) {
      const { extractor, direction = 'asc', nullsLast = true } = criterion;

      const valA = typeof extractor === 'function' ? extractor(a) : a;
      const valB = typeof extractor === 'function' ? extractor(b) : b;

      // Handle null / undefined
      const isMissingA = valA === null || valA === undefined || (typeof valA === 'number' && isNaN(valA));
      const isMissingB = valB === null || valB === undefined || (typeof valB === 'number' && isNaN(valB));

      if (isMissingA && isMissingB) {
        continue;
      }
      if (isMissingA) {
        return nullsLast ? 1 : -1;
      }
      if (isMissingB) {
        return nullsLast ? -1 : 1;
      }

      // Comparison for numbers or strings
      if (valA !== valB) {
        if (typeof valA === 'number' && typeof valB === 'number') {
          return direction === 'asc' ? valA - valB : valB - valA;
        }
        const strA = String(valA);
        const strB = String(valB);
        const cmp = strA.localeCompare(strB);
        return direction === 'asc' ? cmp : -cmp;
      }
    }

    // Definitive fallback: stable original input index
    const indexA = typeof a._originalIndex === 'number' ? a._originalIndex : 0;
    const indexB = typeof b._originalIndex === 'number' ? b._originalIndex : 0;
    return indexA - indexB;
  };
}

export default {
  createTieBreaker,
};
