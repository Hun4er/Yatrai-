import logger from '../../utils/logger.js';
import { MISSING_VALUE_POLICY } from '../rankingConfig.js';

/**
 * Base Ranking Strategy
 * Common foundation for all specialized journey ranking strategies.
 *
 * Enforces:
 * - Immutability: Does not mutate canonical input journeys
 * - Original sequence retention for deterministic tie-breaking
 * - Currency homogeneity validation
 * - Common ranking metadata decoration
 */
export class BaseRankingStrategy {
  /**
   * @param {string} id - Stable identifier (e.g. 'fastest', 'cheapest')
   * @param {string} name - Human-readable label (e.g. 'Fastest', 'Cheapest')
   * @param {string} [description]
   */
  constructor(id, name, description = '') {
    if (!id || typeof id !== 'string') {
      throw new Error('Ranking strategy requires a valid string id');
    }
    if (!name || typeof name !== 'string') {
      throw new Error('Ranking strategy requires a valid string name');
    }
    this.id = id;
    this.name = name;
    this.description = description;
  }

  /**
   * Prepares incoming journeys for ranking without mutating originals.
   * Attaches original index to preserve deterministic order.
   *
   * @param {Array<Object>} journeys
   * @returns {Array<Object>} Cloned working set with _originalIndex
   */
  prepareJourneys(journeys = []) {
    if (!Array.isArray(journeys)) return [];

    return journeys.map((journey, index) => {
      // Shallow clone to preserve caller's object references
      const raw = typeof journey.toJSON === 'function' ? journey.toJSON() : { ...journey };
      return {
        ...raw,
        _originalIndex: index,
      };
    });
  }

  /**
   * Validates currency consistency across candidate journeys.
   * Warns and partitions any non-conforming currencies to avoid comparing raw numbers across currencies.
   *
   * @param {Array<Object>} journeys
   * @returns {{ consistent: boolean, baseCurrency: string, nonConforming: Array<Object> }}
   */
  validateCurrencyConsistency(journeys) {
    if (!journeys || journeys.length === 0) {
      return { consistent: true, baseCurrency: MISSING_VALUE_POLICY.defaultCurrency, nonConforming: [] };
    }

    const currencies = journeys
      .map((j) => (j.currency || MISSING_VALUE_POLICY.defaultCurrency).toUpperCase())
      .filter(Boolean);

    const baseCurrency = currencies[0] || MISSING_VALUE_POLICY.defaultCurrency;
    const nonConforming = journeys.filter(
      (j) => (j.currency || MISSING_VALUE_POLICY.defaultCurrency).toUpperCase() !== baseCurrency
    );

    if (nonConforming.length > 0) {
      logger.warn(
        `[BaseRankingStrategy] Multiple currencies detected (${Array.from(new Set(currencies)).join(', ')}). ` +
          `Raw numeric comparison across different currencies is disabled.`
      );
      return { consistent: false, baseCurrency, nonConforming };
    }

    return { consistent: true, baseCurrency, nonConforming: [] };
  }

  /**
   * Decorates ranked journey candidates with rank and score metadata.
   *
   * @param {Array<Object>} rankedList
   * @param {Function} [scoreExtractor] - Optional (item, index) => number
   * @returns {Array<Object>}
   */
  decorateResults(rankedList, scoreExtractor = null) {
    return rankedList.map((item, index) => {
      const rank = index + 1;
      const score =
        typeof scoreExtractor === 'function'
          ? scoreExtractor(item, index)
          : item._score !== undefined
            ? item._score
            : Math.max(0, Math.round((1 - index / Math.max(1, rankedList.length)) * 100) / 100);

      // Clean internal tracking properties
      const cleaned = { ...item };
      delete cleaned._originalIndex;
      delete cleaned._score;

      cleaned.ranking = {
        rank,
        score: typeof score === 'number' && !isNaN(score) ? score : 1.0,
        strategy: this.id,
        label: this.name,
      };

      return cleaned;
    });
  }

  /**
   * Executes strategy ranking logic. Must be overridden by subclasses.
   *
   * @param {Array<Object>} journeys
   * @param {Object} [context={}]
   * @returns {Array<Object>} Ranked canonical journeys
   */
  rank(journeys, context = {}) {
    throw new Error(`Strategy ${this.id} (${this.constructor.name}) must implement rank()`);
  }
}

export default BaseRankingStrategy;
