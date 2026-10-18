import fs from 'fs';

const SERVER_URL = 'http://127.0.0.1:5000';
const TEST_DATE = '2026-10-29'; // Cold date, not in persistent cache

async function getStats() {
  const r = await fetch(`${SERVER_URL}/api/providers/railkit/stats`);
  const j = await r.json();
  return j.data;
}

async function runColdTest() {
  console.log('====================================================');
  console.log('   PHASE 1b-ii VERIFICATION: NDLS -> PNBE COLD RUN');
  console.log('====================================================');
  console.log(`Route: NDLS -> PNBE`);
  console.log(`Date: ${TEST_DATE} (Cold date, 0 cached entries)`);

  const statsBefore = await getStats();
  console.log('\n--- 1. STATS BEFORE RUN ---');
  console.log(`Raw Outbound Requests: ${statsBefore.rawOutboundRequests}`);
  console.log(`Usage Offset: ${statsBefore.usageOffset}`);
  console.log(`Total Outbound Requests: ${statsBefore.totalOutboundRequests}`);
  console.log(`Quota Limit: ${statsBefore.quotaLimit}`);
  console.log(`Percentage: ${statsBefore.percentage}%`);

  const startTime = Date.now();
  console.log('\n--- 2. EXECUTING JOURNEY SEARCH ---');
  const res = await fetch(`${SERVER_URL}/api/journeys/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: 'NDLS',
      destination: 'PNBE',
      departureDate: TEST_DATE,
      passengers: 1,
      preferences: { class: '3A', quota: 'GN' },
      requestedModes: ['rail'],
    }),
  });

  const durationMs = Date.now() - startTime;
  const json = await res.json();

  console.log(`HTTP Status: ${res.status}`);
  console.log(`Search Duration: ${durationMs}ms`);

  const journeys = json.data?.journeys || json.journeys || [];
  console.log(`Total Journeys Returned: ${journeys.length}`);

  console.log('\n--- 3. CANDIDATE JOURNEY DETAILS ---');
  journeys.forEach((j, idx) => {
    const trainNo = j.metadata?.trainNumber || j.legs?.[0]?.service?.number || 'Unknown';
    const trainName = j.metadata?.trainName || j.legs?.[0]?.service?.name || 'Unknown';
    const fromCode = j.metadata?.fromStationCode || j.legs?.[0]?.originStation?.code || 'Unknown';
    const toCode = j.metadata?.toStationCode || j.legs?.[0]?.destinationStation?.code || 'Unknown';
    const status = j.metadata?.availabilityStatus || j.availabilityStatus || j.availability?.normalizedStatus || 'Unknown';
    const rawStatus = j.availability?.originalStatus || j.availability?.rawStatus || 'None';
    const fare = j.pricing?.totalFare ?? j.totalPrice ?? 'Unavailable';
    const isEst = j.pricing?.isEstimated || j.metadata?.isEstimatedPrice || false;
    const isShift = j.isClusterShift || j.stationDifference?.hasDifference || false;
    const shiftNote = j.stationDifference?.summaryLabel || j.clusterNote || 'None';

    console.log(`\nCandidate #${idx + 1}: Train ${trainNo} (${trainName})`);
    console.log(`  Route: ${fromCode} -> ${toCode} ${isShift ? `(Cluster Shift: ${shiftNote})` : '(Primary Direct)'}`);
    console.log(`  Availability: ${status} [Raw: "${rawStatus}"]`);
    console.log(`  Fare: ₹${fare} (${isEst ? 'Estimated Tariff Fallback' : 'Verified Provider'})`);
    console.log(`  Tier: ${fromCode === 'NDLS' && toCode === 'PNBE' ? 'Tier 1' : 'Tier 2 (Cluster Alternative)'}`);
  });

  const statsAfter = await getStats();
  const netLiveConsumed = statsAfter.rawOutboundRequests - statsBefore.rawOutboundRequests;

  console.log('\n--- 4. STATS AFTER RUN & NET CONSUMPTION ---');
  console.log(`Raw Outbound Requests: ${statsAfter.rawOutboundRequests}`);
  console.log(`Usage Offset: ${statsAfter.usageOffset}`);
  console.log(`Total Outbound Requests: ${statsAfter.totalOutboundRequests}`);
  console.log(`NET Live Requests Consumed: ${netLiveConsumed}`);
  console.log(`Phase 1b-ii Limit: 40 requests`);
  console.log(`Within Budget: ${netLiveConsumed <= 40 ? 'YES ✅' : 'NO ❌'}`);

  return {
    success: res.ok,
    journeys,
    statsBefore,
    statsAfter,
    netLiveConsumed,
    durationMs,
  };
}

runColdTest().catch(console.error);
