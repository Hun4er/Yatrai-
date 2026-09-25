import config from '../../config/index.js';
import nominatimAdapter from './nominatim.adapter.js';

/**
 * Registry of supported location adapters.
 */
const adapters = {
  nominatim: nominatimAdapter,
};

/**
 * Returns the configured location provider adapter.
 *
 * @param {string} [providerName]
 * @returns {typeof nominatimAdapter}
 */
export function getLocationAdapter(providerName = config.geocoding.provider) {
  const adapter = adapters[providerName?.toLowerCase()] || adapters.nominatim;
  return adapter;
}

/**
 * Unified Location Provider Gateway
 */
export const locationProvider = {
  /**
   * Search for locations via the active geocoding provider.
   *
   * @param {string} query
   * @param {Object} [options]
   * @returns {Promise<Array<Object>>} Canonical location objects
   */
  async search(query, options = {}) {
    const adapter = options.adapter || getLocationAdapter();
    return await adapter.search(query, options);
  },
};

export default locationProvider;
