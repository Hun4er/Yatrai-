import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import journeyOrchestrator from '../src/orchestration/journeyOrchestrator.js';

// Global request log
const requestLog = [];
const originalFetch = globalThis.fetch;

function redactUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    for (const key of ['key', 'apiKey', 'api_key', 'token', 'auth']) {
      if (u.searchParams.has(key)) {
        u.searchParams.set(key, '[REDACTED]');
      }
    }
    return u.toString();
  } catch {
    return urlStr.replace(/([?&](?:apiKey|key|token)=)[^&]+/gi, '$1[REDACTED]');
  }
}

function getCallerInfo(stack) {
  if (!stack) return 'unknown';
  const lines = stack.split('\n');
  for (const line of lines.slice(2)) {
    if (line.includes('railKit.adapter') || line.includes('railRadar.adapter') || line.includes('directJourney') || line.includes('journeyRecovery') || line.includes('fare.service') || line.includes('availability.service')) {
      const match = line.trim().match(/at\s+([^\s]+)\s+\((.*?)\)/) || line.trim().match(/at\s+(.*)/);
      if (match) return match[1] || match[0];
    }
  }
  return lines[2]?.trim() || 'unknown';
}

globalThis.fetch = async function (url, options = {}) {
  const urlStr = typeof url === 'string' ? url : url.url || url.toString();
  const stack = new Error().stack;
  const caller = getCallerInfo(stack);

  let provider = 'OTHER';
  let endpoint = 'other';
  if (urlStr.includes('railkit.in')) {
    provider = 'RailKit';
    if (urlStr.includes('/api/v1/seats/')) endpoint = 'RailKit: Seat Availability (/api/v1/seats/)';
    else if (urlStr.includes('/api/v1/fare/')) endpoint = 'RailKit: Fare Lookup (/api/v1/fare/)';
    else if (urlStr.includes('/api/v1/stations/')) endpoint = 'RailKit: Station Lookup (/api/v1/stations/)';
    else if (urlStr.includes('/api/v1/trains/')) endpoint = 'RailKit: Train Route/Stoppages (/api/v1/trains/)';
    else endpoint = `RailKit: Other (${urlStr.split('?')[0]})`;
  } else if (urlStr.includes('railradar') || urlStr.includes('65.109.112.98')) {
    provider = 'RailRadar';
    if (urlStr.includes('/trains/between')) endpoint = 'RailRadar: Trains Between (/trains/between)';
    else if (urlStr.includes('/trains/') && urlStr.includes('/seats')) endpoint = 'RailRadar: Seat Availability (/trains/.../seats)';
    else if (urlStr.includes('/trains/') && urlStr.includes('/route')) endpoint = 'RailRadar: Train Route (/trains/.../route)';
    else endpoint = `RailRadar: Other (${urlStr.split('?')[0]})`;
  }

  const redacted = redactUrl(urlStr);
  const entry = {
    provider,
    endpoint,
    url: redacted,
    rawUrl: urlStr,
    caller,
    timestamp: new Date().toISOString(),
  };
  requestLog.push(entry);

  return originalFetch.apply(this, arguments);
};

async function run() {
  console.log('Connecting to database...');
  await connectDatabase();
  console.log('Database ready.');

  // Pick date 1 day ahead (heavily waitlisted, triggers recovery pipeline)
  const now = new Date();
  const travelDate = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
  const depDateStr = travelDate.toISOString().slice(0, 10);

  console.log(`\n======================================================`);
  console.log(`Executing Search 1 (Cold Cache): NDLS -> PNBE on ${depDateStr}`);
  console.log(`======================================================\n`);

  try {
    const result1 = await journeyOrchestrator.orchestrateSearch({
      origin: 'NDLS',
      destination: 'PNBE',
      departureDate: depDateStr,
      passengers: 1,
      travelClass: '3A',
      quota: 'GN',
      requestedModes: ['rail'],
    });

    console.log(`Search 1 completed. Total journeys returned: ${result1.journeys?.length || 0}`);
  } catch (err) {
    console.error('Search 1 error:', err);
  }

  const coldRequestsCount = requestLog.length;
  console.log(`Cold search completed with ${coldRequestsCount} outbound requests.`);

  console.log(`\n======================================================`);
  console.log(`Executing Search 2 (Warm / Repeat Search): NDLS -> PNBE`);
  console.log(`======================================================\n`);

  const warmStartIndex = requestLog.length;
  try {
    const result2 = await journeyOrchestrator.orchestrateSearch({
      origin: 'NDLS',
      destination: 'PNBE',
      departureDate: depDateStr,
      passengers: 1,
      travelClass: '3A',
      quota: 'GN',
      requestedModes: ['rail'],
    });

    console.log(`Search 2 completed. Total journeys returned: ${result2.journeys?.length || 0}`);
    if (result2.journeys && result2.journeys.length > 0) {
      console.log(`Top journey sample:`, {
        id: result2.journeys[0].id,
        duration: result2.journeys[0].duration,
        price: result2.journeys[0].totalPrice,
        legsCount: result2.journeys[0].legs?.length,
        leg1Origin: result2.journeys[0].legs?.[0]?.origin,
        leg1Dest: result2.journeys[0].legs?.[0]?.destination,
        availabilityStatus: result2.journeys[0].availabilityStatus,
      });
    }
  } catch (err) {
    console.error('Search 2 error:', err);
  }

  const repeatRequests = requestLog.slice(warmStartIndex);
  console.log(`Repeat search completed with ${repeatRequests.length} outbound requests.`);

  console.log(`\n======================================================`);
  console.log(`OUTBOUND REQUEST AUDIT REPORT (NDLS -> PNBE, Date: ${depDateStr})`);
  console.log(`======================================================\n`);

  console.log(`Total Outbound Requests: ${requestLog.length}`);

  // Endpoint counts
  const endpointCounts = {};
  for (const r of requestLog) {
    endpointCounts[r.endpoint] = (endpointCounts[r.endpoint] || 0) + 1;
  }
  console.log('\n--- Requests Per Endpoint ---');
  for (const [ep, count] of Object.entries(endpointCounts)) {
    console.log(`  - ${ep}: ${count}`);
  }

  // Duplicate requests
  const urlCounts = {};
  for (const r of requestLog) {
    urlCounts[r.url] = (urlCounts[r.url] || 0) + 1;
  }
  const duplicates = Object.entries(urlCounts).filter(([_, count]) => count > 1);
  console.log(`\n--- Duplicate Requests: ${duplicates.length} unique URLs hit multiple times ---`);
  for (const [url, count] of duplicates) {
    console.log(`  - [Hits: ${count}] ${url}`);
  }

  // Fare vs Availability breakdown
  let fareCount = 0;
  let availCount = 0;
  let timetableCount = 0;
  for (const r of requestLog) {
    if (r.endpoint.includes('Fare Lookup')) fareCount++;
    else if (r.endpoint.includes('Seat Availability')) availCount++;
    else if (r.endpoint.includes('Trains Between') || r.endpoint.includes('Train Route') || r.endpoint.includes('Stoppages')) timetableCount++;
  }
  console.log('\n--- Call Breakdown ---');
  console.log(`  - Availability Calls: ${availCount}`);
  console.log(`  - Fare Calls: ${fareCount}`);
  console.log(`  - Timetable / Station Route Calls: ${timetableCount}`);

  console.log('\n--- Detailed Chronological Outbound Log ---');
  requestLog.forEach((r, i) => {
    console.log(`[#${i + 1}] [${r.provider}] ${r.endpoint}`);
    console.log(`     URL: ${r.url}`);
    console.log(`     Caller: ${r.caller}`);
  });

  await disconnectDatabase();
  console.log('\nAudit complete.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
