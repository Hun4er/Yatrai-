import journeySearchService from '../services/journeySearchService.js';
import { successResponse } from '../utils/apiResponse.js';

/**
 * Journey Search Controller
 * Handles HTTP requests for journey discovery.
 */
export const journeyController = {
  /**
   * POST /api/journeys/search
   * Coordinates validating input, resolving locations, creating search requests,
   * querying candidate sources, and returning normalized journeys.
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
      } = req.body || {};

      const userId = req.user?.id || null;

      const result = await journeySearchService.searchJourneys({
        origin,
        destination,
        departureDate,
        returnDate,
        passengers,
        requestedModes,
        preferences,
        userId,
      });

      const response = successResponse('Journeys retrieved successfully', {
        searchRequestId: result.searchRequest?._id || null,
        status: result.searchRequest?.status || 'completed',
        count: result.journeys.length,
        journeys: result.journeys,
      });

      // Expose journeys array at the top level to support the canonical contract
      response.journeys = result.journeys;

      return res.status(200).json(response);
    } catch (error) {
      return next(error);
    }
  },
};

export default journeyController;
