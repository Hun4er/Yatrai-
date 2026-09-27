import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JourneyDeduplicator, journeyDeduplicator } from '../src/deduplication/journeyDeduplicator.js';

describe('Yatrai Phase 8 — Journey Deduplication Suite', () => {
  const baseOrigin = {
    id: '66f45a1b8c2d9e0012345671',
    name: 'Sonipat Junction Railway Station',
    city: 'Sonipat',
    coordinates: [77.0151, 28.9931],
  };

  const baseDestination = {
    id: '66f45a1b8c2d9e0012345672',
    name: 'Patna Junction Railway Station',
    city: 'Patna',
    coordinates: [85.1376, 25.6022],
  };

  const depTime = '2026-10-01T06:00:00.000Z';
  const arrTime = '2026-10-01T18:00:00.000Z';

  // Base canonical journey generator
  const createJourney = (overrides = {}) => ({
    id: overrides.id || 'journey_1',
    origin: overrides.origin || baseOrigin,
    destination: overrides.destination || baseDestination,
    departureTime: overrides.departureTime || depTime,
    arrivalTime: overrides.arrivalTime || arrTime,
    duration: overrides.duration !== undefined ? overrides.duration : 720,
    totalDistance: overrides.totalDistance !== undefined ? overrides.totalDistance : 1050,
    totalPrice: overrides.totalPrice !== undefined ? overrides.totalPrice : 1200,
    currency: overrides.currency || 'INR',
    numberOfTransfers: overrides.numberOfTransfers !== undefined ? overrides.numberOfTransfers : 0,
    transportModes: overrides.transportModes || ['rail'],
    status: overrides.status || 'scheduled',
    source: overrides.source || 'provider_a',
    legs: overrides.legs || [
      {
        sequence: 1,
        origin: baseOrigin,
        destination: baseDestination,
        mode: overrides.mode || 'rail',
        departureTime: overrides.departureTime || depTime,
        arrivalTime: overrides.arrivalTime || arrTime,
        duration: 720,
        price: 1200,
        currency: 'INR',
        service: {
          name: overrides.serviceName || 'Ganga Express',
          number: overrides.serviceNumber || '14218',
          operator: overrides.operator || 'Northern Railway',
        },
        vehicle: {
          type: 'Train',
          identifier: overrides.serviceNumber || '14218',
        },
        booking: {
          status: 'available',
          reference: overrides.bookingRef || 'REF-A-01',
          url: overrides.bookingUrl || 'https://booking.example.com/a',
        },
      },
    ],
    metadata: overrides.metadata || {},
  });

  describe('1. Equivalence & Deduplication Rules (Section 22–25, 57)', () => {
    it('Case A: detects and merges exact duplicate canonical journeys', () => {
      const j1 = createJourney({ id: 'j1' });
      const j2 = createJourney({ id: 'j2' });

      const result = journeyDeduplicator.deduplicate([j1, j2]);

      assert.equal(result.length, 1);
      assert.ok(['j1', 'j2'].includes(result[0].id));
    });

    it('Case B: detects duplicate across different providers representing the same underlying journey', () => {
      const jFromProviderA = createJourney({
        id: 'j_provider_a',
        source: 'rail_provider_a',
        serviceNumber: '12424',
      });

      const jFromProviderB = createJourney({
        id: 'j_provider_b',
        source: 'rail_provider_b',
        serviceNumber: '12424', // Same physical train service
      });

      const report = journeyDeduplicator.deduplicateWithReport([jFromProviderA, jFromProviderB]);

      assert.equal(report.journeys.length, 1);
      assert.equal(report.report.duplicatesRemoved, 1);
      assert.equal(report.duplicates.length, 1);
    });

    it('Case C: preserves legitimate alternatives with same route but different departure time', () => {
      const trainEarly = createJourney({
        id: 'train_early',
        departureTime: '2026-10-01T06:00:00.000Z',
        arrivalTime: '2026-10-01T18:00:00.000Z',
        serviceNumber: '12424',
      });

      const trainLater = createJourney({
        id: 'train_later',
        departureTime: '2026-10-01T08:00:00.000Z',
        arrivalTime: '2026-10-01T20:00:00.000Z',
        serviceNumber: '12426',
      });

      const result = journeyDeduplicator.deduplicate([trainEarly, trainLater]);

      assert.equal(result.length, 2, 'Different departure schedules must NOT be deduplicated');
      assert.equal(result[0].id, 'train_early');
      assert.equal(result[1].id, 'train_later');
    });

    it('Case D: preserves legitimate alternatives with same route and departure but different arrival time', () => {
      const superfast = createJourney({
        id: 'train_superfast',
        departureTime: '2026-10-01T06:00:00.000Z',
        arrivalTime: '2026-10-01T16:00:00.000Z', // 10h duration
        duration: 600,
        serviceNumber: '12424',
      });

      const passenger = createJourney({
        id: 'train_passenger',
        departureTime: '2026-10-01T06:00:00.000Z',
        arrivalTime: '2026-10-01T21:00:00.000Z', // 15h duration
        duration: 900,
        serviceNumber: '14218',
      });

      const result = journeyDeduplicator.deduplicate([superfast, passenger]);

      assert.equal(result.length, 2, 'Different arrival times / durations must NOT be deduplicated');
    });

    it('Case E: preserves different transport modes departing at identical times', () => {
      const railJourney = createJourney({
        id: 'rail_option',
        transportModes: ['rail'],
        departureTime: '2026-10-01T06:00:00.000Z',
        arrivalTime: '2026-10-01T18:00:00.000Z',
      });

      const flightJourney = createJourney({
        id: 'flight_option',
        transportModes: ['flight'],
        mode: 'flight',
        departureTime: '2026-10-01T06:00:00.000Z',
        arrivalTime: '2026-10-01T08:00:00.000Z',
        duration: 120,
        totalPrice: 4500,
        serviceName: 'IndiGo 6E-204',
        serviceNumber: '6E-204',
      });

      const result = journeyDeduplicator.deduplicate([railJourney, flightJourney]);

      assert.equal(result.length, 2, 'Rail and Flight options must both be preserved');
    });

    it('preserves different train numbers on the same route even if timings are close', () => {
      const train1 = createJourney({
        id: 'train_1',
        serviceNumber: '12301',
      });

      const train2 = createJourney({
        id: 'train_2',
        serviceNumber: '12303',
      });

      const result = journeyDeduplicator.deduplicate([train1, train2]);
      assert.equal(result.length, 2);
    });
  });

  describe('2. Deterministic Retention Policy (Section 27)', () => {
    it('retains the candidate with richer/more complete data attributes', () => {
      // Sparse candidate: lacks pricing and booking details
      const sparse = createJourney({
        id: 'sparse_candidate',
        source: 'development',
        totalPrice: 0,
        legs: [
          {
            sequence: 1,
            origin: baseOrigin,
            destination: baseDestination,
            mode: 'rail',
            departureTime: depTime,
            arrivalTime: arrTime,
            price: 0,
            service: { number: '12424' },
          },
        ],
      });

      // Rich candidate: full pricing, booking link, vehicle details
      const rich = createJourney({
        id: 'rich_candidate',
        source: 'irctc_direct',
        totalPrice: 1250,
        totalDistance: 1045,
        legs: [
          {
            sequence: 1,
            origin: baseOrigin,
            destination: baseDestination,
            mode: 'rail',
            departureTime: depTime,
            arrivalTime: arrTime,
            price: 1250,
            service: { name: 'Rajdhani', number: '12424', operator: 'IRCTC', class: '3A' },
            vehicle: { type: 'Train', identifier: '12424' },
            booking: { status: 'available', url: 'https://irctc.co.in/book' },
          },
        ],
      });

      const result = journeyDeduplicator.deduplicate([sparse, rich]);

      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'rich_candidate', 'Richer candidate must be retained');
      assert.equal(result[0].totalPrice, 1250);
    });

    it('enriches the retained candidate with non-empty fields from the duplicate', () => {
      const candidateA = createJourney({
        id: 'cand_a',
        totalPrice: 1200,
        legs: [
          {
            sequence: 1,
            origin: baseOrigin,
            destination: baseDestination,
            mode: 'rail',
            departureTime: depTime,
            arrivalTime: arrTime,
            service: { number: '12424' },
            booking: { url: 'https://provider-a.com/ticket' },
          },
        ],
      });

      const candidateB = createJourney({
        id: 'cand_b',
        totalPrice: 1200,
        legs: [
          {
            sequence: 1,
            origin: baseOrigin,
            destination: baseDestination,
            mode: 'rail',
            departureTime: depTime,
            arrivalTime: arrTime,
            service: { number: '12424', operator: 'Northern Railway' }, // Extra operator metadata
            booking: {},
          },
        ],
      });

      const result = journeyDeduplicator.deduplicate([candidateA, candidateB]);

      assert.equal(result.length, 1);
      assert.ok(result[0].legs[0].booking.url, 'Retains booking url from A');
      assert.ok(result[0].legs[0].service.operator, 'Enriched operator from B');
    });

    it('applies stable tie-breaker when data completeness is identical', () => {
      const jA = createJourney({ id: 'cand_first', source: 'provider_a', serviceNumber: '12424' });
      const jB = createJourney({ id: 'cand_second', source: 'provider_b', serviceNumber: '12424' });

      const result1 = journeyDeduplicator.deduplicate([jA, jB]);
      const result2 = journeyDeduplicator.deduplicate([jA, jB]);

      assert.equal(result1.length, 1);
      assert.equal(result1[0].id, result2[0].id, 'Deduplication must be strictly deterministic across calls');
    });
  });

  describe('3. Audit Report & Edge Cases (Section 26)', () => {
    it('returns empty array when input is empty', () => {
      const res = journeyDeduplicator.deduplicate([]);
      assert.deepEqual(res, []);
    });

    it('returns single candidate untouched', () => {
      const single = createJourney({ id: 'single' });
      const res = journeyDeduplicator.deduplicate([single]);
      assert.equal(res.length, 1);
      assert.equal(res[0].id, 'single');
    });

    it('preserves array immutability without mutating the original input', () => {
      const original = [createJourney({ id: '1' }), createJourney({ id: '2' })];
      const copy = [...original];

      journeyDeduplicator.deduplicate(original);

      assert.equal(original.length, copy.length);
      assert.equal(original[0].id, copy[0].id);
    });

    it('provides accurate deduplication report with duration and counts', () => {
      const j1 = createJourney({ id: 'j1', serviceNumber: '12424' });
      const j2 = createJourney({ id: 'j2', serviceNumber: '12424' }); // duplicate of j1
      const j3 = createJourney({ id: 'j3', serviceNumber: '12426' }); // unique

      const report = journeyDeduplicator.deduplicateWithReport([j1, j2, j3]);

      assert.equal(report.journeys.length, 2);
      assert.equal(report.report.totalBefore, 3);
      assert.equal(report.report.totalAfter, 2);
      assert.equal(report.report.duplicatesRemoved, 1);
      assert.ok(typeof report.report.durationMs === 'number');
      assert.equal(report.duplicates.length, 1);
      assert.ok(report.duplicates[0].reason);
      assert.ok(report.duplicates[0].fingerprint);
    });
  });
});
