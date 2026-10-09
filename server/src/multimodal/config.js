/**
 * Multi-Modal Journey Discovery Engine Configuration
 */
export const MULTIMODAL_CONFIG = {
  // Maximum number of legs in a multi-modal journey
  MAX_JOURNEY_LEGS: 3,

  // Maximum number of transfers
  MAX_TRANSFERS: 2,

  // Maximum journey duration in minutes (48 hours)
  MAX_JOURNEY_DURATION: 48 * 60,

  // Minimum transfer time between legs at the same station / terminal (minutes)
  MIN_TRANSFER_MINUTES: 45,

  // Minimum transfer time when changing between different modes / stations in same city
  CROSS_STATION_TRANSFER_MINUTES: 60,

  // Maximum layover / connection wait time in minutes (14 hours)
  MAX_LAYOVER_MINUTES: 14 * 60,

  // Default road feeder speed in km/h for local transfers
  ROAD_FEEDER_SPEED_KMH: 40,

  // Road taxi base fare rate per km for feeder transfers
  ROAD_TAXI_RATE_PER_KM: 12,

  // Maximum number of diverse multi-modal candidates to retain
  MAX_MULTIMODAL_CANDIDATES: 20,
};

export default MULTIMODAL_CONFIG;
