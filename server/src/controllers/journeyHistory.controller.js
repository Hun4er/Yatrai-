import journeyHistoryService from '../services/journeyHistoryService.js';
import { successResponse } from '../utils/apiResponse.js';

export const journeyHistoryController = {
  /**
   * POST /api/journey-history
   * Records a viewed journey for the authenticated user.
   */
  async record(req, res, next) {
    try {
      const { journeyId } = req.body;
      const result = await journeyHistoryService.recordJourneyView({
        userId: req.user.id,
        journeyId,
      });

      return res.status(201).json(
        successResponse('Journey view recorded in history', result)
      );
    } catch (error) {
      return next(error);
    }
  },

  /**
   * GET /api/journey-history
   * Lists journey history for the authenticated user.
   */
  async list(req, res, next) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 30;
      const history = await journeyHistoryService.listJourneyHistory(req.user.id, limit);

      return res.status(200).json(
        successResponse('Journey history retrieved successfully', {
          count: history.length,
          history,
        })
      );
    } catch (error) {
      return next(error);
    }
  },

  /**
   * DELETE /api/journey-history
   * Clears journey history for the authenticated user.
   */
  async clear(req, res, next) {
    try {
      const result = await journeyHistoryService.clearJourneyHistory(req.user.id);
      return res.status(200).json(successResponse('Journey history cleared', result));
    } catch (error) {
      return next(error);
    }
  },
};

export default journeyHistoryController;
