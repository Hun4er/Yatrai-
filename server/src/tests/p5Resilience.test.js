import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyError, ERROR_CLASS, NOT_BOOKABLE_REASONS } from '../utils/errorClassifier.js';
import { ActionCircuitBreakerService } from '../services/rail/circuitBreaker.service.js';
import { RailKitAdapter } from '../providers/rail/railKit.adapter.js';
import { AvailabilityService } from '../services/rail/availability.service.js';
import { RequestBudgetTracker } from '../services/rail/requestBudget.js';

describe('Phase 4 — P5 Resilience Verification Suite', () => {

  // ── 1. Error Classification Table ───────────────────────────────────────────
  describe('1. Error Classification Table', () => {
    it('classifies 429, 5xx, timeouts, and network errors as TRANSIENT', () => {
      assert.equal(classifyError({ status: 429 }).errorClass, ERROR_CLASS.TRANSIENT);
      assert.equal(classifyError({ status: 500 }).errorClass, ERROR_CLASS.TRANSIENT);
      assert.equal(classifyError({ status: 502 }).errorClass, ERROR_CLASS.TRANSIENT);
      assert.equal(classifyError({ status: 503 }).errorClass, ERROR_CLASS.TRANSIENT);
      assert.equal(classifyError({ status: 504 }).errorClass, ERROR_CLASS.TRANSIENT);
      assert.equal(classifyError({ error: new Error('ETIMEDOUT: Connection timed out') }).errorClass, ERROR_CLASS.TRANSIENT);
      assert.equal(classifyError({ error: new Error('ECONNRESET: Connection reset') }).errorClass, ERROR_CLASS.TRANSIENT);
      assert.equal(classifyError({ error: new Error('fetch failed') }).errorClass, ERROR_CLASS.TRANSIENT);
    });

    it('classifies NOT_BOOKABLE domain conditions with specific reason codes', () => {
      const c1 = classifyError({ body: 'CHART PREPARED' });
      assert.equal(c1.errorClass, ERROR_CLASS.NOT_BOOKABLE);
      assert.equal(c1.reason, NOT_BOOKABLE_REASONS.CHART_PREPARED);

      const c2 = classifyError({ body: 'TRAIN DEPARTED from origin' });
      assert.equal(c2.errorClass, ERROR_CLASS.NOT_BOOKABLE);
      assert.equal(c2.reason, NOT_BOOKABLE_REASONS.TRAIN_DEPARTED);

      const c3 = classifyError({ body: 'BOOKING NOT OPEN for selected date' });
      assert.equal(c3.errorClass, ERROR_CLASS.NOT_BOOKABLE);
      assert.equal(c3.reason, NOT_BOOKABLE_REASONS.BOOKING_NOT_OPEN);

      const c4 = classifyError({ body: 'REGRET / CANNOT BOOK' });
      assert.equal(c4.errorClass, ERROR_CLASS.NOT_BOOKABLE);
      assert.equal(c4.reason, NOT_BOOKABLE_REASONS.BOOKING_CLOSED);

      const c5 = classifyError({ body: 'CLASS NOT OFFERED ON THIS TRAIN' });
      assert.equal(c5.errorClass, ERROR_CLASS.NOT_BOOKABLE);
      assert.equal(c5.reason, NOT_BOOKABLE_REASONS.CLASS_NOT_OFFERED);
    });

    it('classifies 400 and 404 as PARAM error', () => {
      assert.equal(classifyError({ status: 400 }).errorClass, ERROR_CLASS.PARAM);
      assert.equal(classifyError({ status: 404 }).errorClass, ERROR_CLASS.PARAM);
    });

    it('classifies 401, 403, and quota errors as AUTH_QUOTA', () => {
      assert.equal(classifyError({ status: 401 }).errorClass, ERROR_CLASS.AUTH_QUOTA);
      assert.equal(classifyError({ status: 403 }).errorClass, ERROR_CLASS.AUTH_QUOTA);
      assert.equal(classifyError({ error: new Error('MONTHLY_QUOTA_EXHAUSTED') }).errorClass, ERROR_CLASS.AUTH_QUOTA);
    });
  });

  // ── 2. Retry Counts & Reserve Enforcement ───────────────────────────────────
  describe('2. Retry Counts & Cap/Reserve Enforcement', () => {
    it('retries TRANSIENT errors at most 2 times (3 total attempts)', async () => {
      let callCount = 0;
      const mockFetch = async () => {
        callCount++;
        const err = new Error('Gateway Timeout');
        err.status = 504;
        throw err;
      };

      const adapter = new RailKitAdapter({ fetchFn: mockFetch, disablePersistentCache: true });
      const tracker = new RequestBudgetTracker();
      const res = await adapter.getAvailability('12310', 'NDLS', 'PNBE', '2026-11-15', '3A', 'GN', {
        budgetTracker: tracker,
      });

      assert.equal(callCount, 3, 'Initial call + 2 retries = 3 calls total');
      assert.equal(res.status, 'error');
    });

    it('stops retry when budget cap or reserve is empty and marks check FAILED', async () => {
      let callCount = 0;
      const mockFetch = async () => {
        callCount++;
        const err = new Error('503 Service Unavailable');
        err.status = 503;
        throw err;
      };

      const adapter = new RailKitAdapter({ fetchFn: mockFetch, disablePersistentCache: true });
      const tracker = new RequestBudgetTracker({ maxDirectRequests: 1, maxRecoveryRequests: 0 });
      const res = await adapter.getAvailability('12310', 'NDLS', 'PNBE', '2026-11-15', '3A', 'GN', {
        budgetTracker: tracker,
        isRecovery: false,
      });

      assert.equal(callCount, 1, 'Retry must halt when reserve is empty');
      assert.equal(res.status, 'error');
    });
  });

  // ── 3. Adaptive Concurrency Halving on 429 ──────────────────────────────────
  describe('3. Adaptive Concurrency', () => {
    it('starts at 4 and halves concurrency on HTTP 429 down to minimum 1', async () => {
      const adapter = new RailKitAdapter({ disablePersistentCache: true });
      assert.equal(adapter._maxConcurrent, 4, 'Default concurrency starts at 4');

      let callCount = 0;
      adapter._fetchFn = async () => {
        callCount++;
        const err = new Error('Too Many Requests');
        err.status = 429;
        throw err;
      };

      await adapter.getAvailability('12310', 'NDLS', 'PNBE', '2026-11-15', '3A', 'GN').catch(() => {});
      assert.equal(adapter._maxConcurrent, 1, 'Concurrency halved on 429 down to min 1');
    });
  });

  // ── 4. Circuit Breaker ──────────────────────────────────────────────────────
  describe('4. Circuit Breaker per Action', () => {
    it('trips after 3 of first 5 availability calls fail with TRANSIENT/AUTH_QUOTA', () => {
      const cb = new ActionCircuitBreakerService();
      const actionId = 'action_test_cb_1';

      // 1st call fails
      const r1 = cb.recordCallOutcome(actionId, { errorClass: ERROR_CLASS.TRANSIENT, success: false });
      assert.equal(r1.isOpen, false);

      // 2nd call succeeds
      const r2 = cb.recordCallOutcome(actionId, { errorClass: null, success: true });
      assert.equal(r2.isOpen, false);

      // 3rd call fails
      const r3 = cb.recordCallOutcome(actionId, { errorClass: ERROR_CLASS.TRANSIENT, success: false });
      assert.equal(r3.isOpen, false);

      // 4th call fails -> 3 failures in first 4 calls! Trips circuit breaker!
      const r4 = cb.recordCallOutcome(actionId, { errorClass: ERROR_CLASS.AUTH_QUOTA, success: false });
      assert.equal(r4.isOpen, true, 'Circuit breaker must open after 3 failures in first 5 calls');
      assert.ok(r4.notice.includes('slow'), 'Returns providerNotice when tripped');

      // Subsequent calls are blocked
      assert.equal(cb.isOpen(actionId), true);
    });
  });

  // ── 5. Stale-While-Error 24h Store ──────────────────────────────────────────
  describe('5. Stale-While-Error 24h Store', () => {
    it('returns 24h cached availability with state STALE and tier OLDER_RESULT on TRANSIENT error', async () => {
      const mockSuccessAdapter = {
        getAvailability: async () => ({
          success: true,
          status: 'ok',
          normalizedStatus: 'AVAILABLE',
          statusText: 'AVL 12',
          seatsAvailable: 12,
          fare: { totalFare: 1450 },
        }),
      };

      const availService = new AvailabilityService({ railKit: mockSuccessAdapter });

      // 1. Initial successful call caches in 24h stale store
      const initial = await availService.checkLegAvailability({
        trainNumber: '12310',
        fromCode: 'NDLS',
        toCode: 'PNBE',
        date: '2026-11-15',
        travelClass: '3A',
        quota: 'GN',
      });
      assert.equal(initial.normalizedStatus, 'AVAILABLE');

      // 2. Clear 90s short cache to simulate next search
      availService.cache.clear();

      // 3. Provider fails with TRANSIENT 503 error
      const mockFailingAdapter = {
        getAvailability: async () => {
          const err = new Error('503 Service Unavailable');
          err.status = 503;
          throw err;
        },
      };
      availService._railKit = mockFailingAdapter;

      const fallback = await availService.checkLegAvailability({
        trainNumber: '12310',
        fromCode: 'NDLS',
        toCode: 'PNBE',
        date: '2026-11-15',
        travelClass: '3A',
        quota: 'GN',
      });

      assert.equal(fallback.state, 'STALE');
      assert.equal(fallback.tier, 'OLDER_RESULT');
      assert.equal(fallback.isStale, true);
      assert.ok(fallback.checkedAt);
      assert.notEqual(fallback.tier, 'CONFIRMED', 'Stale is excluded from CONFIRMED/guaranteed tier');
    });
  });

  // ── 6. NOT_BOOKABLE Domain State ───────────────────────────────────────────
  describe('6. NOT_BOOKABLE Domain State', () => {
    it('stores NOT_BOOKABLE as normal result with specific reason code, not error', async () => {
      const mockNotBookableAdapter = {
        getAvailability: async () => {
          const err = new Error('CHART PREPARED');
          err.body = 'CHART PREPARED';
          throw err;
        },
      };

      const availService = new AvailabilityService({ railKit: mockNotBookableAdapter });
      const res = await availService.checkLegAvailability({
        trainNumber: '12310',
        fromCode: 'NDLS',
        toCode: 'PNBE',
        date: '2026-11-15',
        travelClass: '3A',
        quota: 'GN',
      });

      assert.equal(res.success, true, 'NOT_BOOKABLE is domain state, not an API crash');
      assert.equal(res.normalizedStatus, 'NOT_BOOKABLE');
      assert.equal(res.reason, NOT_BOOKABLE_REASONS.CHART_PREPARED);
      assert.equal(res.statusText, 'Chart prepared');
    });
  });

  // ── 7. Destination Notice Logic ─────────────────────────────────────────────
  describe('7. Destination Notice Code Comparison', () => {
    const KNOWN_CODES = {
      'NEW DELHI': 'NDLS',
      'DELHI': 'NDLS',
      'PATNA': 'PNBE',
      'PATNA JN': 'PNBE',
    };

    function shouldShowNotice(trainTo, requestedDestination, requestedDestinationName) {
      const resolvedTarget = KNOWN_CODES[String(requestedDestination || '').toUpperCase().trim()] || requestedDestination;
      const trainToCode = String(trainTo || '').toUpperCase().trim();
      return Boolean(resolvedTarget && trainToCode && trainToCode !== resolvedTarget);
    }

    it('shows NO notice for NDLS vs "New Delhi" or NDLS vs NDLS', () => {
      assert.equal(shouldShowNotice('NDLS', 'New Delhi'), false);
      assert.equal(shouldShowNotice('NDLS', 'NDLS'), false);
    });

    it('shows notice for DNR vs PNBE and RJPB vs PNBE', () => {
      assert.equal(shouldShowNotice('DNR', 'PNBE'), true);
      assert.equal(shouldShowNotice('RJPB', 'PNBE'), true);
      assert.equal(shouldShowNotice('DNR', 'Patna'), true);
    });
  });
});
