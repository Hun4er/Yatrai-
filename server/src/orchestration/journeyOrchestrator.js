import mongoose from 'mongoose';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import locationService from '../services/locationService.js';
import searchRequestService from '../services/searchRequestService.js';
import journeyService from '../services/journeyService.js';
import journeyLegService from '../services/journeyLegService.js';
import searchResultService from '../services/searchResultService.js';
import JourneyLeg from '../models/JourneyLeg.js';
import Location from '../models/Location.js';
import providerRegistry from '../providers/transport/registry.js';
import developmentJourneyProvider from '../providers/journey/development.provider.js';
import journeyNormalizer from '../normalization/journeyNormalizer.js';
import journeyDeduplicator from '../deduplication/journeyDeduplicator.js';
import rankingEngine from '../ranking/rankingEngine.js';
import resultAssembler from './resultAssembler.js';
import { matchesTimeWindow } from '../services/naturalLanguage/timeWindowResolver.js';

/**
 * Resolves a location input into a canonical Location Mongoose document or object.
 * Reuses Phase 3 Location Resolution.
 *
 * @param {string|Object} input
 * @param {string} label - 'origin' or 'destination'
 * @returns {Promise<Object|null>}
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

  // Case 2: 24-hex ObjectId string
  if (/^[0-9a-fA-F]{24}$/.test(clean) && mongoose.Types.ObjectId.isValid(clean)) {
    const doc = await Location.findById(clean);
    if (doc) return doc;
  }

  // Case 3: Text query via Phase 3 Location Resolution
  logger.debug(`[JourneyOrchestrator] Resolving ${label} text query: "${clean}"`);

  const resolved = await locationService.resolveSingle(clean);
  if (resolved) {
    const resolvedId = resolved._id || resolved.id;
    if (resolvedId && mongoose.Types.ObjectId.isValid(resolvedId)) {
      const doc = await Location.findById(resolvedId);
      if (doc) return doc;
    }
    return resolved;
  }

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

/**
 * Journey Orchestrator
 *
 * The integration brain and coordinator of Yatrai.
 * Coordinates discovery across:
 * - Request validation
 * - Location resolution (Phase 3)
 * - Provider selection & concurrent execution (Phase 5)
 * - Journey normalization (Phase 6)
 * - Deduplication (Phase 8)
 * - Database persistence (Phase 1 & 4)
 * - Pluggable ranking (Phase 7)
 * - Final response assembly (Phase 8)
 *
 * Architectural Invariant:
 * The Orchestrator coordinates capabilities through interfaces and registries.
 * It does NOT implement transport-specific network protocols, normalization field
 * mappings, deduplication algorithms, or ranking arithmetic formulas.
 */
export class JourneyOrchestrator {
  /**
   * @param {Object} [dependencies={}]
   * @param {Object} [dependencies.locationResolver]
   * @param {Object} [dependencies.providerRegistry]
   * @param {Object} [dependencies.normalizer]
   * @param {Object} [dependencies.deduplicator]
   * @param {Object} [dependencies.rankingEngine]
   * @param {Object} [dependencies.resultAssembler]
   * @param {Object} [dependencies.searchRequestService]
   * @param {Object} [dependencies.journeyService]
   * @param {Object} [dependencies.journeyLegService]
   * @param {Object} [dependencies.searchResultService]
   * @param {Object} [dependencies.developmentProvider]
   * @param {number} [dependencies.timeoutMs=10000]
   */
  constructor(dependencies = {}) {
    this.locationResolver = dependencies.locationResolver || { resolveLocation };
    this.providerRegistry = dependencies.providerRegistry || providerRegistry;
    this.normalizer = dependencies.normalizer || journeyNormalizer;
    this.deduplicator = dependencies.deduplicator || journeyDeduplicator;
    this.rankingEngine = dependencies.rankingEngine || rankingEngine;
    this.resultAssembler = dependencies.resultAssembler || resultAssembler;
    this.searchRequestService = dependencies.searchRequestService || searchRequestService;
    this.journeyService = dependencies.journeyService || journeyService;
    this.journeyLegService = dependencies.journeyLegService || journeyLegService;
    this.searchResultService = dependencies.searchResultService || searchResultService;
    this.developmentProvider = dependencies.developmentProvider || developmentJourneyProvider;
    this.timeoutMs = dependencies.timeoutMs || 10000;
  }

  /**
   * 1. Validates the incoming search request parameters.
   *
   * @param {Object} params
   * @throws {Error} If validation fails (HTTP 400)
   */
  validateRequest(params) {
    if (!params || typeof params !== 'object') {
      const err = new Error('Search request body must be a valid JSON object.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    const { origin, destination, departureDate, returnDate, passengers, requestedModes, ranking, sortBy } = params;

    if (!origin) {
      const err = new Error('Origin location is required.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (!destination) {
      const err = new Error('Destination location is required.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (!departureDate) {
      const err = new Error('Departure date is required.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    const depDate = departureDate instanceof Date ? departureDate : new Date(departureDate);
    if (isNaN(depDate.getTime())) {
      const err = new Error('Invalid departure date provided.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (returnDate) {
      const retDate = returnDate instanceof Date ? returnDate : new Date(returnDate);
      if (isNaN(retDate.getTime())) {
        const err = new Error('Invalid return date provided.');
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }
    }

    if (passengers !== undefined) {
      const pNum = Number(passengers);
      if (!Number.isInteger(pNum) || pNum < 1) {
        const err = new Error('Passengers count must be an integer greater than or equal to 1.');
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }
    }

    if (requestedModes !== undefined && !Array.isArray(requestedModes)) {
      const err = new Error('Requested transport modes must be an array of mode strings.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    // Validate ranking strategy if provided
    const strategyName = ranking || sortBy;
    if (strategyName && this.rankingEngine?.registry) {
      const strategy = this.rankingEngine.registry.get(strategyName);
      if (!strategy) {
        const registered = this.rankingEngine.registry.getRegisteredIds().join(', ');
        const err = new Error(
          `Invalid ranking strategy "${strategyName}". Supported strategies: ${registered}`
        );
        err.statusCode = 400;
        err.code = 'INVALID_RANKING_STRATEGY';
        throw err;
      }
    }
  }

  /**
   * 2. Resolves origin and destination inputs to canonical Locations using Phase 3.
   *
   * @param {string|Object} rawOrigin
   * @param {string|Object} rawDestination
   * @returns {Promise<{ originLocation: Object, destLocation: Object }>}
   */
  async resolveLocations(rawOrigin, rawDestination) {
    const resolveFn =
      typeof this.locationResolver.resolveLocation === 'function'
        ? this.locationResolver.resolveLocation
        : resolveLocation;

    const [originLocation, destLocation] = await Promise.all([
      resolveFn(rawOrigin, 'origin'),
      resolveFn(rawDestination, 'destination'),
    ]);

    if (!originLocation) {
      const name = typeof rawOrigin === 'string' ? rawOrigin : rawOrigin?.name || 'unknown';
      const err = new Error(`Unable to resolve origin location "${name}".`);
      err.statusCode = 404;
      err.code = 'LOCATION_NOT_FOUND';
      throw err;
    }

    if (!destLocation) {
      const name = typeof rawDestination === 'string' ? rawDestination : rawDestination?.name || 'unknown';
      const err = new Error(`Unable to resolve destination location "${name}".`);
      err.statusCode = 404;
      err.code = 'LOCATION_NOT_FOUND';
      throw err;
    }

    const originIdStr = String(originLocation._id || originLocation.id || originLocation.name);
    const destIdStr = String(destLocation._id || destLocation.id || destLocation.name);

    if (originIdStr === destIdStr) {
      const err = new Error('Origin and destination cannot be the same location.');
      err.statusCode = 400;
      err.code = 'SAME_ORIGIN_DESTINATION';
      throw err;
    }

    return { originLocation, destLocation };
  }

  /**
   * 3. Constructs the immutable canonical search context for transport providers.
   *
   * @param {Object} params
   * @returns {Object} Canonical search context
   */
  buildSearchContext({
    searchRequest,
    originLocation,
    destLocation,
    departureDate,
    returnDate,
    passengers = 1,
    requestedModes = [],
    preferences = {},
    ranking,
    sortBy,
  }) {
    const depDate = departureDate instanceof Date ? departureDate : new Date(departureDate);
    const retDate = returnDate ? (returnDate instanceof Date ? returnDate : new Date(returnDate)) : null;

    const formatLoc = (loc) => {
      const coords = loc.location?.coordinates || loc.coordinates || null;
      return {
        id: loc._id ? loc._id.toString() : loc.id || null,
        name: loc.name || '',
        displayName: loc.displayName || loc.name || '',
        city: loc.city || '',
        state: loc.state || '',
        country: loc.country || 'India',
        type: loc.type || 'station',
        coordinates: coords,
        latitude: coords ? coords[1] : loc.latitude || null,
        longitude: coords ? coords[0] : loc.longitude || null,
        _doc: loc,
      };
    };

    return Object.freeze({
      searchRequest,
      origin: formatLoc(originLocation),
      destination: formatLoc(destLocation),
      departureDate: depDate,
      returnDate: retDate,
      passengers: Number(passengers) || 1,
      requestedModes: Array.isArray(requestedModes) ? [...requestedModes] : [],
      preferences: { ...(preferences || {}) },
      rankingStrategy: ranking || sortBy || preferences?.priority || 'overall',
    });
  }

  /**
   * 4. Selects transport providers applicable for the search request.
   *
   * @param {Object} searchContext
   * @param {Object} [options={}]
   * @returns {Array<Object>} List of executable provider adapters
   */
  selectProviders(searchContext, options = {}) {
    // Direct candidate sources override (e.g. for testing)
    if (Array.isArray(options.candidateSources) && options.candidateSources.length > 0) {
      return options.candidateSources;
    }
    if (Array.isArray(options.providers) && options.providers.length > 0) {
      return options.providers;
    }
    if (Array.isArray(searchContext.candidateSources) && searchContext.candidateSources.length > 0) {
      return searchContext.candidateSources;
    }

    const { requestedModes } = searchContext;
    let selected = [];

    if (typeof this.providerRegistry.getProviders === 'function') {
      selected = this.providerRegistry.getProviders({ requestedModes });
    } else if (typeof this.providerRegistry.getAllProviders === 'function') {
      selected = this.providerRegistry.getAllProviders();
    } else if (typeof this.providerRegistry.getAll === 'function') {
      selected = this.providerRegistry.getAll();
    }

    // In development or test environments, include the development candidate source if available
    // and not explicitly disabled via options.includeDevelopment = false
    const shouldIncludeDev =
      options.includeDevelopment === true ||
      (options.includeDevelopment !== false && (config.isTest || config.isDevelopment));

    if (shouldIncludeDev && this.developmentProvider) {
      const devAlreadyPresent = selected.some(
        (p) => p === this.developmentProvider || p.code === 'DEV_MOCK' || p.source === 'development'
      );
      if (!devAlreadyPresent) {
        // Only include if requestedModes is empty or includes development/rail
        if (
          !requestedModes ||
          requestedModes.length === 0 ||
          requestedModes.includes('rail') ||
          requestedModes.includes('development')
        ) {
          selected = [...selected, this.developmentProvider];
        }
      }
    }

    return selected;
  }

  /**
   * 5. Concurrently queries independent providers with timeout and fault isolation.
   *
   * @param {Array<Object>} providers
   * @param {Object} searchContext
   * @param {Object} [options={}]
   * @returns {Promise<Object>} Execution summary with all envelopes and candidates
   */
  async executeProviders(providers, searchContext, options = {}) {
    if (!Array.isArray(providers) || providers.length === 0) {
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

    const effectiveTimeoutMs = options.timeoutMs || this.timeoutMs;

    const queryPromises = providers.map(async (provider) => {
      const providerStart = Date.now();
      const providerName = provider.mode || provider.name || provider.code || 'unknown';

      try {
        let timer;
        const timeoutPromise = new Promise((_, reject) => {
          timer = setTimeout(() => {
            const err = new Error(`Provider "${providerName}" timed out after ${effectiveTimeoutMs}ms`);
            err.code = 'PROVIDER_TIMEOUT';
            err.statusCode = 504;
            reject(err);
          }, effectiveTimeoutMs);
        });

        // Pass immutable search context to provider adapter
        const searchPromise = Promise.resolve().then(() =>
          provider.search(
            {
              searchRequest: searchContext.searchRequest,
              origin: searchContext.origin._doc || searchContext.origin,
              destination: searchContext.destination._doc || searchContext.destination,
              departureDate: searchContext.departureDate,
              returnDate: searchContext.returnDate,
              passengers: searchContext.passengers,
              requestedModes: searchContext.requestedModes,
              preferences: searchContext.preferences,
            },
            options
          )
        );

        const result = await Promise.race([searchPromise, timeoutPromise]).finally(() => {
          clearTimeout(timer);
        });

        const durationMs = Date.now() - providerStart;

        // Envelope shape check
        if (result && typeof result === 'object' && 'status' in result) {
          return {
            ...result,
            provider: result.provider || providerName,
            providerCode: result.providerCode || provider.code || providerName.toUpperCase(),
            durationMs,
          };
        }

        // Raw candidates array fallback
        const candidates = Array.isArray(result)
          ? result
          : Array.isArray(result?.candidates)
            ? result.candidates
            : [];

        return {
          provider: providerName,
          providerCode: provider.code || providerName.toUpperCase(),
          status: candidates.length > 0 ? 'success' : 'empty',
          candidates,
          rawData: result?.rawData || result || {},
          metadata: { durationMs },
          durationMs,
          error: null,
        };
      } catch (err) {
        const durationMs = Date.now() - providerStart;
        logger.warn(`[JourneyOrchestrator] Provider "${providerName}" search failed: ${err.message}`);

        return {
          provider: providerName,
          providerCode: provider.code || providerName.toUpperCase(),
          status: 'failed',
          candidates: [],
          rawData: null,
          metadata: { durationMs },
          durationMs,
          error: {
            code: err.code || 'PROVIDER_ERROR',
            message: err.message,
            statusCode: err.statusCode || 500,
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
            providerCode: 'UNKNOWN',
            status: 'failed',
            candidates: [],
            rawData: null,
            metadata: {},
            error: {
              code: 'PROVIDER_FATAL',
              message: item.reason?.message || 'Provider execution rejected unexpectedly',
            },
          }
    );

    let successfulCount = 0;
    let emptyCount = 0;
    let failedCount = 0;
    let unavailableCount = 0;
    const allCandidates = [];

    for (const env of envelopes) {
      switch (env.status) {
        case 'success':
          successfulCount++;
          if (Array.isArray(env.candidates)) {
            allCandidates.push(...env.candidates);
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

  /**
   * 6. Normalizes provider candidate envelopes into canonical candidates with fault isolation.
   *
   * @param {Array<Object>} envelopes
   * @param {Object} searchContext
   * @returns {Array<Object>} Successfully normalized canonical candidates
   */
  normalizeResults(envelopes, searchContext) {
    if (!Array.isArray(envelopes) || envelopes.length === 0) {
      return [];
    }

    const normContext = {
      origin: searchContext.origin?.id || searchContext.origin?._doc?._id,
      destination: searchContext.destination?.id || searchContext.destination?._doc?._id,
      departureDate: searchContext.departureDate,
    };

    const normalizedCandidates = [];

    for (const envelope of envelopes) {
      // Skip empty or failed envelopes
      if (!envelope || envelope.status === 'empty' || envelope.status === 'failed' || envelope.status === 'unavailable') {
        continue;
      }

      try {
        const results = this.normalizer.normalize(envelope, normContext, { validate: true });
        if (Array.isArray(results)) {
          normalizedCandidates.push(...results);
        } else if (results) {
          normalizedCandidates.push(results);
        }
      } catch (err) {
        logger.warn(
          `[JourneyOrchestrator] Error normalizing envelope for provider ${envelope.provider}: ${err.message}`
        );
      }
    }

    return normalizedCandidates;
  }

  /**
   * 7. Deduplicates normalized canonical journeys using the dedicated Deduplication Service.
   *
   * @param {Array<Object>} journeys
   * @param {Object} searchContext
   * @returns {{ uniqueJourneys: Array<Object>, deduplicationReport: Object }}
   */
  deduplicate(journeys, searchContext) {
    if (typeof this.deduplicator.deduplicateWithReport === 'function') {
      const result = this.deduplicator.deduplicateWithReport(journeys, searchContext);
      return {
        uniqueJourneys: result.journeys,
        deduplicationReport: result.report,
      };
    }

    const unique = this.deduplicator.deduplicate(journeys, searchContext);
    return {
      uniqueJourneys: unique,
      deduplicationReport: {
        totalBefore: journeys.length,
        totalAfter: unique.length,
        duplicatesRemoved: journeys.length - unique.length,
      },
    };
  }

  /**
   * 8. Atomically persists unique canonical Journeys, sequential JourneyLegs, and SearchResults.
   *
   * @param {Array<Object>} candidates
   * @param {Object} searchContext
   * @returns {Promise<Array<Object>>} Formatted populated journeys
   */
  async persistJourneys(candidates, searchContext) {
    const { searchRequest } = searchContext;
    const persistedJourneys = [];

    for (const candidate of candidates) {
      let createdJourney = null;

      try {
        // A. Create normalized Journey
        createdJourney = await this.journeyService.create({
          origin: candidate.origin,
          destination: candidate.destination,
          departureTime: candidate.departureTime,
          arrivalTime: candidate.arrivalTime,
          duration: candidate.duration,
          totalDistance: candidate.totalDistance || 0,
          totalPrice: candidate.totalPrice,
          currency: candidate.currency || 'INR',
          numberOfTransfers: candidate.numberOfTransfers || 0,
          transportModes: candidate.transportModes || [],
          status: candidate.status || 'scheduled',
          metadata: candidate.metadata || {},
        });

        // B. Create sequential JourneyLegs with atomicity rollback
        const legs = Array.isArray(candidate.legs) ? candidate.legs : [];
        try {
          for (const legData of legs) {
            await this.journeyLegService.create({
              journey: createdJourney._id,
              sequence: legData.sequence,
              origin: legData.origin,
              destination: legData.destination,
              mode: legData.mode,
              provider: legData.provider || null,
              departureTime: legData.departureTime,
              arrivalTime: legData.arrivalTime,
              duration: legData.duration,
              distance: legData.distance || 0,
              price: legData.price || 0,
              currency: legData.currency || 'INR',
              vehicle: legData.vehicle || {},
              service: legData.service || {},
              booking: legData.booking || {},
              metadata: legData.metadata || {},
            });
          }
        } catch (legErr) {
          logger.error(
            `[JourneyOrchestrator] Leg creation failed for journey ${createdJourney._id}. Rolling back: ${legErr.message}`
          );
          await this.journeyService.delete(createdJourney._id).catch(() => {});
          throw legErr;
        }

        // C. Associate SearchResult with SearchRequest
        if (searchRequest && searchRequest._id) {
          await this.searchResultService.create({
            searchRequest: searchRequest._id,
            journey: createdJourney._id,
            provider: legs[0]?.provider || null,
            source: candidate.source || candidate.metadata?.source || 'orchestrator',
            status: 'active',
            rawData: candidate.rawData || { isMock: false },
            normalizedData: {
              duration: candidate.duration,
              totalPrice: candidate.totalPrice,
              transportModes: candidate.transportModes,
              numberOfTransfers: candidate.numberOfTransfers,
            },
          });
        }

        // D. Populate journey and sequential legs for stable output
        const populatedJourney = await this.journeyService.findById(createdJourney._id);
        const populatedLegs = await JourneyLeg.find({ journey: createdJourney._id })
          .sort({ sequence: 1 })
          .populate('origin')
          .populate('destination')
          .populate('provider');

        persistedJourneys.push(this.formatJourneyResponse(populatedJourney, populatedLegs));
      } catch (err) {
        logger.error(
          `[JourneyOrchestrator] Error persisting canonical candidate: ${err.message}`
        );
      }
    }

    return persistedJourneys;
  }

  /**
   * Formats a populated Mongoose journey and its legs into the canonical response shape.
   *
   * @param {Object} journeyDoc
   * @param {Array<Object>} legs
   * @returns {Object}
   */
  formatJourneyResponse(journeyDoc, legs = []) {
    const raw = typeof journeyDoc.toJSON === 'function' ? journeyDoc.toJSON() : journeyDoc;

    const formatLocation = (loc) => {
      if (!loc) return null;
      return {
        id: loc._id ? loc._id.toString() : loc.id || null,
        name: loc.name || '',
        displayName: loc.displayName || loc.name || '',
        city: loc.city || '',
        state: loc.state || '',
        type: loc.type || 'station',
        coordinates: loc.location?.coordinates || loc.coordinates || null,
      };
    };

    return {
      id: raw._id ? raw._id.toString() : raw.id,
      origin: formatLocation(raw.origin),
      destination: formatLocation(raw.destination),
      departureTime: raw.departureTime ? new Date(raw.departureTime).toISOString() : null,
      arrivalTime: raw.arrivalTime ? new Date(raw.arrivalTime).toISOString() : null,
      duration: raw.duration,
      totalDistance: raw.totalDistance || 0,
      totalPrice: raw.totalPrice,
      currency: raw.currency || 'INR',
      numberOfTransfers: raw.numberOfTransfers || 0,
      transportModes: raw.transportModes || [],
      status: raw.status || 'scheduled',
      legs: legs.map((leg) => {
        const legRaw = typeof leg.toJSON === 'function' ? leg.toJSON() : leg;
        return {
          id: legRaw._id ? legRaw._id.toString() : legRaw.id,
          sequence: legRaw.sequence,
          origin: formatLocation(legRaw.origin),
          destination: formatLocation(legRaw.destination),
          mode: legRaw.mode,
          provider: legRaw.provider
            ? {
                id: legRaw.provider._id?.toString() || legRaw.provider.id,
                name: legRaw.provider.name,
                code: legRaw.provider.code,
              }
            : null,
          departureTime: legRaw.departureTime ? new Date(legRaw.departureTime).toISOString() : null,
          arrivalTime: legRaw.arrivalTime ? new Date(legRaw.arrivalTime).toISOString() : null,
          duration: legRaw.duration,
          distance: legRaw.distance || 0,
          price: legRaw.price || 0,
          currency: legRaw.currency || 'INR',
          vehicle: legRaw.vehicle || {},
          service: {
            ...(legRaw.service || {}),
            number: legRaw.service?.number || legRaw.vehicle?.identifier || '',
          },
          booking: legRaw.booking || {},
        };
      }),
      metadata: raw.metadata || {},
      createdAt: raw.createdAt,
    };
  }

  /**
   * 9. Coordinates ranking canonical journeys using the Phase 7 Ranking Engine.
   *
   * @param {Array<Object>} journeys
   * @param {string} strategyId
   * @param {Object} searchContext
   * @returns {Array<Object>} Ranked journeys
   */
  rank(journeys, strategyId, searchContext) {
    if (!journeys || journeys.length === 0) return [];
    return this.rankingEngine.rank(journeys, strategyId, {
      preferences: searchContext.preferences,
      passengers: searchContext.passengers,
    });
  }

  /**
   * Master Journey Orchestration Pipeline
   *
   * Executes the complete end-to-end journey discovery workflow:
   * 1. Request validation
   * 2. Location resolution (Phase 3)
   * 3. Canonical search context creation
   * 4. SearchRequest persistence (pending -> processing)
   * 5. Provider selection (Phase 5)
   * 6. Concurrent provider execution with fault isolation
   * 7. Provider failure handling
   * 8. Normalization (Phase 6)
   * 9. Deduplication (Phase 8)
   * 10. Journey & Leg persistence
   * 11. Ranking (Phase 7)
   * 12. SearchRequest status update -> completed
   * 13. Final response assembly
   *
   * @param {Object} params - User search request payload
   * @param {Object} [options={}] - Execution options
   * @returns {Promise<Object>} Final canonical search response
   */
  async orchestrateSearch(params, options = {}) {
    const startTime = Date.now();

    // 1. Validate incoming request
    this.validateRequest(params);

    const {
      origin: rawOrigin,
      destination: rawDestination,
      departureDate,
      returnDate,
      passengers = 1,
      requestedModes = [],
      preferences = {},
      ranking,
      sortBy,
      userId = null,
    } = params;

    // 2. Resolve origin and destination via Phase 3 Location Resolution
    const { originLocation, destLocation } = await this.resolveLocations(rawOrigin, rawDestination);

    // Map user ranking/priority preference to SearchRequest priority enum
    const rawPriority = preferences.priority || ranking || sortBy || 'balanced';
    let schemaPriority = 'balanced';
    const cleanP = String(rawPriority).toLowerCase();
    if (cleanP === 'fastest') schemaPriority = 'fastest';
    else if (cleanP === 'cheapest') schemaPriority = 'cheapest';
    else if (cleanP === 'fewest_transfers' || cleanP === 'fewesttransfers') schemaPriority = 'fewestTransfers';
    else if (cleanP === 'most_convenient' || cleanP === 'mostconvenient') schemaPriority = 'mostConvenient';
    else schemaPriority = 'balanced';

    // 3. Create SearchRequest record in 'pending' status
    let searchRequest = null;
    try {
      searchRequest = await this.searchRequestService.create({
        user: userId || null,
        origin: originLocation._id || originLocation,
        destination: destLocation._id || destLocation,
        departureDate: departureDate instanceof Date ? departureDate : new Date(departureDate),
        returnDate: returnDate ? (returnDate instanceof Date ? returnDate : new Date(returnDate)) : null,
        passengers: Number(passengers) || 1,
        preferences: {
          priority: schemaPriority,
          maxBudget: preferences.maxBudget !== undefined ? Number(preferences.maxBudget) : null,
          maxTransfers: preferences.maxTransfers !== undefined ? Number(preferences.maxTransfers) : null,
        },
        requestedModes: Array.isArray(requestedModes) ? requestedModes : [],
        status: 'pending',
      });
    } catch (createErr) {
      logger.error('[JourneyOrchestrator] Error creating SearchRequest:', createErr);
      throw createErr;
    }

    // 4. Advance SearchRequest status to 'processing'
    try {
      await this.searchRequestService.updateStatus(searchRequest._id, 'processing');
      searchRequest.status = 'processing';
    } catch (statusErr) {
      logger.warn(`[JourneyOrchestrator] Could not update status to processing: ${statusErr.message}`);
    }

    // 5. Construct canonical search context
    const searchContext = this.buildSearchContext({
      searchRequest,
      originLocation,
      destLocation,
      departureDate,
      returnDate,
      passengers,
      requestedModes,
      preferences,
      ranking,
      sortBy,
    });

    try {
      // 6. Select providers
      const providers = this.selectProviders(searchContext, options);

      // 7. Concurrently execute providers with fault isolation
      const executionSummary = await this.executeProviders(providers, searchContext, options);

      // 8. Handle complete provider failure state (Section 16 & 62)
      if (
        executionSummary.totalCount > 0 &&
        executionSummary.failedCount === executionSummary.totalCount
      ) {
        const err = new Error(
          'Journey search could not be completed. All queried transport providers failed to respond.'
        );
        err.statusCode = 502;
        err.code = 'ALL_PROVIDERS_FAILED';
        err.details = {
          providersFailed: executionSummary.failedCount,
          totalProviders: executionSummary.totalCount,
        };
        throw err;
      }

      // 9. Normalize candidates from successful providers (Phase 6)
      const normalizedCandidates = this.normalizeResults(executionSummary.envelopes, searchContext);

      // 10. Deduplicate canonical journeys (Phase 8)
      const { uniqueJourneys, deduplicationReport } = this.deduplicate(normalizedCandidates, searchContext);

      // 11. Persist unique canonical journeys, legs, and search results
      const persistedJourneys = await this.persistJourneys(uniqueJourneys, searchContext);

      // 11.5 Apply deterministic search constraints (Budget & Time Window - Phase 11)
      let candidateJourneys = persistedJourneys;
      if (
        preferences.maxBudget !== undefined &&
        preferences.maxBudget !== null &&
        Number(preferences.maxBudget) > 0
      ) {
        const budgetLimit = Number(preferences.maxBudget);
        candidateJourneys = candidateJourneys.filter((j) => Number(j.totalPrice) <= budgetLimit);
      }
      if (preferences.departureWindow) {
        candidateJourneys = candidateJourneys.filter((j) =>
          matchesTimeWindow(j.departureTime, preferences.departureWindow)
        );
      }

      // 12. Rank canonical journeys (Phase 7)
      const rankingStrategyId = ranking || sortBy || preferences.priority || 'overall';
      const rankedJourneys = this.rank(candidateJourneys, rankingStrategyId, searchContext);

      // 13. Advance SearchRequest status to 'completed'
      await this.searchRequestService.updateStatus(searchRequest._id, 'completed');
      searchRequest.status = 'completed';

      // 14. Resolve ranking strategy display metadata
      const strategyInstance = this.rankingEngine?.registry?.get(rankingStrategyId);
      const rankingDescriptor = {
        id: strategyInstance ? strategyInstance.id : rankingStrategyId,
        name: strategyInstance ? strategyInstance.name : 'Best Overall',
      };

      // 15. Assemble final response
      const totalDurationMs = Date.now() - startTime;
      const finalResult = this.resultAssembler.assemble({
        searchRequest,
        origin: originLocation,
        destination: destLocation,
        journeys: rankedJourneys,
        rankingStrategy: rankingDescriptor,
        providerStatuses: executionSummary.envelopes,
        deduplicationReport,
        durationMs: totalDurationMs,
      });

      finalResult.searchRequest = searchRequest;
      return finalResult;
    } catch (pipelineErr) {
      logger.error('[JourneyOrchestrator] Orchestration pipeline failed:', pipelineErr);

      if (searchRequest && searchRequest._id) {
        try {
          await this.searchRequestService.updateStatus(searchRequest._id, 'failed');
          searchRequest.status = 'failed';
        } catch (failStatusErr) {
          logger.error(`[JourneyOrchestrator] Failed to mark SearchRequest failed: ${failStatusErr.message}`);
        }
      }

      throw pipelineErr;
    }
  }
}

export const journeyOrchestrator = new JourneyOrchestrator();
export default journeyOrchestrator;
