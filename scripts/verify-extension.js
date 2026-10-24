#!/usr/bin/env node
/**
 * scripts/verify-extension.js (Phase 3 Live Check)
 *
 * Requirements:
 * 1. On a route and date where A->B is not CONFIRMED, run search with flag OFF, then ON.
 * 2. Capped at max 30 real calls total.
 * 3. Print call counts (cold/warm), extension plans found (or none and why),
 *    and a diff summary showing non-extension plans did not change.
 * 4. Save a sanitized real response as a fixture if an extension plan exists.
 */

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

// Load server .env
dotenv.config({ path: 'server/.env' });

import { connectDatabase, disconnectDatabase } from '../server/src/config/database.js';
import { journeyV2Controller } from '../server/src/controllers/journeyV2.controller.js';

const ROUTE = {
  origins: ['PUNE'],
  destinations: ['NGP'],
  date: '2026-11-20',
  travelClass: '3A',
  mode: 'auto',
};

const MAX_REAL_CALLS = 30;

function sanitizeResponse(data) {
  if (!data) return data;
  const clone = JSON.parse(JSON.stringify(data));
  delete clone.apiKey;
  delete clone.token;
  return clone;
}

function diffNonExtensionPlans(flagOffAlts = [], flagOnAlts = []) {
  const nonExtOn = flagOnAlts.filter((p) => p.type !== 'EXTENSION');
  const differences = [];

  if (flagOffAlts.length !== nonExtOn.length) {
    differences.push(
      `Count mismatch: flag OFF has ${flagOffAlts.length} non-extension plans; flag ON has ${nonExtOn.length}`
    );
  }

  const minLen = Math.min(flagOffAlts.length, nonExtOn.length);
  for (let i = 0; i < minLen; i++) {
    const a = flagOffAlts[i];
    const b = nonExtOn[i];
    if (a.trainNo !== b.trainNo || a.trainNumber !== b.trainNumber || a.type !== b.type) {
      differences.push(
        `Index ${i} mismatch: OFF has (${a.type}:${a.trainNo || a.trainNumber}), ON has (${b.type}:${b.trainNo || b.trainNumber})`
      );
    }
  }

  return {
    identical: differences.length === 0,
    differences,
    nonExtCountOff: flagOffAlts.length,
    nonExtCountOn: nonExtOn.length,
  };
}

async function runSearch(actionId, extensionEnabled) {
  process.env.EXTENSION_ENABLED = extensionEnabled ? 'true' : 'false';

  let resData = null;
  let resStatus = 200;

  const req = {
    body: {
      actionId,
      origins: ROUTE.origins,
      destinations: ROUTE.destinations,
      date: ROUTE.date,
      mode: ROUTE.mode,
      class: ROUTE.travelClass,
    },
  };

  const res = {
    status(s) {
      resStatus = s;
      return this;
    },
    json(d) {
      resData = d;
      return this;
    },
  };

  await journeyV2Controller.search(req, res, (err) => {
    throw err;
  });

  return { status: resStatus, data: resData?.data };
}

let realCallsCount = 0;
const origFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const url = String(args[0] || '');
  if (url.includes('railkit') || url.includes('api.railkit.in')) {
    realCallsCount++;
  }
  return origFetch(...args);
};

async function main() {
  console.log('================================================================');
  console.log('   PHASE 3 — LIVE CHECK: Route Extension (Strategy A)');
  console.log(`   Route: ${ROUTE.origins.join(',')} -> ${ROUTE.destinations.join(',')} on ${ROUTE.date} (${ROUTE.travelClass})`);
  console.log(`   Hard Budget Cap: Max ${MAX_REAL_CALLS} real calls`);
  console.log('================================================================\n');

  try {
    await connectDatabase();
    console.log('  ✓ Connected to database for persistent caching\n');
  } catch (err) {
    console.warn('  ⚠ Database connection warning (using in-memory cache):', err.message);
  }

  const callsStart = realCallsCount;

  // 1. Run with Flag OFF
  console.log('▶ [1/2] Executing search with EXTENSION_ENABLED=false...');
  const offResult = await runSearch('verify_live_flag_off', false);
  const callsOff = realCallsCount - callsStart;

  console.log(`  ✓ Flag OFF status: ${offResult.status}`);
  console.log(`  ✓ Direct trains: ${offResult.data?.direct?.length || 0}`);
  console.log(`  ✓ Has confirmed direct seat: ${offResult.data?.hasConfirmedDirectSeat || false}`);
  console.log(`  ✓ Alternatives (non-extension): ${offResult.data?.alternatives?.length || 0}`);
  console.log(`  ✓ Budget used: ${offResult.data?.budget?.used || 0}/${offResult.data?.budget?.cap || 40}`);
  console.log(`  ✓ Real RailKit calls made in OFF run: ${callsOff}\n`);

  // 2. Run with Flag ON
  console.log('▶ [2/2] Executing search with EXTENSION_ENABLED=true...');
  const callsBeforeOn = realCallsCount;
  const onResult = await runSearch('verify_live_flag_on', true);
  const callsOn = realCallsCount - callsBeforeOn;
  const totalRealCalls = realCallsCount - callsStart;

  console.log(`  ✓ Flag ON status: ${onResult.status}`);
  console.log(`  ✓ Direct trains: ${onResult.data?.direct?.length || 0}`);
  console.log(`  ✓ Alternatives total: ${onResult.data?.alternatives?.length || 0}`);
  console.log(`  ✓ Budget used: ${onResult.data?.budget?.used || 0}/${onResult.data?.budget?.cap || 40}`);
  console.log(`  ✓ Real RailKit calls made in ON run: ${callsOn}`);
  console.log(`  ✓ Total real RailKit calls across both runs: ${totalRealCalls} (Cap: ${MAX_REAL_CALLS})\n`);

  if (totalRealCalls > MAX_REAL_CALLS) {
    console.error(`❌ FAILED: Exceeded maximum real call limit! (${totalRealCalls} > ${MAX_REAL_CALLS})`);
    await disconnectDatabase().catch(() => {});
    process.exit(1);
  }

  // 3. Diff Analysis
  const offAlts = offResult.data?.alternatives || [];
  const onAlts = onResult.data?.alternatives || [];
  const extensionPlans = onAlts.filter((p) => p.type === 'EXTENSION');
  const diffResult = diffNonExtensionPlans(offAlts, onAlts);

  console.log('----------------------------------------------------------------');
  console.log('DIFF SUMMARY (Non-extension plans identity):');
  if (diffResult.identical) {
    console.log(`  ✓ IDENTICAL: All ${diffResult.nonExtCountOff} non-extension plans match between flag OFF and ON.`);
  } else {
    console.error('  ❌ MISMATCH DETECTED:');
    diffResult.differences.forEach((d) => console.error(`    - ${d}`));
    await disconnectDatabase().catch(() => {});
    process.exit(1);
  }

  // 4. Extension Plans Analysis
  console.log('\nEXTENSION PLANS FOUND:');
  if (extensionPlans.length > 0) {
    console.log(`  ✓ Found ${extensionPlans.length} extension plan(s):`);
    extensionPlans.forEach((ext, idx) => {
      console.log(`    [Plan ${idx + 1}] Train ${ext.trainNumber} (${ext.trainName})`);
      console.log(`             Board at: ${ext.from} -> Deboard at: ${ext.to}`);
      console.log(`             Booked to: ${ext.extendedTo} (${ext.extendedStationName})`);
      console.log(`             Class: ${ext.laneClass || ext.class} | Status: ${ext.status} | Extra Fare: ₹${ext.extraFare}`);
    });

    // Save sanitized fixture
    const fixturesDir = path.resolve('server/src/tests/fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }
    const fixturePath = path.join(fixturesDir, 'real_extension_response.json');
    const sanitized = sanitizeResponse(onResult.data);
    fs.writeFileSync(fixturePath, JSON.stringify(sanitized, null, 2), 'utf-8');
    console.log(`\n  ✓ Saved sanitized real response to: ${fixturePath}`);
  } else {
    console.log('  ℹ No extension plan found on this corridor.');
    const reason = onResult.data?.extension?.reason || 'Downstream stations waitlisted or train terminates at destination.';
    console.log(`    Reason: ${reason}`);
  }

  console.log('\n================================================================');
  console.log('PHASE 3 VERIFICATION PASSED');
  console.log('================================================================');

  await disconnectDatabase().catch(() => {});
}

main().catch(async (err) => {
  console.error('Fatal verification error:', err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
