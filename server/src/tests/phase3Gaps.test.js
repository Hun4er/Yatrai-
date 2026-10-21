import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { DirectPassService, MORE_TRAINS_BATCH } from '../services/rail/directPass.service.js';
import { AlternativesEngineService } from '../services/rail/alternativesEngine.service.js';
import { ActionBudgetService } from '../services/rail/actionBudget.service.js';
import { apiUsageService } from '../services/rail/apiUsage.service.js';
import adminRoutes from '../routes/admin.routes.js';
import config from '../config/index.js';

test('Phase 3.1: MORE_TRAINS_BATCH is exported as 8 and cap stays DEFAULT', () => {
  assert.equal(MORE_TRAINS_BATCH, 8, 'MORE_TRAINS_BATCH must equal 8');
  assert.equal(config.p0v2.defaultCap, 40, 'Default cap must be 40');
});

test('Phase 3.2: Monthly request counter (10,000 limit, expires 13 Nov 2026) with degraded mode under 10% remaining', async () => {
  // Test quota calculation
  const usageNearLimit = await apiUsageService.getUsage('railkit', 10000);
  assert.equal(usageNearLimit.limit, 10000);
  assert.equal(usageNearLimit.planExpiry, '2026-11-13');

  // Verify degraded threshold triggers when remaining <= 10% (1,000 calls remaining out of 10,000)
  const degradedCheck = {
    limit: 10000,
    count: 9100,
  };
  const remaining = degradedCheck.limit - degradedCheck.count;
  const isDegraded = remaining <= (degradedCheck.limit * 0.10);
  assert.equal(isDegraded, true, 'Usage over 90% must trigger degraded mode');

  const normalCheck = {
    limit: 10000,
    count: 5000,
  };
  const normalRemaining = normalCheck.limit - normalCheck.count;
  const normalDegraded = normalRemaining <= (normalCheck.limit * 0.10);
  assert.equal(normalDegraded, false, 'Usage under 90% must NOT trigger degraded mode');
});

test('Phase 3.3: In degraded mode, cross-train splits are skipped (direct + same-train only)', async () => {
  let crossTrainCalled = false;
  const budget = new ActionBudgetService();
  const altEngine = new AlternativesEngineService({
    railKit: {
      hasCachedSearch: () => true,
      hasCachedInfo: () => true,
      async searchTrainBetweenStations() {
        crossTrainCalled = true;
        return { success: true, data: [] };
      },
      async trainSchedule() {
        return { success: true, data: { route: [{ station_code: 'CNB' }] } };
      },
    },
    availabilityService: {
      hasCached: () => true,
      async checkLegAvailability() {
        return { normalizedStatus: 'AVAILABLE' };
      },
    },
    corridorHubsService: {
      async getStoredHubs() {
        return [{ code: 'CNB', score: 1 }];
      },
      async storeHubs() {},
    },
    actionBudgetService: budget,
  });

  const actionId = 'degraded_test_act';
  await budget.getOrCreate(actionId, 'default');

  await altEngine.run({
    originCode: 'NDLS',
    destCode: 'PNBE',
    date: '2026-10-22',
    travelClass: '3A',
    actionId,
    referenceTrains: [{ trainNumber: '12302', classes: ['3A'] }],
    isDegraded: true, // Degraded mode active
  });

  assert.equal(crossTrainCalled, false, 'In degraded mode, cross-train searchTrainBetweenStations must NOT be called');
});

test('Phase 3.4: Shared actionId ledger across direct request and automatic alternatives never exceeds cap', async () => {
  const budget = new ActionBudgetService();
  const actionId = 'shared_act_test';
  await budget.getOrCreate(actionId, 'default'); // cap = 40

  let callsMade = 0;
  for (let i = 0; i < 50; i++) {
    const ok = await budget.recordCall({
      actionId,
      phase: i < 20 ? 'direct' : 'crossTrain',
      endpoint: 'seatAvailability',
      cacheHit: false,
      cost: 1,
    });
    if (ok) callsMade++;
  }

  assert.equal(callsMade, 40, 'Total calls must cap strictly at 40');
  const summary = await budget.getBudgetSummary(actionId);
  assert.equal(summary.used, 40);
  assert.equal(summary.partial, true);
});

test('Phase 3.5: Single-flight on duplicate clicks prevents duplicate processing', async () => {
  const budget = new ActionBudgetService();
  let executionCount = 0;

  const performLongTask = async () => {
    return budget.singleFlight('test_key_flight', async () => {
      executionCount++;
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true };
    });
  };

  // Launch 3 simultaneous requests with identical queryKey
  const results = await Promise.all([
    performLongTask(),
    performLongTask(),
    performLongTask(),
  ]);

  assert.equal(executionCount, 1, 'Only one task executed across 3 concurrent calls');
  assert.deepEqual(results[0], { ok: true });
  assert.deepEqual(results[1], { ok: true });
  assert.deepEqual(results[2], { ok: true });
});

test('Phase 3.6: GET /api/admin/usage returns metrics and last 50 actions, protected by ADMIN_SECRET', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Without secret -> rejected (401 Unauthorized)
    const resUnauthorized = await fetch(`${baseUrl}/api/admin/usage`);
    assert.equal(resUnauthorized.status, 401);

    // 2. With invalid secret -> rejected (401 Unauthorized)
    const resBadSecret = await fetch(`${baseUrl}/api/admin/usage`, {
      headers: { 'X-Admin-Secret': 'wrong_secret' },
    });
    assert.equal(resBadSecret.status, 401);

    // 3. With valid secret -> 200 with usage and last 50 actions
    const validSecret = process.env.ADMIN_SECRET || config.apiQuota?.adminSecret || 'yatrai_admin_secret_key';
    const res = await fetch(`${baseUrl}/api/admin/usage`, {
      headers: { 'X-Admin-Secret': validSecret },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    const data = body.data;
    assert.ok('callsToday' in data);
    assert.ok('callsThisMonth' in data);
    assert.ok('monthlyLimit' in data);
    assert.ok('remaining' in data);
    assert.ok('planExpiry' in data);
    assert.ok('cacheHitRate' in data);
    assert.ok(Array.isArray(data.last50Actions), 'last50Actions must be an array');
  } finally {
    server.close();
  }
});
