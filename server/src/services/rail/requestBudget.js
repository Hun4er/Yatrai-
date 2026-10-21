import { AsyncLocalStorage } from 'async_hooks';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

/**
 * AsyncLocalStorage for per-search budget context propagation.
 * Every asynchronous operation within a search automatically inherits its tracker.
 */
export const budgetStorage = new AsyncLocalStorage();

export function runWithBudget(tracker, fn) {
  return budgetStorage.run(tracker, fn);
}

export function getCurrentBudgetTracker() {
  return budgetStorage.getStore() || null;
}

/**
 * RequestBudgetTracker
 *
 * Enforces Phase 2:
 * - Strictly bounds external provider requests per search session
 * - Propagates tracker via AsyncLocalStorage and explicit options
 * - Atomically reserves budget before network dispatch and releases on cache hit/failure
 * - Enforces default recovery cap of 8 calls and direct cap of 4 calls
 * - Stops graph expansion and validation gracefully when budget is exhausted
 */
export class RequestBudgetTracker {
  constructor(options = {}) {
    const recoveryConfig = config.railRecovery || {};

    this.maxRecoveryRequests = Number(
      options.maxRecoveryRequests ??
        options.recoveryBudget ??
        recoveryConfig.maxRecoveryRequests ??
        8
    );
    this.maxDirectRequests = Number(
      options.maxDirectRequests ??
        options.directBudget ??
        recoveryConfig.maxDirectRequests ??
        4
    );
    this.maxTotalRequests = Number(
      options.maxTotalRequests ??
        options.totalBudget ??
        recoveryConfig.maxRailKitRequestsPerSearch ??
        recoveryConfig.maxTotalRequests ??
        14
    );

    const staticConfig = config.railStatic || config.railRecovery || {};
    this.maxStaticRequests = Number(
      options.maxStaticRequests ??
        options.staticBudget ??
        staticConfig.maxStaticRequests ??
        25
    );
    this.tierLimits = {
      tier1: Number(options.tier1Limit ?? staticConfig.tier1Limit ?? 2),
      tier2: Number(options.tier2Limit ?? staticConfig.tier2Limit ?? 8),
      tier3: Number(options.tier3Limit ?? staticConfig.tier3Limit ?? Math.max(0, this.maxStaticRequests - 10)),
    };

    this.directRequestsUsed = 0;
    this.recoveryRequestsUsed = 0;  
    this.staticRequestsUsed = 0;
    this.directReserved = 0;
    this.recoveryReserved = 0;
    this.staticReserved = 0;
    this.tierUsed = { tier1: 0, tier2: 0, tier3: 0 };
    this.tierReserved = { tier1: 0, tier2: 0, tier3: 0 };
    this.cacheHits = 0;
    this.deduplicatedCount = 0;
    this.seenQueryKeys = new Set();
    this.terminationReason = null;
    this.searchCorrelationId =
      options.correlationId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  get totalReserved() {
    return this.directReserved + this.recoveryReserved;
  }

  get totalRequestsUsed() {
    return this.directRequestsUsed + this.recoveryRequestsUsed;
  }

  get totalCommittedAndReserved() {
    return this.totalRequestsUsed + this.totalReserved;
  }

  hasBudgetRemaining() {
    return this.totalCommittedAndReserved < this.maxTotalRequests;
  }

  get remainingRecoveryRequests() {
    const recoveryRemaining = Math.max(
      0,
      this.maxRecoveryRequests - (this.recoveryRequestsUsed + this.recoveryReserved)
    );
    const totalRemaining = Math.max(0, this.maxTotalRequests - this.totalCommittedAndReserved);
    return Math.min(recoveryRemaining, totalRemaining);
  }

  get remainingDirectRequests() {
    const directRemaining = Math.max(
      0,
      this.maxDirectRequests - (this.directRequestsUsed + this.directReserved)
    );
    const totalRemaining = Math.max(0, this.maxTotalRequests - this.totalCommittedAndReserved);
    return Math.min(directRemaining, totalRemaining);
  }

  canMakeRecoveryRequest() {
    if (this.recoveryRequestsUsed + this.recoveryReserved >= this.maxRecoveryRequests) {
      if (!this.terminationReason) {
        this.terminationReason = 'RECOVERY_BUDGET_EXHAUSTED';
      }
      return false;
    }
    if (this.totalCommittedAndReserved >= this.maxTotalRequests) {
      if (!this.terminationReason) {
        this.terminationReason = 'TOTAL_BUDGET_EXHAUSTED';
      }
      return false;
    }
    return true;
  }

  canMakeDirectRequest() {
    if (this.directRequestsUsed + this.directReserved >= this.maxDirectRequests) {
      return false;
    }
    if (this.totalCommittedAndReserved >= this.maxTotalRequests) {
      return false;
    }
    return true;
  }

  canMakeStaticRequest(tier = 'tier1') {
    if (this.staticRequestsUsed + this.staticReserved >= this.maxStaticRequests) {
      if (!this.terminationReason) {
        this.terminationReason = 'STATIC_BUDGET_EXHAUSTED';
      }
      return false;
    }
    const t = (tier || 'tier1').toLowerCase();
    const limit = this.tierLimits[t] ?? this.maxStaticRequests;
    const current = (this.tierUsed[t] || 0) + (this.tierReserved[t] || 0);
    if (current >= limit) {
      return false;
    }
    return true;
  }

  /**
   * Atomically reserves a budget unit BEFORE dispatching an outbound request.
   * If budget is exhausted, returns null.
   * On cache hit or pre-network failure, caller MUST call release().
   * On network completion, caller MUST call commit().
   *
   * @param {'recovery'|'direct'|'static'|'timetable'} [category='recovery']
   * @param {Object} [options={}] - Options including tier ('tier1', 'tier2', 'tier3')
   * @returns {{ commit: Function, release: Function }|null}
   */
  reserve(category = 'recovery', options = {}) {
    const isStatic =
      category === 'static' ||
      category === 'timetable' ||
      category === 'station' ||
      category === 'trainInfo' ||
      category === 'trainsBetween';

    if (isStatic) {
      const tier = (options?.tier || 'tier1').toLowerCase();
      if (!this.canMakeStaticRequest(tier)) {
        logger.debug(
          `[RequestBudgetTracker] Static budget limit reached for ${tier} (${(this.tierUsed[tier] || 0) + (this.tierReserved[tier] || 0)}/${this.tierLimits[tier] || this.maxStaticRequests}). Reservation rejected.`
        );
        return null;
      }
      this.staticReserved++;
      this.tierReserved[tier] = (this.tierReserved[tier] || 0) + 1;

      let finalized = false;
      return {
        commit: () => {
          if (finalized) return;
          finalized = true;
          this.staticReserved = Math.max(0, this.staticReserved - 1);
          this.staticRequestsUsed++;
          this.tierReserved[tier] = Math.max(0, (this.tierReserved[tier] || 1) - 1);
          this.tierUsed[tier] = (this.tierUsed[tier] || 0) + 1;
        },
        release: () => {
          if (finalized) return;
          finalized = true;
          this.staticReserved = Math.max(0, this.staticReserved - 1);
          this.tierReserved[tier] = Math.max(0, (this.tierReserved[tier] || 1) - 1);
        },
      };
    }

    const isRecovery = category !== 'direct';

    if (isRecovery) {
      if (!this.canMakeRecoveryRequest()) {
        logger.debug(
          `[RequestBudgetTracker] Recovery budget limit reached (${this.recoveryRequestsUsed + this.recoveryReserved}/${this.maxRecoveryRequests}). Reservation rejected.`
        );
        return null;
      }
      this.recoveryReserved++;
    } else {
      if (!this.canMakeDirectRequest()) {
        logger.debug(
          `[RequestBudgetTracker] Direct budget limit reached (${this.directRequestsUsed + this.directReserved}/${this.maxDirectRequests}). Reservation rejected.`
        );
        return null;
      }
      this.directReserved++;
    }

    let finalized = false;
    return {
      commit: () => {
        if (finalized) return;
        finalized = true;
        if (isRecovery) {
          this.recoveryReserved = Math.max(0, this.recoveryReserved - 1);
          this.recoveryRequestsUsed++;
        } else {
          this.directReserved = Math.max(0, this.directReserved - 1);
          this.directRequestsUsed++;
        }
      },
      release: () => {
        if (finalized) return;
        finalized = true;
        if (isRecovery) {
          this.recoveryReserved = Math.max(0, this.recoveryReserved - 1);
        } else {
          this.directReserved = Math.max(0, this.directReserved - 1);
        }
      },
    };
  }

  /**
   * Records an outbound provider request synchronously (legacy support).
   */
  recordOutboundRequest(details = {}) {
    const isRecovery = details.isRecovery !== false;

    if (isRecovery) {
      if (!this.canMakeRecoveryRequest()) {
        logger.debug(
          `[RequestBudgetTracker] Recovery request budget reached (${this.recoveryRequestsUsed}/${this.maxRecoveryRequests}). Ceasing further outbound queries.`
        );
        return false;
      }
      this.recoveryRequestsUsed++;
    } else {
      if (!this.canMakeDirectRequest()) {
        return false;
      }
      this.directRequestsUsed++;
    }

    if (details.queryKey) {
      this.seenQueryKeys.add(details.queryKey);
    }

    return true;
  }

  isDuplicateQuery(queryKey) {
    if (!queryKey) return false;
    if (this.seenQueryKeys.has(queryKey)) {
      this.deduplicatedCount++;
      return true;
    }
    return false;
  }

  recordCacheHit() {
    this.cacheHits++;
  }

  setTerminationReason(reason) {
    if (!this.terminationReason) {
      this.terminationReason = reason;
    }
  }

  getSummary() {
    const summary = {
      correlationId: this.searchCorrelationId,
      maxRecoveryRequests: this.maxRecoveryRequests,
      maxDirectRequests: this.maxDirectRequests,
      maxStaticRequests: this.maxStaticRequests,
      maxTotalRequests: this.maxTotalRequests,
      tierLimits: { ...this.tierLimits },
      tierUsed: { ...this.tierUsed },
      staticRequestsUsed: this.staticRequestsUsed,
      directRequestsUsed: this.directRequestsUsed,
      recoveryRequestsUsed: this.recoveryRequestsUsed,
      totalRequestsUsed: this.totalRequestsUsed + this.staticRequestsUsed,
      directReserved: this.directReserved,
      recoveryReserved: this.recoveryReserved,
      staticReserved: this.staticReserved,
      totalReserved: this.totalReserved + this.staticReserved,
      remainingRecoveryRequests: this.remainingRecoveryRequests,
      remainingDirectRequests: this.remainingDirectRequests,
      remainingStaticRequests: Math.max(0, this.maxStaticRequests - (this.staticRequestsUsed + this.staticReserved)),
      cacheHits: this.cacheHits,
      deduplicatedCount: this.deduplicatedCount,
      isBudgetExhausted: !this.canMakeRecoveryRequest(),
      terminationReason: this.terminationReason || 'COMPLETED',
    };
    logger.info(
      `[RequestBudgetTracker] Per-Search Request Summary: totalUsed=${summary.totalRequestsUsed} (direct=${summary.directRequestsUsed}, recovery=${summary.recoveryRequestsUsed}, static=${summary.staticRequestsUsed} [T1:${this.tierUsed.tier1}, T2:${this.tierUsed.tier2}, T3:${this.tierUsed.tier3}], cacheHits=${summary.cacheHits}, deduplicated=${summary.deduplicatedCount})`
    );
    return summary;
  }
}

export default RequestBudgetTracker;
