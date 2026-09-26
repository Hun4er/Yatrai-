import { BaseRankingStrategy } from './base.strategy.js';
import { createTieBreaker } from '../utils/tieBreaker.js';
import { getMetricBounds, normalizeLowerIsBetter } from '../utils/scoreNormalizer.js';
import { STRATEGY_DEFINITIONS, OVERALL_WEIGHTS } from '../rankingConfig.js';
import { computeScheduleScore, computeModeChangeScore } from './mostConvenient.strategy.js';

/**
 * Best Overall Journey Ranking Strategy
 * Calculates a balanced composite score across duration, price, transfers, and convenience.
 *
 * Configurable Weights (defined in rankingConfig.js):
 * - Duration: 35%
 * - Price: 30%
 * - Transfers: 20%
 * - Convenience: 15%
 *
 * Tie-break hierarchy:
 * 1. Overall Score (descending)
 * 2. Total duration (ascending)
 * 3. Total price (ascending)
 * 4. Number of transfers (ascending)
 * 5. Original sequence index (ascending)
 */
export class OverallStrategy extends BaseRankingStrategy {
  constructor(weights = OVERALL_WEIGHTS) {
    super(
      STRATEGY_DEFINITIONS.overall.id,
      STRATEGY_DEFINITIONS.overall.name,
      STRATEGY_DEFINITIONS.overall.description
    );
    this.weights = weights;
  }

  /**
   * Ranks canonical journeys by composite overall score.
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

    // Currency verification
    const { consistent, baseCurrency } = this.validateCurrencyConsistency(working);

    // Compute metric bounds
    const durationBounds = getMetricBounds(working, (j) => j.duration);
    const priceBounds = getMetricBounds(
      working.filter(
        (j) =>
          typeof j.totalPrice === 'number' &&
          !isNaN(j.totalPrice) &&
          (consistent || (j.currency || baseCurrency).toUpperCase() === baseCurrency)
      ),
      (j) => j.totalPrice
    );
    const transferBounds = getMetricBounds(working, (j) => j.numberOfTransfers);

    for (const j of working) {
      const isMissingPrice =
        j.totalPrice === null ||
        j.totalPrice === undefined ||
        isNaN(j.totalPrice) ||
        (!consistent && (j.currency || baseCurrency).toUpperCase() !== baseCurrency);

      const durationScore =
        j.duration !== null && j.duration !== undefined
          ? normalizeLowerIsBetter(j.duration, durationBounds.min, durationBounds.max)
          : 0.0;

      const priceScore = !isMissingPrice
        ? normalizeLowerIsBetter(j.totalPrice, priceBounds.min, priceBounds.max)
        : 0.0;

      const transferScore =
        j.numberOfTransfers !== null && j.numberOfTransfers !== undefined
          ? normalizeLowerIsBetter(j.numberOfTransfers, transferBounds.min, transferBounds.max)
          : 0.0;

      // Convenience factor (schedule + mode change)
      const scheduleScore = computeScheduleScore(j.departureTime);
      const modeScore = computeModeChangeScore(j.transportModes);
      const convenienceScore = (scheduleScore + modeScore) / 2;

      const rawScore =
        durationScore * this.weights.durationWeight +
        priceScore * this.weights.priceWeight +
        transferScore * this.weights.transferWeight +
        convenienceScore * this.weights.convenienceWeight;

      j._score = Math.round(rawScore * 10000) / 10000;
    }

    const comparator = createTieBreaker([
      { extractor: (j) => j._score, direction: 'desc' },
      { extractor: (j) => j.duration, direction: 'asc', nullsLast: true },
      { extractor: (j) => j.totalPrice, direction: 'asc', nullsLast: true },
      { extractor: (j) => j.numberOfTransfers, direction: 'asc', nullsLast: true },
    ]);

    const sorted = working.sort(comparator);

    return this.decorateResults(sorted, (item) => item._score);
  }
}

export const overallStrategy = new OverallStrategy();
export default overallStrategy;
