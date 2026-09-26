import logger from '../utils/logger.js';
import journeyProviderRegistry from '../providers/journey/journey.provider.js';
import { normalizeJourneyCandidate } from './journeyNormalizer.js';
import { validateJourneyCandidate } from './journeyValidator.js';
import journeyService from '../services/journeyService.js';
import journeyLegService from '../services/journeyLegService.js';
import searchResultService from '../services/searchResultService.js';
import JourneyLeg from '../models/JourneyLeg.js';

/**
 * Provider-Agnostic Core Journey Search Engine
 *
 * Coordinates querying registered candidate sources, normalizing candidates,
 * strictly validating domain rules and leg continuity, and persisting SearchResults.
 *
 * CRITICAL RULE:
 * This engine contains NO provider-specific branches (e.g. if rail/bus/flight)
 * and NO route-specific logic. All provider details are encapsulated in candidate sources.
 */
export class JourneySearchEngine {
  constructor(registry = journeyProviderRegistry) {
    this.registry = registry;
  }

  /**
   * Executes the journey discovery pipeline for a given search request context.
   *
   * @param {Object} context
   * @param {Object} context.searchRequest - Persisted SearchRequest Mongoose document
   * @param {Object} context.origin - Canonical origin Location document
   * @param {Object} context.destination - Canonical destination Location document
   * @param {Date} context.departureDate - Validated departure date
   * @param {number} [context.passengers=1]
   * @param {Array<string>} [context.requestedModes=[]]
   * @param {Object} [context.preferences={}]
   * @param {Array<Object>} [context.candidateSources] - Optional provider overrides for testing
   * @returns {Promise<Array<Object>>} Formatted journey results
   */
  async search(context) {
    const {
      searchRequest,
      origin,
      destination,
      departureDate,
      passengers = 1,
      requestedModes = [],
      preferences = {},
      candidateSources,
    } = context;

    logger.info(
      `[JourneySearchEngine] Starting journey discovery pipeline for SearchRequest: ${searchRequest?._id}`
    );

    // 1. Gather active candidate sources
    const sources =
      Array.isArray(candidateSources) && candidateSources.length > 0
        ? candidateSources
        : typeof this.registry.getProviders === 'function'
          ? this.registry.getProviders({ requestedModes })
          : this.registry.getAll();

    logger.debug(`[JourneySearchEngine] Active candidate sources: ${sources.length}`);

    // 2. Query all candidate sources in parallel with fault-isolation
    const rawCandidates = [];
    const queryPromises = sources.map(async (source) => {
      try {
        const results = await source.search({
          searchRequest,
          origin,
          destination,
          departureDate,
          passengers,
          requestedModes,
          preferences,
        });

        if (Array.isArray(results)) {
          rawCandidates.push(...results);
        } else if (results && Array.isArray(results.candidates)) {
          rawCandidates.push(...results.candidates);
        }
      } catch (err) {
        // Individual provider failure must NOT abort the overall search
        logger.warn(
          `[JourneySearchEngine] Candidate source "${source.name || source.code}" failed: ${err.message}`
        );
      }
    });

    await Promise.all(queryPromises);
    logger.debug(`[JourneySearchEngine] Total raw candidates gathered: ${rawCandidates.length}`);

    if (rawCandidates.length === 0) {
      logger.info(
        `[JourneySearchEngine] Zero candidates discovered for ${origin?.name} -> ${destination?.name}`
      );
      return [];
    }

    // 3. Normalize candidates into internal representation
    const normalizedCandidates = [];
    for (const raw of rawCandidates) {
      try {
        const normalized = normalizeJourneyCandidate(raw, {
          origin: origin?._id,
          destination: destination?._id,
        });
        normalizedCandidates.push(normalized);
      } catch (normErr) {
        logger.warn(`[JourneySearchEngine] Skipping unnormalizable candidate: ${normErr.message}`);
      }
    }

    // 4. Validate candidates against strict domain & leg continuity rules
    const validCandidates = [];
    for (const candidate of normalizedCandidates) {
      const validation = validateJourneyCandidate(candidate);
      if (!validation.valid) {
        logger.warn(
          `[JourneySearchEngine] Rejecting invalid journey candidate: ${validation.errors.join('; ')}`
        );
      } else {
        validCandidates.push(candidate);
      }
    }

    logger.debug(
      `[JourneySearchEngine] Valid candidates after strict verification: ${validCandidates.length}`
    );

    if (validCandidates.length === 0) {
      return [];
    }

    // 5. Persist Journeys, Legs, and SearchResults (Atomic per journey candidate)
    const persistedJourneys = [];

    for (const candidate of validCandidates) {
      try {
        // A. Create normalized Journey
        const journey = await journeyService.create({
          origin: candidate.origin,
          destination: candidate.destination,
          departureTime: candidate.departureTime,
          arrivalTime: candidate.arrivalTime,
          duration: candidate.duration,
          totalDistance: candidate.totalDistance,
          totalPrice: candidate.totalPrice,
          currency: candidate.currency,
          numberOfTransfers: candidate.numberOfTransfers,
          transportModes: candidate.transportModes,
          status: candidate.status,
          metadata: candidate.metadata,
        });

        // B. Create authoritative sequential JourneyLegs
        const persistedLegs = [];
        for (const legData of candidate.legs) {
          const leg = await journeyLegService.create({
            journey: journey._id,
            sequence: legData.sequence,
            origin: legData.origin,
            destination: legData.destination,
            mode: legData.mode,
            provider: legData.provider || null,
            departureTime: legData.departureTime,
            arrivalTime: legData.arrivalTime,
            duration: legData.duration,
            distance: legData.distance,
            price: legData.price,
            currency: legData.currency,
            vehicle: legData.vehicle,
            service: legData.service,
            booking: legData.booking,
            metadata: legData.metadata,
          });
          persistedLegs.push(leg);
        }

        // C. Persist SearchResult record associating SearchRequest with Journey
        if (searchRequest && searchRequest._id) {
          await searchResultService.create({
            searchRequest: searchRequest._id,
            journey: journey._id,
            provider: candidate.legs[0]?.provider || null,
            source: candidate.source || candidate.metadata?.source || 'development',
            status: 'active',
            rawData: candidate.rawData || { isMock: true },
            normalizedData: {
              duration: candidate.duration,
              totalPrice: candidate.totalPrice,
              transportModes: candidate.transportModes,
              numberOfTransfers: candidate.numberOfTransfers,
            },
          });
        }

        // D. Populate journey and legs for stable response
        const populatedJourney = await journeyService.findById(journey._id);
        const populatedLegs = await JourneyLeg.find({ journey: journey._id })
          .sort({ sequence: 1 })
          .populate('origin')
          .populate('destination')
          .populate('provider');

        persistedJourneys.push(this.formatJourneyResponse(populatedJourney, populatedLegs));
      } catch (persistenceError) {
        logger.error(
          `[JourneySearchEngine] Error persisting candidate journey: ${persistenceError.message}`
        );
      }
    }

    logger.info(
      `[JourneySearchEngine] Journey search pipeline completed with ${persistedJourneys.length} journey(s)`
    );

    return persistedJourneys;
  }

  /**
   * Formats a populated Mongoose journey and its legs into the stable public API contract.
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
        id: loc._id ? loc._id.toString() : loc.id,
        name: loc.name,
        displayName: loc.displayName || loc.name,
        city: loc.city,
        state: loc.state,
        type: loc.type,
        coordinates: loc.location?.coordinates || null,
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
          service: legRaw.service || {},
          booking: legRaw.booking || {},
        };
      }),
      metadata: raw.metadata || {},
      createdAt: raw.createdAt,
    };
  }
}

export const journeySearchEngine = new JourneySearchEngine();
export default journeySearchEngine;
