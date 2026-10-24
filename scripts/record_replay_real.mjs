import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ path: 'server/.env' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const REPLAY_DIR = path.join(rootDir, 'server', 'src', 'tests', 'fixtures', 'real', 'replay');
fs.mkdirSync(REPLAY_DIR, { recursive: true });

const apiKey = (process.env.RAILKIT_API_KEY || '').trim();
const baseUrl = (process.env.RAILKIT_API_URL || 'https://api.railkit.in').replace(/\/$/, '');

if (!apiKey) {
  console.error('ERROR: RAILKIT_API_KEY missing');
  process.exit(1);
}

function getTestThursday(minDaysAhead = 14) {
  const now = new Date();
  const target = new Date(now.getTime() + minDaysAhead * 24 * 60 * 60 * 1000);
  const day = target.getDay();
  const daysUntilThursday = (4 - day + 7) % 7;
  target.setDate(target.getDate() + (daysUntilThursday === 0 ? 0 : daysUntilThursday));
  return target.toISOString().slice(0, 10);
}

const TEST_DATE = getTestThursday(14);
const [y, m, d] = TEST_DATE.split('-');
const RK_DATE = `${d}-${m}-${y}`;

console.log('================================================================');
console.log('   RECORD REAL RAILKIT RESPONSES FOR REPLAY FIXTURES');
console.log(`   Replay Dir: ${REPLAY_DIR}`);
console.log(`   Test Date: ${TEST_DATE} (RailKit date: ${RK_DATE})`);
console.log('================================================================\n');

let callCount = 0;
const MAX_CALLS = 80;

function sanitize(val) {
  return String(val || '')
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9.\-]/g, '_');
}

function saveReplayFixture(method, argParts, data) {
  const key = argParts.map(sanitize).join('_');
  const fp = path.join(REPLAY_DIR, `${method}__${key}.json`);
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
  console.log(`  ✓ Saved fixture: ${path.basename(fp)}`);
}

async function rkFetch(endpoint, timeoutMs = 8000) {
  if (callCount >= MAX_CALLS) {
    throw new Error(`Max calls (${MAX_CALLS}) reached!`);
  }
  callCount++;
  const url = `${baseUrl}${endpoint}`;
  console.log(`[Call #${callCount}/${MAX_CALLS}] GET ${endpoint}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { status: 'error', raw: text };
    }
    return { ok: res.ok, status: res.status, json };
  } catch (err) {
    console.warn(`  ⚠ Fetch error for ${endpoint}: ${err.message}`);
    return { ok: false, status: 500, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function record() {
  // 1. Search trains NDLS -> PNBE (with and without date)
  console.log('\n▶ [1] Search Trains: NDLS -> PNBE');
  const searchRes = await rkFetch(`/api/v1/trains/between/NDLS/PNBE?date=${RK_DATE}`);
  if (searchRes.json) {
    saveReplayFixture('searchTrainBetweenStations', ['NDLS', 'PNBE'], searchRes.json);
    saveReplayFixture('searchTrainBetweenStations', ['NDLS', 'PNBE', TEST_DATE], searchRes.json);
  }

  // 2. Cancelled trains on TEST_DATE
  console.log('\n▶ [2] Cancelled Trains');
  const cancelledRes = await rkFetch(`/api/v1/trains/cancelled?date=${RK_DATE}`);
  if (cancelledRes.json) {
    saveReplayFixture('getCancelledTrains', [TEST_DATE], cancelledRes.json);
  }

  // 3. Train Schedules for Candidate Trains
  console.log('\n▶ [3] Train Schedules for Key Trains');
  const keyTrains = ['12302', '12304', '12310', '12392', '12394', '12424'];
  for (const tNo of keyTrains) {
    const schedRes = await rkFetch(`/api/v1/trains/${tNo}`);
    if (schedRes.json) {
      saveReplayFixture('trainSchedule', [tNo], schedRes.json);
      saveReplayFixture('getTrainInfo', [tNo], schedRes.json);
    }
  }

  // 4. Availabilities for Direct Trains (NDLS -> PNBE, 3A, GN)
  console.log('\n▶ [4] Availability: NDLS -> PNBE (3A, GN)');
  for (const tNo of keyTrains) {
    const availRes = await rkFetch(`/api/v1/seats/${tNo}/NDLS/PNBE/${RK_DATE}/3A/GN`);
    if (availRes.json) {
      saveReplayFixture('getAvailability', [tNo, 'NDLS', 'PNBE', TEST_DATE, '3A', 'GN'], availRes.json);
    }
  }

  // 5. Downstream availability for Route Extension (NDLS -> RJPB)
  console.log('\n▶ [5] Downstream Availability: NDLS -> RJPB (3A, GN)');
  for (const tNo of ['12310', '12394']) {
    const extAvailRes = await rkFetch(`/api/v1/seats/${tNo}/NDLS/RJPB/${RK_DATE}/3A/GN`);
    if (extAvailRes.json) {
      saveReplayFixture('getAvailability', [tNo, 'NDLS', 'RJPB', TEST_DATE, '3A', 'GN'], extAvailRes.json);
    }
  }

  // 6. Hub Leg Availability for Alternatives (NDLS -> CNB, CNB -> PNBE)
  console.log('\n▶ [6] Hub Availability for Alternatives: NDLS -> CNB & CNB -> PNBE');
  for (const tNo of ['12310', '12394']) {
    const leg1Res = await rkFetch(`/api/v1/seats/${tNo}/NDLS/CNB/${RK_DATE}/3A/GN`);
    if (leg1Res.json) {
      saveReplayFixture('getAvailability', [tNo, 'NDLS', 'CNB', TEST_DATE, '3A', 'GN'], leg1Res.json);
    }
    const leg2Res = await rkFetch(`/api/v1/seats/${tNo}/CNB/PNBE/${RK_DATE}/3A/GN`);
    if (leg2Res.json) {
      saveReplayFixture('getAvailability', [tNo, 'CNB', 'PNBE', TEST_DATE, '3A', 'GN'], leg2Res.json);
    }
  }

  console.log('\n================================================================');
  console.log(`RECORDING COMPLETE: Used ${callCount} real RailKit calls (Cap: ${MAX_CALLS})`);
  console.log('================================================================');
}

record().catch((err) => {
  console.error('Recording failed:', err);
  process.exit(1);
});
