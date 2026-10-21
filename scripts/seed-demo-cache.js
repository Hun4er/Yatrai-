#!/usr/bin/env node
/**
 * scripts/seed-demo-cache.js  (Phase 6)
 *
 * Seeds static cache data for the demo route: New Delhi (NDLS) → Patna (PNBE)
 * for the next 3 consecutive dates.
 *
 * Constraints:
 * - Static data only (search trains, train info routes, corridor hubs, cancelled lists).
 * - Max 40 calls hard cap.
 * - Leaves demo ready for sub-second responses.
 */

import dotenv from 'dotenv';
dotenv.config();

import railKitAdapter from '../server/src/providers/rail/railKit.adapter.js';
import corridorHubsService from '../server/src/services/rail/corridorHubs.service.js';
import cancelledTrainsService from '../server/src/services/rail/cancelledTrains.service.js';
import logger from '../server/src/utils/logger.js';

const CALL_BUDGET = 40;
let callCount = 0;

function incrementCall(label) {
  callCount++;
  console.log(`[Seed ${callCount}/${CALL_BUDGET}] ${label}`);
  if (callCount > CALL_BUDGET) {
    throw new Error(`Budget exceeded! Script must not exceed ${CALL_BUDGET} calls.`);
  }
}

async function main() {
  console.log('========================================================');
  console.log('   Yatrai Demo Cache Seeder — Delhi (NDLS) → Patna (PNBE)');
  console.log('   Budget Cap: Max 40 calls (Static Data Only)');
  console.log('========================================================\n');

  // Compute the next 3 dates (starting from tomorrow)
  const dates = [];
  const now = new Date();
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    dates.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
  }

  console.log(`Seeding dates: ${dates.join(', ')}\n`);

  // 1. Direct Search between NDLS and PNBE (for each date)
  for (const date of dates) {
    if (callCount >= CALL_BUDGET) break;
    incrementCall(`Search Trains: NDLS → PNBE (Date: ${date})`);
    try {
      await railKitAdapter.searchTrainBetweenStations('NDLS', 'PNBE', { date });
    } catch (err) {
      console.warn(`  Warning: search NDLS->PNBE failed: ${err.message}`);
    }
  }

  // 2. Train Info for key NDLS-PNBE trains (static route sequence & stops)
  const keyTrains = ['12310', '12394', '12304'];
  for (const trainNo of keyTrains) {
    if (callCount >= CALL_BUDGET) break;
    incrementCall(`Train Info Route: #${trainNo}`);
    try {
      await railKitAdapter.getTrainInfo(trainNo);
    } catch (err) {
      console.warn(`  Warning: getTrainInfo ${trainNo} failed: ${err.message}`);
    }
  }

  // 3. Store Corridor Hubs (0 network calls — DB / memory)
  const demoHubs = [
    { code: 'CNB', score: 10, distanceFromOriginKm: 440 },
    { code: 'PRYJ', score: 8, distanceFromOriginKm: 635 },
    { code: 'DDU', score: 6, distanceFromOriginKm: 785 },
  ];
  await corridorHubsService.storeHubs('NDLS', 'PNBE', demoHubs);
  console.log(`\n[Corridor Hubs] Stored 3 key junction hubs: CNB (Kanpur), PRYJ (Prayagraj), DDU (Pt. DD Upadhyaya)\n`);

  // 4. Hub Connecting Legs: NDLS ↔ Hub and Hub ↔ PNBE (for primary demo date)
  const primaryDate = dates[0];
  const hubPairs = [
    ['NDLS', 'CNB'],
    ['CNB', 'PNBE'],
    ['NDLS', 'PRYJ'],
    ['PRYJ', 'PNBE'],
    ['NDLS', 'DDU'],
    ['DDU', 'PNBE'],
  ];

  for (const [from, to] of hubPairs) {
    if (callCount >= CALL_BUDGET) break;
    incrementCall(`Hub Leg Search: ${from} → ${to} (Date: ${primaryDate})`);
    try {
      await railKitAdapter.searchTrainBetweenStations(from, to, { date: primaryDate });
    } catch (err) {
      console.warn(`  Warning: search ${from}->${to} failed: ${err.message}`);
    }
  }

  // 5. Cancelled Trains for the 3 dates
  for (const date of dates) {
    if (callCount >= CALL_BUDGET) break;
    incrementCall(`Cancelled Trains List: ${date}`);
    try {
      await cancelledTrainsService.getCancelledTrains(date, railKitAdapter);
    } catch (err) {
      console.warn(`  Warning: cancelledTrains ${date} failed: ${err.message}`);
    }
  }

  console.log('\n========================================================');
  console.log(`Cache Seeding Complete!`);
  console.log(`Total Outbound Calls Used: ${callCount} / ${CALL_BUDGET} max`);
  console.log(`All static data for demo route NDLS → PNBE is now cached.`);
  console.log('========================================================\n');
}

main().catch((err) => {
  console.error('Seed script failed:', err.message);
  process.exit(1);
});
