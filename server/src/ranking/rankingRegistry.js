import {
  overallStrategy,
  fastestStrategy,
  cheapestStrategy,
  fewestTransfersStrategy,
  mostConvenientStrategy,
} from './strategies/index.js';
import { STRATEGY_DEFINITIONS } from './rankingConfig.js';

/**
 * Ranking Strategy Registry
 * Manages registered ranking strategies and resolves aliases.
 */
export class RankingRegistry {
  constructor() {
    this.strategies = new Map();
    this.aliasMap = new Map();
    this.registerDefaults();
  }

  /**
   * Registers default Yatrai ranking strategies and their aliases.
   */
  registerDefaults() {
    this.register('overall', overallStrategy);
    this.register('fastest', fastestStrategy);
    this.register('cheapest', cheapestStrategy);
    this.register('fewest_transfers', fewestTransfersStrategy);
    this.register('most_convenient', mostConvenientStrategy);

    // Register aliases from config
    for (const [canonicalId, def] of Object.entries(STRATEGY_DEFINITIONS)) {
      if (Array.isArray(def.aliases)) {
        for (const alias of def.aliases) {
          this.aliasMap.set(alias.toLowerCase(), canonicalId.toLowerCase());
        }
      }
    }
  }

  /**
   * Registers a ranking strategy instance.
   *
   * @param {string} id
   * @param {Object} strategyInstance
   */
  register(id, strategyInstance) {
    if (!id || typeof id !== 'string') {
      throw new Error('Strategy registration requires a string id');
    }
    if (!strategyInstance || typeof strategyInstance.rank !== 'function') {
      throw new Error(`Strategy "${id}" must implement a rank(journeys, context) method`);
    }

    const cleanId = id.trim().toLowerCase();
    this.strategies.set(cleanId, strategyInstance);
  }

  /**
   * Unregisters a strategy by id.
   *
   * @param {string} id
   */
  unregister(id) {
    if (!id) return;
    const cleanId = id.trim().toLowerCase();
    this.strategies.delete(cleanId);
  }

  /**
   * Resolves a strategy instance by canonical id or alias.
   * Returns null if not found.
   *
   * @param {string} idOrAlias
   * @returns {Object|null}
   */
  get(idOrAlias) {
    if (!idOrAlias || typeof idOrAlias !== 'string') {
      return null;
    }

    const clean = idOrAlias.trim().toLowerCase();

    // 1. Direct match
    if (this.strategies.has(clean)) {
      return this.strategies.get(clean);
    }

    // 2. Alias resolution
    if (this.aliasMap.has(clean)) {
      const canonicalId = this.aliasMap.get(clean);
      return this.strategies.get(canonicalId) || null;
    }

    return null;
  }

  /**
   * Checks whether a strategy or alias is registered.
   *
   * @param {string} idOrAlias
   * @returns {boolean}
   */
  has(idOrAlias) {
    return this.get(idOrAlias) !== null;
  }

  /**
   * Returns all registered strategy instances.
   *
   * @returns {Array<Object>}
   */
  getAll() {
    return Array.from(this.strategies.values());
  }

  /**
   * Returns list of canonical strategy IDs.
   *
   * @returns {Array<string>}
   */
  getRegisteredIds() {
    return Array.from(this.strategies.keys());
  }
}

export const rankingRegistry = new RankingRegistry();
export default rankingRegistry;
