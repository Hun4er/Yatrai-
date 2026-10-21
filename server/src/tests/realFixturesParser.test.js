/**
 * server/src/tests/realFixturesParser.test.js
 *
 * Phase 2 — Real RailKit Fixture Parser & Assumption Verification Tests
 * Uses sanitized responses from real RailKit API calls saved in server/src/tests/fixtures/real/
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSeatAvailability, AVAILABILITY_STATUS } from '../services/rail/availabilityNorm.js';
import { CancelledTrainsService } from '../services/rail/cancelledTrains.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'real');

function loadFixture(filename) {
  const filePath = path.join(FIXTURES_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fixture file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('Real RailKit Fixtures: Availability response parsing & 4-date verification', () => {
  const fixture = loadFixture('avail_12394_3A.json');

  assert.equal(fixture.success, true);
  assert.ok(fixture.data.train, 'train object must exist');
  assert.equal(fixture.data.train.trainNo, '12394');
  assert.equal(fixture.data.train.from, 'NDLS');
  assert.equal(fixture.data.train.to, 'PNBE');

  // Fare verification
  assert.ok(fixture.data.fare, 'fare object must exist');
  assert.equal(fixture.data.fare.totalFare, 1390);

  // Assumption (g): availability responses contain 4 dates
  const list = fixture.data.availability;
  assert.ok(Array.isArray(list), 'availability must be an array');
  assert.equal(list.length, 4, 'Real RailKit availability contains exactly 4 dates');
  assert.equal(list[0].date, '25-10-2026');
  assert.equal(list[1].date, '26-10-2026');
  assert.equal(list[2].date, '27-10-2026');
  assert.equal(list[3].date, '28-10-2026');

  // Status normalizer on real strings
  const first = list[0];
  assert.equal(first.status, 'WAITLIST');
  assert.equal(first.rawStatus, 'GNWL156/WL90');
  const norm = normalizeSeatAvailability(first.rawStatus);
  assert.equal(norm.normalizedStatus, AVAILABILITY_STATUS.WAITLIST);
  assert.equal(norm.isAvailable, false);
});

test('Real RailKit Fixtures: Search trains response parsing & running_days Mon-first rule', () => {
  const withDate = loadFixture('search_ndls_pnbe_withdate.json');
  const noDate = loadFixture('search_ndls_pnbe_nodate.json');

  assert.equal(withDate.success, true);
  assert.ok(Array.isArray(withDate.data));
  assert.equal(noDate.success, true);
  assert.ok(Array.isArray(noDate.data));

  // Assumption (e): with-date returns filtered trains for that date; no-date returns all trains
  assert.ok(withDate.data.length <= noDate.data.length, 'with-date returns subset or equal to no-date');

  // Assumption (f): running_days Mon-first rule (0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun)
  const thuTrain = noDate.data.find((t) => t.train_no === '15623');
  assert.ok(thuTrain, 'Train 15623 should exist in no-date search');
  assert.equal(thuTrain.running_days, '0001000', '15623 runs only on Thursday (index 3, 0-indexed Mon-first)');

  const monTrain = noDate.data.find((t) => t.train_no === '03258');
  assert.ok(monTrain, 'Train 03258 should exist in no-date search');
  assert.equal(monTrain.running_days, '1000000', '03258 runs only on Monday (index 0, Mon-first)');
});

test('Real RailKit Fixtures: Train Info route provider shape vs Live Track', () => {
  const trainInfo = loadFixture('train_info_12310.json');

  assert.equal(trainInfo.success, true);
  assert.ok(trainInfo.data.trainInfo, 'trainInfo object must exist');
  assert.equal(trainInfo.data.trainInfo.train_no, '12310');

  // Route array exists and has stations with codes, times, coordinates
  assert.ok(Array.isArray(trainInfo.data.route), 'route array must exist');
  assert.ok(trainInfo.data.route.length >= 5, '12310 has multiple stations');
  const ndls = trainInfo.data.route[0];
  assert.equal(ndls.stnCode, 'NDLS');
  assert.equal(ndls.departure, '17:10');
  assert.ok(ndls.coordinates?.latitude, 'coordinates.latitude must exist');
  assert.ok(ndls.coordinates?.longitude, 'coordinates.longitude must exist');

  // Live tracking on future date rejects with error
  const liveTrack = loadFixture('live_track_12310.json');
  assert.equal(liveTrack.success, false);
  assert.equal(liveTrack.error, 'Date cannot be greater than today');
});

test('Real RailKit Fixtures: Cancelled trains parser parses fullyCancelledTrains and partiallyCancelledTrains', async () => {
  const cancelledDate = loadFixture('cancelled_trains_date.json');

  assert.equal(cancelledDate.success, true);
  assert.ok(cancelledDate.data.fullyCancelledTrains, 'fullyCancelledTrains array must exist');
  assert.ok(cancelledDate.data.partiallyCancelledTrains, 'partiallyCancelledTrains array must exist');

  // Test CancelledTrainsService handles the real structure
  const mockAdapter = {
    getCancelledTrains: async () => cancelledDate,
  };
  const service = new CancelledTrainsService();
  const set = await service.getCancelledTrains('2026-10-21', mockAdapter);

  assert.ok(set instanceof Set);
  assert.ok(set.size > 0, 'Set of cancelled trains should not be empty');
  assert.ok(set.has('13132'), '13132 is fully cancelled');
  assert.ok(set.has('16515'), '16515 is fully cancelled');
});

test('Real RailKit Fixtures: Error shape probe conforms to { success: false, error: string }', () => {
  const errProbe = loadFixture('error_shape_probe.json');
  assert.equal(errProbe.success, false);
  assert.equal(typeof errProbe.error, 'string');
});

test('Status Normalizer Table Test with Real & Verified Strings', () => {
  // Real strings verified against RailKit and IRCTC PRS
  const testCases = [
    { input: 'AVAILABLE-0042', expectedStatus: AVAILABILITY_STATUS.AVAILABLE, seats: 42, isAvail: true },
    { input: 'AVAILABLE 0024', expectedStatus: AVAILABILITY_STATUS.AVAILABLE, seats: 24, isAvail: true },
    { input: 'CURR_AVBL-0005', expectedStatus: AVAILABILITY_STATUS.AVAILABLE, seats: 5, isAvail: true },
    { input: 'AVL 18', expectedStatus: AVAILABILITY_STATUS.AVAILABLE, seats: 18, isAvail: true },
    { input: 'RAC  38/RAC  11', expectedStatus: AVAILABILITY_STATUS.RAC, seats: 11, isAvail: false },
    { input: 'RAC 12', expectedStatus: AVAILABILITY_STATUS.RAC, seats: 12, isAvail: false },
    { input: 'RAC 5', expectedStatus: AVAILABILITY_STATUS.RAC, seats: 5, isAvail: false },
    { input: 'GNWL156/WL90', expectedStatus: AVAILABILITY_STATUS.WAITLIST, seats: 0, isAvail: false },
    { input: 'WL 90', expectedStatus: AVAILABILITY_STATUS.WAITLIST, seats: 0, isAvail: false },
    { input: 'GNWL 15 / WL 8', expectedStatus: AVAILABILITY_STATUS.WAITLIST, seats: 0, isAvail: false },
    { input: 'RLWL 3', expectedStatus: AVAILABILITY_STATUS.WAITLIST, seats: 0, isAvail: false },
    { input: 'PQWL 10', expectedStatus: AVAILABILITY_STATUS.WAITLIST, seats: 0, isAvail: false },
    { input: 'NOT AVAILABLE', expectedStatus: AVAILABILITY_STATUS.UNAVAILABLE, seats: 0, isAvail: false },
    { input: 'REGRET', expectedStatus: AVAILABILITY_STATUS.UNAVAILABLE, seats: 0, isAvail: false },
    { input: '', expectedStatus: AVAILABILITY_STATUS.UNKNOWN, seats: null, isAvail: false },
  ];

  for (const { input, expectedStatus, seats, isAvail } of testCases) {
    const res = normalizeSeatAvailability(input);
    assert.equal(res.normalizedStatus, expectedStatus, `Failed on input "${input}" status`);
    assert.equal(res.isAvailable, isAvail, `Failed on input "${input}" isAvailable`);
    if (seats !== null) {
      assert.equal(res.seatsAvailable, seats, `Failed on input "${input}" seatsAvailable`);
    }
  }
});

// TODO[BOARDING_DATE]: RailKit Seat Availability 'date' parameter represents the train boarding date at the leg's origin station.
// TODO[AVAILABLE_FORMAT]: Verified status formats: AVAILABLE-XXXX, CURR_AVBL, RAC X/RAC Y, GNWL X/WL Y.
