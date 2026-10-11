import config from '../../config/index.js';
import logger from '../../utils/logger.js';

/**
 * RequestBudgetTracker
 *
 * Enforces Section 6: Low-API-Request Strategy
 * - Strictly bounds external provider requests per search session
 * - Tracks direct and recovery requests separately while capping total combined requests
 * - Tracks cache hits and deduplicated calls
 * - Stops graph expansion gracefully when the recovery budget is exhausted
 */
export class RequestBudgetTracker {
  constructor(options = {}) {
    const recoveryConfig = config.railRecovery || {};

    this.maxRecoveryRequests = Number(
      options.maxRecoveryRequests ??
        options.recoveryBudget ??
        recoveryConfig.maxRecoveryRequests ??
        10
    );
    this.maxDirectRequests = Number(
      options.maxDirectRequests ??
        options.directBudget ??
        6
    );
    this.maxTotalRequests = Number(
      options.maxTotalRequests ??
        options.totalBudget ??
        recoveryConfig.maxTotalRequests ??
        16
    );

    this.directRequestsUsed = 0;
    this.recoveryRequestsUsed = 0;
    this.cacheHits = 0;
    this.deduplicatedCount = 0;
    this.seenQueryKeys = new Set();
    this.terminationReason = null;
    this.searchCorrelationId = options.correlationId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  /**
   * Total outbound provider calls used across direct and recovery phases.
   */
  get totalRequestsUsed() {
    return this.directRequestsUsed + this.recoveryRequestsUsed;
  }

  /**
   * Remaining recovery request budget.
   */
  get remainingRecoveryRequests() {
    const recoveryRemaining = Math.max(0, this.maxRecoveryRequests - this.recoveryRequestsUsed);
    const totalRemaining = Math.max(0, this.maxTotalRequests - this.totalRequestsUsed);
    return Math.min(recoveryRemaining, totalRemaining);
  }

  /**
   * Checks whether another recovery request is allowed within the budget.
   */
  canMakeRecoveryRequest() {
    if (this.recoveryRequestsUsed >= this.maxRecoveryRequests) {
      if (!this.terminationReason) {
        this.terminationReason = 'RECOVERY_BUDGET_EXHAUSTED';
      }
      return false;
    }
    if (this.totalRequestsUsed >= this.maxTotalRequests) {
      if (!this.terminationReason) {
        this.terminationReason = 'TOTAL_BUDGET_EXHAUSTED';
      }
      return false;
    }
    return true;
  }

  /**
   * Checks whether another direct request is allowed.
   */
  canMakeDirectRequest() {
    return (
      this.directRequestsUsed < this.maxDirectRequests &&
      this.totalRequestsUsed < this.maxTotalRequests
    );
  }

  /**
   * Records an outbound provider request.
   *
   * @param {Object} [details={}]
   * @param {boolean} [details.isRecovery=true]
   * @param {string} [details.endpoint='']
   * @param {string} [details.queryKey='']
   * @returns {boolean} Whether request was permitted within budget
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

  /**
   * Checks and records a deduplication check.
   *
   * @param {string} queryKey
   * @returns {boolean} True if query was already issued in this session
   */
  isDuplicateQuery(queryKey) {
    if (!queryKey) return false;
    if (this.seenQueryKeys.has(queryKey)) {
      this.deduplicatedCount++;
      return true;
    }
    return false;
  }

  /**
   * Records a cache hit.
   */
  recordCacheHit() {
    this.cacheHits++;
  }

  /**
   * Records an explicit termination reason.
   */
  setTerminationReason(reason) {
    if (!this.terminationReason) {
      this.terminationReason = reason;
    }
  }

  /**
   * Diagnostic summary for observability and response metadata.
   */
  getSummary() {
    return {
      correlationId: this.searchCorrelationId,
      maxRecoveryRequests: this.maxRecoveryRequests,
      maxDirectRequests: this.maxDirectRequests,
      maxTotalRequests: this.maxTotalRequests,
      directRequestsUsed: this.directRequestsUsed,
      recoveryRequestsUsed: this.recoveryRequestsUsed,
      totalRequestsUsed: this.totalRequestsUsed,
      remainingRecoveryRequests: this.remainingRecoveryRequests,
      cacheHits: this.cacheHits,
      deduplicatedCount: this.deduplicatedCount,
      isBudgetExhausted: !this.canMakeRecoveryRequest(),
      terminationReason: this.terminationReason || 'COMPLETED',
    };
  }
}

export default RequestBudgetTracker;
