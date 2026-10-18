import journeyOrchestrator from '../orchestration/journeyOrchestrator.js';
import naturalLanguageParser from '../services/naturalLanguage/naturalLanguageParser.js';
import locationService from '../services/locationService.js';
import recentSearchService from '../services/recentSearchService.js';
import journeyRecoveryService from '../services/rail/journeyRecovery.service.js';
import availabilityService from '../services/rail/availability.service.js';
import fareService from '../services/rail/fare.service.js';
import journeyService from '../services/journeyService.js';
import JourneyLeg from '../models/JourneyLeg.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

/**
 * Journey Search Controller
 *
 * Thin HTTP controller for journey discovery.
 * Parses and validates HTTP request input and delegates discovery
 * completely to the Journey Orchestrator.
 */
export const journeyController = {
  /**
   * POST /api/journeys/search
   * Coordinates validating input, resolving locations, creating search requests,
   * executing transport providers, normalizing, deduplicating, ranking, and returning
   * canonical journey recommendations.
   */
  async search(req, res, next) {
    try {
      const {
        origin,
        destination,
        departureDate,
        returnDate,
        passengers,
        requestedModes,
        preferences,
        ranking,
        sortBy,
      } = req.body || {};

      const userId = req.user?.id || null;

      // Automatically record search for authenticated users
      if (userId && origin && destination && departureDate) {
        recentSearchService
          .recordSearch({
            userId,
            origin: typeof origin === 'string' ? origin : origin?.name,
            destination: typeof destination === 'string' ? destination : destination?.name,
            departureDate,
            ranking: ranking || sortBy || 'overall',
            passengers,
            transportTypes: requestedModes,
          })
          .catch(() => {});
      }

      const result = await journeyOrchestrator.orchestrateSearch(
        {
          origin,
          destination,
          departureDate,
          returnDate,
          passengers,
          requestedModes: Array.isArray(requestedModes) && requestedModes.length > 0 ? requestedModes : ['rail'],
          preferences,
          ranking,
          sortBy,
          userId,
          exploreAlternatives: Boolean(req.body?.exploreAlternatives),
        },
        {
          railwayOnly: true,
          exploreAlternatives: Boolean(req.body?.exploreAlternatives),
        }
      );

      const response = successResponse('Journeys retrieved successfully', result);

      // Expose journeys array at top-level to support the canonical contract
      response.journeys = result.journeys;

      return res.status(200).json(response);
    } catch (error) {
      return next(error);
    }
  },

  /**
   * POST /api/journeys/search/natural
   * Natural-Language Journey Discovery Endpoint (Phase 11).
   * 1. Interprets user request into structured SearchRequest using the AI parser service.
   * 2. Handles clarification states deterministically if required fields are missing.
   * 3. Executes discovery via the canonical Journey Orchestrator without LLM provider execution.
   */
  async searchNatural(req, res, next) {
    try {
      const { query, referenceDate, timezone } = req.body || {};

      if (!query || typeof query !== 'string' || !query.trim()) {
        const err = new Error('Query string is required for natural language search.');
        err.statusCode = 400;
        err.code = 'INVALID_QUERY';
        throw err;
      }

      // Step 1: Interpret natural language query
      const parseResult = await naturalLanguageParser.parse(query, {
        currentDate: referenceDate,
        timezone,
      });

      // Step 2: Handle clarification or invalid intent
      if (parseResult.status === 'needs_clarification') {
        return res.status(200).json({
          success: false,
          status: 'needs_clarification',
          message: parseResult.message,
          missingFields: parseResult.missingFields,
          parsedRequest: parseResult.structuredRequest,
        });
      }

      if (parseResult.status === 'invalid') {
        return res.status(400).json({
          success: false,
          status: 'invalid',
          message: parseResult.message,
          parsedRequest: parseResult.structuredRequest,
        });
      }

      // Step 3: Execute deterministic search via the Journey Orchestrator
      const userId = req.user?.id || null;
      const structured = parseResult.structuredRequest;

      // Automatically record search for authenticated users
      if (userId && structured?.origin && structured?.destination && structured?.departureDate) {
        recentSearchService
          .recordSearch({
            userId,
            origin: structured.origin,
            destination: structured.destination,
            departureDate: structured.departureDate,
            ranking: structured.ranking || 'overall',
            departureWindow: structured.departureWindow,
            maxBudget: structured.maxBudget,
            transportTypes: structured.transportTypes,
            passengers: structured.passengers,
            query,
          })
          .catch(() => {});
      }

      const result = await journeyOrchestrator.orchestrateSearch(
        {
          origin: structured.origin,
          destination: structured.destination,
          departureDate: structured.departureDate,
          passengers: structured.passengers,
          requestedModes: ['rail'],
          preferences: structured.preferences,
          ranking: structured.ranking,
          userId,
        },
        {
          railwayOnly: true,
        }
      );

      const response = successResponse(
        'Journeys retrieved successfully via natural language search',
        result
      );

      // Attach parsed search intent and canonical journeys
      response.query = query;
      response.parsedRequest = structured;
      response.journeys = result.journeys;

      return res.status(200).json(response);
    } catch (error) {
      return next(error);
    }
  },

  /**
   * POST /api/journeys/interpret
   * Interprets natural language travel intent and resolves candidate locations
   * without immediately orchestrating the entire journey search.
   */
  async interpret(req, res, next) {
    try {
      const { query, referenceDate, timezone } = req.body || {};

      if (!query || typeof query !== 'string' || !query.trim()) {
        const err = new Error('Query string is required for natural language interpretation.');
        err.statusCode = 400;
        err.code = 'INVALID_QUERY';
        throw err;
      }

      const parseResult = await naturalLanguageParser.parse(query, {
        currentDate: referenceDate,
        timezone,
      });

      if (parseResult.status === 'needs_clarification' || parseResult.status === 'invalid') {
        return res.status(200).json({
          success: false,
          status: parseResult.status,
          message: parseResult.message,
          missingFields: parseResult.missingFields,
          parsedRequest: parseResult.structuredRequest,
        });
      }

      const structured = parseResult.structuredRequest;
      const [originCandidates, destinationCandidates] = await Promise.all([
        structured?.origin ? locationService.search(structured.origin, { limit: 5 }) : Promise.resolve([]),
        structured?.destination ? locationService.search(structured.destination, { limit: 5 }) : Promise.resolve([]),
      ]);

      const response = successResponse('Search intent interpreted successfully', {
        query,
        status: 'ready',
        parsedRequest: structured,
        origin: {
          query: structured.origin,
          candidates: originCandidates,
          selected: originCandidates[0] || null,
        },
        destination: {
          query: structured.destination,
          candidates: destinationCandidates,
          selected: destinationCandidates[0] || null,
        },
      });

      return res.status(200).json(response);
    } catch (error) {
      return next(error);
    }
  },

  /**
   * POST /api/journeys/recover
   * On-demand railway recovery engine endpoint.
   */
  async recover(req, res, next) {
    try {
      const { origin, destination, departureDate, passengers, preferences, options } = req.body || {};
      const { originLocation, destLocation } = await journeyOrchestrator.resolveLocations(origin, destination);
      const searchContext = journeyOrchestrator.buildSearchContext({
        originLocation,
        destLocation,
        departureDate,
        passengers,
        preferences,
      });

      const recoveryResult = await journeyRecoveryService.recoverJourneys(searchContext, options || {});
      return res.status(200).json(
        successResponse('Alternative recovery journeys discovered', recoveryResult)
      );
    } catch (error) {
      return next(error);
    }
  },

  /**
   * GET /api/journeys/:id
   * Retrieve authoritative journey with legs.
   */
  async getById(req, res, next) {
    try {
      const journey = await journeyService.getJourneyWithLegs(req.params.id);
      if (!journey) {
        return res.status(404).json(errorResponse('Journey not found', 'NOT_FOUND'));
      }
      return res.status(200).json(successResponse('Journey retrieved successfully', { journey }));
    } catch (error) {
      return next(error);
    }
  },

  /**
   * GET /api/journeys/:id/availability
   * Refresh real-time seat availability for a specific journey.
   */
  async getAvailability(req, res, next) {
    try {
      const journey = await journeyService.findById(req.params.id);
      if (!journey) {
        return res.status(404).json(errorResponse('Journey not found', 'NOT_FOUND'));
      }
      const legs = await JourneyLeg.find({ journey: journey._id }).sort({ sequence: 1 });
      const enrichedLegs = await Promise.all(
        legs.map(async (l) => {
          const avail = await availabilityService.checkLegAvailability({
            trainNumber: l.vehicle?.identifier || l.service?.number,
            fromCode: l.origin?.name || l.origin,
            toCode: l.destination?.name || l.destination,
            date: l.departureTime,
            travelClass: l.service?.class || '3A',
          });
          return { ...l.toObject(), availability: avail };
        })
      );
      const evaluation = availabilityService.evaluateJourneyAvailability(enrichedLegs);
      return res.status(200).json(
        successResponse('Live availability refreshed', { evaluation, legs: enrichedLegs })
      );
    } catch (error) {
      return next(error);
    }
  },

  /**
   * GET /api/journeys/:id/fare
   * Refresh real-time fare calculation for a specific journey.
   */
  async getFare(req, res, next) {
    try {
      const journey = await journeyService.findById(req.params.id);
      if (!journey) {
        return res.status(404).json(errorResponse('Journey not found', 'NOT_FOUND'));
      }
      const legs = await JourneyLeg.find({ journey: journey._id }).sort({ sequence: 1 });
      const enrichedLegs = await Promise.all(
        legs.map(async (l) => {
          const fare = await fareService.getLegFare({
            trainNumber: l.vehicle?.identifier || l.service?.number,
            fromCode: l.origin?.name || l.origin,
            toCode: l.destination?.name || l.destination,
            travelClass: l.service?.class || '3A',
            distanceKm: l.distance,
          });
          return { ...l.toObject(), pricing: fare, price: fare.totalFare };
        })
      );
      const totalFare = fareService.calculateJourneyTotalFare(enrichedLegs);
      return res.status(200).json(
        successResponse('Live fare calculation refreshed', { totalFare, legs: enrichedLegs })
      );
    } catch (error) {
      return next(error);
    }
  },
};

export default journeyController;

