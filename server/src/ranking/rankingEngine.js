import logger from '../utils/logger.js';
import rankingRegistry, { RankingRegistry } from './rankingRegistry.js';
import { DEFAULT_STRATEGY, STRATEGY_DEFINITIONS } from './rankingConfig.js';

/**
 * Core Ranking Engine for Yatrai
 *
 * Coordinates evaluating canonical normalized journeys through
 * pluggable, independent ranking strategies.
 *
 * Invariants:
 * - Operates strictly on canonical domain properties
 * - Zero provider-specific conditionals or brand biases
 * - Pluggable strategy resolution via RankingRegistry
 * - Supports single strategy ranking and multi-category rankAll
 * - Deterministic tie-breaking with original sequence stability
 */
export class RankingEngine {
  constructor(registry = rankingRegistry) {
    this.registry = registry;
  }

  /**
   * Ranks an array of canonical journeys using the specified strategy.
   *
   * @param {Array<Object>} journeys - Canonical normalized journeys
   * @param {string} [strategyId='overall'] - Strategy identifier or alias
   * @param {Object} [context={}] - Ranking context (preferences, passenger count, etc.)
   * @returns {Array<Object>} Ranked journeys with ranking metadata
   */
  rank(journeys, strategyId = DEFAULT_STRATEGY, context = {}) {
    if (!Array.isArray(journeys)) {
      throw new Error('Journeys must be an array');
    }

    if (journeys.length === 0) {
      return [];
    }

    const requestedId = strategyId || DEFAULT_STRATEGY;
    const strategy = this.registry.get(requestedId);

    if (!strategy) {
      const registered = this.registry.getRegisteredIds().join(', ');
      const err = new Error(
        `Invalid ranking strategy "${requestedId}". Supported strategies: ${registered}`
      );
      err.code = 'INVALID_RANKING_STRATEGY';
      err.statusCode = 400;
      throw err;
    }

    logger.debug(
      `[RankingEngine] Ranking ${journeys.length} journey(s) using strategy: "${strategy.id}" (${strategy.name})`
    );

    const ranked = strategy.rank(journeys, context);
    return ranked;
  }

  /**
   * Ranks the same canonical journey set across all registered recommendation categories.
   *
   * @param {Array<Object>} journeys
   * @param {Object} [context={}]
   * @returns {Object<string, Array<Object>>} Map of category ID to ranked journeys
   */
  rankAll(journeys, context = {}) {
    if (!Array.isArray(journeys)) {
      throw new Error('Journeys must be an array');
    }

    const categories = {};
    const strategies = this.registry.getAll();

    for (const strategy of strategies) {
      categories[strategy.id] = strategy.rank(journeys, context);
    }

    return categories;
  }

  /**
   * Returns list of supported strategies with metadata.
   *
   * @returns {Array<Object>}
   */
  getSupportedStrategies() {
    return Object.values(STRATEGY_DEFINITIONS);
  }
}

export const rankingEngine = new RankingEngine();
export { RankingRegistry };
export default rankingEngine;
