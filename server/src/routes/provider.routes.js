import { Router } from 'express';
import { providerHealthService } from '../services/providerHealth.service.js';

const router = Router();

/**
 * GET /api/providers/health
 * Public or operational endpoint returning real-time health and reachability of all transport and geocoding providers.
 */
router.get('/health', async (req, res, next) => {
  try {
    const health = await providerHealthService.checkAll();
    const statusCode = health.status === 'down' ? 503 : 200;
    return res.status(statusCode).json({
      success: health.status !== 'down',
      data: health,
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
