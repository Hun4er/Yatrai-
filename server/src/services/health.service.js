import mongoose from 'mongoose';
import config from '../config/index.js';

/**
 * Health Service
 * Provides diagnostic and health status information for Yatrai API.
 */
export const healthService = {
  getSystemHealth() {
    const dbStateMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };
    const dbStatus = dbStateMap[mongoose.connection.readyState] || 'unknown';

    return {
      service: 'yatrai-api',
      status: 'healthy',
      database: dbStatus,
      environment: config.env,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  },
};

export default healthService;
