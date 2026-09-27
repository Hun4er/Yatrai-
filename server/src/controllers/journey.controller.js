import journeyOrchestrator from '../orchestration/journeyOrchestrator.js';
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
};

export default journeyController;
