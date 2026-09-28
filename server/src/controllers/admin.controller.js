import { adminService } from '../services/admin.service.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

/**
 * Admin Controller (Phase 15)
 * Thin HTTP layer delegating operational queries to adminService.
 */
export const adminController = {
  /**
   * GET /api/admin/overview
   */
  async getOverview(req, res, next) {
    try {
      const stats = await adminService.getOverviewStats();
      return res.status(200).json(successResponse('Overview statistics retrieved successfully', stats));
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /api/admin/users
   */
  async getUsers(req, res, next) {
    try {
      const { page, limit, search, role, status, sort } = req.query;
      const result = await adminService.getUsers({ page, limit, search, role, status, sort });
      const response = successResponse('Users retrieved successfully', result.data, { pagination: result.pagination });
      response.pagination = result.pagination;
      return res.status(200).json(response);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /api/admin/searches
   */
  async getSearches(req, res, next) {
    try {
      const { page, limit, status, search, startDate, endDate, sort } = req.query;
      const result = await adminService.getSearches({ page, limit, status, search, startDate, endDate, sort });
      const response = successResponse('Searches retrieved successfully', result.data, { pagination: result.pagination });
      response.pagination = result.pagination;
      return res.status(200).json(response);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /api/admin/journeys
   */
  async getJourneys(req, res, next) {
    try {
      const { page, limit, mode, status, sort } = req.query;
      const result = await adminService.getJourneys({ page, limit, mode, status, sort });
      const response = successResponse('Journeys retrieved successfully', result.data, { pagination: result.pagination });
      response.pagination = result.pagination;
      return res.status(200).json(response);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /api/admin/providers
   */
  async getProviders(req, res, next) {
    try {
      const result = await adminService.getProviders();
      return res.status(200).json(successResponse('Providers retrieved successfully', result));
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /api/admin/errors
   */
  async getErrors(req, res, next) {
    try {
      const { page, limit, severity, statusCode, provider, search, startDate, endDate, sort } = req.query;
      const result = await adminService.getErrors({
        page,
        limit,
        severity,
        statusCode,
        provider,
        search,
        startDate,
        endDate,
        sort,
      });
      const response = successResponse('Errors retrieved successfully', result.data, { pagination: result.pagination });
      response.pagination = result.pagination;
      return res.status(200).json(response);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /api/admin/errors/:id
   */
  async getErrorById(req, res, next) {
    try {
      const { id } = req.params;
      const errorLog = await adminService.getErrorById(id);
      if (!errorLog) {
        return res.status(404).json(errorResponse('Error log record not found', 'NOT_FOUND'));
      }
      return res.status(200).json(successResponse('Error details retrieved successfully', errorLog));
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /api/admin/analytics
   */
  async getAnalytics(req, res, next) {
    try {
      const analytics = await adminService.getAnalytics();
      return res.status(200).json(successResponse('Analytics retrieved successfully', analytics));
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /api/admin/system-health
   */
  async getSystemHealth(req, res, next) {
    try {
      const health = await adminService.getSystemHealth();
      return res.status(200).json(successResponse('System health retrieved successfully', health));
    } catch (err) {
      return next(err);
    }
  },
};

export default adminController;
