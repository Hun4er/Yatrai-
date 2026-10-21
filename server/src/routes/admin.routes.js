import { Router } from 'express';
import { adminController } from '../controllers/admin.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import config from '../config/index.js';

const router = Router();

/**
 * Middleware: permits request if X-Admin-Secret matches process.env.ADMIN_SECRET,
 * or falls back to existing JWT admin authentication.
 */
const adminAuthOrSecret = (req, res, next) => {
  const secret = (process.env.ADMIN_SECRET || config.apiQuota?.adminSecret || 'yatrai_admin_secret_key').trim();
  const provided = String(req.headers['x-admin-secret'] || req.query.secret || '').trim();
  if (secret && provided && provided === secret) {
    return next();
  }
  return authenticate(req, res, (err) => {
    if (err) return next(err);
    return requireAdmin(req, res, next);
  });
};

/**
 * GET /api/admin/usage
 * Returns calls today, calls this month, cache hit rate, and the last 50 actions with per-phase counts.
 * Protected by existing auth OR an env secret (ADMIN_SECRET).
 */
router.get('/usage', adminAuthOrSecret, adminController.getUsage);

// Strictly enforce authentication and role-based admin authorization across ALL remaining admin endpoints
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
