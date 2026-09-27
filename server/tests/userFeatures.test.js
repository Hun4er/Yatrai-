import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup.js';
import config from '../src/config/index.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import Journey from '../src/models/Journey.js';
import Location from '../src/models/Location.js';
import SavedJourney from '../src/models/SavedJourney.js';
import RecentSearch from '../src/models/RecentSearch.js';
import FavoriteRoute from '../src/models/FavoriteRoute.js';
import JourneyHistory from '../src/models/JourneyHistory.js';

describe('Phase 13 — User Features & Authorization Suite', () => {
  let app;
  let server;
  let baseUrl;
  let userA, tokenA;
  let userB, tokenB;
  let testJourney;
  let testOriginLoc, testDestLoc;

  function createAuthToken(user) {
    return jwt.sign(
      { sub: user._id.toString(), email: user.email },
      config.auth.jwtAccessSecret,
      { expiresIn: '15m' }
    );
  }

  before(async () => {
    await setupTestDb();
    app = createApp();
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // 1. Create User A
    userA = await User.create({
      name: 'User A',
      email: 'user.a@yatrai.test',
      passwordHash: 'secret_hash_a',
    });
    tokenA = createAuthToken(userA);

    // 2. Create User B
    userB = await User.create({
      name: 'User B',
      email: 'user.b@yatrai.test',
      passwordHash: 'secret_hash_b',
    });
    tokenB = createAuthToken(userB);

    // 3. Create canonical locations
    testOriginLoc = await Location.create({
      name: 'Sonipat',
      city: 'Sonipat',
      state: 'Haryana',
      type: 'city',
      location: { type: 'Point', coordinates: [77.023, 28.995] },
    });

    testDestLoc = await Location.create({
      name: 'Patna Junction',
      city: 'Patna',
      state: 'Bihar',
      type: 'railway_station',
      location: { type: 'Point', coordinates: [85.137, 25.603] },
    });

    // 4. Create canonical test journey
    testJourney = await Journey.create({
      origin: testOriginLoc._id,
      destination: testDestLoc._id,
      departureTime: new Date('2026-10-01T06:30:00Z'),
      arrivalTime: new Date('2026-10-01T19:20:00Z'),
      duration: 770,
      totalDistance: 1050,
      totalPrice: 850,
      currency: 'INR',
      numberOfTransfers: 1,
      transportModes: ['rail', 'road'],
      status: 'scheduled',
    });
  });

  describe('1. User Profile (PRD Section 5 & 6)', () => {
    it('retrieves authenticated user profile and strips sensitive fields', async () => {
      const res = await fetch(`${baseUrl}/users/me`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.user.email, 'user.a@yatrai.test');
      assert.equal(body.data.user.name, 'User A');
      assert.equal(body.data.user.passwordHash, undefined);
    });

    it('rejects unauthenticated request to /users/me with 401', async () => {
      const res = await fetch(`${baseUrl}/users/me`);
      assert.equal(res.status, 401);
    });
  });

  describe('2. Saved Journeys (PRD Section 7–11)', () => {
    it('allows saving a journey and prevents duplicates', async () => {
      // First save
      const res1 = await fetch(`${baseUrl}/saved-journeys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          journeyId: testJourney._id.toString(),
          name: 'My Patna Trip',
        }),
      });
      assert.equal(res1.status, 201);
      const body1 = await res1.json();
      assert.equal(body1.data.saved, true);
      assert.equal(body1.data.alreadySaved, false);

      // Duplicate save returns 200 with alreadySaved flag
      const res2 = await fetch(`${baseUrl}/saved-journeys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          journeyId: testJourney._id.toString(),
        }),
      });
      assert.equal(res2.status, 200);
      const body2 = await res2.json();
      assert.equal(body2.data.alreadySaved, true);

      // Verify database row count is strictly 1
      const count = await SavedJourney.countDocuments({ user: userA._id });
      assert.equal(count, 1);
    });

    it('lists saved journeys populated with canonical journey fields', async () => {
      await fetch(`${baseUrl}/saved-journeys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ journeyId: testJourney._id.toString() }),
      });

      const res = await fetch(`${baseUrl}/saved-journeys`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.count, 1);
      assert.equal(body.data.journeys[0].journey.origin.name, 'Sonipat');
      assert.equal(body.data.journeys[0].journey.destination.name, 'Patna Junction');
      assert.equal(body.data.journeys[0].journey.totalPrice, 850);
    });

    it('checks if a journey is saved and removes a saved journey', async () => {
      await fetch(`${baseUrl}/saved-journeys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ journeyId: testJourney._id.toString() }),
      });

      // Check saved
      const checkRes = await fetch(`${baseUrl}/saved-journeys/check/${testJourney._id}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const checkBody = await checkRes.json();
      assert.equal(checkBody.data.isSaved, true);

      // Remove
      const delRes = await fetch(`${baseUrl}/saved-journeys/${testJourney._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(delRes.status, 200);

      // Check after delete
      const checkRes2 = await fetch(`${baseUrl}/saved-journeys/check/${testJourney._id}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const checkBody2 = await checkRes2.json();
      assert.equal(checkBody2.data.isSaved, false);
    });
  });

  describe('3. Recent Searches (PRD Section 12–16)', () => {
    it('records search, collapses duplicates, and orders by most recent', async () => {
      // Record search 1
      await fetch(`${baseUrl}/searches/recent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Patna',
          departureDate: '2026-10-01',
          ranking: 'overall',
        }),
      });

      // Record search 2 (different destination)
      await fetch(`${baseUrl}/searches/recent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          origin: 'Delhi',
          destination: 'Mumbai',
          departureDate: '2026-10-05',
          ranking: 'fastest',
        }),
      });

      // Re-run search 1: should update timestamp and not duplicate row
      await fetch(`${baseUrl}/searches/recent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Patna',
          departureDate: '2026-10-01',
          ranking: 'cheapest',
        }),
      });

      const listRes = await fetch(`${baseUrl}/searches/recent`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(listRes.status, 200);
      const listBody = await listRes.json();

      assert.equal(listBody.data.count, 2);
      // Sonipat -> Patna should be at the top because it was updated most recently
      assert.equal(listBody.data.searches[0].destination, 'Patna');
      assert.equal(listBody.data.searches[0].ranking, 'cheapest');
    });

    it('clears all recent searches for user', async () => {
      await fetch(`${baseUrl}/searches/recent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Patna',
          departureDate: '2026-10-01',
        }),
      });

      const clearRes = await fetch(`${baseUrl}/searches/recent`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(clearRes.status, 200);

      const count = await RecentSearch.countDocuments({ user: userA._id });
      assert.equal(count, 0);
    });
  });

  describe('4. Favorite Routes (PRD Section 18–21)', () => {
    it('adds favorite route and prevents duplicates on same corridor', async () => {
      const res1 = await fetch(`${baseUrl}/favorite-routes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Patna',
          preferredModes: ['rail'],
        }),
      });
      assert.equal(res1.status, 201);

      // Duplicate add
      const res2 = await fetch(`${baseUrl}/favorite-routes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Patna',
        }),
      });
      assert.equal(res2.status, 200);
      const body2 = await res2.json();
      assert.equal(body2.data.alreadyFavorited, true);

      const count = await FavoriteRoute.countDocuments({ user: userA._id });
      assert.equal(count, 1);
    });

    it('rejects favorite route with identical origin and destination', async () => {
      const res = await fetch(`${baseUrl}/favorite-routes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Sonipat',
        }),
      });
      assert.equal(res.status, 400);
    });
  });

  describe('5. Journey History (PRD Section 22–25)', () => {
    it('records journey view and updates viewedAt on repeated inspection', async () => {
      const res1 = await fetch(`${baseUrl}/journey-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ journeyId: testJourney._id.toString() }),
      });
      assert.equal(res1.status, 201);

      // Repeat inspection
      const res2 = await fetch(`${baseUrl}/journey-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ journeyId: testJourney._id.toString() }),
      });
      assert.equal(res2.status, 201);

      const count = await JourneyHistory.countDocuments({ user: userA._id });
      assert.equal(count, 1); // Not duplicated
    });

    it('lists journey history with populated journey', async () => {
      await fetch(`${baseUrl}/journey-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ journeyId: testJourney._id.toString() }),
      });

      const res = await fetch(`${baseUrl}/journey-history`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.count, 1);
      assert.equal(body.data.history[0].journey.origin.name, 'Sonipat');
    });
  });

  describe('6. Security & IDOR Authorization Defense (PRD Section 10, 28 & 55)', () => {
    let savedJourneyA;
    let favoriteRouteA;
    let recentSearchA;

    beforeEach(async () => {
      // User A creates resources
      savedJourneyA = await SavedJourney.create({
        user: userA._id,
        journey: testJourney._id,
      });

      favoriteRouteA = await FavoriteRoute.create({
        user: userA._id,
        origin: 'Sonipat',
        destination: 'Patna',
      });

      recentSearchA = await RecentSearch.create({
        user: userA._id,
        origin: 'Sonipat',
        destination: 'Patna',
        departureDate: '2026-10-01',
      });

      await JourneyHistory.create({
        user: userA._id,
        journey: testJourney._id,
      });
    });

    it('User B CANNOT see User A saved journeys', async () => {
      const res = await fetch(`${baseUrl}/saved-journeys`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.count, 0);
      assert.deepEqual(body.data.journeys, []);
    });

    it('User B CANNOT delete User A saved journey (IDOR Prevention)', async () => {
      const res = await fetch(`${baseUrl}/saved-journeys/${savedJourneyA._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(res.status, 404);

      // Verify User A record still exists in DB
      const exists = await SavedJourney.exists({ _id: savedJourneyA._id });
      assert.ok(exists);
    });

    it('User B CANNOT see User A favorite routes', async () => {
      const res = await fetch(`${baseUrl}/favorite-routes`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.count, 0);
      assert.deepEqual(body.data.routes, []);
    });

    it('User B CANNOT delete User A favorite route (IDOR Prevention)', async () => {
      const res = await fetch(`${baseUrl}/favorite-routes/${favoriteRouteA._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(res.status, 404);

      const exists = await FavoriteRoute.exists({ _id: favoriteRouteA._id });
      assert.ok(exists);
    });

    it('User B CANNOT see User A recent searches', async () => {
      const res = await fetch(`${baseUrl}/searches/recent`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.count, 0);
      assert.deepEqual(body.data.searches, []);
    });

    it('User B CANNOT delete User A recent search (IDOR Prevention)', async () => {
      const res = await fetch(`${baseUrl}/searches/recent/${recentSearchA._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(res.status, 404);

      const exists = await RecentSearch.exists({ _id: recentSearchA._id });
      assert.ok(exists);
    });

    it('User B CANNOT see User A journey history', async () => {
      const res = await fetch(`${baseUrl}/journey-history`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.count, 0);
      assert.deepEqual(body.data.history, []);
    });
  });
});
