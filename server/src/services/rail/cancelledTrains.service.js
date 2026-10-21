/**
 * CancelledTrainsService  (P0 v2)
 *
 * Fetches and caches the list of cancelled train numbers for a date.
 * TTL 1 hour, shared cross-user (MongoDB TTL collection).
 * Cache hits never count against any budget.
 */

import mongoose from 'mongoose';
import CancelledTrain from '../../models/CancelledTrain.js';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

const p0v2 = config.p0v2;

// L1 in-process memory cache: dateKey -> Set<trainNumber>
const _memCache = new Map();

export class CancelledTrainsService {
  /**
   * Returns a Set of cancelled train numbers for the given date string "YYYY-MM-DD".
   * One RailKit call is made at most once per date per TTL window.
   *
   * @param {string} dateStr - "YYYY-MM-DD"
   * @param {object} [railKit] - injected RailKit adapter (for testing)
   * @returns {Promise<Set<string>>}
   */
  async getCancelledTrains(dateStr, railKit = null) {
    const dateKey = String(dateStr).slice(0, 10);

    // L1
    if (_memCache.has(dateKey)) return _memCache.get(dateKey);

    // L2 MongoDB
    if (mongoose.connection.readyState === 1) {
      try {
        const doc = await CancelledTrain.findOne({
          dateKey,
          expiresAt: { $gt: new Date() },
        });
        if (doc) {
          const set = new Set(doc.trainNumbers);
          _memCache.set(dateKey, set);
          return set;
        }
      } catch (err) {
        logger.debug(`[CancelledTrainsService] MongoDB lookup failed: ${err.message}`);
      }
    }

    // Fetch from RailKit
    let trainNumbers = [];
    const adapter = railKit || (await import('../../providers/rail/railKit.adapter.js').then((m) => m.default));
    try {
      if (typeof adapter.getCancelledTrains === 'function' || typeof adapter.cancelList === 'function') {
        const fetchFn = adapter.getCancelledTrains ? adapter.getCancelledTrains.bind(adapter) : adapter.cancelList.bind(adapter);
        const res = await fetchFn(dateKey);
        if (res && res.data) {
          if (Array.isArray(res.data)) {
            trainNumbers = res.data.map((t) => String(t.train_number || t.trainNumber || t.number || t)).filter(Boolean);
          } else {
            const fully = Array.isArray(res.data.fullyCancelledTrains) ? res.data.fullyCancelledTrains : [];
            const partially = Array.isArray(res.data.partiallyCancelledTrains) ? res.data.partiallyCancelledTrains : [];
            trainNumbers = [...fully, ...partially]
              .map((t) => String(t.trainNo || t.train_number || t.trainNumber || t.number || t))
              .filter(Boolean);
          }
        } else if (res && Array.isArray(res.trainNumbers)) {
          trainNumbers = res.trainNumbers.map(String);
        }
        logger.info(`[CancelledTrainsService] Fetched ${trainNumbers.length} cancelled trains for ${dateKey}`);
      } else {
        // TODO[CANCELLED_API]: RailKit adapter does not yet expose getCancelledTrains().
        // Returning empty set. Add implementation when API is available.
        logger.warn('[CancelledTrainsService] TODO: railKit.getCancelledTrains() not implemented. Returning empty set.');
      }
    } catch (err) {
      logger.warn(`[CancelledTrainsService] Fetch failed: ${err.message}`);
    }

    const set = new Set(trainNumbers);

    // Persist in L2
    if (mongoose.connection.readyState === 1) {
      const ttlMs = p0v2.cancelledTrainsTtlMs;
      try {
        await CancelledTrain.findOneAndUpdate(
          { dateKey },
          { dateKey, trainNumbers, fetchedAt: new Date(), expiresAt: new Date(Date.now() + ttlMs) },
          { upsert: true, new: true }
        );
      } catch (err) {
        logger.debug(`[CancelledTrainsService] MongoDB persist failed: ${err.message}`);
      }
    }

    _memCache.set(dateKey, set);
    const timer = setTimeout(() => _memCache.delete(dateKey), p0v2.cancelledTrainsTtlMs);
    timer.unref?.();

    return set;
  }

  /** Checks if a train number is cancelled on a given date. */
  async isCancelled(trainNumber, dateStr, railKit = null) {
    const set = await this.getCancelledTrains(dateStr, railKit);
    return set.has(String(trainNumber));
  }

  /** Clear in-process cache (testing). */
  _clearMem() {
    _memCache.clear();
  }
}

export const cancelledTrainsService = new CancelledTrainsService();
export default cancelledTrainsService;
