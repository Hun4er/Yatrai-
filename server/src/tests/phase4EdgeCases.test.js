import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import journeyV2Routes from '../routes/journeyV2.routes.js';
import { DirectPassService } from '../services/rail/directPass.service.js';
import { AlternativesEngineService } from '../services/rail/alternativesEngine.service.js';
import { ActionBudgetService } from '../services/rail/actionBudget.service.js';
import { formatInIST } from '../utils/railwayTime.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v2/journeys', journeyV2Routes);
  return app;
}

test('Phase 4.1: Date Validations — Past date, >120 day ARP, and invalid string', async () => {
  const app = createTestApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v2/journeys/search`;

  try {
    // 1. Past date
    const resPast = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionId: 'test_past_date_' + Date.now(),
        origins: ['NDLS'],
        destinations: ['PNBE'],
        date: '2020-01-01',
      }),
    });
    const bodyPast = await resPast.json();
    assert.equal(resPast.status, 400, 'Past date must return HTTP 400');
    assert.equal(bodyPast.success, false);
    assert.equal(bodyPast.error?.code, 'PAST_DATE');

    // 2. Beyond 120-day ARP limit
    const resFar = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionId: 'test_far_date_' + Date.now(),
        origins: ['NDLS'],
        destinations: ['PNBE'],
        date: '2028-01-01',
      }),
    });
    const bodyFar = await resFar.json();
    assert.equal(resFar.status, 400, 'Date beyond 120 days must return HTTP 400');
    assert.equal(bodyFar.success, false);
    assert.equal(bodyFar.error?.code, 'ADVANCE_BOOKING_EXCEEDED');

    // 3. Invalid date string
    const resInvalid = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionId: 'test_invalid_date_' + Date.now(),
        origins: ['NDLS'],
        destinations: ['PNBE'],
        date: 'not-a-valid-date',
      }),
    });
    const bodyInvalid = await resInvalid.json();
    assert.equal(resInvalid.status, 400, 'Malformed date must return HTTP 400');
    assert.equal(bodyInvalid.success, false);
    assert.equal(bodyInvalid.error?.code, 'INVALID_DATE_FORMAT');
  } finally {
    server.close();
  }
});

test('Phase 4.2: Station resolution rejects unresolvable stations with 400 STATION_NOT_FOUND', async () => {
  const app = createTestApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v2/journeys/search`;

  try {
    const today = formatInIST(new Date()).localDate;
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionId: 'test_unknown_station_' + Date.now(),
        origins: [],
        destinations: ['PNBE'],
        date: today,
      }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error?.code, 'STATION_NOT_FOUND');
  } finally {
    server.close();
  }
});

test('Phase 4.3: Today travel date filters out already departed trains but retains future departures', async () => {
  const today = formatInIST(new Date()).localDate;
  const budget = new ActionBudgetService();
  const actionId = 'test_departed_' + Date.now();
  await budget.getOrCreate(actionId, 'default');

  const directPass = new DirectPassService({
    railKit: {
      hasCachedSearch: () => false,
      searchTrainBetweenStations: async () => ({
        success: true,
        data: [
          {
            train_number: '12345',
            name: 'Past Train',
            departureTime: '00:01', // already departed early this morning
            classes: ['3A'],
          },
          {
            train_number: '12346',
            name: 'Future Train',
            departureTime: '23:59', // departing late tonight
            classes: ['3A'],
          },
        ],
      }),
    },
    availabilityService: {
      hasCached: () => false,
      checkLegAvailability: async () => ({
        normalizedStatus: 'AVAILABLE',
        statusText: 'AVAILABLE 12',
        predictionPercentage: 100,
      }),
    },
    cancelledTrainsService: {
      hasCached: () => true,
      getCancelledTrains: async () => new Set(),
    },
    actionBudgetService: budget,
  });

  const res = await directPass.run({
    origins: ['NDLS'],
    destinations: ['PNBE'],
    date: today,
    travelClass: '3A',
    quota: 'GN',
    actionId,
  });

  // Only the future train (departing 23:59) should be retained
  assert.equal(res.direct.length, 1, 'Only non-departed train should be returned');
  assert.equal(res.direct[0].trainNumber, '12346');
  assert.equal(res.direct[0].trainName, 'Future Train');
});

test('Phase 4.4: Graceful handling when no trains are found on the route', async () => {
  const budget = new ActionBudgetService();
  const actionId = 'test_no_trains_' + Date.now();
  await budget.getOrCreate(actionId, 'default');

  const directPass = new DirectPassService({
    railKit: {
      hasCachedSearch: () => false,
      searchTrainBetweenStations: async () => ({
        success: true,
        data: [], // empty route data
      }),
    },
    availabilityService: {
      hasCached: () => false,
      checkLegAvailability: async () => null,
    },
    cancelledTrainsService: {
      hasCached: () => true,
      getCancelledTrains: async () => new Set(),
    },
    actionBudgetService: budget,
  });

  const res = await directPass.run({
    origins: ['XYZ'],
    destinations: ['ABC'],
    date: '2026-10-30',
    travelClass: 'ANY',
    quota: 'GN',
    actionId,
  });

  assert.equal(res.direct.length, 0);
  assert.equal(res.waitingTrains.length, 0);
  assert.equal(res.noTrainsFound, true);
  assert.equal(res.allCancelled, false);
  assert.equal(res.partial, false);
  assert.match(res.message, /No direct trains found/i);
});

test('Phase 4.5: Graceful handling when all trains on the route are cancelled', async () => {
  const budget = new ActionBudgetService();
  const actionId = 'test_all_cancelled_' + Date.now();
  await budget.getOrCreate(actionId, 'default');

  const directPass = new DirectPassService({
    railKit: {
      hasCachedSearch: () => false,
      searchTrainBetweenStations: async () => ({
        success: true,
        data: [
          { train_number: '12391', name: 'Shramjeevi Exp', departureTime: '13:10', classes: ['3A', 'SL'] },
          { train_number: '12392', name: 'Magadh Exp', departureTime: '20:00', classes: ['3A', 'SL'] },
        ],
      }),
    },
    availabilityService: {
      hasCached: () => false,
      checkLegAvailability: async () => null,
    },
    cancelledTrainsService: {
      hasCached: () => true,
      getCancelledTrains: async () => new Set(['12391', '12392']), // all cancelled
    },
    actionBudgetService: budget,
  });

  const res = await directPass.run({
    origins: ['NDLS'],
    destinations: ['PNBE'],
    date: '2026-10-30',
    travelClass: 'ANY',
    quota: 'GN',
    actionId,
  });

  assert.equal(res.direct.length, 0);
  assert.equal(res.allCancelled, true);
  assert.equal(res.noTrainsFound, false);
  assert.equal(res.cancelledFilter?.count, 2);
  assert.match(res.message, /All direct trains on this route are cancelled/i);
});

test('Phase 4.6: RailKit 429 & 5xx provider errors return partial: true and providerNotice without crashing', async () => {
  const budget = new ActionBudgetService();
  const actionId = 'test_provider_error_' + Date.now();
  await budget.getOrCreate(actionId, 'default');

  const directPass = new DirectPassService({
    railKit: {
      hasCachedSearch: () => false,
      searchTrainBetweenStations: async () => {
        const err = new Error('RailKit HTTP 429 Rate Limit Exceeded');
        err.status = 429;
        throw err;
      },
    },
    availabilityService: {
      hasCached: () => false,
      checkLegAvailability: async () => null,
    },
    cancelledTrainsService: {
      hasCached: () => true,
      getCancelledTrains: async () => new Set(),
    },
    actionBudgetService: budget,
  });

  const res = await directPass.run({
    origins: ['NDLS'],
    destinations: ['PNBE'],
    date: '2026-10-30',
    travelClass: 'ANY',
    quota: 'GN',
    actionId,
  });

  assert.equal(res.partial, true, 'Provider 429 must set partial: true');
  assert.equal(res.hadProviderError, true);
  assert.ok(res.providerNotice, 'Provider notice must be set');
  assert.match(res.providerNotice, /high traffic|temporary delay|provider/i);
});

test('Phase 4.7: AlternativesEngine _checkAvailMemo gracefully handles provider exceptions', async () => {
  const budget = new ActionBudgetService();
  const actionId = 'test_alt_err_' + Date.now();
  await budget.getOrCreate(actionId, 'default');

  const altEngine = new AlternativesEngineService({
    railKit: {
      hasCachedSearch: () => false,
    },
    availabilityService: {
      hasCached: () => false,
      checkLegAvailability: async () => {
        const err = new Error('RailKit HTTP 503 Service Unavailable');
        err.status = 503;
        throw err;
      },
    },
    actionBudgetService: budget,
  });

  // Calling _checkAvailMemo directly
  const result = await altEngine._checkAvailMemo('12309', 'NDLS', 'CNB', '3A', '2026-10-30', 'GN', actionId, 'sameTrain', budget);
  assert.equal(result, null, 'Failed availability check must return null and not throw');
});
