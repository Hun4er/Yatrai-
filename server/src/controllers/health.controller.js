import healthService from '../services/health.service.js';

/**
 * Health Controller
 * Handles GET /api/health requests.
 */
export function getHealth(req, res, next) {
  try {
    const health = healthService.getSystemHealth();
    return res.status(200).json({
      success: true,
      service: health.service,
      status: health.status,
      environment: health.environment,
      uptimeSeconds: health.uptimeSeconds,
      timestamp: health.timestamp,
    });
  } catch (error) {
    return next(error);
  }
}

export default {
  getHealth,
};
