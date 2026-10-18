#!/usr/bin/env node
/**
 * Yatrai MVP Evaluation Script
 *
 * Runs a fixed set of canonical search routes against the live server API and reports:
 *   - Per-route: status, train count, availability tier, fare, API calls consumed
 *   - Aggregate: requests consumed, booking-quality distribution, pass/fail
 *
 * Usage:
 *   node scripts/eval.mjs                          # Against local dev server (http://localhost:5000)
 *   SERVER_URL=http://localhost:5000 node scripts/eval.mjs
 *   RAILKIT_REPLAY_DIR=./fixtures/railkit node scripts/eval.mjs  # If server uses replay mode
 *
 * Does NOT start the server — you must run 'npm run dev' in server/ first.
 *
 * No API fabrication: status comes from the server's real /api/journeys/search response.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_URL = (process.env.SERVER_URL || 'http://localhost:5000').replace(/\/$/, '');
const TIMEOUT_MS = parseInt(process.env.EVAL_TIMEOUT_MS || '30000', 10);
const RESULTS_FILE = path.resolve(__dirname, '../eval_results.json');

// ─── CANONICAL TEST ROUTES ───────────────────────────────────────────────────
// These are real city pairs with known rail corridors. Dates are set to avoid
// past-date rejections by calculating 7 days ahead from script run time.

function getTestDate(daysAhead = 7) {
  const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  // YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

const TEST_DATE = getTestDate(7);

const TEST_ROUTES = [
  {
    id: 'T1',
    description: 'Delhi → Patna (busy corridor, direct trains available)',
    origin: 'New Delhi',
    destination: 'Patna',
    departureDate: TEST_DATE,
    passengers: 1,
    preferences: { class: '3A', quota: 'GN' },
    expectDirect: true,
    expectRecovery: false,
  },
  {
    id: 'T2',
    description: 'Mumbai → Kolkata (long distance, multiple trains)',
    origin: 'Mumbai',
    destination: 'Kolkata',
    departureDate: TEST_DATE,
    passengers: 1,
    preferences: { class: '3A', quota: 'GN' },
    expectDirect: true,
    expectRecovery: false,
  },
  {
    id: 'T3',
    description: 'Delhi → Varanasi (direct trains with cluster expansion)',
    origin: 'New Delhi',
    destination: 'Varanasi',
    departureDate: TEST_DATE,
    passengers: 1,
    preferences: { class: '3A', quota: 'GN' },
    expectDirect: true,
    expectRecovery: false,
  },
  {
    id: 'T4',
    description: 'Delhi → Lucknow (cluster expansion both ends)',
    origin: 'NDLS',
    destination: 'LKO',
    departureDate: TEST_DATE,
    passengers: 1,
    preferences: { class: '3A', quota: 'GN' },
    expectDirect: true,
    expectRecovery: false,
  },
  {
    id: 'T5',
    description: 'Mumbai CSMT → Surat (cluster station expansion)',
    origin: 'CSMT',
    destination: 'ST',
    departureDate: TEST_DATE,
    passengers: 1,
    preferences: { class: '3A', quota: 'GN' },
    expectDirect: true,
    expectRecovery: false,
  },
];

// ─── HTTP HELPER ─────────────────────────────────────────────────────────────

async function httpPost(url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { _rawText: text };
    }
    return { httpStatus: res.status, ok: res.ok, data };
  } catch (err) {
    return { httpStatus: 0, ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

// ─── EVALUATION LOGIC ────────────────────────────────────────────────────────

function describeAvailability(journey) {
  const status = journey?.availability?.normalizedStatus || journey?.availabilityStatus || 'UNKNOWN';
  const seats = journey?.availability?.seatsAvailable;
  const raw = journey?.availability?.rawStatus || '';
  return `${status}${seats != null ? ` (seats: ${seats})` : ''}${raw ? ` | raw: "${raw}"` : ''}`;
}

function describeBookingQuality(journeys) {
  if (!Array.isArray(journeys) || journeys.length === 0) return 'N/A';
  const tiers = journeys.map((j) => j.metadata?.availabilityStatus || j.availabilityStatus || 'UNKNOWN');
  const counts = {};
  for (const t of tiers) counts[t] = (counts[t] || 0) + 1;
  return Object.entries(counts)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
}

function evalStatus(route, result) {
  const { data, httpStatus, error } = result;
  if (error) return { pass: false, reason: `Network error: ${error}` };
  if (!result.ok) return { pass: false, reason: `HTTP ${httpStatus}: ${JSON.stringify(data?.error || data)}` };

  const body = data?.data || data;
  const directJourneys = body?.directJourneys || body?.journeys || [];
  const alternativeJourneys = body?.alternativeJourneys || body?.recoveredJourneys || [];
  const hasAny = directJourneys.length > 0 || alternativeJourneys.length > 0;

  if (!hasAny) {
    return {
      pass: false,
      reason: `No journeys returned. Status: ${body?.directSearchStatus || body?.status || 'unknown'}`,
      directCount: 0,
      alternativeCount: 0,
    };
  }

  return {
    pass: true,
    reason: 'OK',
    directCount: directJourneys.length,
    alternativeCount: alternativeJourneys.length,
    directSearchStatus: body?.directSearchStatus || body?.status,
    topJourney: directJourneys[0] || alternativeJourneys[0],
    apiRequestsConsumed: body?.debug?.apiRequestsConsumed || body?.meta?.apiRequestsConsumed || null,
    bookingQuality: describeBookingQuality([...directJourneys, ...alternativeJourneys]),
  };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function runEvaluation() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║               YATRAI MVP EVALUATION SCRIPT                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  console.log(`Server: ${SERVER_URL}`);
  console.log(`Test date: ${TEST_DATE} (7 days ahead)`);
  console.log(`Routes: ${TEST_ROUTES.length}`);
  console.log('─────────────────────────────────────────────────────────────────\n');

  // 1. Health check
  const health = await httpPost(`${SERVER_URL}/api/health`, {}).catch(() => null);
  // Try GET for health
  let healthOk = false;
  try {
    const r = await fetch(`${SERVER_URL}/api/health`, { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    healthOk = j?.status === 'ok' || j?.ok === true || r.ok;
    if (healthOk) console.log(`✅ Server health OK: ${JSON.stringify(j)}\n`);
  } catch (err) {
    console.error(`❌ Server health check failed: ${err.message}`);
    console.error('   Is the server running? Run: npm run dev  (in server/)');
    process.exit(1);
  }

  const results = [];
  let totalPass = 0;
  let totalFail = 0;
  let totalApiRequests = 0;

  for (const route of TEST_ROUTES) {
    process.stdout.write(`[${route.id}] ${route.description} ... `);

    const startMs = Date.now();
    const httpResult = await httpPost(`${SERVER_URL}/api/journeys/search`, {
      origin: route.origin,
      destination: route.destination,
      departureDate: route.departureDate,
      passengers: route.passengers,
      preferences: route.preferences,
      requestedModes: ['rail'],
    });
    const elapsedMs = Date.now() - startMs;

    const ev = evalStatus(route, httpResult);

    const emoji = ev.pass ? '✅' : '❌';
    console.log(`${emoji} ${ev.reason} (${elapsedMs}ms)`);

    if (ev.pass) {
      totalPass++;
      if (ev.apiRequestsConsumed) totalApiRequests += ev.apiRequestsConsumed;

      const top = ev.topJourney;
      console.log(`   Direct: ${ev.directCount}, Alternatives: ${ev.alternativeCount}`);
      console.log(`   Status: ${ev.directSearchStatus || 'N/A'}`);
      console.log(`   Booking quality: ${ev.bookingQuality}`);
      if (top) {
        console.log(`   Top journey:`);
        console.log(`     Train: ${top?.metadata?.trainNumber || 'N/A'} (${top?.metadata?.trainName || 'N/A'})`);
        console.log(`     Fare: ₹${top?.totalPrice ?? top?.pricing?.totalFare ?? 'N/A'} ${top?.metadata?.isEstimatedPrice ? '(est.)' : '(real)'}`);
        console.log(`     Availability: ${describeAvailability(top)}`);
        if (top?.isClusterShift) {
          console.log(`     ⚠️  Cluster shift: ${top.clusterNote}`);
        }
      }
      if (ev.apiRequestsConsumed != null) {
        console.log(`   API requests consumed this search: ${ev.apiRequestsConsumed}`);
      }
    } else {
      totalFail++;
      console.log(`   HTTP ${httpResult.httpStatus}: ${JSON.stringify(httpResult.data)?.slice(0, 200)}`);
    }

    results.push({
      ...route,
      elapsedMs,
      pass: ev.pass,
      reason: ev.reason,
      directCount: ev.directCount || 0,
      alternativeCount: ev.alternativeCount || 0,
      directSearchStatus: ev.directSearchStatus || null,
      bookingQuality: ev.bookingQuality || null,
      apiRequestsConsumed: ev.apiRequestsConsumed || null,
      topFare: ev.topJourney?.totalPrice ?? ev.topJourney?.pricing?.totalFare ?? null,
      topAvailabilityStatus: ev.topJourney?.availability?.normalizedStatus ?? null,
      isClusterShift: ev.topJourney?.isClusterShift ?? false,
    });

    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`SUMMARY: ${totalPass}/${TEST_ROUTES.length} routes passed`);
  if (totalApiRequests > 0) {
    console.log(`Total API requests consumed: ~${totalApiRequests}`);
  }
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 2. Per-route pass/fail table
  console.log('Route │ Status │ Direct │ Alternatives │ Booking Quality');
  console.log('──────┼────────┼────────┼──────────────┼──────────────────────');
  for (const r of results) {
    const status = r.pass ? '  PASS' : '  FAIL';
    const dir = String(r.directCount).padStart(6);
    const alt = String(r.alternativeCount).padStart(12);
    const bq = (r.bookingQuality || 'N/A').slice(0, 25);
    console.log(`  ${r.id}  │${status} │${dir} │${alt} │ ${bq}`);
  }

  // 3. Save JSON results
  const summary = {
    runAt: new Date().toISOString(),
    serverUrl: SERVER_URL,
    testDate: TEST_DATE,
    totalRoutes: TEST_ROUTES.length,
    passed: totalPass,
    failed: totalFail,
    totalApiRequestsConsumed: totalApiRequests,
    routes: results,
  };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\nResults saved to: ${RESULTS_FILE}`);

  // Exit with failure code if any route failed
  if (totalFail > 0) {
    process.exit(1);
  }
}

runEvaluation().catch((err) => {
  console.error('Evaluation script crashed:', err);
  process.exit(1);
});
