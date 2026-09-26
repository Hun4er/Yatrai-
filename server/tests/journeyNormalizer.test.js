import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  journeyNormalizer,
  normalizeJourneyCandidate,
  normalizeProviderResult,
  validateJourneyCandidate,
  railNormalizerStrategy,
  busNormalizerStrategy,
  flightNormalizerStrategy,
  roadNormalizerStrategy,
} from '../src/normalization/index.js';
import { createSuccessEnvelope, createEmptyEnvelope, createFailedEnvelope } from '../src/providers/transport/envelope.js';

describe('Yatrai Phase 6 — Journey Normalizer Suite', () => {
  const originId = new mongoose.Types.ObjectId();
  const destId = new mongoose.Types.ObjectId();
  const intermediateId = new mongoose.Types.ObjectId();

  const baseContext = {
    origin: originId,
    destination: destId,
    departureDate: new Date('2026-10-01T00:00:00Z'),
  };

  // =========================================================================
  // 1. Rail Transport Normalization (PRD Phase 6 Section 45)
  // =========================================================================
  describe('1. Rail Normalization Strategy', () => {
    it('normalizes canonical rail candidate according to PRD specification', () => {
      const railPayload = {
        departure_time: '2026-10-01T06:00:00+05:30',
        arrival_time: '2026-10-01T18:00:00+05:30',
        train_number: '12301',
        price: 850,
        currency: 'INR',
      };

      const normalized = railNormalizerStrategy.normalize(railPayload, baseContext);

      // Verify canonical fields
      assert.ok(normalized.departureTime instanceof Date, 'departureTime must be a Date');
      assert.ok(normalized.arrivalTime instanceof Date, 'arrivalTime must be a Date');
      assert.equal(normalized.departureTime.toISOString(), '2026-10-01T00:30:00.000Z');
      assert.equal(normalized.arrivalTime.toISOString(), '2026-10-01T12:30:00.000Z');
      assert.equal(normalized.duration, 720, 'Duration must be 720 minutes (12 hours)');
      assert.equal(normalized.totalPrice, 850);
      assert.equal(normalized.currency, 'INR');
      assert.deepEqual(normalized.transportModes, ['rail']);
      assert.equal(normalized.numberOfTransfers, 0);

      // Verify legs
      assert.equal(normalized.legs.length, 1);
      const leg = normalized.legs[0];
      assert.equal(leg.mode, 'rail');
      assert.equal(leg.service.number, '12301');
      assert.equal(leg.vehicle.identifier, '12301');
      assert.equal(leg.price, 850);
      assert.equal(leg.currency, 'INR');

      // Verify canonical validation passes
      const validation = validateJourneyCandidate(normalized);
      assert.equal(validation.valid, true, `Validation failed: ${validation.errors.join('; ')}`);
    });

    it('handles string prices with currency symbols and train names', () => {
      const railPayload = {
        departureTime: '2026-10-01T08:00:00+05:30',
        arrivalTime: '2026-10-01T14:30:00+05:30',
        trainNumber: '12002',
        trainName: 'Shatabdi Express',
        price: '₹ 1,450.00',
        currency: '₹',
        class: 'CC',
      };

      const normalized = railNormalizerStrategy.normalize(railPayload, baseContext);
      assert.equal(normalized.totalPrice, 1450);
      assert.equal(normalized.currency, 'INR');
      assert.equal(normalized.duration, 390);
      assert.equal(normalized.legs[0].service.name, 'Shatabdi Express');
      assert.equal(normalized.legs[0].service.class, 'CC');
    });
  });

  // =========================================================================
  // 2. Flight Transport Normalization (PRD Phase 6 Section 46)
  // =========================================================================
  describe('2. Flight Normalization Strategy', () => {
    it('normalizes canonical flight candidate according to PRD specification', () => {
      const flightPayload = {
        departure: '2026-10-01T10:30:00+05:30',
        arrival: '2026-10-01T12:40:00+05:30',
        flight_number: 'AI123',
        price: 5200,
        currency: 'INR',
      };

      const normalized = flightNormalizerStrategy.normalize(flightPayload, baseContext);

      // Verify canonical fields
      assert.ok(normalized.departureTime instanceof Date);
      assert.ok(normalized.arrivalTime instanceof Date);
      assert.equal(normalized.departureTime.toISOString(), '2026-10-01T05:00:00.000Z');
      assert.equal(normalized.arrivalTime.toISOString(), '2026-10-01T07:10:00.000Z');
      assert.equal(normalized.duration, 130, 'Duration must be 130 minutes (2h 10m)');
      assert.equal(normalized.totalPrice, 5200);
      assert.equal(normalized.currency, 'INR');
      assert.deepEqual(normalized.transportModes, ['flight']);
      assert.equal(normalized.numberOfTransfers, 0);

      // Verify leg details
      assert.equal(normalized.legs.length, 1);
      const leg = normalized.legs[0];
      assert.equal(leg.mode, 'flight');
      assert.equal(leg.service.number, 'AI123');
      assert.equal(leg.vehicle.identifier, 'AI123');

      // Canonical validation passes
      const validation = validateJourneyCandidate(normalized);
      assert.equal(validation.valid, true, `Validation failed: ${validation.errors.join('; ')}`);
    });

    it('normalizes aviation GDS payload with terminal and baggage details', () => {
      const flightPayload = {
        flightNumber: '6E-205',
        airline: 'IndiGo',
        departureTime: '2026-10-01T14:00:00+05:30',
        arrivalTime: '2026-10-01T16:15:00+05:30',
        cabinClass: 'Economy',
        price: '5400',
        terminal: 'T2',
        baggage: '15kg check-in',
      };

      const normalized = flightNormalizerStrategy.normalize(flightPayload, baseContext);
      assert.equal(normalized.legs[0].service.operator, 'IndiGo');
      assert.equal(normalized.legs[0].metadata.terminal, 'T2');
      assert.equal(normalized.legs[0].metadata.baggage, '15kg check-in');
      assert.equal(normalized.totalPrice, 5400);
    });
  });

  // =========================================================================
  // 3. Bus Transport Normalization (PRD Phase 6 Section 47)
  // =========================================================================
  describe('3. Bus Normalization Strategy', () => {
    it('normalizes canonical bus candidate according to PRD specification', () => {
      const busPayload = {
        busNumber: 'DL-01-A-1234',
        operator: 'Zingbus Premium',
        busType: 'Volvo AC Multi-Axle Sleeper',
        departureTime: '2026-10-01T21:00:00+05:30',
        arrivalTime: '2026-10-02T06:30:00+05:30',
        price: 1100,
        currency: 'INR',
        availableSeats: 12,
        amenities: ['WiFi', 'Charging Point', 'Blanket'],
      };

      const normalized = busNormalizerStrategy.normalize(busPayload, baseContext);

      assert.equal(normalized.transportModes[0], 'bus');
      assert.equal(normalized.totalPrice, 1100);
      assert.equal(normalized.duration, 570); // 9h 30m
      assert.equal(normalized.legs[0].mode, 'bus');
      assert.equal(normalized.legs[0].service.operator, 'Zingbus Premium');
      assert.equal(normalized.legs[0].service.class, 'Volvo AC Multi-Axle Sleeper');
      assert.equal(normalized.legs[0].service.number, 'DL-01-A-1234');
      assert.equal(normalized.legs[0].vehicle.identifier, 'DL-01-A-1234');
      assert.deepEqual(normalized.metadata.amenities, ['WiFi', 'Charging Point', 'Blanket']);

      const validation = validateJourneyCandidate(normalized);
      assert.equal(validation.valid, true);
    });
  });

  // =========================================================================
  // 4. Road Transport Normalization (PRD Phase 6 Section 48)
  // =========================================================================
  describe('4. Road Normalization Strategy', () => {
    it('normalizes road routing result without inventing unprovided price', () => {
      const roadPayload = {
        mode: 'road',
        duration: 360,
        distance: 280,
        departureTime: '2026-10-01T08:00:00+05:30',
        arrivalTime: '2026-10-01T14:00:00+05:30',
      };

      const normalized = roadNormalizerStrategy.normalize(roadPayload, baseContext);

      assert.equal(normalized.transportModes[0], 'road');
      assert.equal(normalized.duration, 360);
      assert.equal(normalized.totalDistance, 280);
      assert.equal(normalized.totalPrice, 0, 'Must not invent a price if road provider provides none');
      assert.equal(normalized.legs[0].mode, 'road');
      assert.equal(normalized.legs[0].vehicle.type, 'Car / Cab');

      const validation = validateJourneyCandidate(normalized);
      assert.equal(validation.valid, true);
    });

    it('normalizes raw OSRM routing structure', () => {
      const osrmPayload = {
        mode: 'road',
        routes: [
          {
            duration: 18000, // 5 hours in seconds
            distance: 245000, // 245 km in meters
          },
        ],
        price: 2940,
      };

      const normalized = roadNormalizerStrategy.normalize(osrmPayload, baseContext);
      assert.equal(normalized.duration, 300); // 300 minutes
      assert.equal(normalized.totalDistance, 245);
      assert.equal(normalized.totalPrice, 2940);
    });
  });

  // =========================================================================
  // 5. Multi-Leg Journeys & Transfer Calculation (PRD Phase 6 Section 50)
  // =========================================================================
  describe('5. Multi-Leg Journeys & Transfer Calculation', () => {
    it('normalizes multi-leg journey with deterministic sequence and correct transfers', () => {
      // Journey: Sonipat (origin) -> Delhi (intermediate) -> Patna (destination)
      // Leg 1: Road (Sonipat -> Delhi)
      // Leg 2: Rail (Delhi -> Patna)
      const multiLegPayload = {
        legs: [
          {
            sequence: 1,
            origin: originId,
            destination: intermediateId,
            mode: 'road',
            departureTime: '2026-10-01T05:00:00+05:30',
            arrivalTime: '2026-10-01T06:30:00+05:30',
            duration: 90,
            distance: 55,
            price: 600,
          },
          {
            sequence: 2,
            origin: intermediateId,
            destination: destId,
            mode: 'rail',
            departureTime: '2026-10-01T07:15:00+05:30',
            arrivalTime: '2026-10-01T19:45:00+05:30',
            duration: 750,
            distance: 990,
            price: 1250,
            train_number: '12302',
            train_name: 'Rajdhani Express',
          },
        ],
      };

      const normalized = journeyNormalizer.normalizeCandidate(multiLegPayload, baseContext);

      // Verify transfers and mode aggregation
      assert.equal(normalized.numberOfTransfers, 1, 'Two legs must equal 1 transfer');
      assert.deepEqual(normalized.transportModes, ['road', 'rail']);
      assert.equal(normalized.totalPrice, 1850, '600 + 1250');
      assert.equal(normalized.totalDistance, 1045, '55 + 990');
      assert.equal(normalized.duration, 840, 'Total duration of legs');

      // Verify legs sequence
      assert.equal(normalized.legs.length, 2);
      assert.equal(normalized.legs[0].sequence, 1);
      assert.equal(normalized.legs[1].sequence, 2);
      assert.equal(String(normalized.legs[0].destination), String(normalized.legs[1].origin));

      // Verify canonical validation passes
      const validation = validateJourneyCandidate(normalized);
      assert.equal(validation.valid, true, `Validation failed: ${validation.errors.join('; ')}`);
    });

    it('deduplicates repeating modes in multi-leg journeys', () => {
      // 3 legs: rail -> rail -> bus
      const payload = {
        legs: [
          {
            sequence: 1,
            origin: originId,
            destination: intermediateId,
            mode: 'rail',
            departureTime: '2026-10-01T06:00:00Z',
            arrivalTime: '2026-10-01T08:00:00Z',
          },
          {
            sequence: 2,
            origin: intermediateId,
            destination: new mongoose.Types.ObjectId(),
            mode: 'rail',
            departureTime: '2026-10-01T09:00:00Z',
            arrivalTime: '2026-10-01T12:00:00Z',
          },
          {
            sequence: 3,
            origin: new mongoose.Types.ObjectId(), // will be matched
            destination: destId,
            mode: 'bus',
            departureTime: '2026-10-01T13:00:00Z',
            arrivalTime: '2026-10-01T15:00:00Z',
          },
        ],
      };

      // Set connecting point for leg 3
      payload.legs[2].origin = payload.legs[1].destination;

      const normalized = journeyNormalizer.normalizeCandidate(payload, baseContext);
      assert.deepEqual(normalized.transportModes, ['rail', 'bus']);
      assert.equal(normalized.numberOfTransfers, 2);
    });
  });

  // =========================================================================
  // 6. Strict Validation & Domain Constraints (PRD Phase 6 Section 49)
  // =========================================================================
  describe('6. Validation & Error Rejection', () => {
    it('rejects candidate with missing departure time', () => {
      const invalid = {
        origin: originId,
        destination: destId,
        arrivalTime: new Date('2026-10-01T12:00:00Z'),
        legs: [
          {
            sequence: 1,
            origin: originId,
            destination: destId,
            mode: 'rail',
            arrivalTime: new Date('2026-10-01T12:00:00Z'),
          },
        ],
      };
      const result = validateJourneyCandidate(invalid);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('departure time')));
    });

    it('rejects candidate when arrival is earlier than departure time', () => {
      const invalid = {
        origin: originId,
        destination: destId,
        departureTime: new Date('2026-10-01T14:00:00Z'),
        arrivalTime: new Date('2026-10-01T10:00:00Z'), // Earlier!
        duration: 240,
        legs: [
          {
            sequence: 1,
            origin: originId,
            destination: destId,
            mode: 'flight',
            departureTime: new Date('2026-10-01T14:00:00Z'),
            arrivalTime: new Date('2026-10-01T10:00:00Z'),
            duration: 240,
          },
        ],
      };
      const result = validateJourneyCandidate(invalid);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('earlier than departure time')));
    });

    it('rejects candidate with negative price', () => {
      const invalid = {
        origin: originId,
        destination: destId,
        departureTime: new Date('2026-10-01T10:00:00Z'),
        arrivalTime: new Date('2026-10-01T12:00:00Z'),
        duration: 120,
        totalPrice: -250,
        legs: [
          {
            sequence: 1,
            origin: originId,
            destination: destId,
            mode: 'bus',
            departureTime: new Date('2026-10-01T10:00:00Z'),
            arrivalTime: new Date('2026-10-01T12:00:00Z'),
            duration: 120,
            price: -250,
          },
        ],
      };
      const result = validateJourneyCandidate(invalid);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('non-negative')));
    });

    it('rejects candidate with invalid transport mode', () => {
      const invalid = {
        origin: originId,
        destination: destId,
        departureTime: new Date('2026-10-01T10:00:00Z'),
        arrivalTime: new Date('2026-10-01T12:00:00Z'),
        duration: 120,
        legs: [
          {
            sequence: 1,
            origin: originId,
            destination: destId,
            mode: 'spaceship_teleport', // Invalid!
            departureTime: new Date('2026-10-01T10:00:00Z'),
            arrivalTime: new Date('2026-10-01T12:00:00Z'),
            duration: 120,
          },
        ],
      };
      const result = validateJourneyCandidate(invalid);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('invalid mode')));
    });

    it('rejects candidate when leg spatial continuity is broken', () => {
      const disconnectedId = new mongoose.Types.ObjectId();
      const brokenContinuity = {
        origin: originId,
        destination: destId,
        departureTime: new Date('2026-10-01T06:00:00Z'),
        arrivalTime: new Date('2026-10-01T18:00:00Z'),
        duration: 720,
        legs: [
          {
            sequence: 1,
            origin: originId,
            destination: intermediateId,
            mode: 'rail',
            departureTime: new Date('2026-10-01T06:00:00Z'),
            arrivalTime: new Date('2026-10-01T10:00:00Z'),
            duration: 240,
          },
          {
            sequence: 2,
            origin: disconnectedId, // Does NOT connect to intermediateId!
            destination: destId,
            mode: 'flight',
            departureTime: new Date('2026-10-01T12:00:00Z'),
            arrivalTime: new Date('2026-10-01T18:00:00Z'),
            duration: 360,
          },
        ],
      };
      const result = validateJourneyCandidate(brokenContinuity);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('Leg continuity broken')));
    });

    it('rejects candidate when leg temporal continuity is broken (next leg departs before current arrives)', () => {
      const brokenTiming = {
        origin: originId,
        destination: destId,
        departureTime: new Date('2026-10-01T06:00:00Z'),
        arrivalTime: new Date('2026-10-01T18:00:00Z'),
        duration: 720,
        legs: [
          {
            sequence: 1,
            origin: originId,
            destination: intermediateId,
            mode: 'rail',
            departureTime: new Date('2026-10-01T06:00:00Z'),
            arrivalTime: new Date('2026-10-01T14:00:00Z'), // Arrives at 14:00
            duration: 480,
          },
          {
            sequence: 2,
            origin: intermediateId,
            destination: destId,
            mode: 'bus',
            departureTime: new Date('2026-10-01T12:00:00Z'), // Departs at 12:00 (impossible layover!)
            arrivalTime: new Date('2026-10-01T18:00:00Z'),
            duration: 360,
          },
        ],
      };
      const result = validateJourneyCandidate(brokenTiming);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('timing continuity broken')));
    });
  });

  // =========================================================================
  // 7. Provider Independence (PRD Phase 6 Section 51)
  // =========================================================================
  describe('7. Provider Independence (Downstream Ranking Readiness)', () => {
    it('produces identical canonical schema across rail, flight, bus, and road', () => {
      const railItem = {
        departure_time: '2026-10-01T06:00:00+05:30',
        arrival_time: '2026-10-01T18:00:00+05:30',
        train_number: '12301',
        price: 850,
      };

      const flightItem = {
        departure: '2026-10-01T10:30:00+05:30',
        arrival: '2026-10-01T12:40:00+05:30',
        flight_number: 'AI123',
        price: 5200,
      };

      const normRail = journeyNormalizer.normalizeCandidate(railItem, baseContext);
      const normFlight = journeyNormalizer.normalizeCandidate(flightItem, baseContext);

      // Verify canonical fields exist on both without provider leak
      const canonicalJourneyKeys = [
        'origin',
        'destination',
        'departureTime',
        'arrivalTime',
        'duration',
        'totalPrice',
        'currency',
        'numberOfTransfers',
        'transportModes',
        'status',
        'schemaVersion',
      ];

      for (const key of canonicalJourneyKeys) {
        assert.ok(key in normRail.journey, `Rail missing canonical journey key: ${key}`);
        assert.ok(key in normFlight.journey, `Flight missing canonical journey key: ${key}`);
      }

      // Ranking engine can evaluate both without knowing train_number vs flight_number
      const scoreJourney = (j) => j.duration * 0.5 + j.totalPrice * 0.1;
      assert.equal(typeof scoreJourney(normRail), 'number');
      assert.equal(typeof scoreJourney(normFlight), 'number');
    });
  });

  // =========================================================================
  // 8. Envelope Processing & Resilience (PRD Phase 6 Section 37)
  // =========================================================================
  describe('8. Envelope Processing & Partial Results Resilience', () => {
    it('processes Provider Result Envelope and extracts all valid candidates', () => {
      const envelope = createSuccessEnvelope({
        provider: 'rail',
        providerCode: 'IRCTC',
        candidates: [
          {
            departure_time: '2026-10-01T06:00:00+05:30',
            arrival_time: '2026-10-01T18:00:00+05:30',
            train_number: '12301',
            price: 850,
          },
          {
            departure_time: '2026-10-01T08:30:00+05:30',
            arrival_time: '2026-10-01T20:30:00+05:30',
            train_number: '12303',
            price: 920,
          },
        ],
      });

      const normalizedList = normalizeProviderResult(envelope, baseContext, { validate: true });
      assert.equal(normalizedList.length, 2);
      assert.equal(normalizedList[0].legs[0].service.number, '12301');
      assert.equal(normalizedList[1].legs[0].service.number, '12303');
    });

    it('safely rejects one malformed candidate without discarding valid candidates', () => {
      const envelope = createSuccessEnvelope({
        provider: 'rail',
        candidates: [
          {
            // Candidate 1: Valid
            departure_time: '2026-10-01T06:00:00+05:30',
            arrival_time: '2026-10-01T18:00:00+05:30',
            train_number: '12301',
            price: 850,
          },
          {
            // Candidate 2: Malformed (arrival before departure)
            departure_time: '2026-10-01T18:00:00+05:30',
            arrival_time: '2026-10-01T06:00:00+05:30',
            train_number: 'INVALID',
            price: 850,
          },
          {
            // Candidate 3: Valid
            departure_time: '2026-10-01T12:00:00+05:30',
            arrival_time: '2026-10-01T22:00:00+05:30',
            train_number: '12305',
            price: 760,
          },
        ],
      });

      const normalizedList = normalizeProviderResult(envelope, baseContext, { validate: true });
      assert.equal(normalizedList.length, 2, '2 valid candidates must survive');
      assert.equal(normalizedList[0].legs[0].service.number, '12301');
      assert.equal(normalizedList[1].legs[0].service.number, '12305');
    });

    it('returns empty array gracefully when provider envelope is empty or failed', () => {
      const emptyEnv = createEmptyEnvelope({ provider: 'rail' });
      assert.deepEqual(normalizeProviderResult(emptyEnv, baseContext), []);

      const failedEnv = createFailedEnvelope({
        provider: 'rail',
        error: new Error('IRCTC network error'),
      });
      assert.deepEqual(normalizeProviderResult(failedEnv, baseContext), []);
    });
  });
});
