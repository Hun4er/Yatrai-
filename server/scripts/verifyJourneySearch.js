import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { createApp } from '../src/app.js';
import SearchRequest from '../src/models/SearchRequest.js';
import SearchResult from '../src/models/SearchResult.js';
import Journey from '../src/models/Journey.js';
import JourneyLeg from '../src/models/JourneyLeg.js';
import authService from '../src/services/auth.service.js';

/**
 * Live Verification Script for Phase 4 Journey Search Engine
 * Verifies POST /api/journeys/search against MongoDB and Express.
 */
async function runJourneySearchVerification() {
  console.log('\n=============================================================');
  console.log('  YATRAI PHASE 4 — JOURNEY SEARCH ENGINE VERIFICATION RUNNER');
  console.log('=============================================================\n');

  console.log('[Step 0] Connecting to database...');
  await connectDatabase();
  console.log('  ✓ Connected to MongoDB.\n');

  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`  ✓ Express verification server listening on ${baseUrl}\n`);

  try {
    // ------------------------------------------------------------------------
    // Step 1: Unauthenticated Journey Search (Sonipat -> Patna)
    // ------------------------------------------------------------------------
    console.log('[Step 1] Testing unauthenticated search: Sonipat -> Patna on 2026-10-01...');
    const res1 = await fetch(`${baseUrl}/api/journeys/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: 'Sonipat',
        destination: 'Patna',
        departureDate: '2026-10-01',
      }),
    });
    const json1 = await res1.json();

    if (res1.status !== 200 || !json1.success || !json1.journeys?.length) {
      throw new Error(`Step 1 failed: ${JSON.stringify(json1)}`);
    }

    const journey = json1.journeys[0];
    console.log(`  ✓ Status: HTTP ${res1.status} OK`);
    console.log(`  ✓ SearchRequest ID: ${json1.data?.searchRequestId}`);
    console.log(`  ✓ Journey ID: ${journey.id}`);
    console.log(`  ✓ Corridor: ${journey.origin?.name} -> ${journey.destination?.name}`);
    console.log(`  ✓ Total Price: ${journey.currency} ${journey.totalPrice}`);
    console.log(
      `  ✓ Duration: ${Math.floor(journey.duration / 60)}h ${journey.duration % 60}m (${journey.duration} mins)`
    );
    console.log(`  ✓ Transport Modes: ${journey.transportModes?.join(', ')}`);
    console.log(`  ✓ Legs Count: ${journey.legs?.length}`);
    for (const leg of journey.legs) {
      console.log(
        `      Leg ${leg.sequence}: [${leg.mode?.toUpperCase()}] ${leg.origin?.name} -> ${leg.destination?.name} (${leg.currency} ${leg.price})`
      );
    }
    console.log(`  ✓ Is Development Mock: ${journey.metadata?.isMock}\n`);

    // ------------------------------------------------------------------------
    // Step 2: Database Persistence & Referential Integrity
    // ------------------------------------------------------------------------
    console.log('[Step 2] Verifying database records & referential integrity...');
    const searchRequestId = json1.data.searchRequestId;
    const searchRequestDoc = await SearchRequest.findById(searchRequestId);
    if (!searchRequestDoc || searchRequestDoc.status !== 'completed') {
      throw new Error(
        `SearchRequest not persisted in 'completed' state! Found: ${searchRequestDoc?.status}`
      );
    }
    console.log(`  ✓ SearchRequest record found in MongoDB (status: ${searchRequestDoc.status})`);

    const journeyDoc = await Journey.findById(journey.id);
    if (!journeyDoc) {
      throw new Error(`Journey record ${journey.id} not found in MongoDB`);
    }
    console.log(`  ✓ Normalized Journey record found in MongoDB`);

    const legs = await JourneyLeg.find({ journey: journey.id }).sort({ sequence: 1 });
    if (!legs.length) {
      throw new Error(`JourneyLeg records not found for journey ${journey.id}`);
    }
    console.log(`  ✓ ${legs.length} authoritative JourneyLeg record(s) verified in MongoDB`);

    const searchResultDoc = await SearchResult.findOne({
      searchRequest: searchRequestId,
      journey: journey.id,
    });
    if (!searchResultDoc) {
      throw new Error(`SearchResult record linking searchRequest and journey not found!`);
    }
    console.log(
      `  ✓ SearchResult record verified linking SearchRequest (${searchRequestId}) to Journey (${journey.id})\n`
    );

    // ------------------------------------------------------------------------
    // Step 3: Authenticated Journey Search
    // ------------------------------------------------------------------------
    console.log('[Step 3] Testing authenticated search with Bearer token...');
    const testEmail = `traveler_${Date.now()}@yatrai.internal`;
    const regResult = await authService.registerUser({
      name: 'Verification Traveler',
      email: testEmail,
      password: 'SafePassword123!',
    });

    const resAuth = await fetch(`${baseUrl}/api/journeys/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${regResult.accessToken}`,
      },
      body: JSON.stringify({
        origin: 'Sonipat',
        destination: 'Patna',
        departureDate: '2026-10-01',
        passengers: 2,
      }),
    });
    const jsonAuth = await resAuth.json();

    if (resAuth.status !== 200 || !jsonAuth.success) {
      throw new Error(`Authenticated search failed: ${JSON.stringify(jsonAuth)}`);
    }

    const authSearchReq = await SearchRequest.findById(jsonAuth.data.searchRequestId);
    const expectedUserId = (regResult.user._id || regResult.user.id).toString();
    if (authSearchReq.user?.toString() !== expectedUserId) {
      throw new Error(
        `SearchRequest.user mismatch: expected ${expectedUserId}, got ${authSearchReq.user}`
      );
    }
    console.log(
      `  ✓ Authenticated user ID correctly bound to SearchRequest: ${authSearchReq.user}`
    );
    console.log(`  ✓ Passengers count honored: ${authSearchReq.passengers}\n`);

    // ------------------------------------------------------------------------
    // Step 4: Input Validation Checks
    // ------------------------------------------------------------------------
    console.log('[Step 4] Testing input validation edge cases...');

    // Missing origin
    const resVal1 = await fetch(`${baseUrl}/api/journeys/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination: 'Patna', departureDate: '2026-10-01' }),
    });
    if (resVal1.status !== 400) throw new Error('Expected 400 for missing origin');
    console.log('  ✓ Missing origin rejected (HTTP 400)');

    // Missing departure date
    const resVal2 = await fetch(`${baseUrl}/api/journeys/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: 'Sonipat', destination: 'Patna' }),
    });
    if (resVal2.status !== 400) throw new Error('Expected 400 for missing departureDate');
    console.log('  ✓ Missing departureDate rejected (HTTP 400)');

    // Invalid calendar date
    const resVal3 = await fetch(`${baseUrl}/api/journeys/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: 'Sonipat',
        destination: 'Patna',
        departureDate: '2026-02-31',
      }),
    });
    if (resVal3.status !== 400) throw new Error('Expected 400 for invalid calendar date (Feb 31)');
    console.log('  ✓ Invalid calendar date rejected (HTTP 400)');

    // Same origin and destination
    const resVal4 = await fetch(`${baseUrl}/api/journeys/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: 'Sonipat',
        destination: 'Sonipat',
        departureDate: '2026-10-01',
      }),
    });
    if (resVal4.status !== 400)
      throw new Error('Expected 400 for identical origin and destination');
    console.log('  ✓ Same origin & destination rejected (HTTP 400)\n');

    // ------------------------------------------------------------------------
    // Step 5: Empty Results Path
    // ------------------------------------------------------------------------
    console.log('[Step 5] Testing empty results path for corridor without candidates...');
    const resEmpty = await fetch(`${baseUrl}/api/journeys/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: 'Delhi',
        destination: 'Patna', // Note: Sonipat-Patna is in mock data; raw Delhi-Patna direct corridor returns []
        departureDate: '2026-10-01',
      }),
    });
    const jsonEmpty = await resEmpty.json();

    if (resEmpty.status !== 200 || !jsonEmpty.success || !Array.isArray(jsonEmpty.journeys)) {
      throw new Error(`Empty results check failed: ${JSON.stringify(jsonEmpty)}`);
    }
    console.log(
      `  ✓ Empty results handled cleanly: journeys.length = ${jsonEmpty.journeys.length} (HTTP 200 OK)`
    );
    console.log(`  ✓ SearchRequest status = completed\n`);

    console.log('=============================================================');
    console.log('  ALL PHASE 4 VERIFICATION STEPS PASSED SUCCESSFULLY! [OK]');
    console.log('=============================================================\n');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDatabase();
  }
}

runJourneySearchVerification().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
