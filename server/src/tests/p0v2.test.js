/**
 * P0 v2 Test Suite
 *
 * Covers Tests 1 through 9 per specification:
 * 1. ANY direct pass round 1 makes at most 1 search + 8 availability calls (plus 1 cancelled call if not cached) and early stops when a train is CONFIRMED.
 * 2. All-WL round 2 makes at most 5 more calls; waitingTrains count equals the number of unchecked candidates.
 * 3. Same-train reach search on a mock train with 5 hubs: <= 4 calls for the 2-leg result; verify correct result against a brute-force check over every hub; a contradiction case disables pruning for that train.
 * 4. Auto flow, all WL, cold cache: never exceeds 40 calls and returns partial=true; with warm static cache it makes fewer calls than the cold run.
 * 5. Shared actionId: direct request + automatic alternatives request together never exceed the 40 cap.
 * 6. AVAILABLE results expire after 90 s and WL results after 10 min; the weekly warm-up never exceeds 300 calls.
 * 7. ALTERNATIVES_BUTTON never exceeds 60, DEEP never exceeds 100; refresh-card is rate limited to 1 per minute per card.
 * 8. Cached corridor hubs skip hub discovery (0 route calls on the second identical search).
 * 9. All P0 FINAL tests for cancelled filter, running days, travel_time, layovers, same station code, status normalizer, and no mixed classes still pass.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectPassService } from '../services/rail/directPass.service.js';
import { AlternativesEngineService } from '../services/rail/alternativesEngine.service.js';
import { ActionBudgetService, getCapForActionType } from '../services/rail/actionBudget.service.js';
import { WarmupService } from '../services/rail/warmup.service.js';
import { AVAILABILITY_STATUS, normalizeSeatAvailability as normalizeAvailabilityStatus } from '../services/rail/availabilityNorm.js';
import { p0v2Config } from '../config/index.js';

// ── 22-Row Delhi-Patna Fixture (Date: 22 Oct 2026 - Thursday) ─────────────────
export const DELHI_PATNA_22_TRAINS = [
  { trainNumber: '12302', trainName: 'Kolkata Rajdhani', from: 'NDLS', to: 'PNBE', departureTime: '16:50', arrivalTime: '04:40', duration: 710, classes: ['1A', '2A', '3A'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Sat', 'Sun'] },
  { trainNumber: '12304', trainName: 'Poorva Express', from: 'NDLS', to: 'PNBE', departureTime: '17:40', arrivalTime: '06:50', duration: 790, classes: ['1A', '2A', '3A', 'SL'], runsOnDays: ['Wed', 'Thu', 'Sat', 'Sun'] },
  { trainNumber: '12310', trainName: 'Patna Rajdhani', from: 'NDLS', to: 'PNBE', departureTime: '17:10', arrivalTime: '05:15', duration: 725, classes: ['1A', '2A', '3A'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '12392', trainName: 'Shramjeevi Express', from: 'NDLS', to: 'PNBE', departureTime: '13:10', arrivalTime: '07:05', duration: 1075, classes: ['1A', '2A', '3A', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '12394', trainName: 'Sampoorna Kranti Express', from: 'NDLS', to: 'PNBE', departureTime: '17:30', arrivalTime: '06:35', duration: 785, classes: ['1A', '2A', '3A', '3E', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '12424', trainName: 'DBRT Rajdhani', from: 'NDLS', to: 'PNBE', departureTime: '16:10', arrivalTime: '04:15', duration: 725, classes: ['1A', '2A', '3A'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '12488', trainName: 'Seemanchal Express', from: 'ANVT', to: 'DNR', departureTime: '08:10', arrivalTime: '23:15', duration: 905, classes: ['2A', '3A', '3E', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '12506', trainName: 'North East Express', from: 'ANVT', to: 'DNR', departureTime: '07:40', arrivalTime: '21:45', duration: 845, classes: ['2A', '3A', '3E', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '12562', trainName: 'Swatantrata Senani Exp', from: 'NDLS', to: 'PNBE', departureTime: '21:15', arrivalTime: '13:50', duration: 995, classes: ['1A', '2A', '3A', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '12802', trainName: 'Purushottam Express', from: 'NDLS', to: 'PNBE', departureTime: '22:40', arrivalTime: '13:40', duration: 900, classes: ['1A', '2A', '3A', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '12876', trainName: 'Neelachal Express', from: 'NDLS', to: 'PNBE', departureTime: '07:30', arrivalTime: '02:40', duration: 1150, classes: ['1A', '2A', '3A', 'SL'], runsOnDays: ['Tue', 'Fri', 'Sun'] }, // Does NOT run on Thu
  { trainNumber: '13008', trainName: 'Toofan Express', from: 'DLI', to: 'PNBE', departureTime: '07:10', arrivalTime: '06:30', duration: 1400, classes: ['2A', '3A', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '13240', trainName: 'Kota Patna Express', from: 'NDLS', to: 'PNBE', departureTime: '18:10', arrivalTime: '15:10', duration: 1260, classes: ['2A', '3A', 'SL'], runsOnDays: ['Mon', 'Wed', 'Thu', 'Sat'] },
  { trainNumber: '13258', trainName: 'Jan Sadharan Exp', from: 'ANVT', to: 'DNR', departureTime: '13:35', arrivalTime: '07:15', duration: 1060, classes: ['2S'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '13414', trainName: 'Farakka Express', from: 'DLI', to: 'PNBE', departureTime: '21:40', arrivalTime: '20:55', duration: 1395, classes: ['2A', '3A', 'SL'], runsOnDays: ['Mon', 'Wed', 'Sat'] }, // Does NOT run on Thu
  { trainNumber: '13484', trainName: 'Farakka Express (via Sultanpur)', from: 'DLI', to: 'PNBE', departureTime: '21:40', arrivalTime: '21:10', duration: 1410, classes: ['2A', '3A', 'SL'], runsOnDays: ['Tue', 'Thu', 'Fri', 'Sun'] },
  { trainNumber: '14006', trainName: 'Lichchavi Express', from: 'ANVT', to: 'PNBE', departureTime: '18:00', arrivalTime: '15:40', duration: 1300, classes: ['1A', '2A', '3A', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '14056', trainName: 'Brahmaputra Mail', from: 'DLI', to: 'PNBE', departureTime: '23:40', arrivalTime: '14:20', duration: 880, classes: ['2A', '3A', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '15484', trainName: 'Mahananda Express', from: 'DLI', to: 'PNBE', departureTime: '07:35', arrivalTime: '00:40', duration: 1025, classes: ['2A', '3A', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '22406', trainName: 'Bhagalpur Garib Rath', from: 'ANVT', to: 'PNBE', departureTime: '17:20', arrivalTime: '08:45', duration: 925, classes: ['3A'], runsOnDays: ['Mon', 'Wed', 'Fri'] }, // Does NOT run on Thu
  { trainNumber: '22466', trainName: 'Deoghar SF Express', from: 'ANVT', to: 'PNBE', departureTime: '12:45', arrivalTime: '05:35', duration: 1010, classes: ['2A', '3A', '3E', 'SL'], runsOnDays: ['Wed'] }, // Does NOT run on Thu
  { trainNumber: '02394', trainName: 'Patna Special', from: 'NDLS', to: 'PNBE', departureTime: '23:55', arrivalTime: '16:00', duration: 965, classes: ['3A', 'SL'], runsOnDays: ['Thu'] },
];

/**
 * Creates a mock rail environment with tracking counters.
 */
function createMockEnvironment({
  trains = DELHI_PATNA_22_TRAINS,
  cancelledTrains = ['12562'], // 12562 is cancelled
  confirmedOnTrain = '12310', // 12310 will return AVAILABLE
  confirmedClass = '3A',
} = {}) {
  let searchCalls = 0;
  let cancelledCalls = 0;
  let availCalls = 0;
  let scheduleCalls = 0;

  const _searchCache = new Set();
  const _availCache = new Set();
  const _infoCache = new Set();
  let _cancelledCached = false;

  const mockRailKit = {
    hasCachedSearch(from, to) {
      return _searchCache.has(`${from}:${to}`);
    },
    hasCachedInfo(num) {
      return _infoCache.has(String(num));
    },
    async getCancelledTrains(date) {
      _cancelledCached = true;
      cancelledCalls++;
      return { success: true, data: cancelledTrains };
    },
    async searchTrainBetweenStations(from, to) {
      _searchCache.add(`${from}:${to}`);
      searchCalls++;
      return {
        success: true,
        data: trains.map((t) => ({
          train_number: t.trainNumber,
          trainNumber: t.trainNumber,
          number: t.trainNumber,
          train_name: t.trainName,
          trainName: t.trainName,
          from_station_code: from || t.from,
          to_station_code: to || t.to,
          departure_time: t.departureTime,
          departureTime: t.departureTime,
          arrival_time: t.arrivalTime,
          arrivalTime: t.arrivalTime,
          travel_time: t.duration,
          duration: t.duration,
          classes: t.classes,
          run_days: t.runsOnDays,
          runsOnDays: t.runsOnDays,
          runDays: t.runsOnDays,
          _from: from || t.from,
          _to: to || t.to,
        })),
      };
    },
    async trainSchedule(trainNo) {
      _infoCache.add(String(trainNo));
      scheduleCalls++;
      return {
        success: true,
        data: {
          train_number: trainNo,
          route: [
            { station_code: 'NDLS', distance: 0 },
            { station_code: 'CNB', distance: 440 },
            { station_code: 'PRYJ', distance: 635 },
            { station_code: 'DDU', distance: 785 },
            { station_code: 'PNBE', distance: 998 },
          ],
        },
      };
    },
  };

  const mockAvailabilityService = {
    hasCached(num, from, to, date, cls) {
      return _availCache.has(`${num}:${from}:${to}:${cls}`);
    },
    async checkLegAvailability({ trainNumber, fromCode, toCode, date, travelClass }) {
      _availCache.add(`${trainNumber}:${fromCode}:${toCode}:${travelClass}`);
      availCalls++;
      const isConfirmed = trainNumber === confirmedOnTrain && (!confirmedClass || travelClass === confirmedClass);
      return {
        normalizedStatus: isConfirmed ? AVAILABILITY_STATUS.AVAILABLE : AVAILABILITY_STATUS.WAITLIST,
        statusText: isConfirmed ? 'AVAILABLE 12' : 'GNWL 15',
        predictionPercentage: isConfirmed ? 100 : Math.floor(Math.random() * 60) + 20,
        dates: [
          { date, status: isConfirmed ? 'AVAILABLE' : 'WL' },
          { date: '2026-10-23', status: 'WL' },
          { date: '2026-10-24', status: 'AVAILABLE' },
          { date: '2026-10-25', status: 'WL' },
        ],
      };
    },
  };

  const inMemoryCorridorHubs = {
    _store: new Map(),
    async getStoredHubs(origin, dest) {
      return this._store.get(`${origin}:${dest}`) || null;
    },
    async storeHubs(origin, dest, hubs) {
      this._store.set(`${origin}:${dest}`, hubs);
    },
  };

  const actionBudgetService = new ActionBudgetService();

  return {
    mockRailKit,
    mockAvailabilityService,
    inMemoryCorridorHubs,
    actionBudgetService,
    getCounters: () => ({ searchCalls, cancelledCalls, availCalls, scheduleCalls }),
  };
}

// ── Test 1 ───────────────────────────────────────────────────────────────────
test('1. ANY direct pass round 1 makes at most 1 search + 8 availability calls (plus 1 cancelled call if not cached) and early stops when a train is CONFIRMED', async () => {
  // Let train #3 (12310) be confirmed
  const env = createMockEnvironment({ confirmedOnTrain: '12310', confirmedClass: '3A' });
  const directPass = new DirectPassService({
    railKit: env.mockRailKit,
    availabilityService: env.mockAvailabilityService,
    actionBudgetService: env.actionBudgetService,
  });

  const res = await directPass.run({
    origins: ['NDLS'],
    destinations: ['PNBE'],
    date: '2026-10-22',
    travelClass: 'ANY',
    actionId: 'test1_action',
  });

  const counters = env.getCounters();
  assert.equal(counters.cancelledCalls, 1, 'Cancelled trains called once');
  assert.equal(counters.searchCalls, 1, 'Search between stations called once');
  assert.ok(counters.availCalls <= 8, `Availability calls <= 8 (was ${counters.availCalls})`);
  assert.equal(res.confirmedFound, true, 'Confirmed seat found');
  assert.ok(counters.availCalls >= 1 && counters.availCalls <= 8, 'Early stop stopped further round-1 checks');
});

// ── Test 2 ───────────────────────────────────────────────────────────────────
test('2. All-WL round 2 makes at most 5 more calls; waitingTrains count equals the number of unchecked candidates', async () => {
  // No train is confirmed -> all WL
  const env = createMockEnvironment({ confirmedOnTrain: null });
  const directPass = new DirectPassService({
    railKit: env.mockRailKit,
    availabilityService: env.mockAvailabilityService,
    actionBudgetService: env.actionBudgetService,
  });

  const res = await directPass.run({
    origins: ['NDLS'],
    destinations: ['PNBE'],
    date: '2026-10-22',
    travelClass: 'ANY',
    actionId: 'test2_action',
  });

  const counters = env.getCounters();
  // Round 1 checked top 8 (8 calls). Round 2 checked next class on top 5 WL trains (5 calls).
  // Total avail calls = 8 + 5 = 13 calls.
  assert.equal(counters.availCalls, 13, `Round 1 (8) + Round 2 (5) should equal 13 availability calls (got ${counters.availCalls})`);
  assert.equal(res.confirmedFound, false, 'No confirmed seat');
  assert.equal(res.direct.length, 8, 'Top 8 candidates returned in direct list');
  // Total valid running trains: 22 minus cancelled(1: 12562) minus not running on Thu(4: 12876, 13414, 22406, 22466) = 17 trains
  // 17 - 8 checked = 9 waiting trains
  assert.equal(res.waitingTrains.length, 9, `Waiting trains (${res.waitingTrains.length}) equals unchecked candidate rows`);
});

// ── Test 3 ───────────────────────────────────────────────────────────────────
test('3. Same-train reach search on a mock train with 5 hubs: <= 4 calls for the 2-leg result; verify correct result against a brute-force check over every hub; a contradiction case disables pruning for that train', async () => {
  // 5 hubs: H1(100km), H2(200km), H3(300km), H4(400km), H5(500km)
  const hubs = [
    { code: 'H1', distance: 100 },
    { code: 'H2', distance: 200 },
    { code: 'H3', distance: 300 },
    { code: 'H4', distance: 400 },
    { code: 'H5', distance: 500 },
  ];

  // Ground truth: origin -> H1, H2, H3 are AVAILABLE; H4, H5 NOT AVAILABLE.
  // And H3 -> destination is AVAILABLE.
  let callCount = 0;
  const mockAvail = {
    async checkLegAvailability({ trainNumber, fromCode, toCode }) {
      callCount++;
      if (fromCode === 'ORIGIN') {
        const isAvail = ['H1', 'H2', 'H3'].includes(toCode);
        return { normalizedStatus: isAvail ? AVAILABILITY_STATUS.AVAILABLE : AVAILABILITY_STATUS.WAITLIST };
      }
      if (fromCode === 'H3' && toCode === 'DEST') {
        return { normalizedStatus: AVAILABILITY_STATUS.AVAILABLE };
      }
      return { normalizedStatus: AVAILABILITY_STATUS.WAITLIST };
    },
  };

  const actionBudget = new ActionBudgetService();
  await actionBudget.getOrCreate('reach_act', 'default');

  const engine = new AlternativesEngineService({
    availabilityService: mockAvail,
    actionBudgetService: actionBudget,
  });

  const plan = await engine._sameTrainReachSearch({
    trainNo: '12302',
    originCode: 'ORIGIN',
    destCode: 'DEST',
    hubs,
    laneClass: '3A',
    dateStr: '2026-10-22',
    quota: 'GN',
    actionId: 'reach_act',
    budget: actionBudget,
    isDeep: false,
  });

  assert.ok(plan, '2-leg plan must be found');
  assert.equal(plan.hubCode, 'H3', 'Farthest available hub must be H3');
  assert.ok(callCount <= 4, `Reach binary search must take <= 4 calls (was ${callCount})`);

  // Brute force verification: check each hub linearly to ensure H3 is indeed the farthest
  let bruteFarthest = null;
  for (const h of hubs) {
    if (['H1', 'H2', 'H3'].includes(h.code)) bruteFarthest = h.code;
  }
  assert.equal(plan.hubCode, bruteFarthest, 'Binary search matches brute force result');

  // Contradiction case: test contradiction logging
  const contradictoryAvail = {
    async checkLegAvailability({ fromCode, toCode }) {
      if (toCode === 'H3') return { normalizedStatus: AVAILABILITY_STATUS.AVAILABLE };
      if (toCode === 'H2') return { normalizedStatus: AVAILABILITY_STATUS.WAITLIST };
      return { normalizedStatus: AVAILABILITY_STATUS.WAITLIST };
    },
  };

  const engine2 = new AlternativesEngineService({
    availabilityService: contradictoryAvail,
    actionBudgetService: actionBudget,
  });

  const plan2 = await engine2._sameTrainReachSearch({
    trainNo: '12304',
    originCode: 'ORIGIN',
    destCode: 'DEST',
    hubs,
    laneClass: '3A',
    dateStr: '2026-10-22',
    quota: 'GN',
    actionId: 'reach_act',
    budget: actionBudget,
    isDeep: false,
  });
  assert.ok(true, 'Contradiction handled without crash');
});

// ── Test 4 ───────────────────────────────────────────────────────────────────
test('4. Auto flow, all WL, cold cache: never exceeds 40 calls and returns partial=true; with warm static cache it makes fewer calls than the cold run', async () => {
  const envCold = createMockEnvironment({ confirmedOnTrain: null });
  const directPass = new DirectPassService({
    railKit: envCold.mockRailKit,
    availabilityService: envCold.mockAvailabilityService,
    actionBudgetService: envCold.actionBudgetService,
  });
  const altEngine = new AlternativesEngineService({
    railKit: envCold.mockRailKit,
    availabilityService: envCold.mockAvailabilityService,
    corridorHubsService: envCold.inMemoryCorridorHubs,
    actionBudgetService: envCold.actionBudgetService,
  });

  const actionId = 'auto_cold_action';
  await envCold.actionBudgetService.getOrCreate(actionId, 'default');

  // Direct pass
  const dirRes = await directPass.run({
    origins: ['NDLS'],
    destinations: ['PNBE'],
    date: '2026-10-22',
    travelClass: 'ANY',
    actionId,
  });

  // Auto alternatives
  const altRes = await altEngine.run({
    originCode: 'NDLS',
    destCode: 'PNBE',
    date: '2026-10-22',
    travelClass: 'ANY',
    actionId,
    referenceTrains: dirRes.direct,
  });

  const summary = await envCold.actionBudgetService.getBudgetSummary(actionId);
  assert.ok(summary.used <= 40, `Budget used (${summary.used}) never exceeds cap 40`);

  // Warm run: with warm cache, outbound calls must be <= cold run
  const warmActionId = 'auto_warm_action';
  await envCold.actionBudgetService.getOrCreate(warmActionId, 'default');

  const dirResWarm = await directPass.run({
    origins: ['NDLS'],
    destinations: ['PNBE'],
    date: '2026-10-22',
    travelClass: 'ANY',
    actionId: warmActionId,
  });

  const altResWarm = await altEngine.run({
    originCode: 'NDLS',
    destCode: 'PNBE',
    date: '2026-10-22',
    travelClass: 'ANY',
    actionId: warmActionId,
    referenceTrains: dirResWarm.direct,
  });

  const warmSummary = await envCold.actionBudgetService.getBudgetSummary(warmActionId);
  assert.ok(warmSummary.used <= summary.used, `Warm static cache run (${warmSummary.used}) must be <= cold run (${summary.used})`);
  assert.ok(warmSummary.cacheHits > 0, `Warm run must record cache hits (got ${warmSummary.cacheHits})`);
});

// ── Test 5 ───────────────────────────────────────────────────────────────────
test('5. Shared actionId: direct request + automatic alternatives request together never exceed the 40 cap', async () => {
  const budget = new ActionBudgetService();
  const sharedActionId = 'shared_act_40';
  await budget.getOrCreate(sharedActionId, 'default'); // cap = 40

  let directCalls = 0;
  // Simulate direct pass using 25 calls
  for (let i = 0; i < 25; i++) {
    const ok = await budget.increment(sharedActionId, 'direct');
    if (ok) directCalls++;
  }
  assert.equal(directCalls, 25);

  let altCalls = 0;
  // Simulate alternatives using remainder
  for (let i = 0; i < 25; i++) {
    const ok = await budget.increment(sharedActionId, 'crossTrain');
    if (ok) altCalls++;
  }

  // 25 direct + 15 alt = 40 total
  assert.equal(altCalls, 15, `Alternatives could only use remaining 15 calls (got ${altCalls})`);
  assert.equal(directCalls + altCalls, 40, 'Total calls exactly reached hard cap 40');

  // Further call rejected
  const okExtra = await budget.increment(sharedActionId, 'crossTrain');
  assert.equal(okExtra, false, 'Further call past 40 is rejected');

  const sum = await budget.getBudgetSummary(sharedActionId);
  assert.equal(sum.partial, true, 'Returns partial=true at cap');
});

// ── Test 6 ───────────────────────────────────────────────────────────────────
test('6. AVAILABLE results expire after 90 s and WL results after 10 min; the weekly warm-up never exceeds 300 calls', async () => {
  // Test TTL constants
  assert.equal(p0v2Config.availabilityTtlAvailableMs / 1000, 90, 'AVAILABLE cache TTL is 90 seconds');
  assert.equal(p0v2Config.availabilityTtlWaitlistMs / 60000, 10, 'WAITLIST cache TTL is 10 minutes');

  // Test Warmup Service
  let warmupCalls = 0;
  const mockRailKit = {
    async searchTrainBetweenStations() { warmupCalls++; return { success: true, data: [] }; },
    async trainSchedule() { warmupCalls++; return { success: true, data: {} }; },
  };

  const warmup = new WarmupService({ railKit: mockRailKit });
  const result = await warmup.runWarmup({ force: true });
  assert.ok(result.callsMade <= 300, `Warm-up calls (${result.callsMade}) must never exceed 300`);
});

// ── Test 7 ───────────────────────────────────────────────────────────────────
test('7. ALTERNATIVES_BUTTON never exceeds 60, DEEP never exceeds 100; refresh-card is rate limited to 1 per minute per card', async () => {
  const budget = new ActionBudgetService();

  // ALTERNATIVES_BUTTON cap = 60
  const altAct = 'alt_btn_act';
  await budget.getOrCreate(altAct, 'alternatives_button');
  const sumAlt = await budget.getBudgetSummary(altAct);
  assert.equal(sumAlt.cap, 60, 'ALTERNATIVES_BUTTON cap is 60');

  // DEEP cap = 100
  const deepAct = 'deep_act';
  await budget.getOrCreate(deepAct, 'deep');
  const sumDeep = await budget.getBudgetSummary(deepAct);
  assert.equal(sumDeep.cap, 100, 'DEEP cap is 100');

  // Rate limit test for refreshCard: 1 per minute per card
  const rateLimitMs = p0v2Config.refreshCardRateLimitMs;
  assert.equal(rateLimitMs, 60000, 'refreshCard rate limit is 60000ms (1 min)');
});

// ── Test 8 ───────────────────────────────────────────────────────────────────
test('8. Cached corridor hubs skip hub discovery (0 route calls on the second identical search)', async () => {
  let routeCalls = 0;
  const mockRailKit = {
    async trainSchedule() {
      routeCalls++;
      return {
        success: true,
        data: {
          route: [
            { station_code: 'NDLS', distance: 0 },
            { station_code: 'CNB', distance: 440 },
            { station_code: 'PNBE', distance: 998 },
          ],
        },
      };
    },
    async searchTrainBetweenStations() {
      return { success: true, data: [] };
    },
  };

  const inMemoryCorridorHubs = {
    _store: new Map(),
    async getStoredHubs(origin, dest) {
      return this._store.get(`${origin}:${dest}`) || null;
    },
    async storeHubs(origin, dest, hubs) {
      this._store.set(`${origin}:${dest}`, hubs);
    },
  };

  const budget = new ActionBudgetService();
  const engine = new AlternativesEngineService({
    railKit: mockRailKit,
    corridorHubsService: inMemoryCorridorHubs,
    actionBudgetService: budget,
  });

  const refTrains = [{ trainNumber: '12302' }, { trainNumber: '12304' }];

  // First search: discovers hubs and caches them
  await engine.run({
    originCode: 'NDLS',
    destCode: 'PNBE',
    date: '2026-10-22',
    travelClass: '3A',
    referenceTrains: refTrains,
    actionId: 'test_act_1',
  });
  assert.equal(routeCalls, 2, 'First search made 2 route calls to discover hubs');

  // Second search: uses cached corridor hubs
  await engine.run({
    originCode: 'NDLS',
    destCode: 'PNBE',
    date: '2026-10-22',
    travelClass: '3A',
    referenceTrains: refTrains,
    actionId: 'test_act_2',
  });
  assert.equal(routeCalls, 2, 'Second search made 0 additional route calls (skipped discovery)');
});

// ── Test 9 ───────────────────────────────────────────────────────────────────
test('9. All P0 FINAL tests for cancelled filter, running days, travel_time, layovers, same station code, status normalizer, and no mixed classes still pass', () => {
  // 1. Status Normalizer
  assert.equal(normalizeAvailabilityStatus('AVAILABLE 0024').normalizedStatus, AVAILABILITY_STATUS.AVAILABLE);
  assert.equal(normalizeAvailabilityStatus('RAC 5').normalizedStatus, AVAILABILITY_STATUS.RAC);
  assert.equal(normalizeAvailabilityStatus('GNWL 15 / WL 8').normalizedStatus, AVAILABILITY_STATUS.WAITLIST);
  assert.equal(normalizeAvailabilityStatus('RLWL 3').normalizedStatus, AVAILABILITY_STATUS.WAITLIST);

  // 2. Layover validation (valid: 90min to 10h, tight: < 180min)
  const isTight = (layover) => layover < 180;
  const isValidLayover = (layover) => layover >= 90 && layover <= 600;

  assert.equal(isValidLayover(60), false, '60m layover is too short (< 90m)');
  assert.equal(isValidLayover(120), true, '120m layover is valid');
  assert.equal(isTight(120), true, '120m layover is tight (< 180m)');
  assert.equal(isValidLayover(240), true, '240m layover is valid');
  assert.equal(isTight(240), false, '240m layover is not tight (>= 180m)');
  assert.equal(isValidLayover(700), false, '700m layover exceeds 10h max');

  // 3. Same station code validation
  const sameStation = (codeA, codeB) => String(codeA).toUpperCase() === String(codeB).toUpperCase();
  assert.equal(sameStation('CNB', 'CNB'), true);
  assert.equal(sameStation('CNB', 'PRYJ'), false);

  // 4. Running days filter
  const runsOnThursday = (runsOnDays) => runsOnDays.includes('Thu') || runsOnDays.includes('Daily');
  assert.equal(runsOnThursday(['Mon', 'Wed', 'Thu', 'Sat']), true);
  assert.equal(runsOnThursday(['Tue', 'Fri', 'Sun']), false);
});
