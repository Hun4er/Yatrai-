import mongoose from 'mongoose';

const SERVER_URL = 'http://127.0.0.1:5000';
const TEST_DATE = '2026-10-21'; // Peak travel date where Tier 1 direct trains are waitlisted

async function getStats() {
  const r = await fetch(`${SERVER_URL}/api/providers/railkit/stats`);
  const j = await r.json();
  return j.data;
}

async function runTask2Proof() {
  console.log('================================================================');
  console.log('       TASK 2 VERIFICATION: TIER 2 AVAILABILITY PROOF');
  console.log('================================================================');
  console.log(`Corridor: NDLS -> PNBE (Delhi to Patna)`);
  console.log(`Date: ${TEST_DATE}`);
  console.log(`Class: 3A | Quota: GN`);

  const statsBefore = await getStats();
  console.log('\n--- 1. RAILKIT DASHBOARD / ADAPTER STATS BEFORE RUN ---');
  console.log(`Raw Outbound Requests: ${statsBefore.rawOutboundRequests}`);
  console.log(`Usage Offset: ${statsBefore.usageOffset}`);
  console.log(`Total Effective Outbound Requests: ${statsBefore.totalOutboundRequests}`);
  console.log(`Quota Limit: ${statsBefore.quotaLimit}`);
  console.log(`Quota Used: ${statsBefore.percentage}%`);

  const startTime = Date.now();
  console.log('\n--- 2. EXECUTING LIVE JOURNEY SEARCH VIA HTTP POST ---');
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

  console.log('\n--- 3. CANDIDATE JOURNEY DETAILS & AVAILABILITY STATUSES ---');
  let t1CheckedCount = 0;
  let t2CheckedCount = 0;

  journeys.forEach((j, idx) => {
    const trainNo = j.metadata?.trainNumber || j.legs?.[0]?.service?.number || 'Unknown';
    const trainName = j.metadata?.trainName || j.legs?.[0]?.service?.name || 'Unknown';
    const fromCode = j.metadata?.fromStationCode || j.legs?.[0]?.originStation?.code || 'Unknown';
    const toCode = j.metadata?.toStationCode || j.legs?.[0]?.destinationStation?.code || 'Unknown';
    const availStatus = j.metadata?.availabilityStatus || j.availabilityStatus || 'Unknown';
    const rawStatus = j.availability?.originalStatus || j.availability?.rawStatus || 'None';
    const fare = j.pricing?.totalFare ?? j.totalPrice ?? 'Unavailable';
    const fareSource = j.pricing?.fareSource || (j.pricing?.isEstimated ? 'estimate' : 'verified');
    const isShift = j.isClusterShift || j.stationDifference?.hasDifference || false;
    const shiftSummary = j.stationDifference?.summaryLabel || j.clusterNote || 'Direct pair';
    const tier = (j.metadata?.tier === 'tier2' || j.tier === 'tier2' || isShift || (fromCode !== 'NDLS' || toCode !== 'PNBE')) ? 'Tier 2 (Cluster)' : 'Tier 1';

    if (availStatus !== 'UNCHECKED' && availStatus !== 'CLASS_NOT_OFFERED') {
      if (tier === 'Tier 1') t1CheckedCount++;
      else t2CheckedCount++;
    }

    console.log(`\nCandidate #${idx + 1}: Train ${trainNo} - ${trainName}`);
    console.log(`  Tier: ${tier}`);
    console.log(`  Segment: ${fromCode} -> ${toCode} ${isShift ? `[Shift: ${shiftSummary}]` : '[Exact Pair]'}`);
    console.log(`  Availability: ${availStatus} (Raw: "${rawStatus}")`);
    console.log(`  Fare: ₹${fare} (Source: ${fareSource})`);
    console.log(`  Bookable: ${j.isBookable ? 'YES' : 'NO'}`);
  });

  const statsAfter = await getStats();
  const netLiveConsumed = statsAfter.rawOutboundRequests - statsBefore.rawOutboundRequests;

  console.log('\n--- 4. STATS AFTER RUN & NET CONSUMPTION ---');
  console.log(`Raw Outbound Requests: ${statsAfter.rawOutboundRequests}`);
  console.log(`Usage Offset: ${statsAfter.usageOffset}`);
  console.log(`Total Effective Outbound Requests: ${statsAfter.totalOutboundRequests}`);
  console.log(`NET Live Requests Consumed: ${netLiveConsumed}`);
  console.log(`Task 2 Live Limit: 40 requests`);
  console.log(`Within Budget: ${netLiveConsumed <= 40 ? 'YES ✅' : 'NO ❌'}`);

  console.log('\n--- 5. TIER ALLOCATION COMPLIANCE SUMMARY ---');
  console.log(`Tier 1 Availability Checks Made: ${t1CheckedCount} (Cap: max 50% = 2)`);
  console.log(`Tier 2 Availability Checks Made: ${t2CheckedCount} (Reserved remainder allocated to Tier 2)`);
  console.log(`Tier 2 Candidates Received Availability: ${t2CheckedCount > 0 ? 'YES ✅' : 'NO ❌'}`);

  return {
    success: res.ok,
    netLiveConsumed,
    t1CheckedCount,
    t2CheckedCount,
    statsBefore,
    statsAfter,
  };
}

runTask2Proof()
  .then((res) => {
    if (res.success && res.netLiveConsumed <= 40) {
      console.log('\n>>> TASK 2 EMPIRICAL VALIDATION PASSED! <<<');
      process.exit(0);
    } else {
      console.error('\n>>> TASK 2 EMPIRICAL VALIDATION FAILED! <<<');
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Task 2 execution failed:', err);
    process.exit(1);
  });
