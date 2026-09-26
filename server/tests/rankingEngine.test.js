import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { setupTestDb, teardownTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import {
  rankingEngine,
  RankingEngine,
  rankingRegistry,
  RankingRegistry,
  BaseRankingStrategy,
  overallStrategy,
  fastestStrategy,
  cheapestStrategy,
  fewestTransfersStrategy,
  mostConvenientStrategy,
  normalizeLowerIsBetter,
  normalizeHigherIsBetter,
  getMetricBounds,
  OVERALL_WEIGHTS,
  CONVENIENCE_WEIGHTS,
} from '../src/ranking/index.js';
import Location from '../src/models/Location.js';

describe('Yatrai Phase 7 — Ranking Engine Suite', () => {
  let app;
  let server;
  let baseUrl;

  before(async () => {
    await setupTestDb();
    await Location.init();

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
  const originId = new mongoose.Types.ObjectId();
  const destId = new mongoose.Types.ObjectId();

  // Helper fixture builder
  const createMockJourney = (overrides = {}) => ({
    id: new mongoose.Types.ObjectId().toString(),
    origin: originId,
    destination: destId,
    departureTime: new Date('2026-10-01T08:00:00+05:30'),
    arrivalTime: new Date('2026-10-01T18:00:00+05:30'),
    duration: 600, // 10h
    totalDistance: 800,
    totalPrice: 1200,
    currency: 'INR',
    numberOfTransfers: 0,
    transportModes: ['rail'],
    status: 'scheduled',
    legs: [
      {
        sequence: 1,
        origin: originId,
        destination: destId,
        mode: 'rail',
        duration: 600,
        distance: 800,
        price: 1200,
        currency: 'INR',
      },
    ],
    metadata: {},
    schemaVersion: 1,
    ...overrides,
  });

  // =========================================================================
  // 1. Strategy Interface & Common Contracts
  // =========================================================================
  describe('1. Strategy Interface & Immutability Contracts', () => {
    it('returns empty array when journey list is empty', () => {
      assert.deepEqual(fastestStrategy.rank([]), []);
      assert.deepEqual(cheapestStrategy.rank([]), []);
      assert.deepEqual(fewestTransfersStrategy.rank([]), []);
      assert.deepEqual(overallStrategy.rank([]), []);
      assert.deepEqual(mostConvenientStrategy.rank([]), []);
    });

    it('assigns rank 1 and score 1.0 when only single journey exists', () => {
      const journey = createMockJourney({ duration: 500, totalPrice: 1000 });
      const ranked = fastestStrategy.rank([journey]);

      assert.equal(ranked.length, 1);
      assert.equal(ranked[0].ranking.rank, 1);
      assert.equal(ranked[0].ranking.score, 1.0);
      assert.equal(ranked[0].ranking.strategy, 'fastest');
    });

    it('preserves immutability of input journeys', () => {
      const originalJourney = createMockJourney({ duration: 600, totalPrice: 1500 });
      const originalJson = JSON.stringify(originalJourney);

      fastestStrategy.rank([originalJourney]);

      assert.equal(
        JSON.stringify(originalJourney),
        originalJson,
        'Input journey must not be mutated during ranking'
      );
    });
  });

  // =========================================================================
  // 2. Fastest Strategy Tests
  // =========================================================================
  describe('2. Fastest Strategy (PRD Section 13)', () => {
    it('ranks journeys by shortest duration: A (600m), B (720m), C (900m) => [A, B, C]', () => {
      const jA = createMockJourney({ id: 'A', duration: 600 });
      const jB = createMockJourney({ id: 'B', duration: 720 });
      const jC = createMockJourney({ id: 'C', duration: 900 });

      const ranked = fastestStrategy.rank([jB, jC, jA]);

      assert.equal(ranked[0].id, 'A');
      assert.equal(ranked[1].id, 'B');
      assert.equal(ranked[2].id, 'C');
      assert.equal(ranked[0].ranking.rank, 1);
      assert.equal(ranked[1].ranking.rank, 2);
      assert.equal(ranked[2].ranking.rank, 3);
      assert.equal(ranked[0].ranking.score, 1.0); // Best
      assert.equal(ranked[2].ranking.score, 0.0); // Worst
    });

    it('breaks ties deterministically using transfers, price, then original order', () => {
      // Both have 600 mins, but jB has fewer transfers
      const jA = createMockJourney({ id: 'A', duration: 600, numberOfTransfers: 1, totalPrice: 1000 });
      const jB = createMockJourney({ id: 'B', duration: 600, numberOfTransfers: 0, totalPrice: 1200 });

      const ranked = fastestStrategy.rank([jA, jB]);
      assert.equal(ranked[0].id, 'B', 'Fewest transfers must break duration tie');
    });
  });

  // =========================================================================
  // 3. Cheapest Strategy Tests
  // =========================================================================
  describe('3. Cheapest Strategy (PRD Section 14)', () => {
    it('ranks journeys by lowest price: A (₹850), B (₹1200), C (₹600) => [C, A, B]', () => {
      const jA = createMockJourney({ id: 'A', totalPrice: 850 });
      const jB = createMockJourney({ id: 'B', totalPrice: 1200 });
      const jC = createMockJourney({ id: 'C', totalPrice: 600 });

      const ranked = cheapestStrategy.rank([jA, jB, jC]);

      assert.equal(ranked[0].id, 'C');
      assert.equal(ranked[1].id, 'A');
      assert.equal(ranked[2].id, 'B');
      assert.equal(ranked[0].ranking.rank, 1);
      assert.equal(ranked[0].ranking.score, 1.0);
    });

    it('does not treat missing price (null/undefined) as zero', () => {
      const jFree = createMockJourney({ id: 'FREE', totalPrice: 0 }); // Legitimate free
      const jMissing = createMockJourney({ id: 'MISSING', totalPrice: null });
      const jPaid = createMockJourney({ id: 'PAID', totalPrice: 500 });

      const ranked = cheapestStrategy.rank([jMissing, jPaid, jFree]);

      assert.equal(ranked[0].id, 'FREE', 'Price 0 is legitimate free journey');
      assert.equal(ranked[1].id, 'PAID', 'Known price ranks before missing price');
      assert.equal(ranked[2].id, 'MISSING', 'Missing price must not be treated as 0');
      assert.equal(ranked[2].ranking.score, 0.0);
    });
  });

  // =========================================================================
  // 4. Fewest Transfers Strategy Tests
  // =========================================================================
  describe('4. Fewest Transfers Strategy (PRD Section 15)', () => {
    it('ranks journeys by transfer count: A (0 transfers), B (2 transfers), C (1 transfer) => [A, C, B]', () => {
      const jA = createMockJourney({ id: 'A', numberOfTransfers: 0, duration: 700 });
      const jB = createMockJourney({ id: 'B', numberOfTransfers: 2, duration: 500 });
      const jC = createMockJourney({ id: 'C', numberOfTransfers: 1, duration: 600 });

      const ranked = fewestTransfersStrategy.rank([jB, jA, jC]);

      assert.equal(ranked[0].id, 'A');
      assert.equal(ranked[1].id, 'C');
      assert.equal(ranked[2].id, 'B');
      assert.equal(ranked[0].ranking.rank, 1);
    });
  });

  // =========================================================================
  // 5. Best Overall Strategy Tests
  // =========================================================================
  describe('5. Best Overall Strategy (PRD Section 10 & 50)', () => {
    it('ranks journeys via weighted multi-dimensional composite formula', () => {
      // Candidate A: Cheap but very slow
      // Candidate B: Very fast but expensive
      // Candidate C: Balanced moderate price, moderate duration, 0 transfers
      const jA = createMockJourney({
        id: 'A',
        duration: 900, // Worst duration
        totalPrice: 400, // Best price
        numberOfTransfers: 1,
        departureTime: new Date('2026-10-01T08:00:00+05:30'),
      });

      const jB = createMockJourney({
        id: 'B',
        duration: 300, // Best duration
        totalPrice: 3500, // Worst price
        numberOfTransfers: 1,
        departureTime: new Date('2026-10-01T08:00:00+05:30'),
      });

      const jC = createMockJourney({
        id: 'C',
        duration: 450, // Moderate-fast
        totalPrice: 850, // Moderate-cheap
        numberOfTransfers: 0, // Best transfer
        departureTime: new Date('2026-10-01T08:00:00+05:30'),
      });

      const ranked = overallStrategy.rank([jA, jB, jC]);

      // Verify that composite scoring places balanced candidate C at the top
      assert.equal(ranked[0].id, 'C', 'Balanced option C must win Best Overall');
      assert.ok(ranked[0].ranking.score > ranked[1].ranking.score);
      assert.ok(ranked[1].ranking.score > ranked[2].ranking.score);
    });

    it('verifies explicit configured scoring weights', () => {
      assert.equal(OVERALL_WEIGHTS.durationWeight, 0.35);
      assert.equal(OVERALL_WEIGHTS.priceWeight, 0.30);
      assert.equal(OVERALL_WEIGHTS.transferWeight, 0.20);
      assert.equal(OVERALL_WEIGHTS.convenienceWeight, 0.15);
      const sum =
        OVERALL_WEIGHTS.durationWeight +
        OVERALL_WEIGHTS.priceWeight +
        OVERALL_WEIGHTS.transferWeight +
        OVERALL_WEIGHTS.convenienceWeight;
      assert.ok(Math.abs(sum - 1.0) < 1e-9, 'Weights must sum to 1.0');
    });
  });

  // =========================================================================
  // 6. Most Convenient Strategy Tests
  // =========================================================================
  describe('6. Most Convenient Strategy (PRD Section 16 & 51)', () => {
    it('rewards daytime departure and penalizes midnight red-eye departure', () => {
      // Daytime departure at 10:00 AM IST
      const jDay = createMockJourney({
        id: 'DAY',
        duration: 400,
        numberOfTransfers: 0,
        departureTime: new Date('2026-10-01T10:00:00+05:30'),
      });

      // Red-eye departure at 02:00 AM IST
      const jNight = createMockJourney({
        id: 'NIGHT',
        duration: 400,
        numberOfTransfers: 0,
        departureTime: new Date('2026-10-01T02:00:00+05:30'),
      });

      const ranked = mostConvenientStrategy.rank([jNight, jDay]);
      assert.equal(ranked[0].id, 'DAY', 'Daytime schedule must score higher convenience than red-eye');
    });

    it('rewards single-mode routes over multiple mode transitions', () => {
      const jDirect = createMockJourney({
        id: 'DIRECT',
        duration: 400,
        numberOfTransfers: 0,
        transportModes: ['rail'],
      });

      const jComplex = createMockJourney({
        id: 'COMPLEX',
        duration: 400,
        numberOfTransfers: 0,
        transportModes: ['road', 'rail', 'bus'],
      });

      const ranked = mostConvenientStrategy.rank([jComplex, jDirect]);
      assert.equal(ranked[0].id, 'DIRECT');
    });
  });

  // =========================================================================
  // 7. Score Normalization Math Edge Cases
  // =========================================================================
  describe('7. Score Normalization Math Edge Cases (PRD Section 37-40)', () => {
    it('handles all equal values without NaN or division by zero', () => {
      const bounds = getMetricBounds([600, 600, 600], (v) => v);
      assert.equal(bounds.allEqual, true);

      const score = normalizeLowerIsBetter(600, bounds.min, bounds.max);
      assert.equal(score, 1.0);
      assert.ok(!isNaN(score));
    });

    it('handles out-of-range bounds safely', () => {
      const score = normalizeLowerIsBetter(100, 200, 500); // Below min
      assert.equal(score, 1.0);

      const scoreHigh = normalizeLowerIsBetter(800, 200, 500); // Above max
      assert.equal(scoreHigh, 0.0);
    });

    it('handles missing values with fallback zero score without throwing', () => {
      const score = normalizeLowerIsBetter(null, 100, 500);
      assert.equal(score, 0.0);
    });
  });

  // =========================================================================
  // 8. Currency Safety Tests
  // =========================================================================
  describe('8. Currency Safety (PRD Section 24 & 53)', () => {
    it('does not falsely compare raw numbers across differing currencies', () => {
      // In INR, 850 is cheaper than 1500
      // But 20 USD is ~1660 INR, so raw 20 must NOT be treated as cheaper than 850 INR!
      const jInr = createMockJourney({ id: 'INR', totalPrice: 850, currency: 'INR' });
      const jUsd = createMockJourney({ id: 'USD', totalPrice: 20, currency: 'USD' });

      const ranked = cheapestStrategy.rank([jInr, jUsd]);

      // Base currency (INR) comparable journey ranks first; non-conforming currency placed at end
      assert.equal(ranked[0].id, 'INR');
      assert.equal(ranked[1].id, 'USD');
    });
  });

  // =========================================================================
  // 9. Multi-Category rankAll & Registry Tests
  // =========================================================================
  describe('9. Multi-Category rankAll & Dynamic Registry (PRD Section 8 & 32)', () => {
    it('executes rankAll producing all 5 categories from the same journey set', () => {
      const journeys = [
        createMockJourney({ id: '1', duration: 400, totalPrice: 1500, numberOfTransfers: 1 }),
        createMockJourney({ id: '2', duration: 800, totalPrice: 500, numberOfTransfers: 0 }),
      ];

      const allRanked = rankingEngine.rankAll(journeys);

      assert.ok(allRanked.overall, 'Must contain overall');
      assert.ok(allRanked.fastest, 'Must contain fastest');
      assert.ok(allRanked.cheapest, 'Must contain cheapest');
      assert.ok(allRanked.fewest_transfers, 'Must contain fewest_transfers');
      assert.ok(allRanked.most_convenient, 'Must contain most_convenient');

      assert.equal(allRanked.fastest[0].id, '1', 'Journey 1 is fastest');
      assert.equal(allRanked.cheapest[0].id, '2', 'Journey 2 is cheapest');
      assert.equal(allRanked.fewest_transfers[0].id, '2', 'Journey 2 has fewest transfers');
    });

    it('resolves aliases correctly (balanced -> overall, fewestTransfers -> fewest_transfers)', () => {
      assert.equal(rankingRegistry.get('balanced').id, 'overall');
      assert.equal(rankingRegistry.get('fewestTransfers').id, 'fewest_transfers');
      assert.equal(rankingRegistry.get('mostConvenient').id, 'most_convenient');
    });

    it('allows registering a new strategy without modifying existing code', () => {
      const customStrategy = {
        id: 'eco_friendly',
        name: 'Eco Friendly',
        rank: (journeys) => journeys.map((j, i) => ({ ...j, ranking: { rank: i + 1, strategy: 'eco_friendly' } })),
      };

      rankingRegistry.register('eco_friendly', customStrategy);
      assert.equal(rankingRegistry.has('eco_friendly'), true);

      const ranked = rankingEngine.rank([createMockJourney()], 'eco_friendly');
      assert.equal(ranked[0].ranking.strategy, 'eco_friendly');

      // Cleanup
      rankingRegistry.unregister('eco_friendly');
    });
  });

  // =========================================================================
  // 10. Search API Integration & Validation
  // =========================================================================
  describe('10. Search API Integration & Validation (PRD Section 55 & 56)', () => {
    let sonipatDoc = null;
    let patnaDoc = null;

    it('setup: verifies test locations exist in database', async () => {
      sonipatDoc = await Location.findOne({ city: 'Sonipat' });
      patnaDoc = await Location.findOne({ city: 'Patna' });

      if (!sonipatDoc) {
        sonipatDoc = await Location.create({
          name: 'Sonipat Junction Railway Station',
          city: 'Sonipat',
          state: 'Haryana',
          country: 'India',
          type: 'railway_station',
          location: { type: 'Point', coordinates: [77.0151, 28.9931] },
        });
      }

      if (!patnaDoc) {
        patnaDoc = await Location.create({
          name: 'Patna Junction Railway Station',
          city: 'Patna',
          state: 'Bihar',
          country: 'India',
          type: 'railway_station',
          location: { type: 'Point', coordinates: [85.1376, 25.6022] },
        });
      }

      assert.ok(sonipatDoc);
      assert.ok(patnaDoc);
    });

    it('rejects invalid ranking strategy with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Patna',
          departureDate: '2026-10-01',
          ranking: 'something_random', // Invalid!
        }),
      });

      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
      assert.ok(data.error.message.includes('Invalid ranking strategy'));
    });

    it('executes journey search with fastest ranking strategy and returns ranked output', async () => {
      const res = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Patna',
          departureDate: '2026-10-01',
          ranking: 'fastest',
        }),
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.ok(data.data.ranking);
      assert.equal(data.data.ranking.strategy, 'fastest');
      assert.equal(data.data.ranking.label, 'Fastest');

      if (data.data.journeys.length > 0) {
        const first = data.data.journeys[0];
        assert.ok(first.ranking, 'Journey must have ranking metadata attached');
        assert.equal(first.ranking.strategy, 'fastest');
        assert.equal(first.ranking.rank, 1);
      }
    });

    it('executes journey search with cheapest ranking strategy via sortBy alias', async () => {
      const res = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Patna',
          departureDate: '2026-10-01',
          sortBy: 'cheapest',
        }),
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.ranking.strategy, 'cheapest');
    });
  });
});
