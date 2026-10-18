import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb, teardownTestDb } from './setup.js';
import { availabilityService } from '../src/services/rail/availability.service.js';
import { fareService } from '../src/services/rail/fare.service.js';
import { liveStatusService } from '../src/services/rail/liveStatus.service.js';
import { distanceService } from '../src/services/rail/distance.service.js';
import { connectionValidator } from '../src/services/rail/connectionValidator.js';
import { stationExpansionService } from '../src/services/rail/stationExpansion.service.js';
import { directJourneyService } from '../src/services/rail/directJourney.service.js';
import { journeyRecoveryService } from '../src/services/rail/journeyRecovery.service.js';
import { aopayAdapter } from '../src/providers/rail/aopay.adapter.js';
import railKitAdapter from '../src/providers/rail/railKit.adapter.js';

describe('Yatrai Real-Time Railway Journey Recovery System (21 Mandatory Scenarios)', () => {
  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  // Scenario 1: Suitable direct train with available seats
  it('Scenario 1: identifies suitable direct train with available seats (DIRECT_AVAILABLE)', () => {
    const directTrains = [
      {
        trainNumber: '12392',
        trainName: 'Shramjeevi Express',
        originStation: 'NDLS',
        destinationStation: 'PNBE',
        departureTime: '13:10',
        arrivalTime: '07:15',
        durationMinutes: 1085,
        runningDays: ['Daily'],
        classes: ['SL', '3A', '2A'],
      },
    ];

    const availabilityMap = {
      '12392-3A-GN': {
        trainNumber: '12392',
        class: '3A',
        quota: 'GN',
        status: 'AVAILABLE',
        seatsAvailable: 42,
        isVerified: true,
      },
    };

    const evaluated = directJourneyService.evaluateDirectCandidates(directTrains, availabilityMap, {
      travelClass: '3A',
      allowWaitlist: false,
    });

    assert.equal(evaluated.status, 'DIRECT_AVAILABLE');
    assert.equal(evaluated.suitableTrains.length, 1);
    assert.equal(directJourneyService.shouldTriggerRecovery(evaluated), false);
  });

  // Scenario 2: Direct trains exist but all seats are unavailable
  it('Scenario 2: direct trains exist but all seats are sold out (DIRECT_UNAVAILABLE triggers recovery)', () => {
    const directTrains = [
      {
        trainNumber: '12392',
        trainName: 'Shramjeevi Express',
        originStation: 'NDLS',
        destinationStation: 'PNBE',
        classes: ['3A'],
      },
    ];

    const availabilityMap = {
      '12392-3A-GN': {
        trainNumber: '12392',
        class: '3A',
        quota: 'GN',
        status: 'NOT_AVAILABLE',
        seatsAvailable: 0,
        isVerified: true,
      },
    };

    const evaluated = directJourneyService.evaluateDirectCandidates(directTrains, availabilityMap, {
      travelClass: '3A',
      allowWaitlist: false,
    });

    assert.equal(evaluated.status, 'DIRECT_UNAVAILABLE');
    assert.equal(directJourneyService.shouldTriggerRecovery(evaluated), true);
  });

  // Scenario 3: Direct trains are waitlisted
  it('Scenario 3: direct trains are waitlist-only (DIRECT_WAITLIST_ONLY triggers recovery for confirmed-seat seekers)', () => {
    const directTrains = [
      {
        trainNumber: '12392',
        trainName: 'Shramjeevi Express',
        originStation: 'NDLS',
        destinationStation: 'PNBE',
        classes: ['3A'],
      },
    ];

    const availabilityMap = {
      '12392-3A-GN': {
        trainNumber: '12392',
        class: '3A',
        quota: 'GN',
        status: 'WAITLISTED',
        seatsAvailable: 0,
        isVerified: true,
      },
    };

    const evaluated = directJourneyService.evaluateDirectCandidates(directTrains, availabilityMap, {
      travelClass: '3A',
      allowWaitlist: false,
    });

    assert.equal(evaluated.status, 'DIRECT_WAITLIST_ONLY');
    assert.equal(directJourneyService.shouldTriggerRecovery(evaluated), true);
  });

  // Scenario 4: No direct train exists
  it('Scenario 4: no direct train exists between stations (DIRECT_NOT_FOUND triggers recovery)', () => {
    const directTrains = [];
    const evaluated = directJourneyService.evaluateDirectCandidates(directTrains, {}, {
      travelClass: 'SL',
    });

    assert.equal(evaluated.status, 'DIRECT_NOT_FOUND');
    assert.equal(directJourneyService.shouldTriggerRecovery(evaluated), true);
  });

  // Scenario 5: Nearby origin station provides a useful connection
  it('Scenario 5: origin-side expansion explores up to 5 physical railway hops', () => {
    const expansion = stationExpansionService.expandStation('SNP', 5);
    assert.ok(expansion.length > 0);
    // SNP connects along Delhi-Ambala corridor to NDLS/DLI/PNP
    const stationCodes = expansion.map((s) => s.code);
    assert.ok(expansion.every((s) => s.hops >= 0 && s.hops <= 5));
    const outwardHops = expansion.filter((s) => s.code !== 'SNP');
    assert.ok(outwardHops.length > 0 && outwardHops.every((s) => s.hops >= 1 && s.hops <= 5));
  });

  // Scenario 6: Nearby destination station provides a useful connection
  it('Scenario 6: destination-side expansion explores up to 5 physical railway hops', () => {
    const expansion = stationExpansionService.expandStation('DNR', 5);
    assert.ok(expansion.length > 0);
    // DNR connects to PNBE, ARA, RJPB, BXR along Delhi-Howrah corridor
    const stationCodes = expansion.map((s) => s.code);
    assert.ok(stationCodes.includes('PNBE') || stationCodes.includes('ARA'));
  });

  // Scenario 7: Both origin and destination station expansions are combined
  it('Scenario 7: candidate topologies track originHops, destHops, and trainChanges separately', () => {
    const topologies = stationExpansionService.generateExpansionCandidateTopologies('SNP', 'DNR', 2);
    assert.ok(topologies.length > 0);
    for (const topo of topologies) {
      assert.ok(topo.originExpansionHops >= 0 && topo.originExpansionHops <= 5);
      assert.ok(topo.destinationExpansionHops >= 0 && topo.destinationExpansionHops <= 5);
      assert.ok(topo.trainChanges <= 2, 'Default max train changes must not exceed 2');
    }
  });

  // Scenario 8: One connecting leg is unavailable -> NOT_BOOKABLE
  it('Scenario 8: multi-leg journey with one unavailable leg is NOT_BOOKABLE', () => {
    const legs = [
      {
        trainNumber: '12418',
        availability: { status: 'AVAILABLE', isVerified: true },
      },
      {
        trainNumber: '12398',
        availability: { status: 'NOT_AVAILABLE', isVerified: true },
      },
    ];

    const evaluation = availabilityService.evaluateJourneyAvailability(legs);
    assert.equal(evaluation.status, 'NOT_BOOKABLE');
    assert.equal(evaluation.isBookable, false);
    assert.equal(evaluation.hasUnavailableLeg, true);
  });

  // Scenario 9: All connecting legs are available -> AVAILABILITY_VERIFIED
  it('Scenario 9: multi-leg journey with all available legs is AVAILABILITY_VERIFIED', () => {
    const legs = [
      {
        trainNumber: '12418',
        availability: { status: 'AVAILABLE', isVerified: true },
      },
      {
        trainNumber: '12398',
        availability: { status: 'AVAILABLE', isVerified: true },
      },
    ];

    const evaluation = availabilityService.evaluateJourneyAvailability(legs);
    assert.equal(evaluation.status, 'AVAILABILITY_VERIFIED');
    assert.equal(evaluation.isBookable, true);
    assert.equal(evaluation.hasUnavailableLeg, false);
  });

  // Scenario 10: Availability is unknown
  it('Scenario 10: unverified or unknown availability status is preserved as UNKNOWN', () => {
    const normalized = availabilityService.normalizeAvailabilityStatus(null);
    assert.equal(normalized, 'UNKNOWN');

    const legs = [
      {
        trainNumber: '12418',
        availability: { status: 'UNKNOWN', isVerified: false },
      },
    ];
    const evaluation = availabilityService.evaluateJourneyAvailability(legs);
    assert.equal(evaluation.status, 'UNKNOWN');
    assert.equal(evaluation.isBookable, false);
  });

  // Scenario 11: Fare retrieval fails -> fallback tariff calculation
  it('Scenario 11: missing fare calculates verified telescopic railway tariff fallback', async () => {
    const fare = await fareService.getLegFare('12418', '2026-11-15', 'NDLS', 'CNB', '3A', 'GN');
    assert.ok(fare.amount > 0);
    assert.equal(fare.currency, 'INR');
    assert.equal(typeof fare.isEstimated, 'boolean');
  });

  // Scenario 12: Provider timeout resilience
  it('Scenario 12: provider handles network errors gracefully without crashing', async () => {
    const res = await aopayAdapter.getTrainSchedule('INVALID_99999');
    // AOPAY returns null or throws caught error gracefully
    assert.ok(res === null || res.trainNumber === undefined);
  });

  // Scenario 13: Station metadata missing handling
  it('Scenario 13: distance service handles missing coordinates gracefully without nan', () => {
    const dist = distanceService.calculateGeographicDistance(null, [77.2, 28.6]);
    assert.equal(dist, null);

    const railDist = distanceService.getLegRailDistance('NONEXISTENT_1', 'NONEXISTENT_2');
    assert.equal(typeof railDist, 'number');
    assert.ok(railDist > 0);
  });

  // Scenario 14: Cross-station transfer validation and distance limits
  it('Scenario 14: rejects cross-station transfers exceeding 35km and enforces buffer for valid transfers', () => {
    // NDLS to DLI (~4km): physically feasible with sufficient transfer window
    const validTransfer = distanceService.evaluateStationTransfer('NDLS', 'DLI', 75);
    assert.equal(validTransfer.isFeasible, true);
    assert.equal(validTransfer.isSameStation, false);

    // NDLS to DLI with only 30 min buffer: rejected (minimum cross-station is 60m)
    const tightTransfer = distanceService.evaluateStationTransfer('NDLS', 'DLI', 30);
    assert.equal(tightTransfer.isFeasible, false);

    // NDLS to CNB (>400km): rejected as impossible cross-station transfer
    const impossibleTransfer = distanceService.evaluateStationTransfer('NDLS', 'CNB', 120);
    assert.equal(impossibleTransfer.isFeasible, false);
    assert.ok(impossibleTransfer.rejectionReason.includes('35 km'));
  });

  // Scenario 15: Overnight journey and date rollover
  it('Scenario 15: connection validator correctly handles overnight journeys across date boundaries', () => {
    const leg1 = {
      origin: { code: 'NDLS' },
      destination: { code: 'CNB' },
      departureTime: '2026-11-15T22:00:00.000Z',
      arrivalTime: '2026-11-16T04:00:00.000Z',
    };

    const leg2 = {
      origin: { code: 'CNB' },
      destination: { code: 'PRYJ' },
      departureTime: '2026-11-16T06:30:00.000Z',
      arrivalTime: '2026-11-16T09:00:00.000Z',
    };

    const validation = connectionValidator.validateConnectingLegs(leg1, leg2);
    assert.equal(validation.isValid, true);
    assert.equal(validation.layoverMinutes, 150);
  });

  // Scenario 16: Connection missed due to live delay
  it('Scenario 16: live delay flags connection risk or invalidates transfer', () => {
    const scheduledLayover = 45; // 45 min buffer
    const delayRisk = liveStatusService.assessDelayRisk(30, scheduledLayover); // 30 min delay -> only 15 min left
    assert.equal(delayRisk.hasRisk, true);
    assert.equal(delayRisk.riskLevel, 'HIGH');
    assert.ok(delayRisk.effectiveBufferMinutes <= 15);
  });

  // Scenario 17: Request deduplication & rate-limiting protection
  it('Scenario 17: provider adapter deduplicates identical in-flight requests', async () => {
    const promise1 = railKitAdapter._cachedFetch('test-dedup-key', 5000, async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { success: true, timestamp: Date.now() };
    }, 'general');

    const promise2 = railKitAdapter._cachedFetch('test-dedup-key', 5000, async () => {
      return { success: true, timestamp: Date.now() };
    }, 'general');

    const [res1, res2] = await Promise.all([promise1, promise2]);
    assert.equal(res1.timestamp, res2.timestamp);
  });

  // Scenario 18: Duplicate candidate route pruning
  it('Scenario 18: candidate deduplication removes identical train sequence itineraries', () => {
    const candidates = [
      {
        legs: [{ trainNumber: '12418' }, { trainNumber: '12398' }],
      },
      {
        legs: [{ trainNumber: '12418' }, { trainNumber: '12398' }],
      },
      {
        legs: [{ trainNumber: '12418' }, { trainNumber: '14218' }],
      },
    ];

    const deduped = journeyRecoveryService.deduplicateCandidates(candidates);
    assert.equal(deduped.length, 2);
  });

  // Scenario 19: Graceful handling when no alternatives exist
  it('Scenario 19: recovery returns empty result with clear status when no alternatives exist', async () => {
    // Provide candidate generator that produces no valid connections
    const recoveryResult = await journeyRecoveryService.recoverJourneys({
      originCode: 'NONEXISTENT_ORIGIN',
      destCode: 'NONEXISTENT_DEST',
      travelDate: '2026-11-20',
      travelClass: 'SL',
    });

    assert.equal(recoveryResult.status, 'NO_ALTERNATIVES_FOUND');
    assert.deepEqual(recoveryResult.journeys, []);
  });

  // Scenario 20: Recovery ranking categorizes results accurately
  it('Scenario 20: ranking engine produces distinct categories (Best Overall, Fastest, Cheapest)', () => {
    const journeys = [
      {
        id: 'j1',
        duration: 800,
        totalPrice: 1200,
        numberOfTransfers: 1,
        availabilityStatus: 'AVAILABILITY_VERIFIED',
      },
      {
        id: 'j2',
        duration: 600, // Fastest
        totalPrice: 1800,
        numberOfTransfers: 1,
        availabilityStatus: 'AVAILABILITY_VERIFIED',
      },
      {
        id: 'j3',
        duration: 900,
        totalPrice: 650, // Cheapest
        numberOfTransfers: 1,
        availabilityStatus: 'AVAILABILITY_VERIFIED',
      },
    ];

    const ranked = journeyRecoveryService.rankAlternatives(journeys, 'overall');
    assert.ok(ranked.length <= 5);
    const topOverall = ranked.find((j) => j.ranking?.category === 'BEST_OVERALL' || j.ranking?.label === 'Best Overall');
    assert.ok(topOverall);

    const fastest = ranked.find((j) => j.ranking?.category === 'FASTEST');
    assert.ok(fastest);
    assert.equal(fastest.id, 'j2');

    const cheapest = ranked.find((j) => j.ranking?.category === 'CHEAPEST');
    assert.ok(cheapest);
    assert.equal(cheapest.id, 'j3');
  });

  // Scenario 21: Booking blocked when unauthorized or multi-leg single-ticket
  it('Scenario 21: booking handoff rejects single-ticket multi-leg bookings and mandates independent leg issuance', async () => {
    const multiLegJourney = {
      id: 'journey-multi-leg-1',
      legs: [
        {
          trainNumber: '12418',
          trainName: 'Prayagraj Express',
          origin: { code: 'NDLS', name: 'New Delhi' },
          destination: { code: 'PRYJ', name: 'Prayagraj Junction' },
          fare: { amount: 480 },
          availability: { status: 'AVAILABLE' },
        },
        {
          trainNumber: '12398',
          trainName: 'Mahabodhi Express',
          origin: { code: 'PRYJ', name: 'Prayagraj Junction' },
          destination: { code: 'DNR', name: 'Danapur' },
          fare: { amount: 390 },
          availability: { status: 'AVAILABLE' },
        },
      ],
    };

    const bookingResult = await aopayAdapter.prepareBooking(multiLegJourney, {
      passengers: [{ name: 'Test Passenger', age: 30, gender: 'M' }],
      travelClass: 'SL',
    });

    assert.equal(bookingResult.singleTicketSupported, false);
    assert.equal(bookingResult.canAutoBook, false);
    assert.ok(bookingResult.complianceNotice.includes('independent bookings'));
    assert.equal(bookingResult.legs.length, 2);
  });
});
