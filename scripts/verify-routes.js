/**
 * Phase 4 Live Verification Script for 3 Routes
 * Routes:
 *   1. NDLS -> PNBE
 *   2. HWH -> BSB
 *   3. MMCT -> NDLS
 *
 * Measures: wall-clock time, ledger calls used, response integrity, fares, and availability.
 */

import { DirectPassService } from '../server/src/services/rail/directPass.service.js';
import { AlternativesEngineService } from '../server/src/services/rail/alternativesEngine.service.js';
import actionBudgetService from '../server/src/services/rail/actionBudget.service.js';
import { formatInIST } from '../server/src/utils/railwayTime.js';

async function runVerification() {
  console.log('=== Starting Phase 4 Route Verification ===\n');

  // Compute test date: tomorrow in IST
  const tomorrowEpoch = Date.now() + 24 * 60 * 60 * 1000;
  const travelDate = formatInIST(new Date(tomorrowEpoch)).localDate;
  console.log(`Using travel date: ${travelDate}\n`);

  const routes = [
    { origin: 'NDLS', destination: 'PNBE', name: 'Delhi to Patna', travelClass: '3A' },
    { origin: 'HWH', destination: 'BSB', name: 'Kolkata to Varanasi', travelClass: 'SL' },
    { origin: 'MMCT', destination: 'NDLS', name: 'Mumbai to Delhi', travelClass: '2A' },
  ];

  const resultsSummary = [];

  for (const r of routes) {
    const actionId = `verify_${r.origin}_${r.destination}_${Date.now()}`;
    await actionBudgetService.getOrCreate(actionId, 'default');

    const startTime = Date.now();
    console.log(`Testing Route: ${r.name} (${r.origin} -> ${r.destination}) [${r.travelClass}]...`);

    const directPass = new DirectPassService();
    const directResult = await directPass.run({
      origins: [r.origin],
      destinations: [r.destination],
      date: travelDate,
      travelClass: r.travelClass,
      quota: 'GN',
      actionId,
    });

    const elapsedMs = Date.now() - startTime;
    const budgetSummary = await actionBudgetService.getBudgetSummary(actionId);

    console.log(`  -> Completed in ${elapsedMs}ms`);
    console.log(`  -> Direct trains found: ${directResult.direct?.length || 0}`);
    console.log(`  -> Waiting trains: ${directResult.waitingTrains?.length || 0}`);
    console.log(`  -> Calls used: ${budgetSummary.used} / ${budgetSummary.cap}`);
    console.log(`  -> Cache hits: ${budgetSummary.cacheHits}`);

    if (directResult.direct?.length > 0) {
      const first = directResult.direct[0];
      const firstChip = first.classes?.[0] || {};
      console.log(`  -> Sample Train: ${first.trainNumber} (${first.trainName})`);
      console.log(`     Class ${firstChip.class}: Status=${firstChip.tier || firstChip.availabilityText || 'N/A'}, Fare=${firstChip.fare || 'Standard'}, Dep=${first.departureTime || first.departureLocalTime}`);
    }

    resultsSummary.push({
      route: `${r.origin} -> ${r.destination}`,
      name: r.name,
      travelClass: r.travelClass,
      elapsedMs,
      callsUsed: budgetSummary.used,
      cap: budgetSummary.cap,
      trainsCount: directResult.direct?.length || 0,
      waitingCount: directResult.waitingTrains?.length || 0,
      confirmed: directResult.confirmedFound,
      partial: directResult.partial,
    });
    console.log('');
  }

  console.log('=== Route Verification Summary ===');
  console.table(resultsSummary);
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
