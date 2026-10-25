import mongoose from 'mongoose';
import PersistentCache from '../../models/PersistentCache.js';
import logger from '../../utils/logger.js';

export const CACHE_TTL_CONFIG = {
  station: parseInt(process.env.CACHE_TTL_STATION_MS || String(24 * 60 * 60 * 1000), 10), // 24 hours
  trainInfo: parseInt(process.env.CACHE_TTL_TRAIN_INFO_MS || String(24 * 60 * 60 * 1000), 10), // 24 hours
  static: parseInt(process.env.CACHE_TTL_STATIC_MS || String(24 * 60 * 60 * 1000), 10), // 24 hours
  fare: parseInt(process.env.CACHE_TTL_FARE_MS || String(24 * 60 * 60 * 1000), 10), // 24 hours
  route: parseInt(process.env.CACHE_TTL_ROUTE_MS || String(24 * 60 * 60 * 1000), 10), // 24 hours
  search: parseInt(process.env.CACHE_TTL_SEARCH_MS || String(15 * 60 * 1000), 10), // 15 minutes
  timetable: parseInt(process.env.CACHE_TTL_TIMETABLE_MS || String(15 * 60 * 1000), 10), // 15 minutes
  schedule: parseInt(process.env.CACHE_TTL_SCHEDULE_MS || String(15 * 60 * 1000), 10), // 15 minutes
  preview: parseInt(process.env.CACHE_TTL_PREVIEW_MS || String(60 * 60 * 1000), 10), // 1 hour
  cancelled: parseInt(process.env.CACHE_TTL_CANCELLED_MS || String(60 * 60 * 1000), 10), // 1 hour
  availability: parseInt(process.env.CACHE_TTL_AVAILABILITY_MS || String(60 * 1000), 10), // 60 seconds
  live: parseInt(process.env.CACHE_TTL_LIVE_MS || String(30 * 1000), 10), // 30 seconds
  pnr: parseInt(process.env.CACHE_TTL_PNR_MS || String(30 * 1000), 10), // 30 seconds
  error: parseInt(process.env.CACHE_TTL_ERROR_MS || String(30 * 1000), 10), // 30 seconds
  negative: parseInt(process.env.CACHE_TTL_NEGATIVE_MS || String(5 * 60 * 1000), 10), // 5 minutes
};

class PersistentCacheService {
  constructor() {
    this._memCache = new Map(); // L1 memory cache: key -> { data, expiresAt, fetchedAt }
    this._stats = {
      l1Hits: 0,
      l2Hits: 0,
      misses: 0,
      writes: 0,
      errors: 0,
    };
  }

  /**
   * Retrieves an item from cache (L1 Memory -> L2 MongoDB).
   *
   * @param {string} key
   * @returns {Promise<any|null>} Cached data or null
   */
  async get(key) {
    const result = await this.getWithMeta(key);
    return result ? result.data : null;
  }

  /**
   * Retrieves an item from cache with freshness metadata.
   *
   * @param {string} key
   * @returns {Promise<{ data: any, meta: { cached: boolean, fetchedAt: string, expiresAt: string, stale: boolean } }|null>}
   */
  async getWithMeta(key) {
    if (!key) return null;
    const now = Date.now();

    // 1. Check L1 Memory
    const mem = this._memCache.get(key);
    if (mem) {
      if (mem.expiresAt > now) {
        this._stats.l1Hits++;
        return {
          data: mem.data,
          meta: {
            cached: true,
            cacheLayer: 'L1_MEMORY',
            fetchedAt: new Date(mem.fetchedAt || now).toISOString(),
            expiresAt: new Date(mem.expiresAt).toISOString(),
            stale: false,
          },
        };
      }
      this._memCache.delete(key);
    }

    // 2. Check L2 MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      try {
        const doc = await PersistentCache.findOne({ key, expiresAt: { $gt: new Date(now) } });
        if (doc) {
          const fetchedAtMs = doc.fetchedAt ? doc.fetchedAt.getTime() : now;
          const expiresAtMs = doc.expiresAt.getTime();
          // Populate L1 cache
          this._memCache.set(key, { data: doc.data, expiresAt: expiresAtMs, fetchedAt: fetchedAtMs });
          this._stats.l2Hits++;
          return {
            data: doc.data,
            meta: {
              cached: true,
              cacheLayer: 'L2_MONGODB',
              fetchedAt: new Date(fetchedAtMs).toISOString(),
              expiresAt: new Date(expiresAtMs).toISOString(),
              stale: false,
            },
          };
        }
      } catch (err) {
        this._stats.errors++;
        logger.debug(`[PersistentCache] MongoDB lookup failed for key "${key}": ${err.message}`);
      }
    }

    this._stats.misses++;
    return null;
  }

  /**
   * Stores an item into cache (both L1 Memory and L2 MongoDB).
   *
   * @param {string} key
   * @param {any} data
   * @param {string} category
   * @param {number} [customTtlMs]
   */
  async set(key, data, category = 'availability', customTtlMs = null) {
    if (!key || data === undefined) return;
    const ttlMs = customTtlMs || CACHE_TTL_CONFIG[category] || CACHE_TTL_CONFIG.availability;
    const now = Date.now();
    const expiresAtMs = now + ttlMs;
    const expiresAtDate = new Date(expiresAtMs);
    const fetchedAtDate = new Date(now);

    this._stats.writes++;

    // 1. Store in L1 Memory
    this._memCache.set(key, { data, expiresAt: expiresAtMs, fetchedAt: now });

    // 2. Persist in L2 MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      try {
        await PersistentCache.findOneAndUpdate(
          { key },
          { key, category, data, fetchedAt: fetchedAtDate, expiresAt: expiresAtDate },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (err) {
        this._stats.errors++;
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

  /**
   * Returns cache stats and observability metrics.
   */
  getStats() {
    const totalHits = this._stats.l1Hits + this._stats.l2Hits;
    const totalLookups = totalHits + this._stats.misses;
    const hitRatio = totalLookups > 0 ? (totalHits / totalLookups).toFixed(4) : '0.0000';
    return {
      ...this._stats,
      totalHits,
      totalLookups,
      hitRatio: parseFloat(hitRatio),
      memoryEntries: this._memCache.size,
    };
  }
}

export const persistentCacheService = new PersistentCacheService();
export default persistentCacheService;
