/**
 * RailKit Replay Adapter — Recorded-Data Mode
 *
 * Two modes (controlled by env vars, never secrets in code):
 *
 * RECORD mode  (RAILKIT_RECORD=true):
 *   Wraps the real adapter. After each live response, writes it to
 *   RAILKIT_RECORD_DIR (default: server/fixtures/railkit) as a JSON file
 *   named by a hash of the call signature. Does NOT intercept — still
 *   consumes live API budget.
 *
 * REPLAY mode  (RAILKIT_REPLAY_DIR=<absolute-path>):
 *   Replaces the real adapter entirely. Reads fixture files from the
 *   specified directory. Returns null for unknown calls (not a crash).
 *   Zero live API requests consumed. No MongoDB required.
 *
 * File naming convention (deterministic):
 *   <method>__<args-hash>.json
 *   e.g. searchTrainBetweenStations__NDLS_PNBE.json
 *        getAvailability__12301_NDLS_PNBE_2026-10-25_3A_GN.json
 *        getFare__12301_2026-10-25_NDLS_PNBE_3A_GN.json
 *
 * Usage in tests / evaluation:
 *   RAILKIT_REPLAY_DIR=./fixtures/railkit node eval.mjs
 *
 * Recording a session:
 *   RAILKIT_RECORD=true node src/server.js
 *   (Make your test searches, then CTRL+C — files will be in server/fixtures/railkit)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../../utils/logger.js';
import railKitAdapter from '../../providers/rail/railKit.adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_RECORD_DIR = path.resolve(__dirname, '../../../fixtures/railkit');

/**
 * Sanitises a segment for use in a filename.
 */
function sanitize(val) {
  return String(val || '')
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9.-]/g, '_');
}

/**
 * Returns the fixture file path for a given method and args tuple.
 */
function fixturePathFor(dir, method, argParts) {
  const key = argParts.map(sanitize).join('_');
  return path.join(dir, `${method}__${key}.json`);
}

/**
 * Writes a fixture file (creates directory if needed).
 */
function saveFixture(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    logger.debug(`[ReplayAdapter] Fixture saved: ${filePath}`);
  } catch (err) {
    logger.warn(`[ReplayAdapter] Could not save fixture ${filePath}: ${err.message}`);
  }
}

/**
 * Reads a fixture file. Returns null if not found.
 */
function loadFixture(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    logger.warn(`[ReplayAdapter] Could not load fixture ${filePath}: ${err.message}`);
    return null;
  }
}

// ─── REPLAY ADAPTER ──────────────────────────────────────────────────────────

/**
 * Creates a read-only replay adapter that serves responses from fixture files.
 * All methods return null/empty if no fixture is found (no crash, no live call).
 */
export function createReplayAdapter(replayDir) {
  const dir = replayDir || DEFAULT_RECORD_DIR;

  logger.info(`[ReplayAdapter] REPLAY mode active — reading fixtures from: ${dir}`);

  return {
    name: 'RailKit-Replay',
    code: 'RAILKIT_REPLAY',

    async searchTrainBetweenStations(from, to) {
      const fp = fixturePathFor(dir, 'searchTrainBetweenStations', [from, to]);
      const data = loadFixture(fp);
      if (!data) {
        logger.debug(`[ReplayAdapter] No fixture for searchTrainBetweenStations(${from}, ${to})`);
        return { success: false, data: [], fromReplay: true, fixtureMissing: true };
      }
      logger.debug(`[ReplayAdapter] Replaying searchTrainBetweenStations(${from}, ${to})`);
      return data;
    },

    async getAvailability(trainNo, from, to, date, travelClass, quota, options = {}) {
      const fp = fixturePathFor(dir, 'getAvailability', [trainNo, from, to, date, travelClass, quota]);
      const data = loadFixture(fp);
      if (!data) {
        logger.debug(`[ReplayAdapter] No fixture for getAvailability(${trainNo},...)`);
        return null;
      }
      logger.debug(`[ReplayAdapter] Replaying getAvailability(${trainNo},...)`);
      return data;
    },

    async getFare(trainNo, date, from, to, travelClass, quota, options = {}) {
      const fp = fixturePathFor(dir, 'getFare', [trainNo, date, from, to, travelClass, quota]);
      const data = loadFixture(fp);
      if (!data) {
        logger.debug(`[ReplayAdapter] No fixture for getFare(${trainNo},...)`);
        return null;
      }
      logger.debug(`[ReplayAdapter] Replaying getFare(${trainNo},...)`);
      return data;
    },

    async validateStationCode(code, options = {}) {
      const fp = fixturePathFor(dir, 'validateStationCode', [code]);
      const data = loadFixture(fp);
      if (!data) {
        // Station validation: allow through with warning if no fixture
        logger.debug(`[ReplayAdapter] No fixture for validateStationCode(${code}) — returning valid=true`);
        return { valid: true, code: String(code).toUpperCase().trim(), fromReplay: true };
      }
      return data;
    },

    hasCachedSearch(from, to) {
      const fp = fixturePathFor(dir, 'searchTrainBetweenStations', [from, to]);
      return fs.existsSync(fp);
    },

    hasCachedInfo(trainNo) {
      const fp = fixturePathFor(dir, 'trainSchedule', [trainNo]);
      return fs.existsSync(fp);
    },

    async trainSchedule(trainNo) {
      const fp = fixturePathFor(dir, 'trainSchedule', [trainNo]);
      const data = loadFixture(fp);
      if (!data) {
        logger.debug(`[ReplayAdapter] No fixture for trainSchedule(${trainNo})`);
        return { success: false, data: null, fromReplay: true };
      }
      return data;
    },

    async getCancelledTrains(date) {
      const fp = fixturePathFor(dir, 'getCancelledTrains', [date]);
      const data = loadFixture(fp);
      if (!data) {
        return { success: true, data: [] };
      }
      return data;
    },

    async checkAvailabilityBatch(legs, options = {}) {
      const results = {};
      for (const leg of legs) {
        const result = await this.getAvailability(
          leg.trainNumber,
          leg.fromCode,
          leg.toCode,
          leg.date,
          leg.travelClass,
          leg.quota,
          options
        );
        results[leg.key || `${leg.trainNumber}-${leg.travelClass}-GN`] = result;
      }
      return results;
    },
  };
}

// ─── RECORDING WRAPPER ────────────────────────────────────────────────────────

/**
 * Wraps the real railKitAdapter and saves responses to fixture files.
 * The real adapter is still called — this is NOT a replay mode.
 */
export function createRecordingAdapter(recordDir) {
  const dir = recordDir || DEFAULT_RECORD_DIR;
  logger.info(`[ReplayAdapter] RECORD mode active — writing fixtures to: ${dir}`);

  function wrap(methodName, argExtractor, original) {
    return async function (...args) {
      const result = await original.apply(railKitAdapter, args);
      if (result !== null && result !== undefined) {
        const argParts = argExtractor(...args);
        const fp = fixturePathFor(dir, methodName, argParts);
        saveFixture(fp, result);
      }
      return result;
    };
  }

  return {
    name: 'RailKit-Recording',
    code: 'RAILKIT_RECORDING',

    searchTrainBetweenStations: wrap(
      'searchTrainBetweenStations',
      (from, to) => [from, to],
      railKitAdapter.searchTrainBetweenStations.bind(railKitAdapter)
    ),

    getAvailability: wrap(
      'getAvailability',
      (trainNo, from, to, date, travelClass, quota) => [trainNo, from, to, date, travelClass, quota],
      railKitAdapter.getAvailability.bind(railKitAdapter)
    ),

    getFare: wrap(
      'getFare',
      (trainNo, date, from, to, travelClass, quota) => [trainNo, date, from, to, travelClass, quota],
      railKitAdapter.getFare.bind(railKitAdapter)
    ),

    validateStationCode: wrap(
      'validateStationCode',
      (code) => [code],
      railKitAdapter.validateStationCode.bind(railKitAdapter)
    ),

    checkAvailabilityBatch: railKitAdapter.checkAvailabilityBatch?.bind(railKitAdapter),
  };
}

// ─── FACTORY ─────────────────────────────────────────────────────────────────

/**
 * Returns the appropriate adapter based on environment variables:
 *   RAILKIT_REPLAY_DIR  → replay adapter (no live calls)
 *   RAILKIT_RECORD=true → recording wrapper (live calls + saves fixtures)
 *   (default)           → the real railKitAdapter
 */
export function getConfiguredAdapter() {
  const replayDir = process.env.RAILKIT_REPLAY_DIR;
  const isRecord = process.env.RAILKIT_RECORD === 'true';

  if (replayDir) {
    return createReplayAdapter(replayDir);
  }
  if (isRecord) {
    return createRecordingAdapter(process.env.RAILKIT_RECORD_DIR || DEFAULT_RECORD_DIR);
  }
  return railKitAdapter;
}

export default {
  createReplayAdapter,
  createRecordingAdapter,
  getConfiguredAdapter,
};
