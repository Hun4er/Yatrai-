import { Router } from 'express';
import { providerHealthService } from '../services/providerHealth.service.js';
import railKitAdapter from '../providers/rail/railKit.adapter.js';

import config from '../config/index.js';
import { optionalAuthenticate } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * GET /api/providers/health
 * Public or operational endpoint returning real-time health and reachability of all transport and geocoding providers.
 * Query: ?live=true to force a live network ping; otherwise returns cached or "not checked live".
 */
router.get('/health', async (req, res, next) => {
  try {
    const isLive = req.query.live === 'true';
    const health = await providerHealthService.checkAll({ live: isLive, isLive });
    const statusCode = health.status === 'down' ? 503 : 200;
    return res.status(statusCode).json({
      success: health.status !== 'down',
      data: health,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/providers/railkit/stats
 * Real-time outbound request statistics directly from the RailKit adapter instance.
 * Protected: accessible in development mode or by authenticated admin users only.
 */
router.get('/railkit/stats', optionalAuthenticate, (req, res) => {
  const isDev = config.isDevelopment || process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
  const isAdmin = req.user?.role === 'admin';

  if (!isDev && !isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Access denied: RailKit statistics are restricted to development or administrator access.',
    });
  }

  return res.status(200).json({
    success: true,
    data: railKitAdapter.getStats(),
  });
});

export default router;
