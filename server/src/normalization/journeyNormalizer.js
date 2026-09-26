import logger from '../utils/logger.js';
import { selectNormalizationStrategy } from './strategies/index.js';
import { validateJourneyCandidate } from './journeyValidator.js';

/**
 * Core Journey Normalizer Service
 *
 * Implements the Phase 6 normalization pipeline:
 * Converts provider-specific transport responses or envelopes into one
 * canonical Yatrai domain representation (Canonical Journey + sequential Canonical JourneyLegs).
 *
 * Guarantees:
 * - Provider-specific mapping is isolated inside strategies (Rail, Bus, Flight, Road)
 * - Canonical output domain is strictly provider-agnostic
 * - Distinguishes complete trip (Journey) from individual transport segments (JourneyLeg)
 * - Authority of JourneyLeg.journey relationship is preserved
 * - Fault-tolerant: Malformed candidates are safely rejected without aborting valid results
 */
export class JourneyNormalizer {
  /**
   * Normalizes a single provider result or candidate.
   *
   * @param {Object} rawCandidate - Raw candidate from provider
   * @param {Object} [context={}] - Search context (origin, destination, departureDate, etc.)
   * @returns {Object} Normalized canonical candidate
   */
  normalizeCandidate(rawCandidate, context = {}) {
    if (!rawCandidate || typeof rawCandidate !== 'object') {
      throw new Error('Raw candidate must be a valid object');
    }

    const strategy = selectNormalizationStrategy(rawCandidate, context);
    const normalized = strategy.normalize(rawCandidate, context);
    return normalized;
  }

  /**
   * Normalizes a Provider Result Envelope or a collection of provider candidates.
   *
   * @param {Object|Array} providerResult - Provider Result Envelope or array of candidates
   * @param {Object} [context={}] - Search context
   * @param {Object} [options={ validate: false }]
   * @returns {Array<Object>} List of successfully normalized canonical journey candidates
   */
  normalizeProviderResult(providerResult, context = {}, options = {}) {
    if (!providerResult) return [];

    // Case 1: Empty envelope or unavailable envelope
    if (providerResult.status === 'empty' || providerResult.status === 'unavailable') {
      logger.debug(
        `[JourneyNormalizer] Provider envelope for ${providerResult.provider || 'unknown'} has status: ${providerResult.status}`
      );
      return [];
    }

    // Case 2: Failed envelope
    if (providerResult.status === 'failed') {
      logger.warn(
        `[JourneyNormalizer] Provider envelope for ${providerResult.provider || 'unknown'} reported failure: ${providerResult.error?.message || 'Unknown error'}`
      );
      return [];
    }

    // Extract candidates from envelope or direct array/object
    let rawItems = [];
    if (Array.isArray(providerResult)) {
      rawItems = providerResult;
    } else if (Array.isArray(providerResult.candidates)) {
      rawItems = providerResult.candidates;
    } else if (providerResult.candidates && typeof providerResult.candidates === 'object') {
      rawItems = [providerResult.candidates];
    } else if (providerResult && typeof providerResult === 'object') {
      // Direct candidate object or envelope with items in data/rawData
      if (Array.isArray(providerResult.data)) {
        rawItems = providerResult.data;
      } else {
        rawItems = [providerResult];
      }
    }

    const normalizedJourneys = [];
    const mergedContext = {
      ...context,
      provider: providerResult.provider || context.provider,
      providerCode: providerResult.providerCode || context.providerCode,
      source: providerResult.source || context.source,
    };

    for (let i = 0; i < rawItems.length; i++) {
      const raw = rawItems[i];
      try {
        const normalized = this.normalizeCandidate(raw, mergedContext);

        if (options.validate) {
          const validation = validateJourneyCandidate(normalized);
          if (!validation.valid) {
            logger.warn(
              `[JourneyNormalizer] Rejecting invalid candidate at index ${i}: ${validation.errors.join('; ')}`
            );
            continue;
          }
        }

        normalizedJourneys.push(normalized);
      } catch (err) {
        logger.warn(
          `[JourneyNormalizer] Failed to normalize candidate at index ${i}: ${err.message}`
        );
      }
    }

    return normalizedJourneys;
  }

  /**
   * Universal normalize entry point.
   *
   * @param {*} input
   * @param {Object} [context={}]
   * @param {Object} [options={}]
   * @returns {Object|Array<Object>}
   */
  normalize(input, context = {}, options = {}) {
    if (Array.isArray(input)) {
      return this.normalizeProviderResult(input, context, options);
    }
    if (input && typeof input === 'object' && ('candidates' in input || 'provider' in input)) {
      return this.normalizeProviderResult(input, context, options);
    }
    return this.normalizeCandidate(input, context);
  }
}

export const journeyNormalizer = new JourneyNormalizer();

/**
 * Backward-compatible helper for Phase 4 & Phase 5 consumers.
 *
 * @param {Object} rawCandidate
 * @param {Object} context
 * @returns {Object}
 */
export function normalizeJourneyCandidate(rawCandidate, context = {}) {
  return journeyNormalizer.normalizeCandidate(rawCandidate, context);
}

/**
 * Normalized provider result helper.
 *
 * @param {Object} providerResult
 * @param {Object} context
 * @param {Object} options
 * @returns {Array<Object>}
 */
export function normalizeProviderResult(providerResult, context = {}, options = {}) {
  return journeyNormalizer.normalizeProviderResult(providerResult, context, options);
}

export default journeyNormalizer;
