/**
 * ActionBudgetService  (P0 v2)
 *
 * Per-action RailKit call ledger.
 * - Keyed by actionId (client-generated UUID per user click).
 * - Stored in MongoDB with TTL 2 min (configurable via config.p0v2.actionBudgetTtlMs).
 * - Shared across all server requests that carry the same actionId, so a direct
 *   request followed by the automatic alternatives request share one cap.
 * - Every outbound attempt (retries included) MUST call increment().
 * - Cache hits MUST call recordCacheHit() — they never count against the budget.
 * - Single-flight: identical in-flight requests are deduped via an in-process Map.
 *
 * TODO[REDIS]: No Redis in current stack. Using MongoDB TTL collection as ledger.
 *   If Redis is added, replace MongoDB ops with atomic INCR + EXPIREAT.
 */

import mongoose from 'mongoose';
import ActionBudget from '../../models/ActionBudget.js';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

const p0v2 = config.p0v2;

// In-process in-flight dedup map: queryKey -> Promise<result>
const _inFlight = new Map();

/**
 * Returns the hard cap for an action type.
 */
export function getCapForActionType(actionType = 'default') {
  switch (String(actionType).toLowerCase()) {
    case 'alternatives_button': return p0v2.alternativesButtonCap;
    case 'deep': return p0v2.deepCap;
    case 'check_class': return p0v2.checkClassCap;
    default: return p0v2.defaultCap;
  }
}

/**
 * Returns sub-cap limits for an action type.
 */
export function getSubCapsForActionType(actionType = 'default') {
  switch (String(actionType).toLowerCase()) {
    case 'alternatives_button': return { ...p0v2.altButtonSubCaps, total: p0v2.alternativesButtonCap };
    default: return { ...p0v2.defaultSubCaps, total: p0v2.defaultCap };
  }
}

export class ActionBudgetService {
  constructor() {
    // L1 in-process cache: actionId -> { used, cap, subUsed, cacheHits, cacheMisses, partial }
    this._mem = new Map();
  }

  /**
   * Ensures a ledger record exists for this actionId.
   * Creates it with the appropriate cap if missing.
   * Returns the current ledger state.
   */
  async getOrCreate(actionId, actionType = 'default') {
    if (!actionId) {
      // No actionId → return a throwaway unbounded tracker
      const cap = getCapForActionType(actionType);
      return { actionId: null, used: 0, cap, partial: false, _mem: true };
    }

    // L1
    if (this._mem.has(actionId)) return this._mem.get(actionId);

    const cap = getCapForActionType(actionType);
    const ttlMs = p0v2.actionBudgetTtlMs;
    const expiresAt = new Date(Date.now() + ttlMs);

    if (mongoose.connection.readyState === 1) {
      try {
        const doc = await ActionBudget.findOneAndUpdate(
          { actionId },
          { $setOnInsert: { actionId, actionType, cap, expiresAt } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        const state = this._docToState(doc);
        this._mem.set(actionId, state);
        return state;
      } catch (err) {
        logger.debug(`[ActionBudget] MongoDB error for ${actionId}: ${err.message}`);
      }
    }

    // Fallback: in-memory only
    const state = { actionId, used: 0, cap, usedDirect: 0, usedScheduleRoutes: 0, usedSameTrain: 0, usedCrossTrain: 0, usedReserve: 0, cacheHits: 0, cacheMisses: 0, partial: false, _mem: true };
    this._mem.set(actionId, state);
    return state;
  }

  _docToState(doc) {
    return {
      actionId: doc.actionId,
      actionType: doc.actionType,
      used: doc.used,
      cap: doc.cap,
      usedDirect: doc.usedDirect,
      usedScheduleRoutes: doc.usedScheduleRoutes,
      usedSameTrain: doc.usedSameTrain,
      usedCrossTrain: doc.usedCrossTrain,
      usedReserve: doc.usedReserve,
      cacheHits: doc.cacheHits,
      cacheMisses: doc.cacheMisses,
      partial: doc.partial,
    };
  }

  /**
   * Atomically increments the ledger by 1 for the given category.
   * Returns false (and sets partial=true on the record) if the cap is already reached.
   * Cache hits MUST NOT call this — use recordCacheHit() instead.
   *
   * @param {string} actionId
   * @param {'direct'|'scheduleRoutes'|'sameTrain'|'crossTrain'|'reserve'|'general'} category
   * @returns {Promise<boolean>} true = budget available, false = cap exceeded
   */
  async increment(actionId, category = 'general') {
    if (!actionId) return true; // no-op for anonymous trackers

    const state = await this.getOrCreate(actionId);

    // Check global cap
    if (state.used >= state.cap) {
      if (!state.partial) {
        state.partial = true;
        await this._persist(actionId, { partial: true });
      }
      logger.debug(`[ActionBudget] Cap reached for action=${actionId} (${state.used}/${state.cap}). Category: ${category}`);
      return false;
    }

    // Track category usage
    const subKey = `used${category.charAt(0).toUpperCase()}${category.slice(1)}`;

    // Increment
    state.used += 1;
    state.cacheMisses = (state.cacheMisses || 0) + 1;
    if (subKey && state[subKey] !== undefined) state[subKey] += 1;

    // Async persist (don't await in hot path)
    const incFields = { $inc: { used: 1, cacheMisses: 1 } };
    if (subKey && subKey !== 'usedGeneral') incFields.$inc[subKey] = 1;
    this._persistInc(actionId, incFields);

    return true;
  }

  async recordCacheHit(actionId) {
    if (!actionId) return;
    const state = await this.getOrCreate(actionId);
    state.cacheHits = (state.cacheHits || 0) + 1;
    this._persistInc(actionId, { $inc: { cacheHits: 1 } });
  }

  async getBudgetSummary(actionId) {
    if (!actionId) return { used: 0, cap: p0v2.defaultCap, partial: false, cacheHits: 0, cacheMisses: 0 };
    const state = await this.getOrCreate(actionId);
    return {
      used: state.used,
      cap: state.cap,
      partial: state.partial,
      cacheHits: state.cacheHits,
      cacheMisses: state.cacheMisses,
    };
  }

  isAtCap(actionId) {
    if (!actionId) return false;
    const state = this._mem.get(actionId);
    return state ? state.used >= state.cap : false;
  }

  // ── Single-flight dedup ────────────────────────────────────────────

  /**
   * Wraps an async fn with in-process dedup for identical queryKeys.
   * If two requests with the same queryKey arrive simultaneously, only
   * one outbound call is made; both get the same result.
   */
  async singleFlight(queryKey, fn) {
    if (_inFlight.has(queryKey)) {
      logger.debug(`[ActionBudget] Single-flight hit for key=${queryKey}`);
      return _inFlight.get(queryKey);
    }
    const promise = fn().finally(() => _inFlight.delete(queryKey));
    _inFlight.set(queryKey, promise);
    return promise;
  }

  // ── Internal persist helpers ───────────────────────────────────────

  async _persist(actionId, update) {
    if (mongoose.connection.readyState !== 1) return;
    try {
      await ActionBudget.updateOne({ actionId }, { $set: update });
    } catch (err) {
      logger.debug(`[ActionBudget] persist failed for ${actionId}: ${err.message}`);
    }
  }

  _persistInc(actionId, incOp) {
    if (mongoose.connection.readyState !== 1) return;
    ActionBudget.updateOne({ actionId }, incOp).catch((err) =>
      logger.debug(`[ActionBudget] persistInc failed for ${actionId}: ${err.message}`)
    );
  }

  // Clear in-process cache (for testing)
  _clearMem() {
    this._mem.clear();
  }
}

export const actionBudgetService = new ActionBudgetService();
export default actionBudgetService;
