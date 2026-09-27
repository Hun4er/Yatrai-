import mongoose from 'mongoose';
import FavoriteRoute from '../models/FavoriteRoute.js';

/**
 * Favorite Route Service (Phase 13)
 * Manages user favorite origin-destination corridors.
 */
export const favoriteRouteService = {
  /**
   * Add a route pair to user's favorites.
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string} params.origin
   * @param {string} params.destination
   * @param {Array<string>} [params.preferredModes=[]]
   * @param {string} [params.label='']
   * @returns {Promise<Object>}
   */
  async addFavoriteRoute({
    userId,
    origin,
    destination,
    preferredModes = [],
    label = '',
  }) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      const err = new Error('Invalid user identifier.');
      err.statusCode = 400;
      err.code = 'INVALID_USER_ID';
      throw err;
    }
    if (!origin || !origin.trim()) {
      const err = new Error('Origin is required.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    if (!destination || !destination.trim()) {
      const err = new Error('Destination is required.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    const cleanOrigin = origin.trim();
    const cleanDest = destination.trim();

    if (cleanOrigin.toLowerCase() === cleanDest.toLowerCase()) {
      const err = new Error('Origin and destination cannot be the same.');
      err.statusCode = 400;
      err.code = 'SAME_ORIGIN_DESTINATION';
      throw err;
    }

    const existing = await FavoriteRoute.findOne({
      user: userId,
      origin: cleanOrigin,
      destination: cleanDest,
    });

    if (existing) {
      return {
        favorited: true,
        alreadyFavorited: true,
        favoriteRoute: existing.toJSON(),
        message: 'Route is already in favorites.',
      };
    }

    const newRoute = await FavoriteRoute.create({
      user: userId,
      origin: cleanOrigin,
      destination: cleanDest,
      preferredModes: Array.isArray(preferredModes) ? preferredModes : [],
      label: label?.trim() || '',
    });

    return {
      favorited: true,
      alreadyFavorited: false,
      favoriteRoute: newRoute.toJSON(),
      message: 'Route added to favorites successfully.',
    };
  },

  /**
   * Remove a route from user's favorites.
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string} params.routeId - Either document _id or composite match
   * @returns {Promise<Object>}
   */
  async removeFavoriteRoute({ userId, routeId }) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      const err = new Error('Invalid user identifier.');
      err.statusCode = 400;
      err.code = 'INVALID_USER_ID';
      throw err;
    }
    if (!routeId || !mongoose.Types.ObjectId.isValid(routeId)) {
      const err = new Error('Invalid route identifier.');
      err.statusCode = 400;
      err.code = 'INVALID_ROUTE_ID';
      throw err;
    }

    const result = await FavoriteRoute.findOneAndDelete({
      _id: routeId,
      user: userId,
    });

    if (!result) {
      const err = new Error('Favorite route not found or not owned by user.');
      err.statusCode = 404;
      err.code = 'ROUTE_NOT_FOUND';
      throw err;
    }

    return {
      favorited: false,
      message: 'Favorite route removed successfully.',
    };
  },

  /**
   * List all favorite routes for an authenticated user.
   *
   * @param {string|mongoose.Types.ObjectId} userId
   * @returns {Promise<Array<Object>>}
   */
  async listFavoriteRoutes(userId) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      const err = new Error('Invalid user identifier.');
      err.statusCode = 400;
      err.code = 'INVALID_USER_ID';
      throw err;
    }

    const routes = await FavoriteRoute.find({ user: userId }).sort({ createdAt: -1 });
    return routes.map((r) => r.toJSON());
  },

  /**
   * Check if a specific corridor is favorited by the user.
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string} params.origin
   * @param {string} params.destination
   * @returns {Promise<{ isFavorited: boolean, favoriteRouteId: string|null }>}
   */
  async checkIsFavorited({ userId, origin, destination }) {
    if (!userId || !origin || !destination) {
      return { isFavorited: false, favoriteRouteId: null };
    }
    const found = await FavoriteRoute.findOne({
      user: userId,
      origin: origin.trim(),
      destination: destination.trim(),
    });
    return {
      isFavorited: Boolean(found),
      favoriteRouteId: found ? found._id.toString() : null,
    };
  },
};

export default favoriteRouteService;
