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
    maxRecoveryRequests: parseInt(process.env.RAIL_RECOVERY_MAX_REQUESTS || '8', 10),
    maxDirectRequests: parseInt(process.env.RAIL_DIRECT_MAX_REQUESTS || '4', 10),
    maxTotalRequests: parseInt(process.env.RAIL_RECOVERY_MAX_TOTAL_REQUESTS || '14', 10),
    maxCandidatesToValidate: parseInt(process.env.RAIL_RECOVERY_MAX_CANDIDATES_VALIDATE || '4', 10),
    maxTransferPairs: parseInt(process.env.MAX_TRANSFER_PAIRS || '4', 10),
    maxRailKitRequestsPerSearch: parseInt(process.env.MAX_RAILKIT_REQUESTS_PER_SEARCH || '14', 10),
    maxHubsToSearch: parseInt(process.env.RAIL_RECOVERY_MAX_HUBS || '2', 10),
    maxTrainsPerLeg: parseInt(process.env.RAIL_RECOVERY_MAX_TRAINS_PER_LEG || '2', 10),
    earlyStopGoodItineraries: parseInt(process.env.RAIL_EARLY_STOP_COUNT || '3', 10),
    checkMoreAllowance: parseInt(process.env.RAIL_CHECK_MORE_ALLOWANCE || '6', 10),
    minSameStationBufferMinutes: parseInt(process.env.RAIL_RECOVERY_MIN_SAME_STATION_BUFFER || '25', 10),
    minCrossStationBufferMinutes: parseInt(process.env.RAIL_RECOVERY_MIN_CROSS_STATION_BUFFER || '60', 10),
    maxTransferBufferMinutes: parseInt(process.env.RAIL_RECOVERY_MAX_TRANSFER_BUFFER || '720', 10),
    maxDetourRatio: parseFloat(process.env.RAIL_RECOVERY_MAX_DETOUR_RATIO || '1.8'),
    maxClusterDistanceKm: parseFloat(process.env.MAX_CLUSTER_DISTANCE_KM || '25'),
  },
  waitlistThresholds: {
    maxGnwlFeasible: parseInt(process.env.MAX_GNWL_FEASIBLE || '10', 10),
    maxRlwlFeasible: parseInt(process.env.MAX_RLWL_FEASIBLE || '20', 10),
    maxPqwlFeasible: parseInt(process.env.MAX_PQWL_FEASIBLE || '10', 10),
    maxDefaultWlFeasible: parseInt(process.env.MAX_DEFAULT_WL_FEASIBLE || '10', 10),
  },
  apiQuota: {
    monthlyLimit: parseInt(process.env.RAILKIT_MONTHLY_LIMIT || '10000', 10),
    usageOffset: parseInt(process.env.RAILKIT_USAGE_OFFSET || '0', 10),
    warningPercent: 80,
    criticalPercent: 95,
    // Monthly degraded-mode threshold: under 10% of 10,000 → direct + same-train only
    degradedThresholdPercent: parseInt(process.env.RAILKIT_DEGRADED_THRESHOLD_PERCENT || '10', 10),
    // 10,000 plan expiration: 13 Nov 2026
    planExpiry: process.env.RAILKIT_PLAN_EXPIRY || '2026-11-13',
    adminSecret: process.env.ADMIN_SECRET || 'yatrai_admin_secret_key',
  },

  /**
   * P0 v2 — Per-action budget caps and sub-caps.
   * All values are configurable via environment variables.
   */
  p0v2: {
    // ── Action-level hard caps ──────────────────────────────────────
    defaultCap: parseInt(process.env.P0V2_DEFAULT_CAP || '40', 10),
    alternativesButtonCap: parseInt(process.env.P0V2_ALT_BUTTON_CAP || '60', 10),
    deepCap: parseInt(process.env.P0V2_DEEP_CAP || '100', 10),

    // ── DEFAULT (40) sub-caps ──────────────────────────────────────
    defaultSubCaps: {
      direct: parseInt(process.env.P0V2_DEFAULT_DIRECT || '14', 10),       // getCancelledTrains + searchTrains (max 4 pairs) + availability
      scheduleRoutes: parseInt(process.env.P0V2_DEFAULT_SCHEDULE || '6', 10),
      sameTrain: parseInt(process.env.P0V2_DEFAULT_SAME_TRAIN || '10', 10),
      crossTrain: parseInt(process.env.P0V2_DEFAULT_CROSS_TRAIN || '8', 10),
      reserve: parseInt(process.env.P0V2_DEFAULT_RESERVE || '2', 10),
    },

    // ── ALTERNATIVES_BUTTON (60) sub-caps ─────────────────────────
    altButtonSubCaps: {
      scheduleRoutes: parseInt(process.env.P0V2_ALT_SCHEDULE || '6', 10),
      sameTrain: parseInt(process.env.P0V2_ALT_SAME_TRAIN || '22', 10),
      crossTrain: parseInt(process.env.P0V2_ALT_CROSS_TRAIN || '28', 10),
      reserve: parseInt(process.env.P0V2_ALT_RESERVE || '4', 10),
    },

    // ── Direct pass algorithm constants ───────────────────────────
    directRound1Candidates: parseInt(process.env.P0V2_ROUND1_CANDIDATES || '8', 10),
    directRound2Candidates: parseInt(process.env.P0V2_ROUND2_CANDIDATES || '5', 10),
    moreTrainsBatch: parseInt(process.env.P0V2_MORE_TRAINS_BATCH || '8', 10),
    searchPairsMax: parseInt(process.env.P0V2_SEARCH_PAIRS_MAX || '4', 10),

    // ── Alternatives algorithm constants ──────────────────────────
    maxHubsDefault: parseInt(process.env.P0V2_MAX_HUBS_DEFAULT || '3', 10),
    maxHubsButton: parseInt(process.env.P0V2_MAX_HUBS_BUTTON || '3', 10),
    maxHubsDeep: parseInt(process.env.P0V2_MAX_HUBS_DEEP || '4', 10),
    maxLanesDefault: parseInt(process.env.P0V2_MAX_LANES_DEFAULT || '2', 10),
    maxLanesDeep: parseInt(process.env.P0V2_MAX_LANES_DEEP || '3', 10),
    maxLegTrains: parseInt(process.env.P0V2_MAX_LEG_TRAINS || '2', 10),
    earlyStopPlans: parseInt(process.env.P0V2_EARLY_STOP_PLANS || '3', 10),

    // ── Valid layover window ───────────────────────────────────────
    layoverMinMinutes: parseInt(process.env.P0V2_LAYOVER_MIN_MINUTES || '90', 10),
    layoverMaxMinutes: parseInt(process.env.P0V2_LAYOVER_MAX_MINUTES || '600', 10),
    layoverTightMinutes: parseInt(process.env.P0V2_LAYOVER_TIGHT_MINUTES || '180', 10),
    maxDetourRatio: parseFloat(process.env.P0V2_MAX_DETOUR_RATIO || '1.15'),

    // ── Cache TTLs (ms) ───────────────────────────────────────────
    availabilityTtlAvailableMs: parseInt(process.env.P0V2_AVAIL_TTL_AVAILABLE_MS || '90000', 10),    // 90 s
    availabilityTtlWaitlistMs: parseInt(process.env.P0V2_AVAIL_TTL_WAITLIST_MS || '600000', 10),    // 10 min
    cancelledTrainsTtlMs: parseInt(process.env.P0V2_CANCELLED_TTL_MS || '3600000', 10),              // 1 h
    searchRouteTtlMs: parseInt(process.env.P0V2_SEARCH_ROUTE_TTL_MS || '604800000', 10),             // 7 days
    corridorHubsTtlMs: parseInt(process.env.P0V2_CORRIDOR_HUBS_TTL_MS || '604800000', 10),          // 7 days

    // ── Action ledger TTL ─────────────────────────────────────────
    actionBudgetTtlMs: parseInt(process.env.P0V2_ACTION_BUDGET_TTL_MS || '120000', 10),              // 2 min

    // ── Refresh-card rate limit ───────────────────────────────────
    refreshCardRateLimitMs: parseInt(process.env.P0V2_REFRESH_RATE_LIMIT_MS || '60000', 10),         // 1 min

    // ── Warm-up job (default off) ─────────────────────────────────
    warmupEnabled: process.env.WARMUP_ENABLED === 'true',
    warmupTopRoutes: parseInt(process.env.WARMUP_TOP_ROUTES || '20', 10),
    warmupWeeklyCallBudget: parseInt(process.env.WARMUP_WEEKLY_BUDGET || '300', 10),

    // ── Capacity order for round-1 class selection ────────────────
    capacityOrder: (process.env.P0V2_CAPACITY_ORDER || 'SL,3A,3E,CC,2S,2A,EC,1A').split(',').map((c) => c.trim()),

    // ── check-class action cap ────────────────────────────────────
    checkClassCap: parseInt(process.env.P0V2_CHECK_CLASS_CAP || '100', 10),
  },
});

export const p0v2Config = config.p0v2;
export default config;
