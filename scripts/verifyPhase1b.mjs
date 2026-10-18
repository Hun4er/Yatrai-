import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../server/.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/yatrai_dev';
const API_BASE = 'http://localhost:5000/api';

async function checkServerHealth() {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

async function getStats() {
  const res = await fetch(`${API_BASE}/providers/railkit/stats`);
  return res.json();
}

async function main() {
  console.log('=== PHASE 1b-i EMPIRICAL VERIFICATION ===');
  console.log(`Database URI: ${MONGODB_URI}`);

  // Connect to persistent DB directly to inspect collections
  await mongoose.connect(MONGODB_URI);
  console.log(`Connected to MongoDB: ${mongoose.connection.name}`);

  const usageCol = mongoose.connection.collection('apiusages');
  const cacheCol = mongoose.connection.collection('persistentcaches');

  const beforeUsageDoc = await usageCol.findOne({ provider: 'railkit' });
  const beforeCacheCount = await cacheCol.countDocuments();

  console.log(`[Before Run] DB ApiUsage count: ${beforeUsageDoc?.count ?? 0}`);
  console.log(`[Before Run] DB PersistentCache documents: ${beforeCacheCount}`);

  // Fetch adapter stats from server
  const beforeStats = await getStats();
  console.log(`[Before Run] Server Adapter Outbound Counter:`, beforeStats.data);

  // Run cold NDLS -> PNBE for date 7 days ahead (2026-10-25)
  // Ensure the cache for 2026-10-25 is cleared so it is truly a cold search
  console.log('\n--- Ensuring cold search for 2026-10-25 ---');
  const deleteResult = await cacheCol.deleteMany({
    key: { $regex: '25-10-2026|2026-10-25' }
  });
  console.log(`Cleared ${deleteResult.deletedCount} cached entries for 2026-10-25 to ensure cold run.`);

  console.log('\n--- Executing Cold NDLS -> PNBE Search ---');
  const startTime = Date.now();
  const searchRes = await fetch(`${API_BASE}/journeys/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: 'NDLS',
      destination: 'PNBE',
      departureDate: '2026-10-25',
      passengers: 1,
      preferences: { class: '3A', quota: 'GN' },
    }),
  });

  const durationMs = Date.now() - startTime;
  const searchData = await searchRes.json();

  console.log(`Search HTTP Status: ${searchRes.status}`);
  console.log(`Search Duration: ${(durationMs / 1000).toFixed(2)}s`);
  console.log(`Search Status: ${searchData.data?.directStatus || searchData.status}`);
  console.log(`Direct Journeys Found: ${searchData.data?.directJourneys?.length || searchData.journeys?.length || 0}`);

  const journeys = searchData.data?.directJourneys || searchData.journeys || [];
  journeys.slice(0, 3).forEach((j, i) => {
    console.log(`  [Journey ${i + 1}] Train ${j.metadata?.trainNumber} (${j.metadata?.trainName}): Status=${j.metadata?.availabilityStatus || j.availabilityStatus}, Price=₹${j.pricing?.totalFare || j.totalPrice}, Duration=${j.duration}m`);
  });

  // Check stats after cold run
  const afterColdStats = await getStats();
  const afterColdUsageDoc = await usageCol.findOne({ provider: 'railkit' });
  const afterColdCacheCount = await cacheCol.countDocuments();

  const coldOutboundUsed = (afterColdStats.data?.totalOutboundRequests || 0) - (beforeStats.data?.totalOutboundRequests || 0);
  console.log(`\n[After Cold Run] Outbound Requests Consumed: ${coldOutboundUsed}`);
  console.log(`[After Cold Run] Server Adapter Outbound Counter:`, afterColdStats.data);
  console.log(`[After Cold Run] DB ApiUsage count: ${afterColdUsageDoc?.count ?? 0}`);
  console.log(`[After Cold Run] DB PersistentCache count: ${afterColdCacheCount}`);

  // Second Run (Warm / Cached Run)
  console.log('\n--- Executing Second (Cached) NDLS -> PNBE Search ---');
  const warmStartTime = Date.now();
  const warmSearchRes = await fetch(`${API_BASE}/journeys/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: 'NDLS',
      destination: 'PNBE',
      departureDate: '2026-10-25',
      passengers: 1,
      preferences: { class: '3A', quota: 'GN' },
    }),
  });

  const warmDurationMs = Date.now() - warmStartTime;
  const warmSearchData = await warmSearchRes.json();

  const afterWarmStats = await getStats();
  const warmOutboundUsed = (afterWarmStats.data?.totalOutboundRequests || 0) - (afterColdStats.data?.totalOutboundRequests || 0);

  console.log(`Warm Search HTTP Status: ${warmSearchRes.status}`);
  console.log(`Warm Search Duration: ${(warmDurationMs / 1000).toFixed(2)}s`);
  console.log(`Warm Search Outbound Requests Consumed: ${warmOutboundUsed} (Expected: 0)`);

  await mongoose.disconnect();
  console.log('\n=== VERIFICATION FINISHED ===');
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
