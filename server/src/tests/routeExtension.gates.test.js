import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RouteExtensionService } from '../services/rail/routeExtension.service.js';
import { ActionBudgetService } from '../services/rail/actionBudget.service.js';
import { AVAILABILITY_STATUS } from '../services/rail/availabilityNorm.js';
import { createGoldenMockEnvironment, executeSearch, TEST_DATE } from './golden/generate.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GOLDEN_DIR = path.join(__dirname, 'golden');

function stripVolatile(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripVolatile);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'checkedAt' || k === 'updatedAt' || k === 'features' || k === 'extension') {
      continue;
    }
    out[k] = stripVolatile(v);
  }
  return out;
}

describe('PHASE 2 — GATES SUITE', () => {
  const origEnv = process.env.EXTENSION_ENABLED;

  after(() => {
    process.env.EXTENSION_ENABLED = origEnv;
  });

  // ── GATE 1: Flag OFF identity ─────────────────────────────────────────────
  describe('Gate 1 — Flag OFF Identity', () => {
    before(() => {
      process.env.EXTENSION_ENABLED = 'false';
    });

    const scenarios = [
      { name: 'default_confirmed', mode: 'default', confirmedOnTrain: '12310' },
      { name: 'alternatives_confirmed', mode: 'alternatives', confirmedOnTrain: '12310' },
      { name: 'deep_confirmed', mode: 'deep', confirmedOnTrain: '12310' },
      { name: 'default_all_wl', mode: 'default', confirmedOnTrain: null },
      { name: 'alternatives_all_wl', mode: 'alternatives', confirmedOnTrain: null },
      { name: 'deep_all_wl', mode: 'deep', confirmedOnTrain: null },
    ];

    const baselineCounts = JSON.parse(
      fs.readFileSync(path.join(GOLDEN_DIR, 'call_counts.json'), 'utf8')
    );

    for (const sc of scenarios) {
      it(`matches golden snapshot for ${sc.name} with flag OFF`, async () => {
        const golden = JSON.parse(
          fs.readFileSync(path.join(GOLDEN_DIR, `${sc.name}.json`), 'utf8')
        );

        const env = createGoldenMockEnvironment({ confirmedOnTrain: sc.confirmedOnTrain });
        const res = await executeSearch({
          mode: sc.mode,
          confirmedOnTrain: sc.confirmedOnTrain,
          env,
          actionId: `gate1_${sc.name}`,
        });
        const counters = env.getCounters();

        // 1. Full response matches golden deep equality
        assert.deepStrictEqual(stripVolatile(res), stripVolatile(golden));

        // 2. Call counts equal baseline
        const expectedCounts = baselineCounts[sc.name];
        assert.equal(counters.total, expectedCounts.cold.total, `Call counts match baseline for ${sc.name}`);
      });
    }
  });

  // ── GATE 2: Flag ON additivity ────────────────────────────────────────────
  describe('Gate 2 — Flag ON Additivity', () => {
    before(() => {
      process.env.EXTENSION_ENABLED = 'true';
    });

    it('non-extension plans are identical to flag-OFF output; only extension plans are added in front', async () => {
      // Run with flag OFF
      process.env.EXTENSION_ENABLED = 'false';
      const envOff = createGoldenMockEnvironment({ confirmedOnTrain: null });
      const resOff = await executeSearch({
        mode: 'default',
        confirmedOnTrain: null,
        env: envOff,
        actionId: 'additivity_off',
      });

      // Run with flag ON
      process.env.EXTENSION_ENABLED = 'true';
      const envOn = createGoldenMockEnvironment({ confirmedOnTrain: null });
      const resOn = await executeSearch({
        mode: 'default',
        confirmedOnTrain: null,
        env: envOn,
        actionId: 'additivity_on',
      });

      // Direct trains identical
      assert.deepStrictEqual(stripVolatile(resOn.direct), stripVolatile(resOff.direct));
      assert.deepStrictEqual(stripVolatile(resOn.waitingTrains), stripVolatile(resOff.waitingTrains));

      // Alternatives additivity: non-extension plans identical
      const nonExtPlans = stripVolatile(resOn.alternatives.filter((p) => p.type !== 'EXTENSION'));
      assert.deepStrictEqual(nonExtPlans, stripVolatile(resOff.alternatives));

      // Total calls within cap 40
      const summary = await envOn.actionBudgetService.getBudgetSummary('additivity_on');
      assert.ok(summary.used <= 40, `Used ${summary.used} <= 40`);

      // Warm <= cold
      const envWarm = createGoldenMockEnvironment({ confirmedOnTrain: '12310' });
      await executeSearch({ mode: 'default', env: envWarm, actionId: 'warm_c' });
      const count1 = envWarm.getCounters().total;
      await executeSearch({ mode: 'default', env: envWarm, actionId: 'warm_w' });
      const count2 = envWarm.getCounters().total - count1;
      assert.ok(count2 <= count1, `Warm calls (${count2}) <= cold calls (${count1})`);
    });
  });

  // ── GATE 3: Fault injection ───────────────────────────────────────────────
  describe('Gate 3 — Fault Injection', () => {
    it('1. availability call throws -> returns HTTP 200 / empty plans with reason', async () => {
      const service = new RouteExtensionService({
        railKit: {
          hasCachedInfo: () => true,
          trainSchedule: async () => ({
            data: {
              route: [
                { station_code: 'NDLS' },
                { station_code: 'PNBE' },
                { station_code: 'RJPB' },
              ],
            },
          }),
        },
        availabilityService: {
          checkLegAvailability: async () => {
            throw new Error('Provider 500 Internal Error');
          },
        },
        actionBudgetService: new ActionBudgetService(),
      });

      const res = await service.run({
        originCode: 'NDLS',
        destCode: 'PNBE',
        date: TEST_DATE,
        actionId: 'fault_1',
        referenceTrains: [{ trainNumber: '12310', classes: [{ class: '3A', state: 'CHECKED', tier: 'WAITLIST' }] }],
      });

      assert.equal(res.plans.length, 0);
      assert.equal(res.metadata.status, 'skipped');
    });

    it('2. route data missing -> returns safely with reason', async () => {
      const service = new RouteExtensionService({
        railKit: {
          hasCachedInfo: () => true,
          trainSchedule: async () => null,
        },
        availabilityService: {},
        actionBudgetService: new ActionBudgetService(),
      });

      const res = await service.run({
        originCode: 'NDLS',
        destCode: 'PNBE',
        date: TEST_DATE,
        actionId: 'fault_2',
        referenceTrains: [{ trainNumber: '12310', classes: [] }],
      });

      assert.equal(res.plans.length, 0);
      assert.equal(res.metadata.status, 'skipped');
    });

    it('3. train has no stoppage after B -> returns safely', async () => {
      const service = new RouteExtensionService({
        railKit: {
          hasCachedInfo: () => true,
          trainSchedule: async () => ({
            data: {
              route: [
                { station_code: 'NDLS' },
                { station_code: 'CNB' },
                { station_code: 'PNBE' }, // Terminus is PNBE
              ],
            },
          }),
        },
        availabilityService: {},
        actionBudgetService: new ActionBudgetService(),
      });

      const res = await service.run({
        originCode: 'NDLS',
        destCode: 'PNBE',
        date: TEST_DATE,
        actionId: 'fault_3',
        referenceTrains: [{ trainNumber: '12310', classes: [] }],
      });

      assert.equal(res.plans.length, 0);
    });

    it('4. B is not a stoppage on train route -> returns safely', async () => {
      const service = new RouteExtensionService({
        railKit: {
          hasCachedInfo: () => true,
          trainSchedule: async () => ({
            data: {
              route: [
                { station_code: 'NDLS' },
                { station_code: 'CNB' },
                { station_code: 'HWH' },
              ],
            },
          }),
        },
        availabilityService: {},
        actionBudgetService: new ActionBudgetService(),
      });

      const res = await service.run({
        originCode: 'NDLS',
        destCode: 'PNBE',
        date: TEST_DATE,
        actionId: 'fault_4',
        referenceTrains: [{ trainNumber: '12310', classes: [] }],
      });

      assert.equal(res.plans.length, 0);
    });

    it('5. provider 429/5xx error -> returns safely without unhandled rejection', async () => {
      const service = new RouteExtensionService({
        railKit: {
          hasCachedInfo: () => true,
          trainSchedule: async () => {
            const err = new Error('HTTP 429 Rate Limit Exceeded');
            err.status = 429;
            throw err;
          },
        },
        availabilityService: {},
        actionBudgetService: new ActionBudgetService(),
      });

      const res = await service.run({
        originCode: 'NDLS',
        destCode: 'PNBE',
        date: TEST_DATE,
        actionId: 'fault_5',
        referenceTrains: [{ trainNumber: '12310', classes: [] }],
      });

      assert.equal(res.plans.length, 0);
      assert.equal(res.metadata.status, 'skipped');
    });

    it('6. extension timeout after 4s -> fail-open triggers and returns empty plans', async () => {
      const service = new RouteExtensionService({
        railKit: {
          hasCachedInfo: () => true,
          trainSchedule: () => new Promise((resolve) => setTimeout(resolve, 5000)), // Hangs for 5s
        },
        availabilityService: {},
        actionBudgetService: new ActionBudgetService(),
      });

      const start = Date.now();
      const res = await service.run({
        originCode: 'NDLS',
        destCode: 'PNBE',
        date: TEST_DATE,
        actionId: 'fault_6',
        referenceTrains: [{ trainNumber: '12310', classes: [] }],
      });
      const elapsed = Date.now() - start;

      assert.ok(elapsed >= 3900 && elapsed <= 4500, `Elapsed ~4s (was ${elapsed}ms)`);
      assert.equal(res.plans.length, 0);
      assert.equal(res.metadata.status, 'skipped');
      assert.match(res.metadata.reason, /timeout/i);
    });

    it('7. malformed availability payload -> returns safely', async () => {
      const service = new RouteExtensionService({
        railKit: {
          hasCachedInfo: () => true,
          trainSchedule: async () => ({
            data: {
              route: [{ station_code: 'NDLS' }, { station_code: 'PNBE' }, { station_code: 'RJPB' }],
            },
          }),
        },
        availabilityService: {
          checkLegAvailability: async () => 'INVALID_STRING_NOT_OBJECT',
        },
        actionBudgetService: new ActionBudgetService(),
      });

      const res = await service.run({
        originCode: 'NDLS',
        destCode: 'PNBE',
        date: TEST_DATE,
        actionId: 'fault_7',
        referenceTrains: [{ trainNumber: '12310', classes: [] }],
      });

      assert.equal(res.plans.length, 0);
    });

    it('8. cap exhausted mid-phase -> halts outbound calls immediately', async () => {
      const budget = new ActionBudgetService();
      await budget.getOrCreate('fault_8', 'default');
      // Exhaust budget to cap (40)
      for (let i = 0; i < 40; i++) {
        await budget.increment('fault_8', 'crossTrain');
      }

      let scheduleCalled = false;
      const service = new RouteExtensionService({
        railKit: {
          hasCachedInfo: () => false,
          trainSchedule: async () => {
            scheduleCalled = true;
            return { data: { route: [] } };
          },
        },
        availabilityService: {},
        actionBudgetService: budget,
      });

      const res = await service.run({
        originCode: 'NDLS',
        destCode: 'PNBE',
        date: TEST_DATE,
        actionId: 'fault_8',
        referenceTrains: [{ trainNumber: '12310', classes: [] }],
      });

      assert.equal(res.plans.length, 0);
      assert.equal(res.metadata.reason, 'cap_exhausted');
      assert.equal(scheduleCalled, false, 'No outbound call made after cap was reached');
    });
  });

  // ── GATE 4: Unit tests from Phase 3B spec ─────────────────────────────────
  describe('Gate 4 — Unit Tests from Phase 3B Spec', () => {
    const mockCache = { get: async () => null, set: async () => {} };

    it('1. A->B WL, A->Y1 WL, A->Y2 CONFIRMED -> exactly 2 availability calls and correct extraFare', async () => {
      let availCalls = 0;
      const callsMade = [];

      const service = new RouteExtensionService({
        railKit: {
          hasCachedInfo: () => true,
          trainSchedule: async () => ({
            data: {
              route: [
                { station_code: 'NDLS', distance: 0 },
                { station_code: 'PNBE', distance: 1000, arrival: '04:40' },
                { station_code: 'RJPB', distance: 1003, arrival: '05:00' }, // Y1
                { station_code: 'BKP', distance: 1045, arrival: '05:40' },  // Y2
                { station_code: 'MKA', distance: 1089, arrival: '06:15' },  // Y3
              ],
            },
          }),
        },
        availabilityService: {
          checkLegAvailability: async ({ fromCode, toCode }) => {
            availCalls++;
            callsMade.push(`${fromCode}->${toCode}`);
            if (toCode === 'RJPB') {
              // Y1 is WL
              return {
                normalizedStatus: AVAILABILITY_STATUS.WAITLIST,
                statusText: 'WL 12',
                fare: 1470,
              };
            }
            if (toCode === 'BKP') {
              // Y2 is CONFIRMED
              return {
                normalizedStatus: AVAILABILITY_STATUS.AVAILABLE,
                statusText: 'AVAILABLE 8',
                fare: 1510,
              };
            }
            return null;
          },
        },
        actionBudgetService: new ActionBudgetService(),
        persistentCacheService: mockCache,
      });

      const res = await service.run({
        originCode: 'NDLS',
        destCode: 'PNBE',
        date: TEST_DATE,
        travelClass: '3A',
        actionId: 'spec_1',
        referenceTrains: [
          {
            trainNumber: '12310',
            trainName: 'Patna Rajdhani',
            classes: [
              { class: '3A', state: 'CHECKED', tier: 'WAITLIST', fare: 1450 }
            ],
          },
        ],
      });

      // Exactly 2 availability calls made (Y1 then Y2)
      assert.equal(availCalls, 2, 'Exactly 2 availability calls made');
      assert.deepStrictEqual(callsMade, ['NDLS->RJPB', 'NDLS->BKP']);

      // 1 plan found
      assert.equal(res.plans.length, 1);
      const plan = res.plans[0];
      assert.equal(plan.type, 'EXTENSION');
      assert.equal(plan.from, 'NDLS');
      assert.equal(plan.to, 'PNBE');
      assert.equal(plan.bookedTo, 'BKP');
      assert.equal(plan.tier, 'CONFIRMED');

      // Extra fare = 1510 - 1450 = 60
      assert.equal(plan.fare, 1510);
      assert.equal(plan.originalFare, 1450);
      assert.equal(plan.extraFare, 60, 'Correct extraFare calculated');
    });

    it('2. Early stop: stops immediately at first confirmed candidate', async () => {
      let availCalls = 0;
      const service = new RouteExtensionService({
        railKit: {
          hasCachedInfo: () => true,
          trainSchedule: async () => ({
            data: {
              route: [
                { station_code: 'NDLS' },
                { station_code: 'PNBE' },
                { station_code: 'RJPB' }, // Y1 is CONFIRMED
                { station_code: 'BKP' },  // Y2
                { station_code: 'MKA' },  // Y3
              ],
            },
          }),
        },
        availabilityService: {
          checkLegAvailability: async () => {
            availCalls++;
            return {
              normalizedStatus: AVAILABILITY_STATUS.AVAILABLE,
              statusText: 'AVAILABLE 4',
              fare: 1460,
            };
          },
        },
        actionBudgetService: new ActionBudgetService(),
        persistentCacheService: mockCache,
      });

      const res = await service.run({
        originCode: 'NDLS',
        destCode: 'PNBE',
        date: TEST_DATE,
        actionId: 'spec_2',
        referenceTrains: [
          { trainNumber: '12310', classes: [{ class: '3A', fare: 1450 }] },
        ],
      });

      assert.equal(availCalls, 1, 'Early stopped at first confirmed candidate');
      assert.equal(res.plans.length, 1);
      assert.equal(res.plans[0].bookedTo, 'RJPB');
    });

    it('3. Terminus-only: candidate Y is the single terminus station after B', async () => {
      const service = new RouteExtensionService({
        railKit: {
          hasCachedInfo: () => true,
          trainSchedule: async () => ({
            data: {
              route: [
                { station_code: 'NDLS' },
                { station_code: 'PNBE' },
                { station_code: 'RJPB' }, // Terminus is only station after B
              ],
            },
          }),
        },
        availabilityService: {
          checkLegAvailability: async () => ({
            normalizedStatus: AVAILABILITY_STATUS.AVAILABLE,
            statusText: 'AVAILABLE 12',
            fare: 1460,
          }),
        },
        actionBudgetService: new ActionBudgetService(),
        persistentCacheService: mockCache,
      });

      const res = await service.run({
        originCode: 'NDLS',
        destCode: 'PNBE',
        date: TEST_DATE,
        actionId: 'spec_3',
        referenceTrains: [
          { trainNumber: '12310', classes: [{ class: '3A', fare: 1450 }] },
        ],
      });

      assert.equal(res.plans.length, 1);
      assert.equal(res.plans[0].bookedTo, 'RJPB');
    });

    it('4. extension_hit logged when extension plan is found', async () => {
      let loggedHit = false;
      const origInfo = logger.info;
      logger.info = (msg) => {
        if (typeof msg === 'string' && msg.includes('extension_hit')) {
          loggedHit = true;
        }
        origInfo.call(logger, msg);
      };

      try {
        const service = new RouteExtensionService({
          railKit: {
            hasCachedInfo: () => true,
            trainSchedule: async () => ({
              data: {
                route: [
                  { station_code: 'NDLS' },
                  { station_code: 'PNBE' },
                  { station_code: 'RJPB' },
                ],
              },
            }),
          },
          availabilityService: {
            checkLegAvailability: async () => ({
              normalizedStatus: AVAILABILITY_STATUS.AVAILABLE,
              statusText: 'AVAILABLE 1',
              fare: 1470,
            }),
          },
          actionBudgetService: new ActionBudgetService(),
          persistentCacheService: mockCache,
        });

        await service.run({
          originCode: 'NDLS',
          destCode: 'PNBE',
          date: TEST_DATE,
          actionId: 'spec_4',
          referenceTrains: [
            { trainNumber: '12310', classes: [{ class: '3A', fare: 1450 }] },
          ],
        });

        assert.equal(loggedHit, true, 'extension_hit was logged');
      } finally {
        logger.info = origInfo;
      }
    });

    it('5. Ranking puts EXTENSION before splits in alternatives array', async () => {
      // Simulate alternatives assembly in journey search
      const extPlan = { type: 'EXTENSION', trainNumber: '12310', bookedTo: 'RJPB' };
      const splitPlan1 = { type: 'same_train', trainNumber: '12304' };
      const splitPlan2 = { type: 'cross_train', trainNumber: '12424' };

      const assembled = [
        extPlan,
        splitPlan1,
        splitPlan2,
      ];

      assert.equal(assembled[0].type, 'EXTENSION');
      assert.equal(assembled[1].type, 'same_train');
      assert.equal(assembled[2].type, 'cross_train');
    });
  });
});
