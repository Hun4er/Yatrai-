import mongoose from 'mongoose';
import RecentSearch from '../models/RecentSearch.js';

const DEFAULT_RECENT_SEARCH_LIMIT = 20;

/**
 * Recent Search Service (Phase 13)
 * Manages user search history with duplicate collapsing and configurable retention.
 */
export const recentSearchService = {
  /**
   * Record a completed search for an authenticated user.
   * Collapses duplicates by updating the searchedAt timestamp.
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string} params.origin
   * @param {string} params.destination
   * @param {string} params.departureDate
   * @param {string} [params.ranking='overall']
   * @param {Object} [params.departureWindow=null]
   * @param {number} [params.maxBudget=null]
   * @param {Array<string>} [params.transportTypes=[]]
   * @param {number} [params.passengers=1]
   * @param {string} [params.query='']
   * @returns {Promise<Object|null>}
   */
  async recordSearch({
    userId,
    origin,
    destination,
    departureDate,
    ranking = 'overall',
    departureWindow = null,
    maxBudget = null,
    transportTypes = [],
    passengers = 1,
    query = '',
  }) {
    if (!userId || !origin || !destination || !departureDate) {
      return null;
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return null;
    }

    const cleanOrigin = origin.trim();
    const cleanDest = destination.trim();
    const cleanDate = typeof departureDate === 'string'
      ? departureDate.split('T')[0]
      : new Date(departureDate).toISOString().split('T')[0];

    // Collapse duplicate: update searchedAt and parameters if user already searched this corridor/date
    const filter = {
      user: userId,
      origin: cleanOrigin,
      destination: cleanDest,
      departureDate: cleanDate,
    };

    const update = {
      ranking: ranking || 'overall',
      departureWindow: departureWindow || null,
      maxBudget: typeof maxBudget === 'number' ? maxBudget : null,
      transportTypes: Array.isArray(transportTypes) ? transportTypes : [],
      passengers: Number(passengers) || 1,
      query: query?.trim() || '',
      searchedAt: new Date(),
    };

    const searchDoc = await RecentSearch.findOneAndUpdate(
      filter,
      { $set: update },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    // Enforce retention limit: keep only the most recent N searches
    try {
      const excessSearches = await RecentSearch.find({ user: userId })
        .sort({ searchedAt: -1 })
        .skip(DEFAULT_RECENT_SEARCH_LIMIT)
        .select('_id');

      if (excessSearches.length > 0) {
        const idsToRemove = excessSearches.map((s) => s._id);
        await RecentSearch.deleteMany({ _id: { $in: idsToRemove } });
      }
    } catch {
      // Non-blocking cleanup
    }

    return searchDoc.toJSON();
  },

  /**
   * List recent searches for an authenticated user.
   *
   * @param {string|mongoose.Types.ObjectId} userId
   * @param {number} [limit=20]
   * @returns {Promise<Array<Object>>}
   */
  async listRecentSearches(userId, limit = DEFAULT_RECENT_SEARCH_LIMIT) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      const err = new Error('Invalid user identifier.');
      err.statusCode = 400;
      err.code = 'INVALID_USER_ID';
      throw err;
    }

    const maxLimit = Math.min(Number(limit) || DEFAULT_RECENT_SEARCH_LIMIT, 50);
    const searches = await RecentSearch.find({ user: userId })
      .sort({ searchedAt: -1 })
      .limit(maxLimit);

    return searches.map((doc) => doc.toJSON());
  },

  /**
   * Remove a single recent search for an authenticated user.
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.searchId
   * @returns {Promise<Object>}
   */
  async removeRecentSearch({ userId, searchId }) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      const err = new Error('Invalid user identifier.');
      err.statusCode = 400;
      err.code = 'INVALID_USER_ID';
      throw err;
    }
    if (!searchId || !mongoose.Types.ObjectId.isValid(searchId)) {
      const err = new Error('Invalid search identifier.');
      err.statusCode = 400;
      err.code = 'INVALID_SEARCH_ID';
      throw err;
    }

    const result = await RecentSearch.findOneAndDelete({
      _id: searchId,
      user: userId,
    });

    if (!result) {
      const err = new Error('Recent search record not found or not owned by user.');
      err.statusCode = 404;
      err.code = 'SEARCH_NOT_FOUND';
      throw err;
    }

    return { removed: true };
  },

  /**
   * Clear all recent searches for an authenticated user.
   *
   * @param {string|mongoose.Types.ObjectId} userId
   * @returns {Promise<Object>}
   */
  async clearRecentSearches(userId) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      const err = new Error('Invalid user identifier.');
      err.statusCode = 400;
      err.code = 'INVALID_USER_ID';
      throw err;
    }

    await RecentSearch.deleteMany({ user: userId });
    return { cleared: true };
  },
};

export default recentSearchService;
