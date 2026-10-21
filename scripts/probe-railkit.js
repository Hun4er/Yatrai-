/**
 * scripts/probe-railkit.js
 *
 * Real RailKit API verification probe.
 * Budget: At most 25 calls in total.
 * Performs direct inspection to test 8 core hypotheses and persists sanitized fixtures.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Load environment variables from server/.env then .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const serverEnvPath = path.join(rootDir, 'server', '.env');
const rootEnvPath = path.join(rootDir, '.env');

if (fs.existsSync(serverEnvPath)) {
  dotenv.config({ path: serverEnvPath });
}
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

const API_KEY = (process.env.RAILKIT_API_KEY || '').trim();
const BASE_URL = (process.env.RAILKIT_API_URL || 'https://api.railkit.in').replace(/\/$/, '');

if (!API_KEY) {
  console.error('ERROR: RAILKIT_API_KEY is not set in environment or server/.env.');
  process.exit(1);
}

const FIXTURES_DIR = path.join(rootDir, 'server', 'src', 'tests', 'fixtures', 'real');
fs.mkdirSync(FIXTURES_DIR, { recursive: true });

let callCounter = 0;
const MAX_BUDGET = 25;

/**
 * Sanitizes response data removing sensitive headers/keys
 */
function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = JSON.parse(JSON.stringify(obj));
  delete clone.key;
  delete clone.apiKey;
  delete clone.api_key;
  return clone;
}

async function apiCall(endpoint, description) {
  if (callCounter >= MAX_BUDGET) {
    throw new Error(`Exceeded maximum probe budget (${MAX_BUDGET} calls)`);
  }
  callCounter++;
  const url = `${BASE_URL}${endpoint}`;
  console.log(`[Call #${callCounter}/${MAX_BUDGET}] GET ${endpoint} (${description})`);

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
  };

  const start = Date.now();
  let res;
  let text = '';
  let json = null;
  try {
    res = await fetch(url, { headers });
    text = await res.text();
    const duration = Date.now() - start;
    try {
      json = JSON.parse(text);
    } catch {
      json = { rawText: text };
    }
    console.log(`  -> HTTP ${res.status} (${duration}ms)`);
    return { status: res.status, headers: res.headers, data: json, rawText: text };
  } catch (err) {
    console.log(`  -> ERROR: ${err.message}`);
    return { status: 0, error: err.message };
  }
}

async function runProbe() {
  console.log('====================================================');
  console.log('   RailKit Real API Probe & Verification Script');
  console.log(`   Target: ${BASE_URL} | Budget: <= ${MAX_BUDGET} calls`);
  console.log('====================================================\n');

  const report = {
    assumptions: {},
    fixturesSaved: [],
    callsUsed: 0,
  };

  // 1. Search Trains (New Delhi -> Patna)
  // Test if search is date-less vs with-date (Hypothesis e)
  const searchNoDate = await apiCall('/api/v1/trains/between/NDLS/PNBE', 'Search NDLS->PNBE (no date)');
  fs.writeFileSync(
    path.join(FIXTURES_DIR, 'search_ndls_pnbe_nodate.json'),
    JSON.stringify(sanitize(searchNoDate.data), null, 2)
  );
  report.fixturesSaved.push('search_ndls_pnbe_nodate.json');

  const searchDate = await apiCall('/api/v1/trains/between/NDLS/PNBE?date=25-10-2026', 'Search NDLS->PNBE (with date)');
  fs.writeFileSync(
    path.join(FIXTURES_DIR, 'search_ndls_pnbe_withdate.json'),
    JSON.stringify(sanitize(searchDate.data), null, 2)
  );
  report.fixturesSaved.push('search_ndls_pnbe_withdate.json');

  // Inspect trains returned
  const trainList = Array.isArray(searchDate.data?.data)
    ? searchDate.data.data
    : Array.isArray(searchNoDate.data?.data)
      ? searchNoDate.data.data
      : [];

  console.log(`Found ${trainList.length} trains between NDLS and PNBE.`);
  if (trainList.length > 0) {
    const sampleTrain = trainList[0];
    console.log(`Sample train keys: ${Object.keys(sampleTrain).join(', ')}`);
    console.log(`running_days sample: ${JSON.stringify(sampleTrain.running_days || sampleTrain.runsOnDays || sampleTrain.days)}`);
  }

  // 2. Seat Availability: 2 different classes on 2 different trains
  // Train 1: 12310 (Patna Rajdhani) or first train in search
  const train1 = '12310';
  const train2 = '12394'; // Sampoorna Kranti

  const availT1Class1 = await apiCall(`/api/v1/seats/${train1}/NDLS/PNBE/25-10-2026/3A/GN`, `Avail ${train1} 3A`);
  fs.writeFileSync(
    path.join(FIXTURES_DIR, `avail_${train1}_3A.json`),
    JSON.stringify(sanitize(availT1Class1.data), null, 2)
  );
  report.fixturesSaved.push(`avail_${train1}_3A.json`);

  const availT1Class2 = await apiCall(`/api/v1/seats/${train1}/NDLS/PNBE/25-10-2026/2A/GN`, `Avail ${train1} 2A`);
  fs.writeFileSync(
    path.join(FIXTURES_DIR, `avail_${train1}_2A.json`),
    JSON.stringify(sanitize(availT1Class2.data), null, 2)
  );
  report.fixturesSaved.push(`avail_${train1}_2A.json`);

  const availT2Class1 = await apiCall(`/api/v1/seats/${train2}/NDLS/PNBE/25-10-2026/3A/GN`, `Avail ${train2} 3A`);
  fs.writeFileSync(
    path.join(FIXTURES_DIR, `avail_${train2}_3A.json`),
    JSON.stringify(sanitize(availT2Class1.data), null, 2)
  );
  report.fixturesSaved.push(`avail_${train2}_3A.json`);

  const availT2Class2 = await apiCall(`/api/v1/seats/${train2}/NDLS/PNBE/25-10-2026/SL/GN`, `Avail ${train2} SL`);
  fs.writeFileSync(
    path.join(FIXTURES_DIR, `avail_${train2}_SL.json`),
    JSON.stringify(sanitize(availT2Class2.data), null, 2)
  );
  report.fixturesSaved.push(`avail_${train2}_SL.json`);

  // Check if we captured an AVAILABLE or RAC
  let foundAvailableOrRac = false;
  const availResponses = [availT1Class1, availT1Class2, availT2Class1, availT2Class2];
  for (const resp of availResponses) {
    const list = Array.isArray(resp.data?.data?.availability) ? resp.data.data.availability : [];
    for (const a of list) {
      const text = String(a.rawStatus || a.status || a.availabilityText || '');
      if (/AVL|AVAILABLE|RAC/i.test(text)) {
        foundAvailableOrRac = true;
        console.log(`Captured real status: "${text}" on date ${a.date}`);
      }
    }
  }

  // If not found yet, try nearby dates / cheaper classes (2S / SL) on an express train to capture AVAILABLE
  if (!foundAvailableOrRac && callCounter < 15) {
    console.log('No AVAILABLE/RAC found on initial check. Probing nearby dates and classes...');
    const datesToTry = ['10-11-2026', '20-11-2026'];
    for (const d of datesToTry) {
      if (foundAvailableOrRac || callCounter >= 18) break;
      const res = await apiCall(`/api/v1/seats/${train2}/NDLS/PNBE/${d}/2S/GN`, `Avail ${train2} 2S date=${d}`);
      const list = Array.isArray(res.data?.data?.availability) ? res.data.data.availability : [];
      if (list.length > 0) {
        fs.writeFileSync(
          path.join(FIXTURES_DIR, `avail_${train2}_2S_${d}.json`),
          JSON.stringify(sanitize(res.data), null, 2)
        );
        report.fixturesSaved.push(`avail_${train2}_2S_${d}.json`);
        for (const a of list) {
          const text = String(a.rawStatus || a.status || a.availabilityText || '');
          if (/AVL|AVAILABLE|RAC/i.test(text)) {
            foundAvailableOrRac = true;
            console.log(`Captured real status: "${text}" on date ${a.date}`);
          }
        }
      }
    }
  }

  // 3. Train Info vs Track Train V1/V2 for route provider (Hypothesis c)
  const trainInfoRes = await apiCall(`/api/v1/trains/${train1}/info`, `Train Info for ${train1}`);
  fs.writeFileSync(
    path.join(FIXTURES_DIR, `train_info_${train1}.json`),
    JSON.stringify(sanitize(trainInfoRes.data), null, 2)
  );
  report.fixturesSaved.push(`train_info_${train1}.json`);

  const liveTrackRes = await apiCall(`/api/v1/trains/${train1}/live/25-10-2026`, `Live Track for ${train1}`);
  fs.writeFileSync(
    path.join(FIXTURES_DIR, `live_track_${train1}.json`),
    JSON.stringify(sanitize(liveTrackRes.data), null, 2)
  );
  report.fixturesSaved.push(`live_track_${train1}.json`);

  // 4. Cancelled Trains endpoint (Hypothesis d)
  const cancelledWithDate = await apiCall('/api/v1/trains/cancelled?date=25-10-2026', 'Cancelled trains (with date)');
  fs.writeFileSync(
    path.join(FIXTURES_DIR, 'cancelled_trains_date.json'),
    JSON.stringify(sanitize(cancelledWithDate.data), null, 2)
  );
  report.fixturesSaved.push('cancelled_trains_date.json');

  const cancelledNoDate = await apiCall('/api/v1/trains/cancelled', 'Cancelled trains (no query param)');
  fs.writeFileSync(
    path.join(FIXTURES_DIR, 'cancelled_trains_nodate.json'),
    JSON.stringify(sanitize(cancelledNoDate.data), null, 2)
  );
  report.fixturesSaved.push('cancelled_trains_nodate.json');

  // Check 429/error shape with invalid request or invalid endpoint (safe check, 1 call)
  const errProbe = await apiCall('/api/v1/seats/INVALID/XXX/YYY/01-01-2099/3A/GN', 'Error shape probe');
  fs.writeFileSync(
    path.join(FIXTURES_DIR, 'error_shape_probe.json'),
    JSON.stringify(sanitize(errProbe.data), null, 2)
  );
  report.fixturesSaved.push('error_shape_probe.json');

  report.callsUsed = callCounter;
  console.log('\n====================================================');
  console.log(`Probe completed successfully! Total calls used: ${callCounter}/${MAX_BUDGET}`);
  console.log(`Fixtures saved in: ${FIXTURES_DIR}`);
  console.log('====================================================');

  return report;
}

runProbe().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(1);
});
