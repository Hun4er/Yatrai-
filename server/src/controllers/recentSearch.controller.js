import recentSearchService from '../services/recentSearchService.js';
import { successResponse } from '../utils/apiResponse.js';

export const recentSearchController = {
  /**
   * POST /api/searches/recent
   * Explicitly records a recent search.
   */
  async record(req, res, next) {
    try {
      const search = await recentSearchService.recordSearch({
        userId: req.user.id,
        ...req.body,
      });

      return res.status(201).json(
        successResponse('Recent search recorded successfully', { search })
      );
    } catch (error) {
      return next(error);
    }
  },

  /**
   * GET /api/searches/recent
   * Lists recent searches for the authenticated user.
   */
  async list(req, res, next) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
      const searches = await recentSearchService.listRecentSearches(req.user.id, limit);

      return res.status(200).json(
        successResponse('Recent searches retrieved successfully', {
          count: searches.length,
          searches,
        })
      );
    } catch (error) {
      return next(error);
    }
  },

  /**
   * DELETE /api/searches/recent/:id
   * Removes a recent search for the authenticated user.
   */
  async remove(req, res, next) {
    try {
      const { id } = req.params;
      const result = await recentSearchService.removeRecentSearch({
        userId: req.user.id,
        searchId: id,
      });

      return res.status(200).json(successResponse('Recent search removed', result));
    } catch (error) {
      return next(error);
    }
  },

  /**
   * DELETE /api/searches/recent
   * Clears all recent searches for the authenticated user.
   */
  async clear(req, res, next) {
    try {
      const result = await recentSearchService.clearRecentSearches(req.user.id);
      return res.status(200).json(successResponse('All recent searches cleared', result));
    } catch (error) {
      return next(error);
    }
  },
};

export default recentSearchController;
