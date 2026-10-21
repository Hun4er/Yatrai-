/**
 * CorridorHubsService  (P0 v2)
 *
 * Stores and retrieves learned hub stations for a (origin, destination) corridor.
 * If a corridor record is present → skip hub discovery (0 route calls).
 * TTL 7 days, shared cross-user.
 */

import mongoose from 'mongoose';
import CorridorHub from '../../models/CorridorHub.js';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

const p0v2 = config.p0v2;

// L1 in-process cache: corridorKey -> hub[]
const _mem = new Map();

function buildCorridorKey(originCode, destCode) {
  return `${String(originCode).toUpperCase()}:${String(destCode).toUpperCase()}`;
}

export class CorridorHubsService {
  /**
   * Returns stored hubs for a corridor, or null if not cached yet.
   *
   * @param {string} originCode
   * @param {string} destCode
   * @returns {Promise<Array|null>} Array of hub objects, or null
   */
  async getStoredHubs(originCode, destCode) {
    const key = buildCorridorKey(originCode, destCode);

    // L1
    if (_mem.has(key)) return _mem.get(key);

    // L2 MongoDB
    if (mongoose.connection.readyState === 1) {
      try {
        const doc = await CorridorHub.findOne({
          corridorKey: key,
          expiresAt: { $gt: new Date() },
        });
        if (doc && doc.hubs && doc.hubs.length > 0) {
          _mem.set(key, doc.hubs);
          return doc.hubs;
        }
      } catch (err) {
        logger.debug(`[CorridorHubs] MongoDB lookup failed: ${err.message}`);
      }
    }

    return null;
  }

  /**
   * Persists verified hubs for a corridor.
   *
   * @param {string} originCode
   * @param {string} destCode
   * @param {Array<{code, name, score, distanceFromOriginKm, distanceToDestKm}>} hubs
   */
  async storeHubs(originCode, destCode, hubs) {
    if (!hubs || hubs.length === 0) return;
    const key = buildCorridorKey(originCode, destCode);
    const ttlMs = p0v2.corridorHubsTtlMs;
    const expiresAt = new Date(Date.now() + ttlMs);

    _mem.set(key, hubs);

    if (mongoose.connection.readyState === 1) {
      try {
        await CorridorHub.findOneAndUpdate(
          { corridorKey: key },
          {
            corridorKey: key,
            originCode: String(originCode).toUpperCase(),
            destCode: String(destCode).toUpperCase(),
            hubs,
            expiresAt,
          },
          { upsert: true, new: true }
        );
        logger.info(`[CorridorHubs] Stored ${hubs.length} hubs for ${key}`);
      } catch (err) {
        logger.debug(`[CorridorHubs] MongoDB persist failed: ${err.message}`);
      }
    }
  }

  /** Clear L1 (testing). */
  _clearMem() {
    _mem.clear();
  }
}

export const corridorHubsService = new CorridorHubsService();
export default corridorHubsService;
