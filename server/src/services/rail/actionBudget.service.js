/**
 * ActionBudgetService  (P0 v2)
 *
 * Per-action RailKit call ledger.
 * - Keyed by actionId (client-generated UUID per user click).
 * - Stored in MongoDB with TTL 2 min (configurable via config.p0v2.actionBudgetTtlMs).
 * - Shared across all server requests that carry the same actionId, so a direct
 *   request followed by the automatic alternatives request share one cap.
 * - Every outbound attempt (retries included) MUST call recordCall() or increment().
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
    // In-memory ring buffer of the last 50 actions for admin / monitoring
    this._recentActions = [];
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
        this._updateRecentAction(actionId, state);
        return state;
      } catch (err) {
        logger.debug(`[ActionBudget] MongoDB error for ${actionId}: ${err.message}`);
      }
    }

    // Fallback: in-memory only
    const state = {
      actionId,
      actionType,
      used: 0,
      cap,
      usedDirect: 0,
      usedScheduleRoutes: 0,
      usedSameTrain: 0,
      usedCrossTrain: 0,
      usedReserve: 0,
      cacheHits: 0,
      cacheMisses: 0,
      partial: false,
      _mem: true,
      updatedAt: new Date().toISOString(),
    };
    this._mem.set(actionId, state);
    this._updateRecentAction(actionId, state);
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
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Instruments and records a per-call ledger event:
   * phase, endpoint, cache hit/miss, cost.
   *
   * Cache hits MUST have cacheHit: true and cost: 0.
   * They never deduct from budget.
   *
   * @param {object} params
   * @param {string} params.actionId
   * @param {'direct'|'scheduleRoutes'|'sameTrain'|'crossTrain'|'reserve'|'general'} [params.phase='general']
   * @param {string} [params.endpoint='unknown']
   * @param {boolean} [params.cacheHit=false]
   * @param {number} [params.cost=1]
   * @returns {Promise<boolean>} true if under cap / allowed, false if cap exceeded
   */
  async recordCall({ actionId, phase = 'general', endpoint = 'unknown', cacheHit = false, cost = 1 }) {
    if (!actionId) return true;

    if (cacheHit) {
      await this.recordCacheHit(actionId);
      logger.info(`[ActionBudget][Call] actionId=${actionId} phase=${phase} endpoint=${endpoint} cacheHit=true cost=0`);
      this._updateRecentAction(actionId);
      return true;
    }

    const ok = await this.increment(actionId, phase, cost);
    const state = await this.getOrCreate(actionId);
    logger.info(`[ActionBudget][Call] actionId=${actionId} phase=${phase} endpoint=${endpoint} cacheHit=false cost=${cost} used=${state.used}/${state.cap}`);
    this._updateRecentAction(actionId);
    return ok;
  }

  /**
   * Atomically increments the ledger by cost for the given category.
   * Returns false (and sets partial=true on the record) if the cap is already reached.
   * Cache hits MUST NOT call this — use recordCacheHit() instead.
   *
   * @param {string} actionId
   * @param {'direct'|'scheduleRoutes'|'sameTrain'|'crossTrain'|'reserve'|'general'} category
   * @param {number} [cost=1]
   * @returns {Promise<boolean>} true = budget available, false = cap exceeded
   */
  async increment(actionId, category = 'general', cost = 1) {
    if (!actionId) return true; // no-op for anonymous trackers

    const state = await this.getOrCreate(actionId);

    // Check global cap
    if (state.used + cost > state.cap) {
      if (!state.partial) {
        state.partial = true;
        await this._persist(actionId, { partial: true });
      }
      logger.debug(`[ActionBudget] Cap reached for action=${actionId} (${state.used}/${state.cap}). Category: ${category}`);
      this._updateRecentAction(actionId);
      return false;
    }

    // Track category usage
    const subKey = `used${category.charAt(0).toUpperCase()}${category.slice(1)}`;

    // Increment
    state.used += cost;
    state.cacheMisses = (state.cacheMisses || 0) + 1;
    if (subKey && state[subKey] !== undefined) state[subKey] += cost;
    state.updatedAt = new Date().toISOString();

    // Async persist (don't await in hot path)
    const incFields = { $inc: { used: cost, cacheMisses: 1 } };
    if (subKey && subKey !== 'usedGeneral') incFields.$inc[subKey] = cost;
    this._persistInc(actionId, incFields);
    this._updateRecentAction(actionId, state);

    return true;
  }

  async recordCacheHit(actionId) {
    if (!actionId) return;
    const state = await this.getOrCreate(actionId);
    state.cacheHits = (state.cacheHits || 0) + 1;
    state.updatedAt = new Date().toISOString();
    this._persistInc(actionId, { $inc: { cacheHits: 1 } });
    this._updateRecentAction(actionId, state);
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

  // ── Recent Actions & Overall Stats (for /api/admin/usage) ──────────

  _updateRecentAction(actionId, stateObj = null) {
    if (!actionId) return;
    const state = stateObj || this._mem.get(actionId);
    if (!state) return;

    const formatted = {
      actionId: state.actionId,
      actionType: state.actionType || 'default',
      used: state.used || 0,
      cap: state.cap || 40,
      perPhaseCounts: {
        direct: state.usedDirect || 0,
        scheduleRoutes: state.usedScheduleRoutes || 0,
        sameTrain: state.usedSameTrain || 0,
        crossTrain: state.usedCrossTrain || 0,
        reserve: state.usedReserve || 0,
      },
      cacheHits: state.cacheHits || 0,
      cacheMisses: state.cacheMisses || 0,
      partial: Boolean(state.partial),
      updatedAt: state.updatedAt || new Date().toISOString(),
    };

    const existingIdx = this._recentActions.findIndex((a) => a.actionId === actionId);
    if (existingIdx >= 0) {
      this._recentActions[existingIdx] = formatted;
    } else {
      this._recentActions.unshift(formatted);
      if (this._recentActions.length > 50) {
        this._recentActions.pop();
      }
    }
  }

  async getLastActions(limit = 50) {
    if (mongoose.connection.readyState === 1) {
      try {
        const docs = await ActionBudget.find().sort({ updatedAt: -1 }).limit(limit);
        if (docs && docs.length > 0) {
          return docs.map((doc) => ({
            actionId: doc.actionId,
            actionType: doc.actionType,
            used: doc.used,
            cap: doc.cap,
            perPhaseCounts: {
              direct: doc.usedDirect || 0,
              scheduleRoutes: doc.usedScheduleRoutes || 0,
              sameTrain: doc.usedSameTrain || 0,
              crossTrain: doc.usedCrossTrain || 0,
              reserve: doc.usedReserve || 0,
            },
            cacheHits: doc.cacheHits || 0,
            cacheMisses: doc.cacheMisses || 0,
            partial: doc.partial || false,
            updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : new Date().toISOString(),
          }));
        }
      } catch (err) {
        logger.debug(`[ActionBudget] Failed to fetch last actions from MongoDB: ${err.message}`);
      }
    }
    return this._recentActions.slice(0, limit);
  }

  async getOverallStats() {
    let totalHits = 0;
    let totalMisses = 0;

    for (const action of this._recentActions) {
      totalHits += action.cacheHits || 0;
      totalMisses += action.cacheMisses || 0;
    }

    const totalCalls = totalHits + totalMisses;
    const hitRate = totalCalls > 0 ? Number((totalHits / totalCalls).toFixed(3)) : 0;

    return {
      totalHits,
      totalMisses,
      totalCalls,
      hitRate,
    };
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
    this._recentActions = [];
  }
}

export const actionBudgetService = new ActionBudgetService();
export default actionBudgetService;
