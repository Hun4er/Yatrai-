import config from '../config/index.js';

/**
 * Health Service
 * Provides diagnostic and health status information for Yatrai API.
 */
export const healthService = {
  getSystemHealth() {
    return {
      service: 'yatrai-api',
      status: 'healthy',
      environment: config.env,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  },
};

export default healthService;
