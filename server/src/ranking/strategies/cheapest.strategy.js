import { BaseRankingStrategy } from './base.strategy.js';
import { createTieBreaker } from '../utils/tieBreaker.js';
import { getMetricBounds, normalizeLowerIsBetter } from '../utils/scoreNormalizer.js';
import { STRATEGY_DEFINITIONS } from '../rankingConfig.js';

/**
 * Cheapest Journey Ranking Strategy
 * Prioritizes routes with the lowest total travel cost.
 *
 * Tie-break hierarchy:
 * 1. Total price (ascending)
 * 2. Duration (ascending)
 * 3. Number of transfers (ascending)
 * 4. Original sequence index (ascending)
 *
 * Currency policy:
 * Validates that all comparable prices share the same currency.
 * Journeys with differing currencies or missing prices are placed at the end.
 */
export class CheapestStrategy extends BaseRankingStrategy {
  constructor() {
    super(
      STRATEGY_DEFINITIONS.cheapest.id,
      STRATEGY_DEFINITIONS.cheapest.name,
      STRATEGY_DEFINITIONS.cheapest.description
    );
  }

  /**
   * Ranks canonical journeys by total cost.
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

    // Validate currency consistency
    const { consistent, baseCurrency } = this.validateCurrencyConsistency(working);

    // Filter comparable vs non-comparable (different currency or missing price)
    const comparable = [];
    const nonComparable = [];

    for (const j of working) {
      const isMissingPrice = j.totalPrice === null || j.totalPrice === undefined || isNaN(j.totalPrice);
      const jCurrency = (j.currency || baseCurrency).toUpperCase();

      if (isMissingPrice || (!consistent && jCurrency !== baseCurrency)) {
        nonComparable.push(j);
      } else {
        comparable.push(j);
      }
    }

    // Bounds for comparable prices
    const bounds = getMetricBounds(comparable, (j) => j.totalPrice);

    // Multi-criteria tie-breaker for comparable journeys
    const comparator = createTieBreaker([
      { extractor: (j) => j.totalPrice, direction: 'asc', nullsLast: true },
      { extractor: (j) => j.duration, direction: 'asc', nullsLast: true },
      { extractor: (j) => j.numberOfTransfers, direction: 'asc', nullsLast: true },
    ]);

    const sortedComparable = comparable.sort(comparator);

    // Non-comparables preserve their original order
    const sortedNonComparable = nonComparable.sort(
      createTieBreaker([{ extractor: (j) => j._originalIndex, direction: 'asc' }])
    );

    const merged = [...sortedComparable, ...sortedNonComparable];

    return this.decorateResults(merged, (item) => {
      if (item.totalPrice === null || item.totalPrice === undefined || isNaN(item.totalPrice)) {
        return 0.0;
      }
      return normalizeLowerIsBetter(item.totalPrice, bounds.min, bounds.max);
    });
  }
}

export const cheapestStrategy = new CheapestStrategy();
export default cheapestStrategy;
