import { Router } from 'express';
import { adminController } from '../controllers/admin.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

// Strictly enforce authentication and role-based admin authorization across ALL admin endpoints
router.use(authenticate, requireAdmin);

/**
 * GET /api/admin/overview
 * Operational summary metrics for admin dashboard
 */
router.get('/overview', adminController.getOverview);

/**
 * GET /api/admin/users
 * Paginated user accounts inspection with filtering and safe serialization
 */
router.get('/users', adminController.getUsers);

/**
 * GET /api/admin/searches
 * Paginated historical search activity inspection
 */
router.get('/searches', adminController.getSearches);

/**
 * GET /api/admin/journeys
 * Paginated canonical persisted journeys inspection
 */
router.get('/journeys', adminController.getJourneys);

/**
 * GET /api/admin/providers
 * Operational provider registry and database provider status (secrets strictly masked)
 */
router.get('/providers', adminController.getProviders);

/**
 * GET /api/admin/errors
 * Paginated operational error logs with severity and status code filtering
 */
router.get('/errors', adminController.getErrors);

/**
 * GET /api/admin/errors/:id
 * Single error log inspection with diagnostic stack trace (admins only)
 */
router.get('/errors/:id', adminController.getErrorById);

/**
 * GET /api/admin/analytics
 * Server-side MongoDB aggregations for operational analytics
 */
router.get('/analytics', adminController.getAnalytics);

/**
 * GET /api/admin/system-health
 * Liveness and readiness operational health breakdown
 */
router.get('/system-health', adminController.getSystemHealth);

export default router;
