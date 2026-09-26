import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import locationService from './locationService.js';
import searchRequestService from './searchRequestService.js';
import journeySearchEngine from '../search/journeySearchEngine.js';
import Location from '../models/Location.js';
import rankingEngine from '../ranking/rankingEngine.js';

/**
 * Resolves a location input into a canonical Location Mongoose document.
 * Accepts:
 * - Location Mongoose/JSON document with _id
 * - Valid 24-hex MongoDB ObjectId string
 * - Free-text place name / travel phrase resolved via Phase 3 Location Resolution
 *
 * @param {string|Object} input
 * @param {string} label - 'origin' or 'destination'
 * @returns {Promise<Object|null>} Canonical Location document
 */
export async function resolveLocation(input, label = 'location') {
  if (!input) return null;

  // Case 1: Object with _id
  if (typeof input === 'object' && input._id) {
    if (mongoose.Types.ObjectId.isValid(input._id)) {
      const doc = await Location.findById(input._id);
      if (doc) return doc;
    }
    return input;
  }

  const clean = typeof input === 'string' ? input.trim() : '';
  if (!clean) return null;

  // Case 2: 24-character hexadecimal ObjectId
  if (/^[0-9a-fA-F]{24}$/.test(clean) && mongoose.Types.ObjectId.isValid(clean)) {
    const doc = await Location.findById(clean);
    if (doc) return doc;
  }

  // Case 3: Text query — delegate directly to Phase 3 Location Resolution
  logger.debug(`[JourneySearchService] Resolving ${label} text query: "${clean}"`);

  // Try exact/cached resolution first
  const resolved = await locationService.resolveSingle(clean);
  if (resolved) {
    const resolvedId = resolved._id || resolved.id;
    if (resolvedId && mongoose.Types.ObjectId.isValid(resolvedId)) {
      const doc = await Location.findById(resolvedId);
      if (doc) return doc;
    }
    return resolved;
  }

  // Fallback to location search candidates
  const candidates = await locationService.search(clean, { limit: 1 });
  if (candidates && candidates.length > 0) {
    const candidate = candidates[0];
    const candidateId = candidate._id || candidate.id;
    if (candidateId && mongoose.Types.ObjectId.isValid(candidateId)) {
      const doc = await Location.findById(candidateId);
      if (doc) return doc;
    }
    return candidate;
  }

  return null;
}

export const journeySearchService = {
  /**
   * Orchestrates the complete journey search lifecycle:
   * 1. Validates search input
   * 2. Resolves origin and destination to canonical Locations
   * 3. Validates origin/destination compatibility
   * 4. Creates SearchRequest record (status: 'pending')
   * 5. Advances status to 'processing'
   * 6. Executes internal Journey Search Pipeline
   * 7. Persists SearchResults and updates SearchRequest status to 'completed' (or 'failed')
   * 8. Returns canonical journey results
   *
   * @param {Object} params
   * @param {string|Object} params.origin - Origin query or Location reference
   * @param {string|Object} params.destination - Destination query or Location reference
   * @param {string|Date} params.departureDate - Travel departure date
   * @param {string|Date} [params.returnDate] - Optional return travel date
   * @param {number} [params.passengers=1]
   * @param {Array<string>} [params.requestedModes=[]]
   * @param {Object} [params.preferences={}]
   * @param {string} [params.userId=null] - Authenticated user ID (if available)
   * @param {Array<Object>} [params.candidateSources] - Optional provider overrides
   * @returns {Promise<{ searchRequest: Object, journeys: Array<Object> }>}
   */
  async searchJourneys(params) {
    const {
      origin: rawOrigin,
      destination: rawDestination,
      departureDate: rawDepDate,
      returnDate: rawRetDate,
      passengers = 1,
      requestedModes = [],
      preferences = {},
      ranking,
      sortBy,
      userId = null,
      candidateSources,
    } = params;

    // 1. Validate required inputs
    if (!rawOrigin) {
      const err = new Error('Origin location is required.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (!rawDestination) {
      const err = new Error('Destination location is required.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (!rawDepDate) {
      const err = new Error('Departure date is required.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    const departureDate = rawDepDate instanceof Date ? rawDepDate : new Date(rawDepDate);
    if (isNaN(departureDate.getTime())) {
      const err = new Error('Invalid departure date provided.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    const returnDate = rawRetDate ? new Date(rawRetDate) : null;
    if (returnDate && isNaN(returnDate.getTime())) {
      const err = new Error('Invalid return date provided.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    // 2. Resolve origin and destination using Phase 3 Location Resolution
    const [originLocation, destLocation] = await Promise.all([
      resolveLocation(rawOrigin, 'origin'),
      resolveLocation(rawDestination, 'destination'),
    ]);

    if (!originLocation) {
      const err = new Error(
        `Unable to resolve origin location "${typeof rawOrigin === 'string' ? rawOrigin : rawOrigin?.name || 'unknown'}".`
      );
      err.statusCode = 404;
      err.code = 'LOCATION_NOT_FOUND';
      throw err;
    }

    if (!destLocation) {
      const err = new Error(
        `Unable to resolve destination location "${typeof rawDestination === 'string' ? rawDestination : rawDestination?.name || 'unknown'}".`
      );
      err.statusCode = 404;
      err.code = 'LOCATION_NOT_FOUND';
      throw err;
    }

    // 3. Origin and destination compatibility check
    const originIdStr = String(originLocation._id || originLocation.id);
    const destIdStr = String(destLocation._id || destLocation.id);

    if (originIdStr === destIdStr) {
      const err = new Error('Origin and destination cannot be the same location.');
      err.statusCode = 400;
      err.code = 'SAME_ORIGIN_DESTINATION';
      throw err;
    }

    // 4. Create SearchRequest in 'pending' status
    let searchRequest = null;
    try {
      searchRequest = await searchRequestService.create({
        user: userId || null,
        origin: originLocation._id || originLocation,
        destination: destLocation._id || destLocation,
        departureDate,
        returnDate,
        passengers: Number(passengers) || 1,
        preferences: {
          priority: preferences.priority || 'balanced',
          maxBudget: preferences.maxBudget !== undefined ? Number(preferences.maxBudget) : null,
          maxTransfers:
            preferences.maxTransfers !== undefined ? Number(preferences.maxTransfers) : null,
        },
        requestedModes: Array.isArray(requestedModes) ? requestedModes : [],
        status: 'pending',
      });
    } catch (createErr) {
      logger.error('[JourneySearchService] Error creating SearchRequest:', createErr);
      throw createErr;
    }

    // 5. Advance SearchRequest status to 'processing'
    try {
      await searchRequestService.updateStatus(searchRequest._id, 'processing');
    } catch (statusErr) {
      logger.warn(
        `[JourneySearchService] Could not update status to processing: ${statusErr.message}`
      );
    }

    // 6. Execute search pipeline
    try {
      const journeys = await journeySearchEngine.search({
        searchRequest,
        origin: originLocation,
        destination: destLocation,
        departureDate,
        passengers: Number(passengers) || 1,
        requestedModes: Array.isArray(requestedModes) ? requestedModes : [],
        preferences,
        candidateSources,
      });

      // 7. Execute Phase 7 Ranking Engine
      const rankingStrategy = ranking || sortBy || preferences.priority || 'overall';
      const rankedJourneys = rankingEngine.rank(journeys, rankingStrategy, {
        preferences,
        passengers: Number(passengers) || 1,
      });

      // 8. Advance SearchRequest status to 'completed'
      await searchRequestService.updateStatus(searchRequest._id, 'completed');

      const strategyInstance = rankingEngine.registry.get(rankingStrategy);

      return {
        searchRequest,
        origin: originLocation,
        destination: destLocation,
        ranking: {
          strategy: strategyInstance ? strategyInstance.id : rankingStrategy,
          label: strategyInstance ? strategyInstance.name : 'Best Overall',
        },
        journeys: rankedJourneys,
      };
    } catch (pipelineError) {
      logger.error('[JourneySearchService] Search pipeline failed:', pipelineError);

      if (searchRequest && searchRequest._id) {
        try {
          await searchRequestService.updateStatus(searchRequest._id, 'failed');
        } catch (failStatusErr) {
          logger.error(
            `[JourneySearchService] Failed to set SearchRequest status to failed: ${failStatusErr.message}`
          );
        }
      }

      throw pipelineError;
    }
  },
};

export default journeySearchService;
