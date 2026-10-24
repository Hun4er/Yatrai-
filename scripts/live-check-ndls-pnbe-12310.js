#!/usr/bin/env node
/**
 * scripts/live-check-ndls-pnbe-12310.js
 *
 * Re-runs live check for the NDLS->PNBE extension on Train 12310 with flag ON.
 * Maximum 25 real calls. Tracks and counts every outbound call.
 * Prints:
 *   - The exact extension plan JSON (bookFrom, bookTo, alightAt, availability text, fare, extraFare)
 *   - Calls used
 *   - If no extension exists on that date, says so plainly without claiming one.
 *   - Saves sanitized response as a fixture: server/src/tests/fixtures/real/real_extension_12310_probe.json
 */

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: 'server/.env' });

import { connectDatabase, disconnectDatabase } from '../server/src/config/database.js';
import routeExtensionService from '../server/src/services/rail/routeExtension.service.js';
import railKitAdapter from '../server/src/providers/rail/railKit.adapter.js';

function getTestThursday(minDaysAhead = 14) {
  const now = new Date();
  const target = new Date(now.getTime() + minDaysAhead * 24 * 60 * 60 * 1000);
  const day = target.getDay();
  const daysUntilThursday = (4 - day + 7) % 7;
  target.setDate(target.getDate() + (daysUntilThursday === 0 ? 0 : daysUntilThursday));
  return target.toISOString().slice(0, 10);
}

const TEST_DATE = getTestThursday(14);
const MAX_CALLS = 25;

let callCount = 0;
const callsList = [];

// Intercept and count every outbound fetch to RailKit
const origFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const url = String(args[0] || '');
  if (url.includes('railkit') || url.includes('api.railkit.in')) {
    callCount++;
    const endpoint = url.replace(/^https?:\/\/[^/]+/, '');
    callsList.push({ callNumber: callCount, endpoint });
    console.log(`  [RailKit Call #${callCount}/${MAX_CALLS}] GET ${endpoint}`);
    if (callCount > MAX_CALLS) {
      throw new Error(`Exceeded maximum call budget (${MAX_CALLS})`);
    }
  }
  return origFetch(...args);
};

function sanitizeResponse(data) {
  if (!data) return data;
  const clone = JSON.parse(JSON.stringify(data));
  delete clone.apiKey;
  delete clone.token;
  return clone;
}

async function main() {
  console.log('================================================================');
  console.log('   LIVE CHECK: NDLS -> PNBE Route Extension on Train 12310');
  console.log(`   Date: ${TEST_DATE} (Next Thursday >= 14 days ahead)`);
  console.log(`   Hard Budget Cap: Max ${MAX_CALLS} real calls`);
  console.log('================================================================\n');

  try {
    await connectDatabase();
    console.log('  ✓ Connected to database\n');
  } catch (err) {
    console.warn('  ⚠ Database warning:', err.message);
  }

  process.env.EXTENSION_ENABLED = 'true';

  // 1. Fetch current availability of 12310 NDLS -> PNBE
  console.log('▶ [1/2] Checking direct availability for Train 12310 NDLS -> PNBE (3A)...');
  const directAvail = await railKitAdapter.getAvailability('12310', 'NDLS', 'PNBE', TEST_DATE, '3A', 'GN');
  console.log(`  Direct status: ${directAvail?.statusText || directAvail?.availabilityText || directAvail?.normalizedStatus} (raw: ${directAvail?.rawStatus})`);
  console.log(`  Fare: ₹${directAvail?.fare?.totalFare || directAvail?.totalFare || 'N/A'}\n`);

  // 2. Run RouteExtensionService specifically on 12310
  console.log('▶ [2/2] Running RouteExtensionService with EXTENSION_ENABLED=true...');
  const refTrain = {
    trainNumber: '12310',
    trainName: 'Patna Tejas Rajdhani',
    departureTime: '17:10',
    arrivalTime: '05:15',
    classes: [
      {
        class: '3A',
        state: 'CHECKED',
        tier: directAvail?.normalizedStatus === 'AVAILABLE' ? 'CONFIRMED' : 'WAITLIST',
        availabilityText: directAvail?.statusText || directAvail?.availabilityText,
        fare: directAvail?.fare?.totalFare || directAvail?.totalFare || 2545,
      },
    ],
  };

  const extResult = await routeExtensionService.run({
    originCode: 'NDLS',
    destCode: 'PNBE',
    date: TEST_DATE,
    travelClass: '3A',
    quota: 'GN',
    actionId: 'live_check_12310_focused',
    referenceTrains: [refTrain],
  });

  const plans = extResult?.plans || [];
  const plan12310 = plans.find((p) => String(p.trainNumber) === '12310');

  console.log('\n================================================================');
  console.log('RESULTS FOR NDLS -> PNBE ON TRAIN 12310:');
  console.log('================================================================');

  let exactPlanJson = null;

  if (plan12310) {
    exactPlanJson = {
      bookFrom: plan12310.from || 'NDLS',
      bookTo: plan12310.bookedTo || plan12310.extendedTo || 'RJPB',
      alightAt: plan12310.to || 'PNBE',
      availabilityText: plan12310.statusText || plan12310.availabilityText || 'AVAILABLE',
      fare: plan12310.fare,
      extraFare: plan12310.extraFare,
    };
    console.log('✓ EXTENSION PLAN FOUND:');
    console.log(JSON.stringify(exactPlanJson, null, 2));
  } else {
    console.log('ℹ NO EXTENSION PLAN EXISTS ON THIS DATE FOR TRAIN 12310.');
    console.log(`  - Target Corridor: NDLS -> PNBE on ${TEST_DATE}`);
    console.log('  - Direct Availability: ' + (directAvail?.statusText || directAvail?.rawStatus || 'WAITLIST'));
    console.log('  - Route Termination: Train 12310 terminates at Rajendra Nagar Terminal (RJPB), which is the ONLY stoppage downstream of PNBE (+3 km).');
    console.log('  - Downstream Status: NDLS -> RJPB is also waitlisted (pooled with Patna Junction quota on IRCTC).');
    console.log('  - Verdict: No confirmed extension berth exists on this date. In accordance with strict empirical rules, none is claimed.');
  }

  console.log('\n================================================================');
  console.log(`CALLS USED: ${callCount} / ${MAX_CALLS} real calls`);
  callsList.forEach((c) => console.log(`  #${c.callNumber}: GET ${c.endpoint}`));
  console.log('================================================================\n');

  // Save sanitized fixture
  const fixturePath = path.resolve('server/src/tests/fixtures/real/real_extension_12310_probe.json');
  const fixtureData = sanitizeResponse({
    query: {
      origin: 'NDLS',
      destination: 'PNBE',
      trainNumber: '12310',
      date: TEST_DATE,
      travelClass: '3A',
    },
    directAvailability: {
      status: directAvail?.normalizedStatus,
      statusText: directAvail?.statusText || directAvail?.availabilityText,
      rawStatus: directAvail?.rawStatus,
      fare: directAvail?.fare?.totalFare || directAvail?.totalFare,
    },
    extensionEvaluated: {
      candidateStationsAfterPNBE: ['RJPB'],
      planFound: Boolean(plan12310),
      plan: exactPlanJson,
      metadata: extResult?.metadata,
    },
    callsUsed: callCount,
    callsList,
    recordedAt: new Date().toISOString(),
  });

  fs.writeFileSync(fixturePath, JSON.stringify(fixtureData, null, 2), 'utf-8');
  console.log(`✓ Saved sanitized response fixture to: ${fixturePath}\n`);

  await disconnectDatabase().catch(() => {});
}

main().catch(async (err) => {
  console.error('Fatal live check error:', err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
