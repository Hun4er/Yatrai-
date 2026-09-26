import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup.js';

import { createApp } from '../src/app.js';
import Location from '../src/models/Location.js';
import User from '../src/models/User.js';
import Journey from '../src/models/Journey.js';
import JourneyLeg from '../src/models/JourneyLeg.js';
import SearchRequest from '../src/models/SearchRequest.js';
import SearchResult from '../src/models/SearchResult.js';
import TransportProvider from '../src/models/TransportProvider.js';
import journeySearchService, { resolveLocation } from '../src/services/journeySearchService.js';
import { journeySearchEngine } from '../src/search/journeySearchEngine.js';
import { normalizeJourneyCandidate } from '../src/search/journeyNormalizer.js';
import { validateJourneyCandidate } from '../src/search/journeyValidator.js';
import { DevelopmentJourneyProvider } from '../src/providers/journey/development.provider.js';
import { journeyProviderRegistry } from '../src/providers/journey/journey.provider.js';
import authService from '../src/services/auth.service.js';

describe('Yatrai Phase 4 — Journey Search Engine Suite', () => {
  let app;
  let server;
  let baseUrl;
  let sonipatLoc;
  let patnaLoc;
  let delhiLoc;
  let testUser;
  let userToken;

  before(async () => {
    await setupTestDb();
    await Promise.all([
      Location.init(),
      User.init(),
      Journey.init(),
      JourneyLeg.init(),
      SearchRequest.init(),
      SearchResult.init(),
      TransportProvider.init(),
    ]);

    app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    journeyProviderRegistry.resetToDefault();

    // Seed test locations
    sonipatLoc = await Location.create({
      name: 'Sonipat Junction Railway Station',
      displayName: 'Sonipat Junction, Haryana, India',
      type: 'railway_station',
      city: 'Sonipat',
      state: 'Haryana',
      country: 'India',
      countryCode: 'IN',
      aliases: ['Sonipat', 'SNP'],
      location: {
        type: 'Point',
        coordinates: [77.0151, 28.9931],
      },
    });

    delhiLoc = await Location.create({
      name: 'New Delhi Railway Station',
      displayName: 'New Delhi Railway Station, Delhi, India',
      type: 'railway_station',
      city: 'New Delhi',
      state: 'Delhi',
      country: 'India',
      countryCode: 'IN',
      aliases: ['Delhi', 'NDLS'],
      location: {
        type: 'Point',
        coordinates: [77.2218, 28.6431],
      },
    });

    patnaLoc = await Location.create({
      name: 'Patna Junction Railway Station',
      displayName: 'Patna Junction, Bihar, India',
      type: 'railway_station',
      city: 'Patna',
      state: 'Bihar',
      country: 'India',
      countryCode: 'IN',
      aliases: ['Patna', 'PNBE'],
      location: {
        type: 'Point',
        coordinates: [85.1376, 25.6022],
      },
    });

    // Seed IRCTC transport provider
    await TransportProvider.create({
      name: 'Indian Railway Catering and Tourism Corporation',
      code: 'IRCTC',
      type: 'rail',
      supportedModes: ['rail'],
    });

    // Seed test user & generate auth token
    const authResult = await authService.registerUser({
      name: 'Traveler Tester',
      email: 'traveler@yatrai.internal',
      password: 'SafePassword123!',
    });
    testUser = authResult.user;
    userToken = authResult.accessToken;
  });

  // ============================================================================
  // 1. INPUT VALIDATION & LOCATION RESOLUTION TESTS
  // ============================================================================
  describe('Input Validation & Location Resolution', () => {
    it('rejects search request when origin is missing', async () => {
      const res = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: 'Patna',
          departureDate: '2026-10-01',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
      assert.match(data.error.message, /Origin location is required/i);
    });

    it('rejects search request when destination is missing', async () => {
      const res = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'Sonipat',
          departureDate: '2026-10-01',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
      assert.match(data.error.message, /Destination location is required/i);
    });

    it('rejects search request when departureDate is missing', async () => {
      const res = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Patna',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
      assert.match(data.error.message, /Departure date is required/i);
    });

    it('rejects malformed or impossible dates without silently reinterpreting', async () => {
      // 1. Not a date
      const res1 = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Patna',
          departureDate: 'not-a-valid-date',
        }),
      });
      assert.equal(res1.status, 400);

      // 2. Impossible calendar date (Feb 31)
      const res2 = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Patna',
          departureDate: '2026-02-31',
        }),
      });
      assert.equal(res2.status, 400);
      const data2 = await res2.json();
      assert.match(data2.error.message, /valid date in YYYY-MM-DD format/i);
    });

    it('rejects request when origin and destination are identical', async () => {
      const res = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'sonipat',
          departureDate: '2026-10-01',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.error.message, /Origin and destination cannot be the same/i);
    });

    it('rejects invalid passengers count or invalid transport modes', async () => {
      const res = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Patna',
          departureDate: '2026-10-01',
          passengers: 0,
          requestedModes: ['teleportation'],
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.error.message, /positive integer/i);
      assert.match(data.error.message, /Invalid transport modes/i);
    });

    it('returns 404 when origin or destination cannot be resolved', async () => {
      const res = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'NonExistentUnknownLocation999',
          destination: 'Patna',
          departureDate: '2026-10-01',
        }),
      });

      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'LOCATION_NOT_FOUND');
    });

    it('resolves location references via MongoDB ObjectId, object, or text query', async () => {
      // By string place query
      const locByQuery = await resolveLocation('Sonipat');
      assert.ok(locByQuery);
      assert.equal(locByQuery._id.toString(), sonipatLoc._id.toString());

      // By 24-hex string
      const locById = await resolveLocation(sonipatLoc._id.toString());
      assert.ok(locById);
      assert.equal(locById._id.toString(), sonipatLoc._id.toString());

      // By object with _id
      const locByObj = await resolveLocation({ _id: sonipatLoc._id });
      assert.ok(locByObj);
      assert.equal(locByObj._id.toString(), sonipatLoc._id.toString());
    });
  });

  // ============================================================================
  // 2. CANDIDATE NORMALIZATION & STRICT VALIDATION TESTS
  // ============================================================================
  describe('Candidate Normalization & Validation', () => {
    it('normalizes raw candidates into canonical structure with computed fields', () => {
      const dep = new Date('2026-10-01T06:00:00.000Z');
      const arr = new Date('2026-10-01T14:00:00.000Z');

      const raw = {
        origin: sonipatLoc._id,
        destination: patnaLoc._id,
        departureTime: dep,
        arrivalTime: arr,
        legs: [
          {
            origin: sonipatLoc._id,
            destination: patnaLoc._id,
            mode: 'rail',
            departureTime: dep,
            arrivalTime: arr,
            price: 1500,
            distance: 1045,
          },
        ],
      };

      const normalized = normalizeJourneyCandidate(raw);
      assert.equal(normalized.duration, 480); // 8 hours = 480 mins
      assert.equal(normalized.totalPrice, 1500);
      assert.equal(normalized.totalDistance, 1045);
      assert.equal(normalized.numberOfTransfers, 0);
      assert.deepEqual(normalized.transportModes, ['rail']);
      assert.equal(normalized.legs.length, 1);
      assert.equal(normalized.legs[0].sequence, 1);
      assert.equal(normalized.metadata.isMock, true);
    });

    it('validates a correct journey candidate', () => {
      const dep = new Date('2026-10-01T06:00:00.000Z');
      const arr = new Date('2026-10-01T14:00:00.000Z');

      const candidate = {
        origin: sonipatLoc._id,
        destination: patnaLoc._id,
        departureTime: dep,
        arrivalTime: arr,
        duration: 480,
        totalPrice: 1500,
        totalDistance: 1045,
        currency: 'INR',
        legs: [
          {
            sequence: 1,
            origin: sonipatLoc._id,
            destination: patnaLoc._id,
            mode: 'rail',
            departureTime: dep,
            arrivalTime: arr,
            duration: 480,
            price: 1500,
          },
        ],
      };

      const result = validateJourneyCandidate(candidate);
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });

    it('rejects candidate when arrivalTime is earlier than departureTime', () => {
      const dep = new Date('2026-10-01T14:00:00.000Z');
      const arr = new Date('2026-10-01T06:00:00.000Z');

      const candidate = {
        origin: sonipatLoc._id,
        destination: patnaLoc._id,
        departureTime: dep,
        arrivalTime: arr,
        duration: 480,
        totalPrice: 1500,
        legs: [
          {
            sequence: 1,
            origin: sonipatLoc._id,
            destination: patnaLoc._id,
            mode: 'rail',
            departureTime: dep,
            arrivalTime: arr,
            duration: 480,
            price: 1500,
          },
        ],
      };

      const result = validateJourneyCandidate(candidate);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('earlier than departure time')));
    });

    it('rejects candidate with broken leg spatial continuity', () => {
      const dep1 = new Date('2026-10-01T06:00:00.000Z');
      const arr1 = new Date('2026-10-01T08:00:00.000Z');
      const dep2 = new Date('2026-10-01T09:00:00.000Z');
      const arr2 = new Date('2026-10-01T18:00:00.000Z');

      const candidate = {
        origin: sonipatLoc._id,
        destination: patnaLoc._id,
        departureTime: dep1,
        arrivalTime: arr2,
        duration: 720,
        totalPrice: 2000,
        legs: [
          // Leg 1: Sonipat -> Delhi
          {
            sequence: 1,
            origin: sonipatLoc._id,
            destination: delhiLoc._id,
            mode: 'rail',
            departureTime: dep1,
            arrivalTime: arr1,
            duration: 120,
            price: 500,
          },
          // Leg 2: Sonipat -> Patna (Broken continuity! Should be Delhi -> Patna)
          {
            sequence: 2,
            origin: sonipatLoc._id, // MISMATCH
            destination: patnaLoc._id,
            mode: 'rail',
            departureTime: dep2,
            arrivalTime: arr2,
            duration: 540,
            price: 1500,
          },
        ],
      };

      const result = validateJourneyCandidate(candidate);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('Leg continuity broken')));
    });

    it('rejects candidate with broken leg temporal continuity (transfer departs before arrival)', () => {
      const dep1 = new Date('2026-10-01T06:00:00.000Z');
      const arr1 = new Date('2026-10-01T08:00:00.000Z');
      const dep2 = new Date('2026-10-01T07:30:00.000Z'); // Departs 30 min before Leg 1 arrives!
      const arr2 = new Date('2026-10-01T18:00:00.000Z');

      const candidate = {
        origin: sonipatLoc._id,
        destination: patnaLoc._id,
        departureTime: dep1,
        arrivalTime: arr2,
        duration: 720,
        totalPrice: 2000,
        legs: [
          {
            sequence: 1,
            origin: sonipatLoc._id,
            destination: delhiLoc._id,
            mode: 'rail',
            departureTime: dep1,
            arrivalTime: arr1,
            duration: 120,
            price: 500,
          },
          {
            sequence: 2,
            origin: delhiLoc._id,
            destination: patnaLoc._id,
            mode: 'rail',
            departureTime: dep2,
            arrivalTime: arr2,
            duration: 630,
            price: 1500,
          },
        ],
      };

      const result = validateJourneyCandidate(candidate);
      assert.equal(result.valid, false);
      assert.ok(
        result.errors.some(
          (e) => e.includes('Leg timing continuity broken') || e.includes('before Leg 1 arrives')
        )
      );
    });
  });

  // ============================================================================
  // 3. MOCK CANDIDATE SOURCE & PROVIDER REGISTRY TESTS
  // ============================================================================
  describe('Development Candidate Source & Provider Abstraction', () => {
    it('executes development candidate source independently without network calls', async () => {
      const devProvider = new DevelopmentJourneyProvider();

      const candidates = await devProvider.search({
        origin: sonipatLoc,
        destination: patnaLoc,
        departureDate: new Date('2026-10-01'),
        passengers: 2,
      });

      assert.ok(Array.isArray(candidates));
      assert.ok(candidates.length > 0);

      // Verify explicit mock markings
      for (const c of candidates) {
        assert.equal(c.source, 'development');
        assert.equal(c.isMock, true);
        assert.equal(c.metadata.isMock, true);
        assert.ok(c.metadata.note.includes('mock journey candidate'));
      }
    });

    it('returns empty array when searching between non-configured corridors', async () => {
      const devProvider = new DevelopmentJourneyProvider();

      // Create a remote unused location
      const randomLoc = await Location.create({
        name: 'Random Remote Outpost',
        type: 'landmark',
        city: 'RemoteCity',
        country: 'India',
        location: { type: 'Point', coordinates: [75.0, 25.0] },
      });

      const candidates = await devProvider.search({
        origin: randomLoc,
        destination: patnaLoc,
        departureDate: new Date('2026-10-01'),
      });

      assert.deepEqual(candidates, []);
    });

    it('supports custom corridors for isolated pipeline testing', async () => {
      const devProvider = new DevelopmentJourneyProvider();
      devProvider.addMockCorridor({
        originPattern: 'custom-hub-a',
        destinationPattern: 'custom-hub-b',
        generateCandidates: ({ origin, destination, travelDate, passengers }) => [
          {
            origin: origin._id,
            destination: destination._id,
            departureTime: new Date(travelDate.getTime() + 3600000),
            arrivalTime: new Date(travelDate.getTime() + 7200000),
            duration: 60,
            totalPrice: 300 * passengers,
            legs: [
              {
                sequence: 1,
                origin: origin._id,
                destination: destination._id,
                mode: 'bus',
                departureTime: new Date(travelDate.getTime() + 3600000),
                arrivalTime: new Date(travelDate.getTime() + 7200000),
                duration: 60,
                price: 300 * passengers,
              },
            ],
          },
        ],
      });

      const customA = await Location.create({
        name: 'Custom-Hub-A Bus Station',
        type: 'bus_station',
        city: 'HubA',
        location: { type: 'Point', coordinates: [78.0, 29.0] },
      });

      const customB = await Location.create({
        name: 'Custom-Hub-B Bus Station',
        type: 'bus_station',
        city: 'HubB',
        location: { type: 'Point', coordinates: [79.0, 29.0] },
      });

      const results = await devProvider.search({
        origin: customA,
        destination: customB,
        departureDate: new Date('2026-10-01'),
        passengers: 1,
      });

      assert.equal(results.length, 1);
      assert.equal(results[0].totalPrice, 300);
    });
  });

  // ============================================================================
  // 4. SEARCH PIPELINE, LIFECYCLE & PERSISTENCE TESTS
  // ============================================================================
  describe('Search Pipeline, Lifecycle & Persistence', () => {
    it('executes full pipeline, transitions SearchRequest status, and persists all models', async () => {
      const result = await journeySearchService.searchJourneys({
        origin: 'Sonipat',
        destination: 'Patna',
        departureDate: '2026-10-01',
        passengers: 1,
      });

      assert.ok(result.searchRequest);
      assert.ok(result.journeys);
      assert.ok(result.journeys.length > 0);

      // Verify SearchRequest lifecycle: reached 'completed'
      const savedRequest = await SearchRequest.findById(result.searchRequest._id);
      assert.equal(savedRequest.status, 'completed');
      assert.equal(savedRequest.origin.toString(), sonipatLoc._id.toString());
      assert.equal(savedRequest.destination.toString(), patnaLoc._id.toString());

      // Verify Journey documents in MongoDB
      const firstJourneyId = result.journeys[0].id;
      const savedJourney = await Journey.findById(firstJourneyId);
      assert.ok(savedJourney);
      assert.equal(savedJourney.origin.toString(), sonipatLoc._id.toString());
      assert.equal(savedJourney.destination.toString(), patnaLoc._id.toString());
      assert.ok(savedJourney.duration > 0);
      assert.ok(savedJourney.totalPrice > 0);

      // Verify JourneyLegs in MongoDB
      const savedLegs = await JourneyLeg.find({ journey: firstJourneyId }).sort({ sequence: 1 });
      assert.ok(savedLegs.length >= 1);
      assert.equal(savedLegs[0].sequence, 1);
      assert.equal(savedLegs[0].origin.toString(), sonipatLoc._id.toString());

      // Verify SearchResult persistence associating SearchRequest with Journey
      const savedSearchResult = await SearchResult.findOne({
        searchRequest: savedRequest._id,
        journey: savedJourney._id,
      });
      assert.ok(savedSearchResult);
      assert.equal(savedSearchResult.source, 'development');
      assert.equal(savedSearchResult.status, 'active');
      assert.ok(savedSearchResult.normalizedData);
    });

    it('handles empty results path cleanly and marks SearchRequest completed with zero journeys', async () => {
      // Create isolated location not covered by mock data
      const unknownLoc = await Location.create({
        name: 'Untravelled Waystation',
        type: 'landmark',
        city: 'Untravelled',
        location: { type: 'Point', coordinates: [74.0, 24.0] },
      });

      const result = await journeySearchService.searchJourneys({
        origin: unknownLoc._id.toString(),
        destination: patnaLoc._id.toString(),
        departureDate: '2026-10-01',
      });

      assert.ok(result.searchRequest);
      assert.deepEqual(result.journeys, []);

      const reqDoc = await SearchRequest.findById(result.searchRequest._id);
      assert.equal(reqDoc.status, 'completed');
    });

    it('marks SearchRequest as failed if an unexpected pipeline exception occurs', async () => {
      // Create engine that forces failure during journey persistence
      const faultyEngine = {
        search: async () => {
          throw new Error('Fatal persistence engine crash');
        },
      };

      let thrownError = null;

      try {
        // Intercept SearchRequest creation to grab ID
        const originalCreate = journeySearchEngine.search;
        journeySearchEngine.search = faultyEngine.search;

        try {
          await journeySearchService.searchJourneys({
            origin: 'Sonipat',
            destination: 'Patna',
            departureDate: '2026-10-01',
          });
        } finally {
          journeySearchEngine.search = originalCreate;
        }
      } catch (err) {
        thrownError = err;
      }

      assert.ok(thrownError);
      assert.match(thrownError.message, /Fatal persistence engine crash/i);

      // Verify latest SearchRequest was updated to 'failed'
      const failedReq = await SearchRequest.findOne({}).sort({ createdAt: -1 });
      assert.ok(failedReq);
      assert.equal(failedReq.status, 'failed');
    });
  });

  // ============================================================================
  // 5. END-TO-END HTTP API TESTS (POST /api/journeys/search)
  // ============================================================================
  describe('End-to-End Journey Search API (POST /api/journeys/search)', () => {
    it('executes POST /api/journeys/search for unauthenticated user (Sonipat -> Patna)', async () => {
      const res = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Patna',
          departureDate: '2026-10-01',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(data.success, true);
      assert.ok(Array.isArray(data.journeys));
      assert.ok(data.journeys.length > 0);
      assert.equal(data.data.count, data.journeys.length);

      const firstJourney = data.journeys[0];
      assert.ok(firstJourney.id);
      assert.ok(firstJourney.origin);
      assert.match(firstJourney.origin.name, /Sonipat/i);
      assert.ok(firstJourney.destination);
      assert.match(firstJourney.destination.name, /Patna/i);
      assert.ok(firstJourney.departureTime.startsWith('2026-10-01'));
      assert.ok(firstJourney.arrivalTime);
      assert.ok(firstJourney.duration > 0);
      assert.ok(firstJourney.totalPrice > 0);
      assert.equal(firstJourney.currency, 'INR');
      assert.ok(Array.isArray(firstJourney.legs));
      assert.ok(firstJourney.legs.length >= 1);
      assert.equal(firstJourney.legs[0].sequence, 1);
      assert.equal(firstJourney.metadata.isMock, true);

      // Verify search request in database had user: null
      const searchReq = await SearchRequest.findById(data.data.searchRequestId);
      assert.equal(searchReq.user, null);
    });

    it('executes POST /api/journeys/search for authenticated user and binds user ID', async () => {
      const res = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Patna',
          departureDate: '2026-10-01',
          passengers: 2,
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);

      const searchReq = await SearchRequest.findById(data.data.searchRequestId);
      assert.ok(searchReq);
      assert.equal(searchReq.user.toString(), (testUser._id || testUser.id).toString());
      assert.equal(searchReq.passengers, 2);
    });

    it('returns empty results { journeys: [] } when no candidates exist', async () => {
      // Create two places with no mock corridor connecting them
      const place1 = await Location.create({
        name: 'Isolated Mountain Top',
        type: 'landmark',
        city: 'MountainCity',
        location: { type: 'Point', coordinates: [76.0, 31.0] },
      });

      const place2 = await Location.create({
        name: 'Isolated Desert Oasis',
        type: 'landmark',
        city: 'DesertCity',
        location: { type: 'Point', coordinates: [71.0, 26.0] },
      });

      const res = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: place1.name,
          destination: place2.name,
          departureDate: '2026-10-01',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.deepEqual(data.journeys, []);
      assert.equal(data.data.count, 0);
    });

    it('exposes journey search in GET /api discovery document', async () => {
      const res = await fetch(`${baseUrl}/api`);
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(data.success, true);
      assert.ok(data.endpoints);
      assert.ok(data.endpoints.journeys);
      assert.equal(data.endpoints.journeys.search, '/api/journeys/search');
    });
  });
});
