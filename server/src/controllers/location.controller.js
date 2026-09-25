import mongoose from 'mongoose';
import locationService from '../services/locationService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

/**
 * Location Controller
 * Thin controller layer orchestrating location discovery and resolution.
 */
export const locationController = {
  /**
   * GET /api/locations/search?q=Delhi&limit=5
   * Autocomplete and search location candidates.
   */
  async search(req, res, next) {
    try {
      const q = req.query.q || req.query.query;
      const limit = parseInt(req.query.limit || '5', 10);

      if (!q || typeof q !== 'string' || q.trim().length === 0) {
        return res
          .status(400)
          .json(errorResponse('Search query parameter "q" is required.', 'VALIDATION_ERROR'));
      }

      const locations = await locationService.search(q.trim(), { limit });

      return res.status(200).json(
        successResponse('Locations retrieved successfully', {
          query: q.trim(),
          count: locations.length,
          locations,
        })
      );
    } catch (error) {
      return next(error);
    }
  },

  /**
   * POST /api/locations/resolve
   * Resolves a place name or simple natural language travel intent ("Sonipat to Patna").
   */
  async resolve(req, res, next) {
    try {
      const { query } = req.body || {};

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res
          .status(400)
          .json(errorResponse('Body field "query" is required.', 'VALIDATION_ERROR'));
      }

      const result = await locationService.resolve(query.trim());

      return res.status(200).json(successResponse('Location resolved successfully', result));
    } catch (error) {
      return next(error);
    }
  },

  /**
   * GET /api/locations/:id
   * Retrieves a single canonical location by its database ID.
   */
  async getById(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json(errorResponse('Invalid location ID format.', 'INVALID_ID'));
      }

      const location = await locationService.findById(id);
      if (!location) {
        return res
          .status(404)
          .json(errorResponse(`Location with ID "${id}" not found.`, 'NOT_FOUND'));
      }

      return res
        .status(200)
        .json(successResponse('Location retrieved successfully', { location: location.toJSON() }));
    } catch (error) {
      return next(error);
    }
  },
};

export default locationController;
