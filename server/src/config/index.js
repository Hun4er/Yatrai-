import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env relative to server root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Validates required environment variables in production.
 * In development, safe defaults are used.
 */
function validateConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const requiredInProduction = ['PORT'];

  if (isProduction) {
    const missing = requiredInProduction.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`[Configuration Error] Missing required production environment variables: ${missing.join(', ')}`);
    }
  }
}

validateConfig();

/**
 * Centralized Application Configuration
 * All modules access environment settings through this object.
 */
export const config = Object.freeze({
  // Core environment
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: (process.env.NODE_ENV || 'development') === 'development',
  isTest: process.env.NODE_ENV === 'test',

  // Server network
  port: parseInt(process.env.PORT || '5000', 10),
  host: process.env.HOST || 'localhost',

  // CORS and Client settings
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // Logging
  logLevel: process.env.LOG_LEVEL || 'debug',

  // Placeholders for future phases (Phase 1+)
  database: {
    url: process.env.DATABASE_URL || null,
  },
  cache: {
    redisUrl: process.env.REDIS_URL || null,
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || null,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  providers: {
    rail: {
      apiKey: process.env.RAIL_API_KEY || null,
      apiUrl: process.env.RAIL_API_URL || null,
    },
    bus: {
      apiKey: process.env.BUS_API_KEY || null,
      apiUrl: process.env.BUS_API_URL || null,
    },
    flight: {
      apiKey: process.env.FLIGHT_API_KEY || null,
      apiUrl: process.env.FLIGHT_API_URL || null,
    },
  },
  maps: {
    provider: process.env.MAP_PROVIDER || 'default',
    apiKey: process.env.MAP_API_KEY || null,
  },
});

export default config;
