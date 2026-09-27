import journeyOrchestrator from '../orchestration/journeyOrchestrator.js';
import naturalLanguageParser from '../services/naturalLanguage/naturalLanguageParser.js';
import recentSearchService from '../services/recentSearchService.js';
import { successResponse } from '../utils/apiResponse.js';

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

      const result = await journeyOrchestrator.orchestrateSearch({
        origin,
        destination,
        departureDate,
        returnDate,
        passengers,
        requestedModes,
        preferences,
        ranking,
        sortBy,
        userId,
      });

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

      const result = await journeyOrchestrator.orchestrateSearch({
        origin: structured.origin,
        destination: structured.destination,
        departureDate: structured.departureDate,
        passengers: structured.passengers,
        requestedModes: structured.requestedModes,
        preferences: structured.preferences,
        ranking: structured.ranking,
        userId,
      });

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
};

export default journeyController;

