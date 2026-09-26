/**
 * Centralized Ranking Configuration
 *
 * Defines strategy identifiers, display labels, scoring weights,
 * tie-break rules, and missing value policies.
 */

export const DEFAULT_STRATEGY = 'overall';

export const STRATEGY_DEFINITIONS = {
  overall: {
    id: 'overall',
    name: 'Best Overall',
    description: 'Balanced composite score optimizing duration, cost, transfers, and travel convenience.',
    aliases: ['balanced', 'default'],
  },
  fastest: {
    id: 'fastest',
    name: 'Fastest',
    description: 'Prioritizes shortest total journey duration.',
    aliases: ['quickest'],
  },
  cheapest: {
    id: 'cheapest',
    name: 'Cheapest',
    description: 'Prioritizes lowest total journey cost.',
    aliases: ['budget', 'lowest_fare'],
  },
  fewest_transfers: {
    id: 'fewest_transfers',
    name: 'Fewest Transfers',
    description: 'Prioritizes routes with minimum connection interchanges.',
    aliases: ['fewestTransfers', 'transfers', 'direct'],
  },
  most_convenient: {
    id: 'most_convenient',
    name: 'Most Convenient',
    description: 'Optimizes comfort, daylight schedules, minimal modal changes, and smooth transfers.',
    aliases: ['mostConvenient', 'convenience', 'comfortable'],
  },
};

/**
 * Weights for Best Overall composite scoring.
 * Must sum to 1.0.
 */
export const OVERALL_WEIGHTS = {
  durationWeight: 0.35,
  priceWeight: 0.30,
  transferWeight: 0.20,
  convenienceWeight: 0.15,
};

/**
 * Weights for Most Convenient composite scoring.
 * Must sum to 1.0.
 */
export const CONVENIENCE_WEIGHTS = {
  transferWeight: 0.40,
  durationWeight: 0.30,
  scheduleWeight: 0.20,
  modeChangeWeight: 0.10,
};

/**
 * Schedule scoring configuration (based on departure time in travel timezone).
 * Daytime departures (06:00 - 22:00) score highest.
 */
export const SCHEDULE_SCORING = {
  preferredWindowStartHour: 6,
  preferredWindowEndHour: 22,
  daytimeScore: 1.0,
  lateNightScore: 0.7, // 22:00 - 00:00
  earlyMorningScore: 0.4, // 00:00 - 06:00
};

/**
 * Policy for missing attributes.
 */
export const MISSING_VALUE_POLICY = {
  missingPriceScore: 0.0,
  missingDurationScore: 0.0,
  missingTransferScore: 0.0,
  defaultCurrency: 'INR',
};

export default {
  DEFAULT_STRATEGY,
  STRATEGY_DEFINITIONS,
  OVERALL_WEIGHTS,
  CONVENIENCE_WEIGHTS,
  SCHEDULE_SCORING,
  MISSING_VALUE_POLICY,
};
