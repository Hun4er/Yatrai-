import { BaseRankingStrategy } from './base.strategy.js';
import { createTieBreaker } from '../utils/tieBreaker.js';
import { getMetricBounds, normalizeLowerIsBetter } from '../utils/scoreNormalizer.js';
import { STRATEGY_DEFINITIONS } from '../rankingConfig.js';

/**
 * Fastest Journey Ranking Strategy
 * Prioritizes routes with the shortest total travel duration.
 *
 * Tie-break hierarchy:
 * 1. Duration (ascending)
 * 2. Number of transfers (ascending)
 * 3. Total price (ascending)
 * 4. Original sequence index (ascending)
 */
export class FastestStrategy extends BaseRankingStrategy {
  constructor() {
    super(
      STRATEGY_DEFINITIONS.fastest.id,
      STRATEGY_DEFINITIONS.fastest.name,
      STRATEGY_DEFINITIONS.fastest.description
    );
  }

  /**
   * Ranks canonical journeys by total duration.
   *
   * @param {Array<Object>} journeys
   * @param {Object} [context={}]
   * @returns {Array<Object>}
   */
  rank(journeys, context = {}) {
    if (!Array.isArray(journeys) || journeys.length === 0) {
      return [];
    }

    const working = this.prepareJourneys(journeys);

    if (working.length === 1) {
      return this.decorateResults(working, () => 1.0);
    }

    // Bounds for score normalization
    const bounds = getMetricBounds(working, (j) => j.duration);

    // Multi-criteria tie-breaker
    const comparator = createTieBreaker([
      { extractor: (j) => j.duration, direction: 'asc', nullsLast: true },
      { extractor: (j) => j.numberOfTransfers, direction: 'asc', nullsLast: true },
      { extractor: (j) => j.totalPrice, direction: 'asc', nullsLast: true },
    ]);

    const sorted = working.sort(comparator);

    return this.decorateResults(sorted, (item) => {
      if (item.duration === null || item.duration === undefined) return 0.0;
      return normalizeLowerIsBetter(item.duration, bounds.min, bounds.max);
    });
  }
}

export const fastestStrategy = new FastestStrategy();
export default fastestStrategy;
