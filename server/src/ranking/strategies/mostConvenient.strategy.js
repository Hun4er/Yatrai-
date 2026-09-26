import { BaseRankingStrategy } from './base.strategy.js';
import { createTieBreaker } from '../utils/tieBreaker.js';
import { getMetricBounds, normalizeLowerIsBetter } from '../utils/scoreNormalizer.js';
import { STRATEGY_DEFINITIONS, CONVENIENCE_WEIGHTS, SCHEDULE_SCORING } from '../rankingConfig.js';

/**
 * Evaluates convenience score based on departure hour.
 *
 * @param {Date|string} departureTime
 * @returns {number} Score in [0.0, 1.0]
 */
export function computeScheduleScore(departureTime) {
  if (!departureTime) return SCHEDULE_SCORING.daytimeScore;
  const d = departureTime instanceof Date ? departureTime : new Date(departureTime);
  if (isNaN(d.getTime())) return SCHEDULE_SCORING.daytimeScore;

  // Compute local hour in IST (+05:30)
  const utcHours = d.getUTCHours();
  const utcMinutes = d.getUTCMinutes();
  const istMinutes = utcHours * 60 + utcMinutes + 330;
  const istHour = Math.floor((istMinutes / 60) % 24);

  if (
    istHour >= SCHEDULE_SCORING.preferredWindowStartHour &&
    istHour < SCHEDULE_SCORING.preferredWindowEndHour
  ) {
    return SCHEDULE_SCORING.daytimeScore; // Daytime (06:00 - 22:00)
  }
  if (istHour >= SCHEDULE_SCORING.preferredWindowEndHour || istHour < 1) {
    return SCHEDULE_SCORING.lateNightScore; // Late night (22:00 - 01:00)
  }
  return SCHEDULE_SCORING.earlyMorningScore; // Red-eye / early morning (01:00 - 06:00)
}

/**
 * Evaluates mode change simplicity (single mode = 1.0, 2 modes = 0.7, 3+ modes = 0.4).
 *
 * @param {Array<string>} transportModes
 * @returns {number}
 */
export function computeModeChangeScore(transportModes) {
  if (!Array.isArray(transportModes) || transportModes.length <= 1) {
    return 1.0;
  }
  if (transportModes.length === 2) {
    return 0.7;
  }
  return 0.4;
}

/**
 * Most Convenient Journey Ranking Strategy
 * Evaluates connection complexity, total travel time, departure schedule, and mode transitions.
 *
 * Composite Weights (configurable in rankingConfig.js):
 * - Transfers: 40%
 * - Duration: 30%
 * - Departure Schedule: 20%
 * - Mode Transitions: 10%
 *
 * Tie-break hierarchy:
 * 1. Convenience Score (descending)
 * 2. Number of transfers (ascending)
 * 3. Duration (ascending)
 * 4. Total price (ascending)
 * 5. Original sequence index (ascending)
 */
export class MostConvenientStrategy extends BaseRankingStrategy {
  constructor(weights = CONVENIENCE_WEIGHTS) {
    super(
      STRATEGY_DEFINITIONS.most_convenient.id,
      STRATEGY_DEFINITIONS.most_convenient.name,
      STRATEGY_DEFINITIONS.most_convenient.description
    );
    this.weights = weights;
  }

  /**
   * Ranks canonical journeys by convenience score.
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

    const durationBounds = getMetricBounds(working, (j) => j.duration);
    const transferBounds = getMetricBounds(working, (j) => j.numberOfTransfers);

    // Compute composite convenience score for each candidate
    for (const j of working) {
      const transferScore =
        j.numberOfTransfers !== null && j.numberOfTransfers !== undefined
          ? normalizeLowerIsBetter(j.numberOfTransfers, transferBounds.min, transferBounds.max)
          : 0.0;

      const durationScore =
        j.duration !== null && j.duration !== undefined
          ? normalizeLowerIsBetter(j.duration, durationBounds.min, durationBounds.max)
          : 0.0;

      const scheduleScore = computeScheduleScore(j.departureTime);
      const modeScore = computeModeChangeScore(j.transportModes);

      const rawScore =
        transferScore * this.weights.transferWeight +
        durationScore * this.weights.durationWeight +
        scheduleScore * this.weights.scheduleWeight +
        modeScore * this.weights.modeChangeWeight;

      j._score = Math.round(rawScore * 10000) / 10000;
    }

    const comparator = createTieBreaker([
      { extractor: (j) => j._score, direction: 'desc' },
      { extractor: (j) => j.numberOfTransfers, direction: 'asc', nullsLast: true },
      { extractor: (j) => j.duration, direction: 'asc', nullsLast: true },
      { extractor: (j) => j.totalPrice, direction: 'asc', nullsLast: true },
    ]);

    const sorted = working.sort(comparator);

    return this.decorateResults(sorted, (item) => item._score);
  }
}

export const mostConvenientStrategy = new MostConvenientStrategy();
export default mostConvenientStrategy;
