/**
 * Weekly Warm-Up Job Service (P0 v2)
 *
 * Implements the optional weekly warm-up job for the top 20 routes:
 * - Flag: WARMUP_ENABLED (default off: false)
 * - Static data only: train search between stations + route schedules
 * - Strict cap: max 300 calls per week
 * - Shared cross-user cache population
 */

import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import railKitAdapter from '../../providers/rail/railKit.adapter.js';
import corridorHubsService from './corridorHubs.service.js';

// Top 20 high-density corridors in Indian Railways
export const TOP_20_CORRIDORS = [
  { origin: 'NDLS', dest: 'PNBE' },
  { origin: 'NDLS', dest: 'HWH' },
  { origin: 'NDLS', dest: 'MMCT' },
  { origin: 'NDLS', dest: 'LKO' },
  { origin: 'NDLS', dest: 'BSB' },
  { origin: 'NDLS', dest: 'CNB' },
  { origin: 'MMCT', dest: 'ADI' },
  { origin: 'MMCT', dest: 'PUNE' },
  { origin: 'HWH', dest: 'PURI' },
  { origin: 'SBC', dest: 'MAS' },
  { origin: 'MAS', dest: 'CBE' },
  { origin: 'HYB', dest: 'BZA' },
  { origin: 'PNBE', dest: 'HWH' },
  { origin: 'ADI', dest: 'JP' },
  { origin: 'NDLS', dest: 'ASR' },
  { origin: 'NDLS', dest: 'CDG' },
  { origin: 'NDLS', dest: 'GKP' },
  { origin: 'LKO', dest: 'BSB' },
  { origin: 'PNBE', dest: 'GAYA' },
  { origin: 'HWH', dest: 'RNC' },
];

export class WarmupService {
  constructor(dependencies = {}) {
    this.railKit = dependencies.railKit || railKitAdapter;
    this.corridorHubsService = dependencies.corridorHubsService || corridorHubsService;
    this.enabled = config.p0v2?.warmupEnabled ?? false;
    this.maxWeeklyBudget = config.p0v2?.warmupWeeklyCallBudget ?? 300;
    this.topRoutes = TOP_20_CORRIDORS.slice(0, config.p0v2?.warmupTopRoutes ?? 20);
    this.callsMade = 0;
  }

  /**
   * Executes one run of the weekly warm-up job.
   * Static data only: train searches + train routes.
   * Returns summary with total calls made.
   */
  async runWarmup({ force = false } = {}) {
    if (!this.enabled && !force) {
      logger.info('[WarmupService] Warmup job is disabled by default (WARMUP_ENABLED=false). Skipping.');
      return { skipped: true, reason: 'WARMUP_DISABLED', callsMade: 0 };
    }

    logger.info(`[WarmupService] Starting weekly warm-up for ${this.topRoutes.length} corridors, cap=${this.maxWeeklyBudget}`);
    this.callsMade = 0;

    for (const corridor of this.topRoutes) {
      if (this.callsMade >= this.maxWeeklyBudget) {
        logger.info(`[WarmupService] Reached weekly call budget (${this.callsMade}/${this.maxWeeklyBudget}). Stopping.`);
        break;
      }

      try {
        // 1. Static train search between stations (1 call)
        this.callsMade++;
        const searchRes = await this.railKit.searchTrainBetweenStations(corridor.origin, corridor.dest);
        const trains = searchRes?.data || [];

        // 2. Route data for top reference trains to populate corridor hubs (max 2 per route)
        const refTrains = trains.slice(0, 2);
        for (const train of refTrains) {
          if (this.callsMade >= this.maxWeeklyBudget) break;
          const trainNo = String(train.train_number || train.number || train.trainNumber || '');
          if (trainNo) {
            this.callsMade++;
            try {
              await this.railKit.trainSchedule(trainNo);
            } catch { /* ignore */ }
          }
        }
      } catch (err) {
        logger.warn(`[WarmupService] Warmup failed for ${corridor.origin}→${corridor.dest}: ${err.message}`);
      }
    }

    logger.info(`[WarmupService] Weekly warmup completed. Total calls made: ${this.callsMade} (cap: ${this.maxWeeklyBudget})`);
    return {
      completed: true,
      corridorsProcessed: this.topRoutes.length,
      callsMade: this.callsMade,
      cap: this.maxWeeklyBudget,
    };
  }
}

export const warmupService = new WarmupService();
export default warmupService;
