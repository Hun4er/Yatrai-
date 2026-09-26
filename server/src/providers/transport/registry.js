import { roadTransportProvider } from './road/road.provider.js';
import { railTransportProvider } from './rail/rail.provider.js';
import { busTransportProvider } from './bus/bus.provider.js';
import { flightTransportProvider } from './flight/flight.provider.js';
import { logger } from '../../utils/logger.js';

/**
 * Transport Provider Registry
 *
 * Controls executable provider adapters across supported transport modes:
 * - road
 * - rail
 * - bus
 * - flight
 *
 * Responsibilities:
 * - Register and resolve mode-specific adapters
 * - Filter providers based on SearchRequest.requestedModes
 * - Coordinate parallel, fault-isolated queries
 * - Maintain distinction between successful, empty, failed, and unavailable results
 */
export class TransportProviderRegistry {
  constructor() {
    this.providers = new Map();
  }

  /**
   * Registers a transport provider adapter for a mode.
   *
   * @param {string} mode - e.g. 'road', 'rail', 'bus', 'flight'
   * @param {Object} provider - Instance of BaseTransportProvider
   */
  register(mode, provider) {
    if (!mode || typeof mode !== 'string') {
      throw new Error('Provider mode must be a non-empty string');
    }
    if (!provider || typeof provider.search !== 'function') {
      throw new Error(`Provider for mode "${mode}" must implement a search() method`);
    }
    this.providers.set(mode.toLowerCase(), provider);
  }

  /**
   * Unregisters a provider adapter.
   *
   * @param {string} mode
   */
  unregister(mode) {
    this.providers.delete(mode.toLowerCase());
  }

  /**
   * Retrieves the provider adapter registered for a specific mode.
   *
   * @param {string} mode
   * @returns {Object|null}
   */
  getProvider(mode) {
    return this.providers.get(mode.toLowerCase()) || null;
  }

  /**
   * Returns all registered provider adapters.
   *
   * @returns {Array<Object>}
   */
  getAllProviders() {
    return Array.from(this.providers.values());
  }

  /**
   * Resolves relevant providers for a search request based on requestedModes.
   *
   * @param {Object} [filter]
   * @param {string[]} [filter.requestedModes] - Array of requested modes
   * @returns {Array<Object>} List of provider adapters
   */
  getProviders(filter = {}) {
    const { requestedModes } = filter;

    if (!requestedModes || !Array.isArray(requestedModes) || requestedModes.length === 0) {
      // By default, return all registered and enabled providers
      return Array.from(this.providers.values());
    }

    const matched = [];
    const normalizedModes = requestedModes.map((m) => String(m).toLowerCase());

    for (const mode of normalizedModes) {
      const provider = this.getProvider(mode);
      if (provider) {
        matched.push(provider);
      }
    }

    return matched;
  }

  /**
   * Queries matching providers in parallel with full fault-isolation.
   * A failure or timeout in one provider will never terminate or invalidate
   * successful responses from other providers.
   *
   * @param {Object} request - Standard Provider Request
   * @param {Object} [options] - Options passed to provider search (e.g. timeoutMs, mockData)
   * @returns {Promise<Object>} Aggregated execution summary and envelopes
   */
  async searchAll(request, options = {}) {
    const providersToQuery = this.getProviders({
      requestedModes: request.requestedModes,
    });

    if (providersToQuery.length === 0) {
      return {
        envelopes: [],
        candidates: [],
        successfulCount: 0,
        emptyCount: 0,
        failedCount: 0,
        unavailableCount: 0,
        totalCount: 0,
      };
    }

    const queryPromises = providersToQuery.map(async (provider) => {
      try {
        const envelope = await provider.search(request, options);
        return envelope;
      } catch (unhandledErr) {
        logger.error(`[Provider Registry] Unhandled error during ${provider.mode} search:`, {
          message: unhandledErr.message,
          provider: provider.mode,
        });
        return {
          provider: provider.mode,
          providerCode: provider.code,
          status: 'failed',
          requestedAt: new Date(),
          candidates: [],
          rawData: null,
          metadata: { unhandled: true },
          error: {
            provider: provider.mode,
            code: 'PROVIDER_ERROR',
            message: unhandledErr.message,
            retryable: false,
          },
        };
      }
    });

    const settled = await Promise.allSettled(queryPromises);
    const envelopes = settled.map((item) =>
      item.status === 'fulfilled'
        ? item.value
        : {
            provider: 'unknown',
            status: 'failed',
            requestedAt: new Date(),
            candidates: [],
            rawData: null,
            metadata: {},
            error: {
              code: 'PROVIDER_FATAL',
              message: item.reason?.message || 'Provider execution rejected',
            },
          }
    );

    let successfulCount = 0;
    let emptyCount = 0;
    let failedCount = 0;
    let unavailableCount = 0;
    const allCandidates = [];

    for (const envelope of envelopes) {
      switch (envelope.status) {
        case 'success':
          successfulCount++;
          if (Array.isArray(envelope.candidates)) {
            allCandidates.push(...envelope.candidates);
          }
          break;
        case 'empty':
          emptyCount++;
          break;
        case 'failed':
          failedCount++;
          break;
        case 'unavailable':
          unavailableCount++;
          break;
        default:
          failedCount++;
      }
    }

    return {
      envelopes,
      candidates: allCandidates,
      successfulCount,
      emptyCount,
      failedCount,
      unavailableCount,
      totalCount: envelopes.length,
    };
  }
}

/**
 * Default singleton provider registry instance initialized with
 * standard transport adapters.
 */
export const providerRegistry = new TransportProviderRegistry();

// Register default transport adapters
providerRegistry.register('road', roadTransportProvider);
providerRegistry.register('rail', railTransportProvider);
providerRegistry.register('bus', busTransportProvider);
providerRegistry.register('flight', flightTransportProvider);

export default providerRegistry;
