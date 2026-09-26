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
  const requiredInProduction = ['PORT', 'JWT_ACCESS_SECRET'];

  if (isProduction) {
    const missing = requiredInProduction.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(
        `[Configuration Error] Missing required production environment variables: ${missing.join(', ')}`
      );
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

  // Database — Phase 1 (MongoDB)
  database: {
    mongodbUri:
      process.env.MONGODB_URI || process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/yatrai_dev',
    url: process.env.DATABASE_URL || null,
  },
  cache: {
    redisUrl: process.env.REDIS_URL || null,
  },
  auth: {
    jwtAccessSecret:
      process.env.JWT_ACCESS_SECRET ||
      (process.env.NODE_ENV === 'production'
        ? null
        : 'yatrai_dev_jwt_access_secret_do_not_use_in_production_987654'),
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    cookieName: process.env.AUTH_COOKIE_NAME || 'yatrai_refresh_token',
    cookieSecure:
      process.env.AUTH_COOKIE_SECURE !== undefined
        ? process.env.AUTH_COOKIE_SECURE === 'true'
        : process.env.NODE_ENV === 'production',
    cookieSameSite: process.env.AUTH_COOKIE_SAME_SITE || 'lax',
  },
  providers: {
    rail: {
      apiKey: process.env.RAIL_API_KEY || null,
      apiUrl: process.env.RAIL_API_URL || null,
      timeoutMs: parseInt(process.env.RAIL_TIMEOUT_MS || '5000', 10),
      enabled: process.env.RAIL_ENABLED !== 'false',
    },
    bus: {
      apiKey: process.env.BUS_API_KEY || null,
      apiUrl: process.env.BUS_API_URL || null,
      timeoutMs: parseInt(process.env.BUS_TIMEOUT_MS || '5000', 10),
      enabled: process.env.BUS_ENABLED !== 'false',
    },
    flight: {
      apiKey: process.env.FLIGHT_API_KEY || null,
      apiUrl: process.env.FLIGHT_API_URL || null,
      timeoutMs: parseInt(process.env.FLIGHT_TIMEOUT_MS || '5000', 10),
      enabled: process.env.FLIGHT_ENABLED !== 'false',
    },
    road: {
      apiKey: process.env.ROAD_API_KEY || process.env.MAP_API_KEY || null,
      apiUrl: process.env.ROAD_API_URL || 'https://router.project-osrm.org',
      timeoutMs: parseInt(process.env.ROAD_TIMEOUT_MS || '5000', 10),
      enabled: process.env.ROAD_ENABLED !== 'false',
    },
  },

  maps: {
    provider: process.env.MAP_PROVIDER || 'default',
    apiKey: process.env.MAP_API_KEY || null,
  },
  geocoding: {
    provider: process.env.GEOCODING_PROVIDER || 'nominatim',
    apiKey: process.env.GEOCODING_API_KEY || null,
    baseUrl: process.env.GEOCODING_BASE_URL || 'https://nominatim.openstreetmap.org',
    userAgent:
      process.env.GEOCODING_USER_AGENT ||
      'Yatrai-Platform/1.0 (contact: engineering@yatrai.internal)',
    timeoutMs: parseInt(process.env.GEOCODING_TIMEOUT_MS || '6000', 10),
  },
});

export default config;
