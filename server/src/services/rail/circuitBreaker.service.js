/**
 * Action-level Circuit Breaker Service (P5 Resilience)
 *
 * Protects provider quota and user experience:
 * If 3 of the first 5 availability calls for an action fail with TRANSIENT or AUTH_QUOTA,
 * the circuit breaker trips for that action:
 * - Stops issuing further live availability calls for that action.
 * - Marks the action budget as partial=true.
 * - Sets providerNotice = "Seat data is slow right now - showing last known results where available".
 * - Any failure cached during this period is limited to at most 30 seconds.
 */

import logger from '../../utils/logger.js';
import { ERROR_CLASS } from '../../utils/errorClassifier.js';

export class ActionCircuitBreakerService {
  constructor() {
    // actionId -> { callCount, failureCount, isOpen, providerNotice, trippedAt }
    this._actions = new Map();
  }

  /**
   * Records the outcome of an availability call under this action.
   *
   * @param {string} actionId
   * @param {object} outcome
   * @param {string} outcome.errorClass - TRANSIENT | AUTH_QUOTA | NOT_BOOKABLE | PARAM | null
   * @param {boolean} outcome.success
   * @returns {{ isOpen: boolean, justTripped: boolean }}
   */
  recordCallOutcome(actionId, { errorClass, success = false } = {}) {
    if (!actionId) return { isOpen: false, justTripped: false };

    let state = this._actions.get(actionId);
    if (!state) {
      state = {
        callCount: 0,
        failureCount: 0,
        isOpen: false,
        providerNotice: null,
        trippedAt: null,
      };
      this._actions.set(actionId, state);
    }

    if (state.isOpen) {
      return { isOpen: true, justTripped: false };
    }

    state.callCount++;

    // Only count against breaker within the first 5 calls
    if (state.callCount <= 5) {
      if (
        !success &&
        (errorClass === ERROR_CLASS.TRANSIENT || errorClass === ERROR_CLASS.AUTH_QUOTA)
      ) {
        state.failureCount++;
      }

      if (state.failureCount >= 3) {
        state.isOpen = true;
        state.trippedAt = Date.now();
        state.providerNotice = 'Seat data is slow right now - showing last known results where available';
        logger.warn(`[CircuitBreaker] Breaker TRIPPED for actionId=${actionId}: 3 of first 5 calls failed (${state.failureCount}/${state.callCount}). Halting further availability calls.`);
        return { isOpen: true, justTripped: true, notice: state.providerNotice };
      }
    }

    return { isOpen: false, justTripped: false, notice: state.providerNotice };
  }

  /**
   * Checks whether the breaker is open for this action.
   *
   * @param {string} actionId
   * @returns {boolean}
   */
  isOpen(actionId) {
    if (!actionId) return false;
    const state = this._actions.get(actionId);
    return Boolean(state && state.isOpen);
  }

  /**
   * Gets provider notice if breaker is open.
   *
   * @param {string} actionId
   * @returns {string|null}
   */
  getProviderNotice(actionId) {
    if (!actionId) return null;
    return this._actions.get(actionId)?.providerNotice || null;
  }

  /**
   * Clears state for an action (or all actions).
   */
  reset(actionId) {
    if (actionId) {
      this._actions.delete(actionId);
    } else {
      this._actions.clear();
    }
  }
}

export const circuitBreakerService = new ActionCircuitBreakerService();
export default circuitBreakerService;
