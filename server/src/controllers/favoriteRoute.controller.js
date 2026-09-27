import favoriteRouteService from '../services/favoriteRouteService.js';
import { successResponse } from '../utils/apiResponse.js';

export const favoriteRouteController = {
  /**
   * POST /api/favorite-routes
   * Adds a route to favorites.
   */
  async add(req, res, next) {
    try {
      const { origin, destination, preferredModes, label } = req.body;
      const result = await favoriteRouteService.addFavoriteRoute({
        userId: req.user.id,
        origin,
        destination,
        preferredModes,
        label,
      });

      const statusCode = result.alreadyFavorited ? 200 : 201;
      return res.status(statusCode).json(successResponse(result.message, result));
    } catch (error) {
      return next(error);
    }
  },

  /**
   * DELETE /api/favorite-routes/:id
   * Removes a route from favorites.
   */
  async remove(req, res, next) {
    try {
      const { id } = req.params;
      const result = await favoriteRouteService.removeFavoriteRoute({
        userId: req.user.id,
        routeId: id,
      });

      return res.status(200).json(successResponse(result.message, result));
    } catch (error) {
      return next(error);
    }
  },

  /**
   * GET /api/favorite-routes
   * Lists all favorite routes for the user.
   */
  async list(req, res, next) {
    try {
      const routes = await favoriteRouteService.listFavoriteRoutes(req.user.id);
      return res.status(200).json(
        successResponse('Favorite routes retrieved successfully', {
          count: routes.length,
          routes,
        })
      );
    } catch (error) {
      return next(error);
    }
  },

  /**
   * GET /api/favorite-routes/check
   * Checks if an origin-destination pair is favorited.
   */
  async check(req, res, next) {
    try {
      const { origin, destination } = req.query;
      const result = await favoriteRouteService.checkIsFavorited({
        userId: req.user.id,
        origin,
        destination,
      });

      return res.status(200).json(successResponse('Check completed', result));
    } catch (error) {
      return next(error);
    }
  },
};

export default favoriteRouteController;
