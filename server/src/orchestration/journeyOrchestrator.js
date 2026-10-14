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
import multiModalEngine from '../multimodal/index.js';
import directJourneyService, { DIRECT_SEARCH_STATUS } from '../services/rail/directJourney.service.js';
import journeyRecoveryService from '../services/rail/journeyRecovery.service.js';
import RequestBudgetTracker from '../services/rail/requestBudget.js';
import { AVAILABILITY_STATUS } from '../services/rail/availabilityNorm.js';
import { matchesTimeWindow } from '../services/naturalLanguage/timeWindowResolver.js';
import { isValidCalendarDate, isPastDate } from '../middleware/validate.middleware.js';

async function ensureMongoLocation(loc) {
  if (!loc) return null;
  const locId = loc._id || loc.id;
  if (locId && mongoose.Types.ObjectId.isValid(locId)) {
    const existing = await Location.findById(locId);
    if (existing) return existing;
  }
  const name = loc.name || loc.displayName || 'Location';
  const stnCode = loc.stationCode || loc.metadata?.stationCode;
  let existing = await Location.findOne({
    $or: [
      { name: new RegExp(`^${name}$`, 'i') },
      ...(stnCode ? [{ aliases: stnCode }] : []),
    ],
  });
  if (existing) return existing;

  try {
    const created = await Location.create({
      name,
      displayName: loc.displayName || name,
      type: loc.type || 'railway_station',
      city: loc.city || name,
      state: loc.state || 'India',
      country: 'India',
      location: loc.location || {
        type: 'Point',
        coordinates: loc.coordinates || [77.2, 28.6],
      },
      aliases: stnCode ? [stnCode, name] : [name],
      metadata: {
        stationCode: stnCode,
        provider: 'railway_registry',
      },
    });
    return created;
  } catch {
    return loc;
  }
}

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

  // Case 1: Object
  if (typeof input === 'object' && input !== null) {
    if (input._id && mongoose.Types.ObjectId.isValid(input._id)) {
      const doc = await Location.findById(input._id);
      if (doc) return doc;
      return input;
    }
    return await ensureMongoLocation(input);
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
    return await ensureMongoLocation(resolved);
  }

  const candidates = await locationService.search(clean, { limit: 1 });
  if (candidates && candidates.length > 0) {
    return await ensureMongoLocation(candidates[0]);
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
    this.multiModalEngine = dependencies.multiModalEngine || multiModalEngine;
    this.directJourneyService = dependencies.directJourneyService || directJourneyService;
    this.journeyRecoveryService = dependencies.journeyRecoveryService || journeyRecoveryService;
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

    // Immediate check if origin and destination strings/names are identical
    const extractLocationStr = (loc) => {
      if (typeof loc === 'string') return loc.trim();
      if (loc && typeof loc === 'object') {
        return (loc.name || loc.city || loc._id || loc.id || '').toString().trim();
      }
      return '';
    };
    const originStr = extractLocationStr(origin);
    const destStr = extractLocationStr(destination);
    if (originStr && destStr && originStr.toLowerCase() === destStr.toLowerCase()) {
      const err = new Error('Origin and destination cannot be the same location.');
      err.statusCode = 400;
      err.code = 'SAME_ORIGIN_DESTINATION';
      throw err;
    }

    if (!departureDate) {
      const err = new Error('Departure date is required.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (typeof departureDate === 'string') {
      if (!isValidCalendarDate(departureDate)) {
        const err = new Error('Departure date must be a valid date in YYYY-MM-DD format.');
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }
      if (!config.isTest && isPastDate(departureDate)) {
        const err = new Error('Departure date cannot be in the past.');
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }
    } else {
      const depDate = departureDate instanceof Date ? departureDate : new Date(departureDate);
      if (isNaN(depDate.getTime())) {
        const err = new Error('Invalid departure date provided.');
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }
    }

    if (returnDate) {
      if (typeof returnDate === 'string') {
        if (!isValidCalendarDate(returnDate)) {
          const err = new Error('Return date must be a valid date in YYYY-MM-DD format.');
          err.statusCode = 400;
          err.code = 'VALIDATION_ERROR';
          throw err;
        }
        if (isPastDate(returnDate)) {
          const err = new Error('Return date cannot be in the past.');
          err.statusCode = 400;
          err.code = 'VALIDATION_ERROR';
          throw err;
        }
      } else {
        const retDate = returnDate instanceof Date ? returnDate : new Date(returnDate);
        if (isNaN(retDate.getTime())) {
          const err = new Error('Invalid return date provided.');
          err.statusCode = 400;
          err.code = 'VALIDATION_ERROR';
          throw err;
        }
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
    // Railway-only MVP enforcement: active orchestration queries only railway providers when railwayOnly is true
    const isRailwayOnly = options.railwayOnly === true;
    const requestedModes = isRailwayOnly ? ['rail'] : searchContext.requestedModes;
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
    // When live rail provider is configured, prioritize live providers and omit mock development provider
    const hasLiveRail = Boolean(config.providers.rail.apiKey && config.providers.rail.apiUrl);
    const shouldIncludeDev =
      options.includeDevelopment === true ||
      (options.includeDevelopment !== false && (config.isTest || (config.isDevelopment && !hasLiveRail)));

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

    // If dedicated railway direct & recovery pipeline will run, filter out redundant generic rail provider queries
    const shouldHandleRailViaPipeline =
      !options.skipRailRecovery &&
      (!config.isTest || options.enableRailwayRecovery === true);

    if (shouldHandleRailViaPipeline) {
      selected = selected.filter((p) => {
        const mode = String(p?.mode || '').toLowerCase();
        return mode !== 'rail' && p?.code !== 'IRCTC';
      });
    }

    return selected;
  }

  /**
   * Validates that a candidate journey conforms strictly to the Indian Railways domain model.
   * Rejects road, bus, flight, OSRM candidates, and unknown transport modes at the backend validation boundary.
   *
   * @param {Object} candidate
   * @returns {boolean}
   */
  validateRailwayCandidate(candidate) {
    if (!candidate || typeof candidate !== 'object') return false;

    // Reject missing, unknown, or non-rail transport modes
    const modes = Array.isArray(candidate.transportModes) ? candidate.transportModes : [];
    if (modes.length === 0) return false;
    const hasNonRailMode = modes.some((m) => String(m).toLowerCase() !== 'rail');
    if (hasNonRailMode) return false;

    // Reject missing legs or non-rail legs
    const legs = Array.isArray(candidate.legs) ? candidate.legs : [];
    if (legs.length === 0) return false;
    const hasNonRailLeg = legs.some((leg) => {
      const mode = String(leg?.mode || '').toLowerCase();
      return mode !== 'rail';
    });
    if (hasNonRailLeg) return false;

    // Reject road/driving/OSRM/bus/flight sources or providers
    const source = String(candidate.source || candidate.metadata?.source || '').toLowerCase();
    const providerCode = String(candidate.metadata?.provider || candidate.provider || candidate.providerCode || '').toLowerCase();
    const vehicleType = String(candidate.legs?.[0]?.vehicle?.type || '').toLowerCase();
    if (
      ['osrm', 'road', 'bus', 'flight', 'car', 'cab', 'driving'].some(
        (s) => source.includes(s) || providerCode.includes(s) || vehicleType.includes(s)
      )
    ) {
      return false;
    }

    return true;
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
        const journeyOriginId = candidate.origin?._id || candidate.origin?.id || candidate.origin;
        const journeyDestId = candidate.destination?._id || candidate.destination?.id || candidate.destination;

        createdJourney = await this.journeyService.create({
          origin: journeyOriginId,
          destination: journeyDestId,
          departureTime: candidate.departureTime,
          arrivalTime: candidate.arrivalTime,
          duration: candidate.duration,
          totalDistance: candidate.totalDistance || 0,
          totalPrice: candidate.totalPrice,
          currency: candidate.currency || 'INR',
          numberOfTransfers: candidate.numberOfTransfers || 0,
          transportModes: candidate.transportModes || [],
          status: candidate.status || 'scheduled',
          availabilityStatus: candidate.availabilityStatus || candidate.metadata?.availabilityStatus || null,
          isBookable: candidate.isBookable ?? false,
          metadata: candidate.metadata || {},
        });

        // B. Create sequential JourneyLegs with atomicity rollback
        const legs = Array.isArray(candidate.legs) ? candidate.legs : [];
        try {
          for (const legData of legs) {
            let legOriginId = legData.origin?._id || legData.origin?.id || legData.origin;
            let legDestId = legData.destination?._id || legData.destination?.id || legData.destination;

            if (!mongoose.Types.ObjectId.isValid(legOriginId)) {
              legOriginId = createdJourney.origin;
            }
            if (!mongoose.Types.ObjectId.isValid(legDestId)) {
              legDestId = createdJourney.destination;
            }

            await this.journeyLegService.create({
              journey: createdJourney._id,
              sequence: legData.sequence,
              origin: legOriginId,
              destination: legDestId,
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
      availabilityStatus: raw.availabilityStatus || raw.metadata?.availabilityStatus || null,
      isBookable: raw.isBookable ?? (raw.availabilityStatus === 'AVAILABILITY_VERIFIED' || raw.availabilityStatus === 'RAC_AVAILABLE'),
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
        executionSummary.successfulCount === 0 &&
        executionSummary.emptyCount === 0
      ) {
        // Detect if provider failure was caused by rate limiting
        const rateLimitedEnvelope = executionSummary.envelopes.find(
          (e) =>
            e.error?.code === 'PROVIDER_RATE_LIMITED' ||
            e.error?.code === 'RATE_LIMITED' ||
            e.error?.statusCode === 429 ||
            /rate limit|quota exceeded|too many requests|429/i.test(e.error?.message || '')
        );

        if (rateLimitedEnvelope) {
          const isMonthly = Boolean(
            rateLimitedEnvelope.error?.details?.isMonthlyQuota ||
            rateLimitedEnvelope.error?.code === 'PROVIDER_MONTHLY_QUOTA_EXHAUSTED' ||
            /monthly quota/i.test(rateLimitedEnvelope.error?.message || '')
          );
          const err = new Error(
            'Railway search is temporarily rate-limited. Please try again shortly.'
          );
          err.statusCode = 429;
          err.code = 'PROVIDER_RATE_LIMITED';
          err.details = {
            provider: rateLimitedEnvelope.provider,
            isRateLimited: true,
            isMonthlyQuota: isMonthly,
            subCode: isMonthly ? 'MONTHLY_QUOTA_EXHAUSTED' : 'RATE_LIMITED',
            quotaNotice: isMonthly
              ? 'Upstream provider (RailRadar) monthly quota has reached its 100 requests limit.'
              : null,
            originalError: rateLimitedEnvelope.error?.message,
          };
          throw err;
        }

        const isAllUnavailable =
          executionSummary.unavailableCount > 0 &&
          executionSummary.unavailableCount === executionSummary.totalCount;
        const err = new Error(
          isAllUnavailable
            ? 'Journey search could not be completed. All queried transport providers are currently unavailable.'
            : 'Journey search could not be completed. All queried transport providers failed to respond.'
        );
        err.statusCode = isAllUnavailable ? 503 : 502;
        err.code = isAllUnavailable ? 'PROVIDER_UNAVAILABLE' : 'ALL_PROVIDERS_FAILED';
        err.details = {
          providersFailed: executionSummary.failedCount,
          providersUnavailable: executionSummary.unavailableCount,
          totalProviders: executionSummary.totalCount,
        };
        throw err;
      }

      // 9. Normalize candidates from successful providers (Phase 6)
      const normalizedCandidates = this.normalizeResults(executionSummary.envelopes, searchContext);

      // 9.2 Production Railway Direct & Recovery Pipeline (Sections 2, 3, 4, 12)
      let railwayCandidates = [];
      let recoveryMeta = null;
      const isRailRequested =
        !requestedModes?.length ||
        requestedModes.includes('rail') ||
        requestedModes.includes('multimodal');

      const shouldRunRailPipeline =
        isRailRequested &&
        !options.skipRailRecovery &&
        (!config.isTest || options.enableRailwayRecovery === true);

      if (shouldRunRailPipeline) {
        try {
          const budgetTracker =
            options.budgetTracker ||
            new RequestBudgetTracker({
              correlationId: searchContext.searchId || searchContext.correlationId,
            });
          const searchOpts = { ...options, budgetTracker };

          const directResult = await this.directJourneyService.searchDirectTrains(
            searchContext,
            searchOpts
          );

          if (directResult.isRateLimited) {
            recoveryMeta = {
              recoveryTriggered: false,
              isRateLimited: true,
              directStatus: 'RATE_LIMITED',
              failureReason: directResult.failureReason || 'Railway search is temporarily rate-limited. Please try again shortly.',
              message: directResult.failureReason || 'Railway search is temporarily rate-limited. Please try again shortly.',
              directCount: 0,
              additionalDirectCount: 0,
              hasMoreDirect: false,
              budgetStats: budgetTracker.getSummary(),
            };
            railwayCandidates = [];
          } else if (directResult.status === DIRECT_SEARCH_STATUS.DIRECT_SEARCH_FAILED) {
            recoveryMeta = {
              recoveryTriggered: false,
              isProviderFailure: true,
              directStatus: directResult.status,
              failureReason: directResult.failureReason || 'Direct train search provider failed to respond.',
              message: directResult.failureReason || 'Direct train search provider failed to respond.',
              directCount: 0,
              additionalDirectCount: 0,
              hasMoreDirect: false,
              budgetStats: budgetTracker.getSummary(),
            };
            railwayCandidates = [];
          } else if (
            !directResult.shouldTriggerRecovery &&
            (directResult.status === DIRECT_SEARCH_STATUS.DIRECT_AVAILABLE ||
             directResult.status === DIRECT_SEARCH_STATUS.DIRECT_RAC_ONLY) &&
            directResult.directJourneys?.length > 0
          ) {
            recoveryMeta = {
              recoveryTriggered: false,
              directStatus: directResult.status,
              failureReason: null,
              directCount: directResult.directJourneys.length,
              bestDirectJourney: directResult.bestDirectJourney || directResult.directJourneys[0],
              additionalDirectCount: Math.max(0, directResult.directJourneys.length - 1),
              hasMoreDirect: directResult.directJourneys.length > 1,
              message: directResult.status === DIRECT_SEARCH_STATUS.DIRECT_RAC_ONLY
                ? 'Suitable direct train available with RAC booking.'
                : 'Suitable direct train available with verified confirmed-seat availability.',
              budgetStats: budgetTracker.getSummary(),
            };
            railwayCandidates = directResult.directJourneys;
          } else if (
            !directResult.shouldTriggerRecovery &&
            directResult.status === DIRECT_SEARCH_STATUS.TIMETABLE_ONLY &&
            (directResult.directJourneys?.length > 0 || directResult.timetableJourneys?.length > 0)
          ) {
            const trains = directResult.directJourneys?.length > 0 ? directResult.directJourneys : directResult.timetableJourneys;
            recoveryMeta = {
              recoveryTriggered: false,
              directStatus: directResult.status,
              failureReason: null,
              directCount: trains.length,
              bestDirectJourney: directResult.bestDirectJourney || trains[0],
              additionalDirectCount: Math.max(0, trains.length - 1),
              hasMoreDirect: trains.length > 1,
              message: directResult.message || 'Direct trains found from static timetable (seat availability unverified).',
              budgetStats: budgetTracker.getSummary(),
              isTimetableOnly: true,
            };
            railwayCandidates = options.confirmedOnly === true ? [] : trains;
          } else if (directResult.shouldTriggerRecovery) {
            const recoveryResult = await this.journeyRecoveryService.recoverJourneys(
              searchContext,
              searchOpts
            );

            recoveryMeta = {
              recoveryTriggered: true,
              directStatus: directResult.status,
              failureReason: directResult.failureReason,
              message: recoveryResult.recoveredJourneys?.length > 0
                ? 'No confirmed direct train seats found. Yatrai is finding alternative routes.'
                : (directResult.failureReason || 'No confirmed direct train seats found. No alternative connecting routes could be found.'),
              reason: directResult.failureReason || 'Direct trains have no confirmed seats available.',
              originHops: recoveryResult.originExpansionHops || 5,
              destinationHops: recoveryResult.destinationExpansionHops || 5,
              alternativesCount: recoveryResult.recoveredJourneys?.length || 0,
              bestAlternative: recoveryResult.bestAlternative || recoveryResult.recoveredJourneys?.[0],
              additionalAlternativesCount: Math.max(0, (recoveryResult.recoveredJourneys?.length || 0) - 1),
              hasMoreAlternatives: (recoveryResult.recoveredJourneys?.length || 0) > 1,
              budgetStats: recoveryResult.budgetStats || budgetTracker.getSummary(),
            };

            const directFallback = directResult.directJourneys?.length > 0
              ? directResult.directJourneys
              : (directResult.timetableJourneys || []);

            if (recoveryResult.recoveredJourneys?.length > 0) {
              railwayCandidates = recoveryResult.recoveredJourneys;
            } else if (directFallback.length > 0 && options.confirmedOnly !== true) {
              railwayCandidates = directFallback;
            }
          } else {
            const directFallback = directResult.directJourneys?.length > 0
              ? directResult.directJourneys
              : (directResult.timetableJourneys || []);
            recoveryMeta = {
              recoveryTriggered: false,
              directStatus: directResult.status,
              failureReason: directResult.failureReason || 'Seat availability unverified.',
              message: directResult.failureReason || 'Direct trains found but seat availability could not be verified.',
              directCount: directFallback.length,
              budgetStats: budgetTracker.getSummary(),
            };
            railwayCandidates = options.confirmedOnly === true ? [] : directFallback;
          }

          if (shouldRunRailPipeline) {
            const hasRailEnvelope = executionSummary.envelopes.some(
              (e) => e.provider === 'rail' || e.provider === 'railradar' || e.mode === 'rail'
            );
            if (!hasRailEnvelope) {
              executionSummary.envelopes.push({
                provider: 'rail',
                mode: 'rail',
                status: (directResult.status === DIRECT_SEARCH_STATUS.DIRECT_SEARCH_FAILED || recoveryMeta?.isRateLimited) && railwayCandidates.length === 0
                  ? 'failed'
                  : 'success',
                resultCount: railwayCandidates.length,
                candidates: railwayCandidates,
                error: (directResult.status === DIRECT_SEARCH_STATUS.DIRECT_SEARCH_FAILED || recoveryMeta?.isRateLimited) && railwayCandidates.length === 0
                  ? (recoveryMeta?.isRateLimited
                    ? { code: 'PROVIDER_RATE_LIMITED', message: recoveryMeta.failureReason }
                    : { code: 'PROVIDER_ERROR', message: directResult.failureReason })
                  : null,
              });
            }
          }
        } catch (railErr) {
          logger.warn(`[JourneyOrchestrator] Rail direct & recovery pipeline warning: ${railErr.message}`);
        }
      }

      // Combine railway pipeline candidates if present, else preserve normalized candidates
      let combinedBaseCandidates = railwayCandidates.length > 0
        ? railwayCandidates
        : normalizedCandidates;

      logger.info(`[DIAGNOSTIC - ORCHESTRATOR STAGE 6 (CANDIDATE COMBINATION)] railwayCandidates=${railwayCandidates.length}, normalizedCandidates=${normalizedCandidates.length}, combinedBaseCandidates=${combinedBaseCandidates.length}`);

      // In railway search MVP, strictly reject road, bus, flight, and OSRM candidates
      const isRailwaySearch = options.railwayOnly === true;
      if (isRailwaySearch) {
        combinedBaseCandidates = combinedBaseCandidates.filter((c) => this.validateRailwayCandidate(c));
        logger.info(`[DIAGNOSTIC - ORCHESTRATOR STAGE 6 (RAILWAY ONLY FILTER)] After validateRailwayCandidate: ${combinedBaseCandidates.length}`);
      }

      // 9.5 Multi-Modal Journey Discovery Engine (Phase 23)
      let candidatesToDeduplicate = combinedBaseCandidates;
      const canRunMultiModal =
        options.includeMultiModal === true &&
        !config.isTest &&
        Array.isArray(requestedModes) &&
        requestedModes.includes('multimodal');

      if (canRunMultiModal && this.multiModalEngine && typeof this.multiModalEngine.discoverJourneys === 'function') {
        try {
          candidatesToDeduplicate = await this.multiModalEngine.discoverJourneys(
            searchContext,
            combinedBaseCandidates,
            options
          );
        } catch (mmErr) {
          logger.warn(`[JourneyOrchestrator] Multi-modal engine skipped: ${mmErr.message}`);
          candidatesToDeduplicate = combinedBaseCandidates;
        }
      }

      // Enforce strict confirmed-availability invariant:
      // Every journey returned in confirmed-only search must have verified AVAILABLE status on all legs
      if (options.confirmedOnly === true) {
        const beforeConfirmedOnly = candidatesToDeduplicate.length;
        candidatesToDeduplicate = candidatesToDeduplicate.filter((j) => {
          if (j.isRecoveryJourney || j.isRecoveredAlternative) {
            return j.isConfirmedAvailable === true;
          }
          if (Array.isArray(j.legs) && j.legs.length > 0) {
            return j.legs.every(
              (l) => l.availability?.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE
            );
          }
          return j.availability?.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE;
        });
        logger.info(`[DIAGNOSTIC - ORCHESTRATOR STAGE 6 (CONFIRMED ONLY FILTER)] in=${beforeConfirmedOnly}, out=${candidatesToDeduplicate.length}`);
        if (candidatesToDeduplicate.length === 0 && beforeConfirmedOnly > 0) {
          logger.info(`[DIAGNOSTIC - DROPPED TO ZERO AT ORCHESTRATOR STAGE 6] Filtered out by options.confirmedOnly === true`);
        }
      }

      // Final validation boundary before deduplication and persistence
      if (isRailwaySearch) {
        candidatesToDeduplicate = candidatesToDeduplicate.filter((c) => this.validateRailwayCandidate(c));
      }

      // 10. Deduplicate canonical journeys (Phase 8)
      const { uniqueJourneys, deduplicationReport } = this.deduplicate(candidatesToDeduplicate, searchContext);
      logger.info(`[DIAGNOSTIC - ORCHESTRATOR STAGE 6 (DEDUPLICATION)] uniqueJourneys=${uniqueJourneys.length}`);

      // 11. Persist unique canonical journeys, legs, and search results
      const persistedJourneys = await this.persistJourneys(uniqueJourneys, searchContext);
      logger.info(`[DIAGNOSTIC - ORCHESTRATOR STAGE 6 (PERSISTENCE)] persistedJourneys=${persistedJourneys.length}`);

      // 11.5 Apply deterministic search constraints (Budget & Time Window - Phase 11)
      let candidateJourneys = persistedJourneys;
      if (isRailwaySearch) {
        candidateJourneys = candidateJourneys.filter((j) => this.validateRailwayCandidate(j));
      }

      if (options.confirmedOnly === true) {
        candidateJourneys = candidateJourneys.filter((j) => {
          if (j.isRecoveryJourney || j.isRecoveredAlternative) {
            return j.isConfirmedAvailable === true;
          }
          if (Array.isArray(j.legs) && j.legs.length > 0) {
            return j.legs.every(
              (l) => l.availability?.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE
            );
          }
          return j.availability?.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE;
        });
      }

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
        recoveryMeta,
        options,
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
