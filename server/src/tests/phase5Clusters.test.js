import test from 'node:test';
import assert from 'node:assert/strict';
import clusterService, { getClusterForStation, getClusterStationCodes } from '../services/rail/cluster.service.js';
import { DirectPassService } from '../services/rail/directPass.service.js';
import { AlternativesEngineService } from '../services/rail/alternativesEngine.service.js';
import { ActionBudgetService } from '../services/rail/actionBudget.service.js';

test('Phase 5.1: Same-city clusters contain required stations', () => {
  // 1. Delhi
  const delhiCodes = getClusterStationCodes('NDLS');
  const requiredDelhi = ['NDLS', 'DLI', 'ANVT', 'NZM', 'DEE'];
  for (const c of requiredDelhi) {
    assert.ok(delhiCodes.includes(c), `Delhi cluster must include ${c}`);
  }

  // 2. Kolkata
  const kolkataCodes = getClusterStationCodes('HWH');
  const requiredKolkata = ['HWH', 'SDAH', 'KOAA', 'SHM'];
  for (const c of requiredKolkata) {
    assert.ok(kolkataCodes.includes(c), `Kolkata cluster must include ${c}`);
  }

  // 3. Patna
  const patnaCodes = getClusterStationCodes('PNBE');
  const requiredPatna = ['PNBE', 'DNR', 'PPTA', 'RJPB'];
  for (const c of requiredPatna) {
    assert.ok(patnaCodes.includes(c), `Patna cluster must include ${c}`);
  }
});

test('Phase 5.2: Station pair cap — Max 4 station pairs per action with primary pair first', () => {
  const directPass = new DirectPassService();
  const delhiStations = ['NDLS', 'DLI', 'ANVT', 'NZM', 'DEE'];
  const patnaStations = ['PNBE', 'DNR', 'PPTA', 'RJPB'];

  // Total possible Cartesian product is 5 x 4 = 20 pairs
  const pairs = directPass._buildPairs(delhiStations, patnaStations);

  assert.equal(pairs.length, 4, 'Must strictly cap to 4 station pairs');
  assert.deepEqual(pairs[0], ['NDLS', 'PNBE'], 'Primary requested pair must be first');
});

test('Phase 5.3: Transfer leg requires minimum 120-minute buffer and proper label', async () => {
  const budget = new ActionBudgetService();
  const actionId = 'test_cluster_transfer_' + Date.now();
  await budget.getOrCreate(actionId, 'default');

  const altEngine = new AlternativesEngineService({
    railKit: {
      hasCachedSearch: () => true,
      hasCachedInfo: () => true,
      async searchTrainBetweenStations(from, to) {
        if (to === 'HWH') {
          // Train 1 arrives at HWH at 10:00
          return {
            success: true,
            data: [
              {
                train_number: '12301',
                from: 'GAYA',
                to: { code: 'HWH', arrival: '10:00' },
                classes: ['3A'],
                duration: 360,
              },
            ],
          };
        }
        if (from === 'HWH' || from === 'SDAH') {
          // Train 2 departs from SDAH at 11:30 (layover 90 min - too short for transfer!)
          // Train 3 departs from SDAH at 12:30 (layover 150 min - valid transfer!)
          return {
            success: true,
            data: [
              {
                train_number: '12302',
                from: { code: 'SDAH', departure: '11:30' },
                to: 'NJP',
                classes: ['3A'],
                duration: 400,
              },
              {
                train_number: '12303',
                from: { code: 'SDAH', departure: '12:30' },
                to: 'NJP',
                classes: ['3A'],
                duration: 400,
              },
            ],
          };
        }
        return { success: true, data: [] };
      },
    },
    availabilityService: {
      hasCached: () => true,
      async checkLegAvailability() {
        return { normalizedStatus: 'AVAILABLE' };
      },
    },
    actionBudgetService: budget,
  });

  const plans = await altEngine._crossTrainSearch({
    originCode: 'GAYA',
    destCode: 'NJP',
    hubCode: 'HWH', // Hub is Kolkata cluster
    laneClass: '3A',
    dateStr: '2026-10-30',
    quota: 'GN',
    actionId,
    budget,
  });

  // Train 1 (arr HWH 10:00) -> Train 2 (dep SDAH 11:30) is 90 min: REJECTED (transfer requires >=120 min)
  // Train 1 (arr HWH 10:00) -> Train 3 (dep SDAH 12:30) is 150 min: ACCEPTED
  assert.equal(plans.length, 1, 'Only connection with >= 120min transfer buffer should be accepted');

  const plan = plans[0];
  assert.equal(plan.isClusterTransfer, true);
  assert.equal(plan.legs.length, 3, 'Must have 3 legs (leg 1, transfer leg, leg 2)');

  const transferLeg = plan.legs[1];
  assert.equal(transferLeg.type, 'transfer');
  assert.equal(transferLeg.from, 'HWH');
  assert.equal(transferLeg.to, 'SDAH');
  assert.equal(transferLeg.durationMinutes, 150);
  assert.equal(transferLeg.label, 'get to SDAH yourself (local train / metro / cab)');
});
