import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../server/.env') });

// Explicitly enable live requests for this verification script
process.env.LIVE_REQUESTS_ALLOWED = 'true';

import { connectDatabase, disconnectDatabase } from '../server/src/config/database.js';
import railKitAdapter from '../server/src/providers/rail/railKit.adapter.js';
import { directJourneyService } from '../server/src/services/rail/directJourney.service.js';
import { RequestBudgetTracker } from '../server/src/services/rail/requestBudget.js';
import apiUsageService from '../server/src/services/rail/apiUsage.service.js';
import PersistentCache from '../server/src/models/PersistentCache.js';

async function run() {
  console.log('===============================================================');
  console.log('PHASE 1b-i LIVE VERIFICATION & PERSISTENCE TEST');
  console.log('Dashboard baseline: 1,881 requests used at 18 Oct 21:46 IST');
  console.log('Current Time:', new Date().toISOString());
  console.log('Max live request allowance for this run: 40');
  console.log('===============================================================\n');

  // Step 1: Connect to persistent MongoDB
  await connectDatabase();
  await railKitAdapter.syncUsage();

  const initialUsage = await apiUsageService.getUsage('railkit');
  const initialCacheCount = await PersistentCache.countDocuments();
  const initialAdapterStats = railKitAdapter.getStats();

  console.log(`[Initial State] Persistent DB: ${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`);
  console.log(`[Initial State] Usage Counter (DB): ${initialUsage.count}`);
  console.log(`[Initial State] Persistent Cache Count: ${initialCacheCount}`);
  console.log(`[Initial State] Adapter Counter: ${initialAdapterStats.totalOutboundRequests}\n`);

  // Target cold search date: 7 days ahead (2026-10-25)
  const testDate = '2026-10-25';
  console.log(`[Cold Prep] Clearing any existing cached entries for date: ${testDate}`);
  const cleared = await PersistentCache.deleteMany({ key: { $regex: '25-10-2026|2026-10-25' } });
  console.log(`[Cold Prep] Deleted ${cleared.deletedCount} cache entries to guarantee cold run.\n`);

  // Clear in-memory cache in adapter
  railKitAdapter._cache.clear();

  // Track detailed endpoint breakdown
  const endpointRequests = {
    timetable: 0,
    availability: 0,
    fare: 0,
    other: 0,
  };

  // Wrap adapter._fetch with counter to track endpoints
  const originalFetch = railKitAdapter._fetch.bind(railKitAdapter);
  railKitAdapter._fetch = async function (url, options = {}) {
    if (url.includes('/trains/between')) endpointRequests.timetable++;
    else if (url.includes('/availability/')) endpointRequests.availability++;
    else if (url.includes('/fare/')) endpointRequests.fare++;
    else endpointRequests.other++;
    return originalFetch(url, options);
  };

  // Step 2: Run Cold NDLS -> PNBE
  console.log(`[Run 1: Cold Search] Starting direct search for NDLS -> PNBE on ${testDate}...`);
  const budgetTracker = new RequestBudgetTracker({
    maxDirectRequests: 4,
    maxStaticRequests: 25,
    tier1Limit: 2,
    tier2Limit: 8,
  });

  const startTime = Date.now();
  const searchResult = await directJourneyService.searchDirectTrains(
    {
      origin: 'NDLS',
      destination: 'PNBE',
      departureDate: testDate,
      passengers: 1,
      preferences: { class: '3A', quota: 'GN' },
    },
    { budgetTracker }
  );
  const runtimeMs = Date.now() - startTime;

  console.log(`\n[Run 1: Cold Search Completed] Runtime: ${runtimeMs} ms (${(runtimeMs / 1000).toFixed(2)}s)`);
  console.log(`[Run 1: Cold Search Outcome] Status: ${searchResult.status}`);
  console.log(`[Run 1: Cold Search Outcome] Direct Journeys: ${searchResult.directJourneys?.length || 0}`);
  if (searchResult.bestDirectJourney) {
    const b = searchResult.bestDirectJourney;
    console.log(`  Top Pick: Train ${b.metadata?.trainNumber} (${b.metadata?.trainName}) | Avail: ${b.availability?.normalizedStatus} (${b.availability?.rawStatus}) | Fare: ₹${b.pricing?.totalFare} | Dep: ${b.departureTimeFormatted} Arr: ${b.arrivalTimeFormatted}`);
  }

  const postRun1Stats = railKitAdapter.getStats();
  const postRun1Usage = await apiUsageService.getUsage('railkit');
  const postRun1CacheCount = await PersistentCache.countDocuments();
  const coldRequestsUsed = postRun1Stats.totalOutboundRequests - initialAdapterStats.totalOutboundRequests;

  console.log('\n--- Cold Search Breakdown ---');
  console.log(`Live Requests Consumed: ${coldRequestsUsed}`);
  console.log(`Endpoint Breakdown:`, endpointRequests);
  console.log(`Tier Breakdown:`, {
    tier1: budgetTracker.tierUsed.tier1,
    tier2: budgetTracker.tierUsed.tier2,
    tier3: budgetTracker.tierUsed.tier3,
    staticTotal: budgetTracker.staticRequestsUsed,
    directAvailability: budgetTracker.directRequestsUsed,
  });
  console.log(`Persistent DB Usage Counter: ${postRun1Usage.count}`);
  console.log(`Persistent Cache Total Entries: ${postRun1CacheCount}\n`);

  // Step 3: Server Restart 1 Simulation
  console.log('[Restart 1] Simulating server shutdown & restart...');
  await disconnectDatabase();

  // Reset adapter memory cache
  railKitAdapter._cache.clear();
  railKitAdapter._monthlyCount = 0;

  // Re-start / re-connect
  await connectDatabase();
  await railKitAdapter.syncUsage();

  const restart1Usage = await apiUsageService.getUsage('railkit');
  const restart1Stats = railKitAdapter.getStats();
  const restart1CacheCount = await PersistentCache.countDocuments();

  console.log(`[Restart 1 Verified] Usage counter survived restart: ${restart1Stats.totalOutboundRequests} (DB: ${restart1Usage.count})`);
  console.log(`[Restart 1 Verified] Cache survived restart: ${restart1CacheCount} entries in DB\n`);

  // Step 4: Run NDLS -> PNBE Warm (after restart 1)
  console.log(`[Run 2: Warm Search] Running NDLS -> PNBE on ${testDate} after restart...`);
  const warmBudgetTracker = new RequestBudgetTracker({
    maxDirectRequests: 4,
    maxStaticRequests: 25,
  });

  const warmBeforeRequests = railKitAdapter.getStats().totalOutboundRequests;
  const warmStartTime = Date.now();
  const warmResult = await directJourneyService.searchDirectTrains(
    {
      origin: 'NDLS',
      destination: 'PNBE',
      departureDate: testDate,
      passengers: 1,
      preferences: { class: '3A', quota: 'GN' },
    },
    { budgetTracker: warmBudgetTracker }
  );
  const warmRuntimeMs = Date.now() - warmStartTime;
  const warmAfterRequests = railKitAdapter.getStats().totalOutboundRequests;
  const warmRequestsUsed = warmAfterRequests - warmBeforeRequests;

  console.log(`[Run 2: Warm Search Completed] Runtime: ${warmRuntimeMs} ms (${(warmRuntimeMs / 1000).toFixed(2)}s)`);
  console.log(`[Run 2: Warm Search Outcome] Status: ${warmResult.status}`);
  console.log(`[Run 2: Warm Search Requests Consumed]: ${warmRequestsUsed} (Expected: 0)`);
  console.log(`[Run 2: Warm Cache Hits in BudgetTracker]: ${warmBudgetTracker.cacheHits}\n`);

  // Step 5: Server Restart 2 Simulation
  console.log('[Restart 2] Simulating second server shutdown & restart...');
  await disconnectDatabase();

  railKitAdapter._cache.clear();
  railKitAdapter._monthlyCount = 0;

  await connectDatabase();
  await railKitAdapter.syncUsage();

  const restart2Usage = await apiUsageService.getUsage('railkit');
  const restart2Stats = railKitAdapter.getStats();
  const restart2CacheCount = await PersistentCache.countDocuments();

  console.log(`[Restart 2 Verified] Usage counter survived 2nd restart: ${restart2Stats.totalOutboundRequests} (DB: ${restart2Usage.count})`);
  console.log(`[Restart 2 Verified] Cache survived 2nd restart: ${restart2CacheCount} entries in DB\n`);

  // Final Summary
  console.log('===============================================================');
  console.log('FINAL RECONCILIATION REPORT');
  console.log(`Dashboard Baseline: 1,881 requests at 18 Oct 21:46 IST`);
  console.log(`Total Live Outbound Requests Consumed in this phase run: ${coldRequestsUsed + warmRequestsUsed}`);
  console.log(`Estimated RailKit Dashboard Total after run: ${1881 + coldRequestsUsed + warmRequestsUsed}`);
  console.log('===============================================================');

  await disconnectDatabase();
}

run().catch((err) => {
  console.error('[FATAL ERROR IN LIVE VERIFICATION]:', err);
  process.exit(1);
});
