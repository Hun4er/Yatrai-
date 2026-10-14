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
  isTest:
    process.env.NODE_ENV === 'test' ||
    process.env.npm_lifecycle_event === 'test' ||
    process.execArgv.some((a) => a.includes('--test')),

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
      process.env.MONGODB_URI ||
      process.env.MONGO_URI ||
      process.env.DATABASE_URL ||
      'mongodb://127.0.0.1:27017/yatrai_dev',
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
      apiKey: (process.env.RAIL_API_KEY || process.env.RAIL_API || '').trim() || null,
      apiUrl: process.env.RAIL_API_URL ? process.env.RAIL_API_URL.trim() : null,
      timeoutMs: parseInt(process.env.RAIL_TIMEOUT_MS || '5000', 10),
      enabled: process.env.RAIL_ENABLED !== 'false',
    },
    railradar: {
      apiKey: process.env.RAILRADAR_API_KEY || process.env.RAIL_API_KEY || process.env.RAIL_API || null,
      apiUrl: process.env.RAILRADAR_BASE_URL || process.env.RAIL_API_URL || 'https://api.railradar.in/v1',
      timeoutMs: parseInt(process.env.RAILRADAR_TIMEOUT_MS || process.env.RAIL_TIMEOUT_MS || '5000', 10),
      enabled: process.env.RAILRADAR_ENABLED !== 'false' && process.env.RAIL_ENABLED !== 'false',
      enableAvailabilityEndpoint: process.env.RAILRADAR_ENABLE_AVAILABILITY !== 'false',
      availabilityTtlMs: parseInt(process.env.RAILRADAR_AVAILABILITY_TTL_MS || '300000', 10),
    },
    railkit: {
      apiKey: process.env.RAILKIT_API_KEY || null,
      apiUrl: process.env.RAILKIT_API_URL || 'https://api.railkit.in',
      timeoutMs: parseInt(process.env.RAILKIT_TIMEOUT_MS || '8000', 10),
      enabled: process.env.RAILKIT_ENABLED !== 'false',
      cacheTtlMs: parseInt(process.env.RAILKIT_CACHE_TTL_MS || '300000', 10),
      maxConcurrent: parseInt(process.env.RAILKIT_MAX_CONCURRENT || '3', 10),
      maxEnrichCandidates: parseInt(process.env.RAILKIT_MAX_ENRICH_CANDIDATES || '5', 10),
    },
    aopay: {
      apiKey: process.env.AOPAY_API_KEY || null,
      baseUrl: process.env.AOPAY_BASE_URL || 'https://api.aopay.in/v1',
      timeoutMs: parseInt(process.env.AOPAY_TIMEOUT_MS || '5000', 10),
      enabled: process.env.AOPAY_ENABLED === 'true',
    },
    bus: {
      apiKey: process.env.BUS_API_KEY || null,
      apiUrl: process.env.BUS_API_URL || null,
      timeoutMs: parseInt(process.env.BUS_TIMEOUT_MS || '5000', 10),
      enabled: process.env.BUS_ENABLED === 'true',
    },
    flight: {
      apiKey: process.env.FLIGHT_API_KEY || null,
      apiUrl: process.env.FLIGHT_API_URL || null,
      timeoutMs: parseInt(process.env.FLIGHT_TIMEOUT_MS || '5000', 10),
      enabled: process.env.FLIGHT_ENABLED === 'true',
    },
    road: {
      apiKey: process.env.ROAD_API_KEY || process.env.MAP_API_KEY || null,
      apiUrl: process.env.ROAD_API_URL || 'https://router.project-osrm.org',
      timeoutMs: parseInt(process.env.ROAD_TIMEOUT_MS || '5000', 10),
      enabled: process.env.ROAD_ENABLED === 'true',
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
  ai: {
    provider: process.env.NATURAL_LANGUAGE_MODEL_PROVIDER || 'mock',
    model: process.env.NATURAL_LANGUAGE_MODEL || 'gemini-1.5-flash',
    apiKey: process.env.NATURAL_LANGUAGE_API_KEY || process.env.GEMINI_API_KEY || null,
    maxQueryLength: parseInt(process.env.NATURAL_LANGUAGE_MAX_QUERY_LENGTH || '500', 10),
    timezone: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
  },
  notifications: {
    reminderLeadTimeHours: parseInt(process.env.JOURNEY_REMINDER_LEAD_TIME_HOURS || '24', 10),
    priceChangeMinPercent: parseFloat(process.env.PRICE_CHANGE_MIN_PERCENT || '0'),
    maxPerUser: parseInt(process.env.NOTIFICATIONS_MAX_PER_USER || '100', 10),
    retentionDays: parseInt(process.env.NOTIFICATIONS_RETENTION_DAYS || '30', 10),
  },
  railRecovery: {
    maxStationsBefore: parseInt(process.env.RAIL_RECOVERY_MAX_STATIONS_BEFORE || '5', 10),
    maxStationsAfter: parseInt(process.env.RAIL_RECOVERY_MAX_STATIONS_AFTER || '5', 10),
    maxTransfers: parseInt(process.env.RAIL_RECOVERY_MAX_TRANSFERS || '2', 10),
    maxReturnedJourneys: parseInt(process.env.RAIL_RECOVERY_MAX_RETURNED_JOURNEYS || '5', 10),
    maxRecoveryRequests: parseInt(process.env.RAIL_RECOVERY_MAX_REQUESTS || '10', 10),
    maxTotalRequests: parseInt(process.env.RAIL_RECOVERY_MAX_TOTAL_REQUESTS || '16', 10),
    maxCandidatesToValidate: parseInt(process.env.RAIL_RECOVERY_MAX_CANDIDATES_VALIDATE || '8', 10),
    minSameStationBufferMinutes: parseInt(process.env.RAIL_RECOVERY_MIN_SAME_STATION_BUFFER || '25', 10),
    minCrossStationBufferMinutes: parseInt(process.env.RAIL_RECOVERY_MIN_CROSS_STATION_BUFFER || '60', 10),
    maxTransferBufferMinutes: parseInt(process.env.RAIL_RECOVERY_MAX_TRANSFER_BUFFER || '720', 10),
    maxDetourRatio: parseFloat(process.env.RAIL_RECOVERY_MAX_DETOUR_RATIO || '1.8'),
  },
});

export default config;
