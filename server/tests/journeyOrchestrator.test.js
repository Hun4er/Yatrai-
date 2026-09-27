import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { setupTestDb, teardownTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import Location from '../src/models/Location.js';
import SearchRequest from '../src/models/SearchRequest.js';
import Journey from '../src/models/Journey.js';
import JourneyLeg from '../src/models/JourneyLeg.js';
import SearchResult from '../src/models/SearchResult.js';
import { JourneyOrchestrator, journeyOrchestrator } from '../src/orchestration/journeyOrchestrator.js';
import { RankingRegistry, BaseRankingStrategy } from '../src/ranking/index.js';
import { RankingEngine } from '../src/ranking/rankingEngine.js';

describe('Yatrai Phase 8 — Journey Orchestrator Suite', () => {
  let app;
  let server;
  let baseUrl;
  let sonipatLoc;
  let patnaLoc;

  before(async () => {
    await setupTestDb();
    await Location.init();

    // Create stable test locations in MongoDB
    sonipatLoc = await Location.findOneAndUpdate(
      { name: 'Sonipat Junction Railway Station' },
      {
        name: 'Sonipat Junction Railway Station',
        displayName: 'Sonipat Junction, Haryana',
        city: 'Sonipat',
        state: 'Haryana',
        country: 'India',
        type: 'railway_station',
        location: { type: 'Point', coordinates: [77.0151, 28.9931] },
        aliases: ['SNP', 'Sonipat'],
      },
      { upsert: true, new: true }
    );

    patnaLoc = await Location.findOneAndUpdate(
      { name: 'Patna Junction Railway Station' },
      {
        name: 'Patna Junction Railway Station',
        displayName: 'Patna Junction, Bihar',
        city: 'Patna',
        state: 'Bihar',
        country: 'India',
        type: 'railway_station',
        location: { type: 'Point', coordinates: [85.1376, 25.6022] },
        aliases: ['PNBE', 'Patna'],
      },
      { upsert: true, new: true }
    );

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

  // Helper to build canonical raw candidate fixtures for mock transport providers
  const createMockCandidate = ({
    provider = 'rail',
    trainNumber = '12424',
    trainName = 'Rajdhani Express',
    depTime = '06:00',
    arrTime = '18:00',
    price = 1250,
    duration = 720,
    distance = 1045,
  } = {}) => ({
    mode: provider,
    train_number: trainNumber,
    train_name: trainName,
    departure_time: depTime,
    arrival_time: arrTime,
    fare: price,
    duration,
    distance,
    operator: 'Indian Railways',
    class: '3A',
  });

  // ============================================================================
  // 1. REQUEST VALIDATION TESTS (Section 8)
  // ============================================================================
  describe('1. Request Validation', () => {
    it('rejects missing origin with HTTP 400 VALIDATION_ERROR', () => {
      assert.throws(
        () => {
          journeyOrchestrator.validateRequest({
            destination: 'Patna',
            departureDate: '2026-10-01',
          });
        },
        (err) => err.statusCode === 400 && err.code === 'VALIDATION_ERROR'
      );
    });

    it('rejects missing destination with HTTP 400 VALIDATION_ERROR', () => {
      assert.throws(
        () => {
          journeyOrchestrator.validateRequest({
            origin: 'Sonipat',
            departureDate: '2026-10-01',
          });
        },
        (err) => err.statusCode === 400 && err.code === 'VALIDATION_ERROR'
      );
    });

    it('rejects missing or invalid departure date with HTTP 400 VALIDATION_ERROR', () => {
      assert.throws(
        () => {
          journeyOrchestrator.validateRequest({
            origin: 'Sonipat',
            destination: 'Patna',
            departureDate: 'invalid-date',
          });
        },
        (err) => err.statusCode === 400 && err.code === 'VALIDATION_ERROR'
      );
    });

    it('rejects invalid passengers count (< 1 or non-integer)', () => {
      assert.throws(
        () => {
          journeyOrchestrator.validateRequest({
            origin: 'Sonipat',
            destination: 'Patna',
            departureDate: '2026-10-01',
            passengers: 0,
          });
        },
        (err) => err.statusCode === 400 && err.code === 'VALIDATION_ERROR'
      );
    });

    it('rejects invalid ranking strategy name', () => {
      assert.throws(
        () => {
          journeyOrchestrator.validateRequest({
            origin: 'Sonipat',
            destination: 'Patna',
            departureDate: '2026-10-01',
            ranking: 'unsupported_strategy_xyz',
          });
        },
        (err) => err.statusCode === 400 && err.code === 'INVALID_RANKING_STRATEGY'
      );
    });
  });

  // ============================================================================
  // 2. LOCATION RESOLUTION & ISOLATION TESTS (Section 9, 10, 66)
  // ============================================================================
  describe('2. Location Resolution & Failure Handling', () => {
    it('resolves text origin and destination to canonical Locations', async () => {
      const { originLocation, destLocation } = await journeyOrchestrator.resolveLocations('Sonipat', 'Patna');

      assert.ok(originLocation);
      assert.ok(destLocation);
      assert.equal(originLocation.city, 'Sonipat');
      assert.equal(destLocation.city, 'Patna');
    });

    it('rejects unresolvable origin without calling transport providers', async () => {
      let providersCalled = false;
      const mockProvider = {
        mode: 'rail',
        search: async () => {
          providersCalled = true;
          return { status: 'success', candidates: [] };
        },
      };

      const orchestrator = new JourneyOrchestrator({
        providerRegistry: { getProviders: () => [mockProvider] },
      });

      await assert.rejects(
        async () => {
          await orchestrator.orchestrateSearch({
            origin: 'NonExistentPlaceXYZ987',
            destination: 'Patna',
            departureDate: '2026-10-01',
          });
        },
        (err) => err.statusCode === 404 && err.code === 'LOCATION_NOT_FOUND'
      );

      assert.equal(providersCalled, false, 'Transport providers must not be called when origin is unresolvable');
    });

    it('rejects same origin and destination with HTTP 400 SAME_ORIGIN_DESTINATION', async () => {
      await assert.rejects(
        async () => {
          await journeyOrchestrator.orchestrateSearch({
            origin: 'Sonipat',
            destination: 'Sonipat',
            departureDate: '2026-10-01',
          });
        },
        (err) => err.statusCode === 400 && err.code === 'SAME_ORIGIN_DESTINATION'
      );
    });

    it('supports injected mock location resolver (Section 66)', async () => {
      const mockResolver = {
        resolveLocation: async (query) => {
          if (query === 'MockA') {
            return { _id: new mongoose.Types.ObjectId(), name: 'Mock A', city: 'City A', location: { coordinates: [77, 28] } };
          }
          if (query === 'MockB') {
            return { _id: new mongoose.Types.ObjectId(), name: 'Mock B', city: 'City B', location: { coordinates: [85, 25] } };
          }
          return null;
        },
      };

      const orchestrator = new JourneyOrchestrator({
        locationResolver: mockResolver,
        providerRegistry: { getProviders: () => [] },
      });

      const { originLocation, destLocation } = await orchestrator.resolveLocations('MockA', 'MockB');
      assert.equal(originLocation.name, 'Mock A');
      assert.equal(destLocation.name, 'Mock B');
    });
  });

  // ============================================================================
  // 3. PROVIDER EXECUTION & CONCURRENCY TESTS (Section 14, 44, 65)
  // ============================================================================
  describe('3. Provider Execution & Concurrency', () => {
    it('executes independent providers concurrently via Promise.allSettled', async () => {
      const executionTimes = [];

      const createDelayedProvider = (mode, delayMs) => ({
        mode,
        code: mode.toUpperCase(),
        search: async () => {
          const start = Date.now();
          await new Promise((r) => setTimeout(r, delayMs));
          executionTimes.push({ mode, duration: Date.now() - start });
          return {
            provider: mode,
            status: 'success',
            candidates: [createMockCandidate({ provider: mode, trainNumber: `${mode}-01` })],
          };
        },
      });

      const providers = [
        createDelayedProvider('rail', 50),
        createDelayedProvider('bus', 50),
        createDelayedProvider('flight', 50),
      ];

      const orchestrator = new JourneyOrchestrator();
      const wallStart = Date.now();
      const summary = await orchestrator.executeProviders(providers, {
        origin: sonipatLoc,
        destination: patnaLoc,
        departureDate: new Date('2026-10-01'),
      });
      const totalWallTime = Date.now() - wallStart;

      assert.equal(summary.totalCount, 3);
      assert.equal(summary.successfulCount, 3);
      // Concurrent execution: total wall clock time should be much less than serial sum (150ms)
      assert.ok(totalWallTime < 130, `Expected concurrent execution (<130ms), got ${totalWallTime}ms`);
    });

    it('works with arbitrary mock provider conforming only to search() (Section 65)', async () => {
      const mockResult = {
        provider: 'custom_hyperloop',
        providerCode: 'LOOP',
        status: 'success',
        candidates: [
          {
            mode: 'rail',
            train_number: 'LOOP-001',
            train_name: 'Hyperloop Transit',
            departure_time: '10:00',
            arrival_time: '11:00',
            fare: 2500,
            duration: 60,
          },
        ],
      };

      const mockProvider = {
        mode: 'rail',
        search: async () => mockResult,
      };

      const orchestrator = new JourneyOrchestrator({
        providerRegistry: { getProviders: () => [mockProvider] },
      });

      const result = await orchestrator.orchestrateSearch({
        origin: 'Sonipat',
        destination: 'Patna',
        departureDate: '2026-10-01',
      }, { includeDevelopment: false });

      assert.ok(result.journeys.length >= 1);
      assert.equal(result.journeys[0].totalPrice, 2500);
      assert.equal(result.journeys[0].duration, 60);
    });

    it('enforces timeout budget when a provider hangs (Section 43)', async () => {
      const hangingProvider = {
        mode: 'flight',
        code: 'HANG_AIR',
        search: async () => {
          await new Promise((r) => setTimeout(r, 500));
          return { provider: 'flight', status: 'success', candidates: [] };
        },
      };

      const orchestrator = new JourneyOrchestrator({
        timeoutMs: 50, // Short timeout for testing
      });

      const summary = await orchestrator.executeProviders([hangingProvider], {
        origin: sonipatLoc,
        destination: patnaLoc,
        departureDate: new Date('2026-10-01'),
      });

      assert.equal(summary.totalCount, 1);
      assert.equal(summary.failedCount, 1);
      assert.equal(summary.envelopes[0].status, 'failed');
      assert.equal(summary.envelopes[0].error.code, 'PROVIDER_TIMEOUT');
    });
  });

  // ============================================================================
  // 4. PARTIAL PROVIDER FAILURE & FAULT ISOLATION TESTS (Section 15, 59, 67)
  // ============================================================================
  describe('4. Partial Provider Failure & Fault Isolation (Section 15, 59, 67)', () => {
    it('simulates Rail=success, Bus=timeout, Flight=success, Road=unavailable (Section 59)', async () => {
      const railProvider = {
        mode: 'rail',
        code: 'IRCTC',
        search: async () => ({
          provider: 'rail',
          providerCode: 'IRCTC',
          status: 'success',
          candidates: [createMockCandidate({ provider: 'rail', trainNumber: '12424', price: 1200 })],
        }),
      };

      const busProvider = {
        mode: 'bus',
        code: 'REDBUS',
        search: async () => {
          const err = new Error('Bus provider connection timed out');
          err.code = 'PROVIDER_TIMEOUT';
          throw err;
        },
      };

      const flightProvider = {
        mode: 'flight',
        code: 'AIRLINE',
        search: async () => ({
          provider: 'flight',
          providerCode: 'AIRLINE',
          status: 'success',
          candidates: [
            {
              mode: 'flight',
              flight_number: 'AI-202',
              airline: 'Air India',
              departure: '09:00',
              arrival: '11:00',
              fare: 4500,
              duration: 120,
            },
          ],
        }),
      };

      const roadProvider = {
        mode: 'road',
        code: 'OSRM',
        search: async () => ({
          provider: 'road',
          providerCode: 'OSRM',
          status: 'unavailable',
          candidates: [],
          error: { code: 'PROVIDER_UNAVAILABLE', message: 'No road route available' },
        }),
      };

      const orchestrator = new JourneyOrchestrator({
        providerRegistry: {
          getProviders: () => [railProvider, busProvider, flightProvider, roadProvider],
        },
      });

      const response = await orchestrator.orchestrateSearch({
        origin: 'Sonipat',
        destination: 'Patna',
        departureDate: '2026-10-01',
      }, { includeDevelopment: false });

      // 1. Both Rail and Flight results must survive
      assert.equal(response.journeys.length, 2);
      const modesFound = response.journeys.flatMap((j) => j.transportModes);
      assert.ok(modesFound.includes('rail'));
      assert.ok(modesFound.includes('flight'));

      // 2. Bus failure and Road unavailable must be safely recorded in metadata
      assert.equal(response.meta.providersQueried, 4);
      assert.equal(response.meta.providersSuccessful, 2);
      assert.equal(response.meta.providersFailed, 1);

      const busMeta = response.meta.providers.find((p) => p.provider === 'bus');
      assert.equal(busMeta.status, 'failed');
      assert.ok(busMeta.error);

      const roadMeta = response.meta.providers.find((p) => p.provider === 'road');
      assert.equal(roadMeta.status, 'unavailable');
    });

    it('survives when one provider returns results while others return empty (Section 67)', async () => {
      const railEmpty = {
        mode: 'rail',
        search: async () => ({ provider: 'rail', status: 'empty', candidates: [] }),
      };
      const busSuccess = {
        mode: 'bus',
        search: async () => ({
          provider: 'bus',
          status: 'success',
          candidates: [
            {
              mode: 'bus',
              busNumber: 'BUS-101',
              operator: 'HRTC',
              departureTime: '08:00',
              arrivalTime: '20:00',
              price: 800,
            },
          ],
        }),
      };
      const flightEmpty = {
        mode: 'flight',
        search: async () => ({ provider: 'flight', status: 'empty', candidates: [] }),
      };
      const roadEmpty = {
        mode: 'road',
        search: async () => ({ provider: 'road', status: 'empty', candidates: [] }),
      };

      const orchestrator = new JourneyOrchestrator({
        providerRegistry: { getProviders: () => [railEmpty, busSuccess, flightEmpty, roadEmpty] },
      });

      const response = await orchestrator.orchestrateSearch({
        origin: 'Sonipat',
        destination: 'Patna',
        departureDate: '2026-10-01',
      }, { includeDevelopment: false });

      assert.equal(response.journeys.length, 1);
      assert.equal(response.journeys[0].transportModes[0], 'bus');
      assert.equal(response.meta.providersSuccessful, 1);
    });
  });

  // ============================================================================
  // 5. ALL PROVIDERS FAIL & EMPTY RESULTS TESTS (Section 16, 61, 62)
  // ============================================================================
  describe('5. All-Provider Failure vs Zero Results (Section 16, 61, 62)', () => {
    it('distinguishes "No journeys found" when all providers return empty [] (Section 61)', async () => {
      const railEmpty = {
        mode: 'rail',
        search: async () => ({ provider: 'rail', status: 'empty', candidates: [] }),
      };
      const busEmpty = {
        mode: 'bus',
        search: async () => ({ provider: 'bus', status: 'empty', candidates: [] }),
      };

      const orchestrator = new JourneyOrchestrator({
        providerRegistry: { getProviders: () => [railEmpty, busEmpty] },
      });

      const response = await orchestrator.orchestrateSearch({
        origin: 'Sonipat',
        destination: 'Patna',
        departureDate: '2026-10-01',
      }, { includeDevelopment: false });

      // Valid HTTP 200 with empty journeys array, NOT an error
      assert.equal(response.status, 'completed');
      assert.equal(response.count, 0);
      assert.deepEqual(response.journeys, []);
    });

    it('rejects with ALL_PROVIDERS_FAILED (HTTP 502) when all providers fail (Section 16, 62)', async () => {
      const failProvider1 = {
        mode: 'rail',
        search: async () => {
          throw new Error('Rail network connection refused');
        },
      };
      const failProvider2 = {
        mode: 'flight',
        search: async () => {
          throw new Error('Flight API 500 Internal Error');
        },
      };

      const orchestrator = new JourneyOrchestrator({
        providerRegistry: { getProviders: () => [failProvider1, failProvider2] },
      });

      let caughtErr = null;
      try {
        await orchestrator.orchestrateSearch({
          origin: 'Sonipat',
          destination: 'Patna',
          departureDate: '2026-10-01',
        }, { includeDevelopment: false });
      } catch (err) {
        caughtErr = err;
      }

      assert.ok(caughtErr);
      assert.equal(caughtErr.statusCode, 502);
      assert.equal(caughtErr.code, 'ALL_PROVIDERS_FAILED');

      // Verify SearchRequest was marked 'failed'
      const failedReq = await SearchRequest.findOne({}).sort({ createdAt: -1 });
      assert.ok(failedReq);
      assert.equal(failedReq.status, 'failed');
    });
  });

  // ============================================================================
  // 6. NORMALIZATION FAILURE ISOLATION (Section 19, 60)
  // ============================================================================
  describe('6. Normalization Candidate-Level Failure Isolation (Section 19, 60)', () => {
    it('preserves candidates A and C when candidate B is malformed (Section 60)', async () => {
      const candidates = [
        // A: Valid candidate
        createMockCandidate({ trainNumber: '12424', trainName: 'Valid Train A', depTime: '06:00', arrTime: '18:00' }),
        // B: Corrupted candidate (missing arrival time / malformed timing)
        {
          mode: 'rail',
          train_number: 'CORRUPT-001',
          departure_time: '06:00',
          arrival_time: null, // Malformed: missing arrival
        },
        // C: Valid candidate
        createMockCandidate({ trainNumber: '12426', trainName: 'Valid Train C', depTime: '08:00', arrTime: '20:00' }),
      ];

      const providerWithMixedCandidates = {
        mode: 'rail',
        search: async () => ({
          provider: 'rail',
          status: 'success',
          candidates,
        }),
      };

      const orchestrator = new JourneyOrchestrator({
        providerRegistry: { getProviders: () => [providerWithMixedCandidates] },
      });

      const response = await orchestrator.orchestrateSearch({
        origin: 'Sonipat',
        destination: 'Patna',
        departureDate: '2026-10-01',
      }, { includeDevelopment: false });

      // Valid candidates A and C should survive; B should be safely rejected
      assert.equal(response.journeys.length, 2);
      const trainNumbers = response.journeys.map((j) => j.legs[0].vehicle?.identifier || j.legs[0].service?.number);
      assert.ok(trainNumbers.includes('12424'));
      assert.ok(trainNumbers.includes('12426'));
      assert.ok(!trainNumbers.includes('CORRUPT-001'));
    });
  });

  // ============================================================================
  // 7. DEDUPLICATION INTEGRATION (Section 21, 52)
  // ============================================================================
  describe('7. Deduplication Integration & Persistence Cleanliness', () => {
    it('deduplicates duplicate candidates before database persistence without duplicate Journey docs', async () => {
      // Simulate two different providers listing the same Rajdhani Express 12424 at 06:00 -> 18:00
      const provider1 = {
        mode: 'rail',
        search: async () => ({
          provider: 'rail',
          providerCode: 'IRCTC',
          status: 'success',
          candidates: [
            createMockCandidate({ trainNumber: '12424', price: 1250, depTime: '06:00', arrTime: '18:00' }),
          ],
        }),
      };

      const provider2 = {
        mode: 'rail',
        search: async () => ({
          provider: 'rail',
          providerCode: 'TRAVEL_PORTAL',
          status: 'success',
          candidates: [
            createMockCandidate({ trainNumber: '12424', price: 1250, depTime: '06:00', arrTime: '18:00' }),
          ],
        }),
      };

      const orchestrator = new JourneyOrchestrator({
        providerRegistry: { getProviders: () => [provider1, provider2] },
      });

      const initialJourneyCount = await Journey.countDocuments();

      const response = await orchestrator.orchestrateSearch({
        origin: 'Sonipat',
        destination: 'Patna',
        departureDate: '2026-10-01',
      }, { includeDevelopment: false });

      // Deduplicated to 1 result
      assert.equal(response.journeys.length, 1);
      assert.equal(response.meta.deduplication.duplicatesRemoved, 1);

      // Verify in MongoDB: exactly 1 new Journey document created, NOT 2
      const finalJourneyCount = await Journey.countDocuments();
      assert.equal(finalJourneyCount, initialJourneyCount + 1, 'Only 1 Journey document should be persisted for duplicates');
    });
  });

  // ============================================================================
  // 8. RANKING INTEGRATION & STRATEGY INDEPENDENCE (Section 28, 63, 64)
  // ============================================================================
  describe('8. Ranking Integration & Strategy Independence (Section 28, 63, 64)', () => {
    it('calls Ranking Engine and orders candidates based on fastest, cheapest, etc. (Section 63)', async () => {
      // Journey A: 600 min, 1200 fare, 1 transfer
      // Journey B: 720 min, 800 fare, 0 transfers
      // Journey C: 900 min, 600 fare, 2 transfers
      const candidates = [
        createMockCandidate({ trainNumber: 'TRAIN_A', duration: 600, price: 1200, depTime: '06:00', arrTime: '16:00' }),
        createMockCandidate({ trainNumber: 'TRAIN_B', duration: 720, price: 800, depTime: '07:00', arrTime: '19:00' }),
        createMockCandidate({ trainNumber: 'TRAIN_C', duration: 900, price: 600, depTime: '08:00', arrTime: '23:00' }),
      ];

      const multiCandidateProvider = {
        mode: 'rail',
        search: async () => ({ provider: 'rail', status: 'success', candidates }),
      };

      const orchestrator = new JourneyOrchestrator({
        providerRegistry: { getProviders: () => [multiCandidateProvider] },
      });

      // Test Fastest
      const resFastest = await orchestrator.orchestrateSearch({
        origin: 'Sonipat',
        destination: 'Patna',
        departureDate: '2026-10-01',
        ranking: 'fastest',
      }, { includeDevelopment: false });

      assert.equal(resFastest.ranking.strategy, 'fastest');
      assert.equal(resFastest.journeys[0].duration, 600); // Train A is fastest

      // Test Cheapest
      const resCheapest = await orchestrator.orchestrateSearch({
        origin: 'Sonipat',
        destination: 'Patna',
        departureDate: '2026-10-01',
        ranking: 'cheapest',
      }, { includeDevelopment: false });

      assert.equal(resCheapest.ranking.strategy, 'cheapest');
      assert.equal(resCheapest.journeys[0].totalPrice, 600); // Train C is cheapest
    });

    it('works with injected mock ranking strategy demonstrating strategy independence (Section 64)', async () => {
      // Custom mock strategy that inverts natural sort
      class CustomMockStrategy extends BaseRankingStrategy {
        constructor() {
          super('custom_reverse', 'Custom Reverse Strategy');
        }
        rank(journeys) {
          return [...journeys].reverse().map((j, i) => ({
            ...j,
            ranking: { rank: i + 1, strategy: this.id, score: 0.99 },
          }));
        }
      }

      const customRegistry = new RankingRegistry();
      customRegistry.register('custom_reverse', new CustomMockStrategy());
      const customRankingEngine = new RankingEngine(customRegistry);

      const mockProvider = {
        mode: 'rail',
        search: async () => ({
          provider: 'rail',
          status: 'success',
          candidates: [
            createMockCandidate({ trainNumber: 'T1', depTime: '06:00', arrTime: '12:00' }),
            createMockCandidate({ trainNumber: 'T2', depTime: '08:00', arrTime: '14:00' }),
          ],
        }),
      };

      const orchestrator = new JourneyOrchestrator({
        providerRegistry: { getProviders: () => [mockProvider] },
        rankingEngine: customRankingEngine,
      });

      const response = await orchestrator.orchestrateSearch({
        origin: 'Sonipat',
        destination: 'Patna',
        departureDate: '2026-10-01',
        ranking: 'custom_reverse',
      }, { includeDevelopment: false });

      assert.equal(response.ranking.strategy, 'custom_reverse');
      assert.equal(response.journeys[0].ranking.strategy, 'custom_reverse');
    });
  });

  // ============================================================================
  // 9. END-TO-END HTTP API SEARCH TEST (Section 58, 78)
  // ============================================================================
  describe('9. End-to-End HTTP API Search (POST /api/journeys/search)', () => {
    it('executes POST /api/journeys/search through the full Orchestrator pipeline (Section 58, 78)', async () => {
      const res = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Patna',
          departureDate: '2026-10-01',
          ranking: 'overall',
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();

      assert.equal(body.success, true);
      assert.equal(body.message, 'Journeys retrieved successfully');
      assert.ok(body.data.searchRequestId);
      assert.equal(body.data.status, 'completed');
      assert.ok(body.data.count >= 1);
      assert.ok(body.data.journeys.length >= 1);
      assert.ok(body.journeys.length >= 1);

      // Verify origin and destination canonical data
      assert.equal(body.data.origin.name, 'Sonipat Junction Railway Station');
      assert.equal(body.data.destination.name, 'Patna Junction Railway Station');

      // Verify ranking metadata
      assert.equal(body.data.ranking.strategy, 'overall');
      assert.equal(body.data.ranking.label, 'Best Overall');

      // Verify search metadata
      assert.ok(body.data.meta);
      assert.ok(body.data.meta.searchedAt);
      assert.ok(typeof body.data.meta.durationMs === 'number');
      assert.ok(Array.isArray(body.data.meta.providers));

      // Verify JourneyLegs referential link
      const firstJourney = body.data.journeys[0];
      assert.ok(firstJourney.legs.length >= 1);
      assert.ok(firstJourney.legs[0].departureTime);
      assert.ok(firstJourney.legs[0].arrivalTime);
    });
  });
});
