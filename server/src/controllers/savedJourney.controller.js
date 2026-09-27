import savedJourneyService from '../services/savedJourneyService.js';
import { successResponse } from '../utils/apiResponse.js';

export const savedJourneyController = {
  /**
   * POST /api/saved-journeys
   * Saves a journey for the authenticated user.
   */
  async save(req, res, next) {
    try {
      const { journeyId, name, notes } = req.body;
      const result = await savedJourneyService.saveJourney({
        userId: req.user.id,
        journeyId,
        name,
        notes,
      });

      const statusCode = result.alreadySaved ? 200 : 201;
      return res.status(statusCode).json(successResponse(result.message, result));
    } catch (error) {
      return next(error);
    }
  },

  /**
   * DELETE /api/saved-journeys/:journeyId
   * Removes a saved journey for the authenticated user.
   */
  async remove(req, res, next) {
    try {
      const { journeyId } = req.params;
      const result = await savedJourneyService.removeSavedJourney({
        userId: req.user.id,
        journeyId,
      });

      return res.status(200).json(successResponse(result.message, result));
    } catch (error) {
      return next(error);
    }
  },

  /**
   * GET /api/saved-journeys
   * Lists all saved journeys for the authenticated user.
   */
  async list(req, res, next) {
    try {
      const journeys = await savedJourneyService.listSavedJourneys(req.user.id);
      return res.status(200).json(
        successResponse('Saved journeys retrieved successfully', {
          count: journeys.length,
          journeys,
        })
      );
    } catch (error) {
      return next(error);
    }
  },

  /**
   * GET /api/saved-journeys/check/:journeyId
   * Checks if a journey is saved by the authenticated user.
   */
  async check(req, res, next) {
    try {
      const { journeyId } = req.params;
      const result = await savedJourneyService.checkIsSaved({
        userId: req.user.id,
        journeyId,
      });

      return res.status(200).json(successResponse('Check completed', result));
    } catch (error) {
      return next(error);
    }
  },
};

export default savedJourneyController;
