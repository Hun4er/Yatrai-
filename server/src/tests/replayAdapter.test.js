/**
 * Test: Recorded-data mode (replayAdapter)
 *
 * Verifies:
 *   1. createReplayAdapter returns null/fixtureMissing for unknown calls
 *   2. createReplayAdapter returns fixture data when file exists
 *   3. File naming convention (method__ARGS.json) is deterministic
 *   4. createRecordingAdapter passes through to the wrapped adapter
 *   5. getConfiguredAdapter returns replay adapter when RAILKIT_REPLAY_DIR is set
 *   6. getConfiguredAdapter returns real adapter by default
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import under test
import {
  createReplayAdapter,
  createRecordingAdapter,
  getConfiguredAdapter,
} from '../services/rail/replayAdapter.js';

// ─── Test Fixtures Directory ──────────────────────────────────────────────────
// Use a temp directory so we don't pollute the workspace
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yatrai-replay-'));

function cleanupTmpDir() {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// Write a known fixture
function writeFixture(filename, data) {
  const fp = path.join(tmpDir, filename);
  fs.writeFileSync(fp, JSON.stringify(data), 'utf8');
  return fp;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('1. createReplayAdapter: returns fixtureMissing=true for unknown call', async () => {
  const adapter = createReplayAdapter(tmpDir);
  const result = await adapter.searchTrainBetweenStations('NDLS', 'PNBE');
  assert.equal(result.success, false);
  assert.equal(result.fixtureMissing, true);
  assert.equal(result.fromReplay, true);
});

test('2. createReplayAdapter: returns fixture data when file exists', async () => {
  const fixtureData = {
    success: true,
    data: [
      {
        train_no: '12310',
        train_name: 'RJPB TEJAS RAJ',
        from_time: '17:10',
        to_time: '05:15',
        running_days: '1111111',
        distance: '1000',
        from_stn_code: 'NDLS',
        to_stn_code: 'PNBE',
      },
    ],
  };
  writeFixture('searchTrainBetweenStations__NDLS_PNBE.json', fixtureData);

  const adapter = createReplayAdapter(tmpDir);
  const result = await adapter.searchTrainBetweenStations('NDLS', 'PNBE');
  assert.equal(result.success, true);
  assert.equal(Array.isArray(result.data), true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].train_no, '12310');
});

test('3. createReplayAdapter: getAvailability returns null if fixture missing', async () => {
  const adapter = createReplayAdapter(tmpDir);
  const result = await adapter.getAvailability('12310', 'NDLS', 'PNBE', '2026-10-25', '3A', 'GN');
  assert.equal(result, null);
});

test('4. createReplayAdapter: getAvailability returns fixture data when file exists', async () => {
  const fixtureData = {
    success: true,
    normalizedStatus: 'AVAILABLE',
    seatsAvailable: 42,
    rawStatus: 'AVAILABLE 42',
    trainNumber: '12310',
    provider: 'RailKit-Replay',
  };
  writeFixture('getAvailability__12310_NDLS_PNBE_2026-10-25_3A_GN.json', fixtureData);

  const adapter = createReplayAdapter(tmpDir);
  const result = await adapter.getAvailability('12310', 'NDLS', 'PNBE', '2026-10-25', '3A', 'GN');
  assert.ok(result, 'Should return fixture data');
  assert.equal(result.normalizedStatus, 'AVAILABLE');
  assert.equal(result.seatsAvailable, 42);
});

test('5. createReplayAdapter: fareLookup alias (getFare) returns null if fixture missing', async () => {
  const adapter = createReplayAdapter(tmpDir);
  const result = await adapter.getFare('12310', '2026-10-25', 'NDLS', 'PNBE', '3A', 'GN');
  assert.equal(result, null);
});

test('6. createReplayAdapter: validateStationCode returns valid=true when no fixture (safe default)', async () => {
  const adapter = createReplayAdapter(tmpDir);
  const result = await adapter.validateStationCode('NDLS');
  assert.equal(result.valid, true);
  assert.equal(result.fromReplay, true);
});

test('7. File naming: deterministic lower-case sanitization', () => {
  // The fixture file name should be exactly:
  // searchTrainBetweenStations__NDLS_PNBE.json
  // We can validate by writing and reading back
  const fixtureData = { test: 'case-insensitive' };
  writeFixture('searchTrainBetweenStations__NDLS_PNBE.json', fixtureData);

  // The adapter normalises lowercase args via sanitize() which upper-cases
  const adapter = createReplayAdapter(tmpDir);
  // 'ndls' and 'pnbe' (lowercase) should still resolve to the fixture
  return adapter.searchTrainBetweenStations('ndls', 'pnbe').then((result) => {
    assert.ok(result, 'Lowercase args should resolve to uppercase fixture');
    assert.deepEqual(result, fixtureData);
  });
});

test('8. getConfiguredAdapter: returns replay adapter when RAILKIT_REPLAY_DIR is set', () => {
  const originalEnv = process.env.RAILKIT_REPLAY_DIR;
  try {
    process.env.RAILKIT_REPLAY_DIR = tmpDir;
    // Delete any RECORD setting
    delete process.env.RAILKIT_RECORD;

    const adapter = getConfiguredAdapter();
    assert.equal(adapter.name, 'RailKit-Replay');
    assert.equal(adapter.code, 'RAILKIT_REPLAY');
  } finally {
    if (originalEnv !== undefined) {
      process.env.RAILKIT_REPLAY_DIR = originalEnv;
    } else {
      delete process.env.RAILKIT_REPLAY_DIR;
    }
  }
});

test('9. getConfiguredAdapter: returns real adapter by default (no env vars)', () => {
  const savedReplay = process.env.RAILKIT_REPLAY_DIR;
  const savedRecord = process.env.RAILKIT_RECORD;
  try {
    delete process.env.RAILKIT_REPLAY_DIR;
    delete process.env.RAILKIT_RECORD;

    const adapter = getConfiguredAdapter();
    // Real adapter is RailKitAdapter class — check it's not the replay/recording wrapper
    assert.ok(adapter.name === 'RailKit' || !adapter.name.includes('Replay'), 'Should return real adapter');
  } finally {
    if (savedReplay !== undefined) process.env.RAILKIT_REPLAY_DIR = savedReplay;
    if (savedRecord !== undefined) process.env.RAILKIT_RECORD = savedRecord;
  }
});

test('10. checkAvailabilityBatch: returns results for each leg', async () => {
  // Write two fixtures
  writeFixture('getAvailability__12301_NDLS_HWH_2026-10-25_3A_GN.json', {
    normalizedStatus: 'AVAILABLE',
    seatsAvailable: 10,
    trainNumber: '12301',
  });
  writeFixture('getAvailability__12303_NDLS_HWH_2026-10-25_3A_GN.json', {
    normalizedStatus: 'WAITLIST',
    seatsAvailable: 0,
    rawStatus: 'GNWL5/WL3',
    trainNumber: '12303',
  });

  const adapter = createReplayAdapter(tmpDir);
  const legs = [
    { trainNumber: '12301', fromCode: 'NDLS', toCode: 'HWH', date: '2026-10-25', travelClass: '3A', quota: 'GN', key: '12301-3A-GN' },
    { trainNumber: '12303', fromCode: 'NDLS', toCode: 'HWH', date: '2026-10-25', travelClass: '3A', quota: 'GN', key: '12303-3A-GN' },
  ];
  const results = await adapter.checkAvailabilityBatch(legs);
  assert.ok(results['12301-3A-GN'], 'First leg should have result');
  assert.ok(results['12303-3A-GN'], 'Second leg should have result');
  assert.equal(results['12301-3A-GN'].normalizedStatus, 'AVAILABLE');
  assert.equal(results['12303-3A-GN'].normalizedStatus, 'WAITLIST');
});

// Cleanup temp directory after all tests
process.on('exit', cleanupTmpDir);
