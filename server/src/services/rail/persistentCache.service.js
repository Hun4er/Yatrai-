import mongoose from 'mongoose';
import PersistentCache from '../../models/PersistentCache.js';
import logger from '../../utils/logger.js';

export const CACHE_TTL_CONFIG = {
  availability: 10 * 60 * 1000,          // 10 minutes
  fare: 24 * 60 * 60 * 1000,             // 24 hours
  timetable: 24 * 60 * 60 * 1000,        // 24 hours
  station: 24 * 60 * 60 * 1000,          // 24 hours
  route: 24 * 60 * 60 * 1000,            // 24 hours
  negative: 5 * 60 * 1000,               // 5 minutes
};

class PersistentCacheService {
  constructor() {
    this._memCache = new Map(); // L1 memory cache: key -> { data, expiresAt }
  }

  /**
   * Retrieves an item from cache (L1 Memory -> L2 MongoDB).
   *
   * @param {string} key
   * @returns {Promise<any|null>} Cached data or null
   */
  async get(key) {
    if (!key) return null;
    const now = Date.now();

    // 1. Check L1 Memory
    const mem = this._memCache.get(key);
    if (mem) {
      if (mem.expiresAt > now) {
        return mem.data;
      }
      this._memCache.delete(key);
    }

    // 2. Check L2 MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      try {
        const doc = await PersistentCache.findOne({ key, expiresAt: { $gt: new Date(now) } });
        if (doc) {
          // Populate L1 cache
          this._memCache.set(key, { data: doc.data, expiresAt: doc.expiresAt.getTime() });
          return doc.data;
        }
      } catch (err) {
        logger.debug(`[PersistentCache] MongoDB lookup failed for key "${key}": ${err.message}`);
      }
    }

    return null;
  }

  /**
   * Stores an item into cache (both L1 Memory and L2 MongoDB).
   *
   * @param {string} key
   * @param {any} data
   * @param {'availability'|'fare'|'timetable'|'station'|'negative'} category
   * @param {number} [customTtlMs]
   */
  async set(key, data, category = 'availability', customTtlMs = null) {
    if (!key || data === undefined) return;
    const ttlMs = customTtlMs || CACHE_TTL_CONFIG[category] || CACHE_TTL_CONFIG.availability;
    const expiresAtMs = Date.now() + ttlMs;
    const expiresAtDate = new Date(expiresAtMs);

    // 1. Store in L1 Memory
    this._memCache.set(key, { data, expiresAt: expiresAtMs });

    // 2. Persist in L2 MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      try {
        await PersistentCache.findOneAndUpdate(
          { key },
          { key, category, data, expiresAt: expiresAtDate },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (err) {
        logger.debug(`[PersistentCache] MongoDB persist failed for key "${key}": ${err.message}`);
      }
    }
  }

  /**
   * Caches a negative outcome (e.g. invalid station, no trains found, 404).
   *
   * @param {string} key
   * @param {any} [reasonData={ notFound: true }]
   */
  async setNegative(key, reasonData = { notFound: true }) {
    return this.set(key, reasonData, 'negative', CACHE_TTL_CONFIG.negative);
  }

  /**
   * Evicts a key from memory and database.
   */
  async delete(key) {
    if (!key) return;
    this._memCache.delete(key);
    if (mongoose.connection.readyState === 1) {
      try {
        await PersistentCache.deleteOne({ key });
      } catch {
        // Fallback silently if cache deletion fails
      }
    }
  }

  /**
   * Clears in-memory cache (primarily for testing).
   */
  clearMemory() {
    this._memCache.clear();
  }

  /**
   * Clears all cache (both L1 memory and L2 MongoDB).
   */
  async clearAll() {
    this._memCache.clear();
    if (mongoose.connection.readyState === 1) {
      try {
        await PersistentCache.deleteMany({});
      } catch (err) {
        logger.debug(`[PersistentCache] deleteMany failed: ${err.message}`);
      }
    }
  }
}

export const persistentCacheService = new PersistentCacheService();
export default persistentCacheService;
