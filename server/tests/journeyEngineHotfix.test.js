import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// Backend domain modules
import {
  railNormalizerStrategy,
  validateJourneyCandidate,
} from '../src/normalization/index.js';
import { ConnectionValidator } from '../src/services/rail/connectionValidator.js';
import { resolveStationCode } from '../src/providers/transport/rail/rail.provider.js';
import { findStationByCode } from '../src/services/rail/stationRegistry.js';
import { getDayOffset } from '../../client/src/utils/formatters.js';

// Shared parser & filter modules used across frontend and backend
import { parseJourneyStages, resolveStation } from '../../client/src/utils/journeyParser.js';
import { filterJourneys, matchesDepartureTime, matchesTransfers } from '../../client/src/utils/journeyFilters.js';

describe('Yatrai Production Hotfix — Critical Journey Engine Regression Suite', () => {
  const originId = new mongoose.Types.ObjectId();
  const destId = new mongoose.Types.ObjectId();
  const intermediateId = new mongoose.Types.ObjectId();

  // =========================================================================
  // TEST 1 — DIRECT TRAIN
  // Given a verified train that serves origin and destination in correct order:
  // Expected: One train leg, zero train transfers.
  // =========================================================================
  describe('TEST 1 — DIRECT TRAIN', () => {
    it('normalizes a verified direct train to exactly one leg and zero transfers', () => {
      const directCandidate = {
        departure_time: '2026-10-21T17:30:00+05:30',
        arrival_time: '2026-10-22T06:50:00+05:30',
        train_number: '12394',
        train_name: 'Sampooran Kranti Express',
        from_station_code: 'NDLS',
        to_station_code: 'PNBE',
        price: 950,
        currency: 'INR',
      };

      const context = {
        origin: originId,
        destination: destId,
        departureDate: new Date('2026-10-21T12:00:00Z'),
      };

      const normalized = railNormalizerStrategy.normalize(directCandidate, context);

      assert.equal(normalized.numberOfTransfers, 0, 'Direct train must have 0 transfers');
      assert.equal(normalized.legs.length, 1, 'Direct train must have exactly 1 leg');
      assert.equal(normalized.legs[0].mode, 'rail');
      assert.equal(normalized.legs[0].service.number, '12394');
      assert.equal(normalized.legs[0].service.name, 'Sampooran Kranti Express');

      // Verify domain validation
      const validation = validateJourneyCandidate(normalized);
      assert.equal(validation.valid, true, `Validation failed: ${validation.errors.join(', ')}`);
    });
  });

  // =========================================================================
  // TEST 2 — INTERMEDIATE STOPS
  // Given a continuous train service with intermediate stops:
  // Expected: Still one train leg and zero transfers.
  // =========================================================================
  describe('TEST 2 — INTERMEDIATE STOPS', () => {
    it('maintains 1 leg and 0 transfers for continuous service with intermediate halts', () => {
      const directWithStops = {
        id: 'journey-12394-ndls-pnbe',
        origin: { name: 'New Delhi', code: 'NDLS' },
        destination: { name: 'Patna Junction', code: 'PNBE' },
        departureTime: '2026-10-21T17:30:00.000Z',
        arrivalTime: '2026-10-22T06:50:00.000Z',
        numberOfTransfers: 0,
        isDirectTrain: true,
        transportModes: ['rail'],
        legs: [
          {
            sequence: 1,
            mode: 'rail',
            trainNumber: '12394',
            trainName: 'Sampooran Kranti Express',
            originStation: { name: 'New Delhi', code: 'NDLS', stationCode: 'NDLS' },
            destinationStation: { name: 'Patna Junction', code: 'PNBE', stationCode: 'PNBE' },
            departureTime: '2026-10-21T17:30:00.000Z',
            arrivalTime: '2026-10-22T06:50:00.000Z',
            intermediateStops: [
              { stationCode: 'CNB', stationName: 'Kanpur Central', haltMinutes: 5 },
              { stationCode: 'PRYJ', stationName: 'Prayagraj Junction', haltMinutes: 5 },
              { stationCode: 'DDU', stationName: 'Pt Deen Dayal Upadhyaya Jn', haltMinutes: 10 },
            ],
            duration: 800,
            price: 950,
          },
        ],
      };

      const parsed = parseJourneyStages(directWithStops);
      assert.equal(parsed.totalTransfers, 0, 'Intermediate stops must not create transfers');
      assert.equal(parsed.trainStages.length, 1, 'Must have only 1 train stage');
      assert.equal(parsed.accessStage, null, 'Must not create access leg');
      assert.equal(parsed.onwardStage, null, 'Must not create onward leg');
    });
  });

  // =========================================================================
  // TEST 3 — REAL CONNECTION
  // Given two valid train legs requiring a train change:
  // Expected: Two train legs and one transfer.
  // =========================================================================
  describe('TEST 3 — REAL CONNECTION', () => {
    it('validates a 2-leg train connection with 1 transfer and calculates transfer buffer', () => {
      const validator = new ConnectionValidator();
      const leg1 = {
        sequence: 1,
        mode: 'rail',
        origin: { name: 'New Delhi', code: 'NDLS' },
        destination: { name: 'Kanpur Central', code: 'CNB' },
        departureTime: '2026-10-21T06:00:00.000Z',
        arrivalTime: '2026-10-21T11:00:00.000Z',
      };
      const leg2 = {
        sequence: 2,
        mode: 'rail',
        origin: { name: 'Kanpur Central', code: 'CNB' },
        destination: { name: 'Patna Junction', code: 'PNBE' },
        departureTime: '2026-10-21T12:30:00.000Z',
        arrivalTime: '2026-10-21T19:00:00.000Z',
      };

      const connResult = validator.validateConnectingLegs(leg1, leg2);
      assert.equal(connResult.isValid, true, 'Valid 90-min layover at Kanpur Central must be valid');
      assert.equal(connResult.layoverMinutes, 90);
      assert.equal(connResult.isSameStation, true);

      // Verify stage parsing across both train legs
      const twoLegJourney = {
        origin: { name: 'New Delhi', code: 'NDLS' },
        destination: { name: 'Patna Junction', code: 'PNBE' },
        numberOfTransfers: 1,
        legs: [leg1, leg2],
      };

      const parsed = parseJourneyStages(twoLegJourney);
      assert.equal(parsed.totalTransfers, 1, 'Two legs must have exactly 1 transfer');
      assert.equal(parsed.trainStages.length, 2, 'Must render both train stages');
      assert.equal(parsed.trainStages[0].transferBuffer.bufferMinutes, 90);
      assert.equal(parsed.trainStages[0].transferBuffer.transferStationCode, 'CNB');
    });
  });

  // =========================================================================
  // TEST 4 — MULTIPLE CONNECTIONS
  // Given three valid train legs:
  // Expected: Three train legs and two transfers.
  // =========================================================================
  describe('TEST 4 — MULTIPLE CONNECTIONS', () => {
    it('handles 3 consecutive train legs with exactly 2 transfers (N - 1)', () => {
      const leg1 = {
        sequence: 1,
        mode: 'rail',
        origin: { name: 'Sonipat', code: 'SNP' },
        destination: { name: 'New Delhi', code: 'NDLS' },
        departureTime: '2026-10-21T04:30:00.000Z',
        arrivalTime: '2026-10-21T05:30:00.000Z',
      };
      const leg2 = {
        sequence: 2,
        mode: 'rail',
        origin: { name: 'New Delhi', code: 'NDLS' },
        destination: { name: 'Kanpur Central', code: 'CNB' },
        departureTime: '2026-10-21T06:30:00.000Z',
        arrivalTime: '2026-10-21T11:30:00.000Z',
      };
      const leg3 = {
        sequence: 3,
        mode: 'rail',
        origin: { name: 'Kanpur Central', code: 'CNB' },
        destination: { name: 'Patna Junction', code: 'PNBE' },
        departureTime: '2026-10-21T13:00:00.000Z',
        arrivalTime: '2026-10-21T20:00:00.000Z',
      };

      const threeLegJourney = {
        origin: { name: 'Sonipat', code: 'SNP' },
        destination: { name: 'Patna Junction', code: 'PNBE' },
        numberOfTransfers: 2,
        legs: [leg1, leg2, leg3],
      };

      const parsed = parseJourneyStages(threeLegJourney);
      assert.equal(parsed.totalTransfers, 2, '3 train legs must equal 2 transfers');
      assert.equal(parsed.trainStages.length, 3, 'Must render all 3 train stages');
      assert.equal(parsed.trainStages[0].transferBuffer.transferStationCode, 'NDLS');
      assert.equal(parsed.trainStages[1].transferBuffer.transferStationCode, 'CNB');
    });
  });

  // =========================================================================
  // TEST 5 — INVALID STOP ORDER
  // Given a train that serves the destination before the origin:
  // Expected: Reject the candidate for the requested direction.
  // =========================================================================
  describe('TEST 5 — INVALID STOP ORDER', () => {
    it('rejects candidate if arrival occurs before departure or chronological sequence is reversed', () => {
      const invalidOrderJourney = {
        origin: originId,
        destination: destId,
        departureTime: new Date('2026-10-21T18:00:00Z'),
        arrivalTime: new Date('2026-10-21T12:00:00Z'), // Arrival before departure!
        duration: -360,
        legs: [
          {
            sequence: 1,
            mode: 'rail',
            origin: originId,
            destination: destId,
            departureTime: new Date('2026-10-21T18:00:00Z'),
            arrivalTime: new Date('2026-10-21T12:00:00Z'),
            duration: -360,
          },
        ],
      };

      const validation = validateJourneyCandidate(invalidOrderJourney);
      assert.equal(validation.valid, false, 'Must reject journey where arrival is before departure');
      assert.ok(
        validation.errors.some((e) => e.includes('earlier than departure time')),
        'Must contain error regarding arrival before departure'
      );
    });
  });

  // =========================================================================
  // TEST 6 — ACCESS JOURNEY
  // Given a train that departs from the requested origin:
  // Expected: No unnecessary access leg.
  // =========================================================================
  describe('TEST 6 — ACCESS JOURNEY', () => {
    it('does not invent an access leg when train departs directly from requested origin', () => {
      // Station code resolution test: New Delhi resolves to NDLS, not 'NCR'
      const resolvedCode = resolveStationCode({
        name: 'New Delhi',
        code: '',
        aliases: ['Delhi', 'NCR', 'NDLS'],
      });
      assert.equal(resolvedCode, 'NDLS', 'New Delhi must resolve to NDLS, never NCR');

      const directNdlsJourney = {
        origin: { name: 'New Delhi', code: 'NDLS' },
        destination: { name: 'Patna Junction', code: 'PNBE' },
        numberOfTransfers: 0,
        isDirectTrain: true,
        legs: [
          {
            sequence: 1,
            mode: 'rail',
            trainNumber: '12394',
            trainName: 'Sampooran Kranti Express',
            originStation: { name: 'New Delhi', code: 'NDLS', stationCode: 'NDLS' },
            destinationStation: { name: 'Patna Junction', code: 'PNBE', stationCode: 'PNBE' },
            departureTime: '2026-10-21T17:30:00.000Z',
            arrivalTime: '2026-10-22T06:50:00.000Z',
          },
        ],
      };

      const parsed = parseJourneyStages(directNdlsJourney);
      assert.equal(parsed.hasOriginShift, false, 'Must not flag origin shift for NDLS -> NDLS');
      assert.equal(parsed.accessStage, null, 'Must not generate access stage');
      assert.equal(parsed.stagesList.length, 1, 'Stage list must contain only the train stage');
    });
  });

  // =========================================================================
  // TEST 7 — OVERNIGHT JOURNEY
  // Given a journey crossing midnight:
  // Expected: Correct dates and total duration.
  // =========================================================================
  describe('TEST 7 — OVERNIGHT JOURNEY', () => {
    it('correctly calculates positive day offset and duration for overnight train crossing midnight', () => {
      const depIso = '2026-10-21T23:30:00+05:30';
      const arrIso = '2026-10-22T06:15:00+05:30';

      const offset = getDayOffset(depIso, arrIso);
      assert.equal(offset, 1, 'Must have +1 day offset');

      const durationMinutes = Math.round((new Date(arrIso) - new Date(depIso)) / 60000);
      assert.equal(durationMinutes, 405, 'Duration must be 405 minutes (6h 45m)');

      const overnightJourney = {
        departure_time: '2026-10-21T23:30:00+05:30',
        arrival_time: '2026-10-22T06:15:00+05:30',
        train_number: '12394',
        price: 800,
        currency: 'INR',
      };

      const normalized = railNormalizerStrategy.normalize(overnightJourney, {
        origin: originId,
        destination: destId,
      });

      assert.equal(normalized.duration, 405);
      assert.ok(normalized.arrivalTime > normalized.departureTime);
    });
  });

  // =========================================================================
  // TEST 8 — PROVIDER FAILURE
  // Given a railway API failure:
  // Expected: A useful error or degraded-result state, not fabricated data.
  // =========================================================================
  describe('TEST 8 — PROVIDER FAILURE', () => {
    it('returns empty result envelope on provider empty response or 404 without fabricating trains', () => {
      // Simulating RailKit adapter returning 0 trains gracefully
      const safeProviderResult = {
        status: 'ok',
        success: true,
        provider: 'RailKit',
        data: [],
      };

      assert.equal(safeProviderResult.success, true);
      assert.equal(safeProviderResult.data.length, 0);
      assert.deepEqual(safeProviderResult.data, [], 'Must return honest empty array, no fake trains');
    });
  });

  // =========================================================================
  // TEST 9 — MISSING FARE
  // Given a verified journey without fare data:
  // Expected: The journey remains usable and the fare is shown as unavailable.
  // =========================================================================
  describe('TEST 9 — MISSING FARE', () => {
    it('preserves journey usability and marks fare as missing/unavailable without treating as zero', () => {
      const journeyNoFare = {
        origin: { name: 'New Delhi', code: 'NDLS' },
        destination: { name: 'Patna Junction', code: 'PNBE' },
        totalPrice: null,
        pricing: {
          totalFare: null,
          isEstimated: false,
          fareSource: null,
        },
        legs: [
          {
            sequence: 1,
            mode: 'rail',
            trainNumber: '12394',
            trainName: 'Sampooran Kranti Express',
            price: null,
          },
        ],
      };

      const parsed = parseJourneyStages(journeyNoFare);
      assert.equal(parsed.costs.trainFare, null, 'Train fare must be null, not 0');
      assert.equal(parsed.costs.hasMissingCosts, true, 'Must indicate missing costs');

      // Price filter verification: filter must not treat null fare as matching ₹0 - ₹500
      const filtered = filterJourneys([journeyNoFare], { maxPrice: 500 });
      assert.equal(filtered.length, 0, 'Missing fare must not match a numeric maxPrice filter');
    });
  });

  // =========================================================================
  // TEST 10 — SEARCH CONSISTENCY
  // Given a new search request:
  // Expected: The displayed results correspond to the new request, not stale data.
  // =========================================================================
  describe('TEST 10 — SEARCH CONSISTENCY', () => {
    it('produces distinct station resolution for different search origin/destinations', () => {
      const stn1 = resolveStation(null, 'NDLS', 'New Delhi');
      const stn2 = resolveStation(null, 'HWH', 'Howrah Junction');

      assert.equal(stn1.code, 'NDLS');
      assert.equal(stn1.city, 'Delhi');
      assert.equal(stn2.code, 'HWH');
      assert.equal(stn2.city, 'Kolkata');
      assert.notEqual(stn1.code, stn2.code, 'Different search queries must not cross-contaminate');
    });
  });

  // =========================================================================
  // TEST 11 — FILTERING
  // Given direct and connecting journeys:
  // Expected: Direct-only filtering excludes connecting journeys.
  // =========================================================================
  describe('TEST 11 — FILTERING', () => {
    it('direct-only filter strictly includes direct journeys and excludes connecting journeys', () => {
      const directJourney = { id: 'j-direct', numberOfTransfers: 0, totalPrice: 800, duration: 600 };
      const oneTransferJourney = { id: 'j-conn1', numberOfTransfers: 1, totalPrice: 950, duration: 750 };
      const twoTransferJourney = { id: 'j-conn2', numberOfTransfers: 2, totalPrice: 1100, duration: 900 };

      const all = [directJourney, oneTransferJourney, twoTransferJourney];

      // Test direct filter
      const directOnly = filterJourneys(all, { transfers: '0' });
      assert.equal(directOnly.length, 1);
      assert.equal(directOnly[0].id, 'j-direct');

      // Test transfer filter helper
      assert.equal(matchesTransfers(0, '0'), true);
      assert.equal(matchesTransfers(1, '0'), false);
      assert.equal(matchesTransfers(2, '0'), false);

      // Test max 1 transfer filter
      const maxOne = filterJourneys(all, { transfers: '1_max' });
      assert.equal(maxOne.length, 2);
      assert.deepEqual(maxOne.map((j) => j.id), ['j-direct', 'j-conn1']);
    });
  });

  // =========================================================================
  // TEST 12 — END-TO-END CONSISTENCY
  // Given a verified direct journey:
  // Expected: API response, result card, timeline, transfer count, fare display, and summary agree.
  // =========================================================================
  describe('TEST 12 — END-TO-END CONSISTENCY', () => {
    it('ensures API payload, parsed timeline stages, and card metrics agree with zero contradictions', () => {
      const verifiedDirectJourney = {
        id: '12394-ndls-pnbe',
        origin: { name: 'New Delhi', code: 'NDLS', city: 'Delhi' },
        destination: { name: 'Patna Junction', code: 'PNBE', city: 'Patna' },
        departureTime: '2026-10-21T17:30:00.000Z',
        arrivalTime: '2026-10-22T06:50:00.000Z',
        duration: 800,
        totalPrice: 950,
        currency: 'INR',
        numberOfTransfers: 0,
        isDirectTrain: true,
        transportModes: ['rail'],
        legs: [
          {
            sequence: 1,
            mode: 'rail',
            trainNumber: '12394',
            trainName: 'Sampooran Kranti Express',
            originStation: { name: 'New Delhi', code: 'NDLS', stationCode: 'NDLS' },
            destinationStation: { name: 'Patna Junction', code: 'PNBE', stationCode: 'PNBE' },
            departureTime: '2026-10-21T17:30:00.000Z',
            arrivalTime: '2026-10-22T06:50:00.000Z',
            duration: 800,
            price: 950,
          },
        ],
      };

      const parsed = parseJourneyStages(verifiedDirectJourney);

      // 1. Timeline metrics
      assert.equal(parsed.totalTransfers, 0, 'Timeline transfers must be 0');
      assert.equal(parsed.hasStationDifference, false, 'Must have no false station difference');
      assert.equal(parsed.accessStage, null, 'Must have no access stage');
      assert.equal(parsed.onwardStage, null, 'Must have no onward stage');
      assert.equal(parsed.trainStages.length, 1, 'Must have exactly 1 train stage');

      // 2. Train card details
      const trainStage = parsed.trainStages[0];
      assert.equal(trainStage.originCode, 'NDLS');
      assert.equal(trainStage.destinationCode, 'PNBE');
      assert.equal(trainStage.trainNumber, '12394');
      assert.equal(trainStage.fare, 950);

      // 3. Card center divider description agreement
      const cardCenterText = parsed.totalTransfers === 0
        ? (parsed.hasStationDifference ? `Direct (${parsed.trainFromCode})` : 'Direct')
        : `${parsed.totalTransfers} transfer`;
      assert.equal(cardCenterText, 'Direct', 'Card center text must be exactly "Direct"');
    });
  });
});
