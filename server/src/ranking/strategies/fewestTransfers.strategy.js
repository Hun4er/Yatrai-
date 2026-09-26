import { BaseRankingStrategy } from './base.strategy.js';
import { createTieBreaker } from '../utils/tieBreaker.js';
import { getMetricBounds, normalizeLowerIsBetter } from '../utils/scoreNormalizer.js';
import { STRATEGY_DEFINITIONS } from '../rankingConfig.js';

/**
 * Fewest Transfers Journey Ranking Strategy
 * Prioritizes routes with the simplest transfer structure.
 *
 * Tie-break hierarchy:
 * 1. Number of transfers (ascending)
 * 2. Total duration (ascending)
 * 3. Total price (ascending)
 * 4. Original sequence index (ascending)
 */
export class FewestTransfersStrategy extends BaseRankingStrategy {
  constructor() {
    super(
      STRATEGY_DEFINITIONS.fewest_transfers.id,
      STRATEGY_DEFINITIONS.fewest_transfers.name,
      STRATEGY_DEFINITIONS.fewest_transfers.description
    );
  }

  /**
   * Ranks canonical journeys by transfer count.
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

    const bounds = getMetricBounds(working, (j) => j.numberOfTransfers);

    const comparator = createTieBreaker([
      { extractor: (j) => j.numberOfTransfers, direction: 'asc', nullsLast: true },
      { extractor: (j) => j.duration, direction: 'asc', nullsLast: true },
      { extractor: (j) => j.totalPrice, direction: 'asc', nullsLast: true },
    ]);

    const sorted = working.sort(comparator);

    return this.decorateResults(sorted, (item) => {
      if (item.numberOfTransfers === null || item.numberOfTransfers === undefined) {
        return 0.0;
      }
      return normalizeLowerIsBetter(item.numberOfTransfers, bounds.min, bounds.max);
    });
  }
}

export const fewestTransfersStrategy = new FewestTransfersStrategy();
export default fewestTransfersStrategy;
