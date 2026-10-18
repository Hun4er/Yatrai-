import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb, teardownTestDb } from './setup.js';
import { stationExpansionService } from '../src/services/rail/stationExpansion.service.js';
import { connectionValidator } from '../src/services/rail/connectionValidator.js';
import { availabilityService, AVAILABILITY_STATUS, JOURNEY_AVAILABILITY } from '../src/services/rail/availability.service.js';
import { fareService } from '../src/services/rail/fare.service.js';
import { directJourneyService, DIRECT_SEARCH_STATUS } from '../src/services/rail/directJourney.service.js';
import { journeyRecoveryService } from '../src/services/rail/journeyRecovery.service.js';
import { RequestBudgetTracker } from '../src/services/rail/requestBudget.js';
import { RailKitAdapter } from '../src/providers/rail/railKit.adapter.js';

describe('Bounded Train Journey Recovery Algorithm — 17 Mandatory Verification Scenarios', () => {
  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  // 1. Direct journey available: recovery is not unnecessarily invoked
  it('Requirement 1: Direct journey available does not trigger recovery', () => {
    const directTrains = [
      {
        trainNumber: '12310',
        trainName: 'Patna Rajdhani Express',
        from: { code: 'NDLS' },
        to: { code: 'PNBE' },
        departureTime: '17:10',
        arrivalTime: '05:15',
        duration: 725,
      },
    ];

    const availabilityMap = {
      '12310-3A-GN': {
        trainNumber: '12310',
        status: AVAILABILITY_STATUS.AVAILABLE,
        seatsAvailable: 28,
      },
    };

    const evaluation = directJourneyService.evaluateDirectCandidates(directTrains, availabilityMap, {
      travelClass: '3A',
      allowWaitlist: false,
    });

    assert.equal(evaluation.status, DIRECT_SEARCH_STATUS.DIRECT_AVAILABLE);
    assert.equal(directJourneyService.shouldTriggerRecovery(evaluation), false);
  });

  // 2. Direct journey unavailable: recovery is invoked
  it('Requirement 2: Direct journey unavailable activates recovery algorithm', () => {
    const directTrains = [
      {
        trainNumber: '12310',
        trainName: 'Patna Rajdhani Express',
        from: { code: 'NDLS' },
        to: { code: 'PNBE' },
      },
    ];

    const availabilityMap = {
      '12310-3A-GN': {
        trainNumber: '12310',
        status: AVAILABILITY_STATUS.NOT_AVAILABLE,
        seatsAvailable: 0,
      },
    };

    const evaluation = directJourneyService.evaluateDirectCandidates(directTrains, availabilityMap, {
      travelClass: '3A',
      allowWaitlist: false,
    });

    assert.equal(evaluation.status, DIRECT_SEARCH_STATUS.DIRECT_UNAVAILABLE);
    assert.equal(directJourneyService.shouldTriggerRecovery(evaluation), true);
  });

  // 3. No relevant neighboring stations: returns a valid empty result
  it('Requirement 3: No relevant neighboring stations returns a clean empty result', async () => {
    const result = await journeyRecoveryService.recoverJourneys({
      origin: 'NONEXISTENT_ORIGIN',
      destination: 'NONEXISTENT_DEST',
      departureDate: '2026-11-20',
    });

    assert.equal(result.status, 'NO_ALTERNATIVES_FOUND');
    assert.deepEqual(result.journeys, []);
    assert.equal(result.totalCandidatesGenerated, 0);
  });

  // 4. A valid two-train combination is discovered
  it('Requirement 4: Discovers a valid two-train combination with one interchange', async () => {
    // Varanasi (BSB) -> Prayagraj (PRYJ) -> Banaras or similar verified corridor
    const mockRailRadar = {
      searchDirectTrains: async (from, to) => {
        if (from === 'BSB' && to === 'PRYJ') {
          return {
            success: true,
            trains: [
              {
                trainNumber: '22436',
                trainName: 'Vande Bharat Express',
                departureTime: '15:00',
                arrivalTime: '16:30',
                duration: 90,
                distance: 125,
                from: { code: 'BSB', name: 'Varanasi Junction' },
                to: { code: 'PRYJ', name: 'Prayagraj Junction' },
              },
            ],
          };
        }
        if (from === 'PRYJ' && to === 'CNB') {
          return {
            success: true,
            trains: [
              {
                trainNumber: '12417',
                trainName: 'Prayagraj Express',
                departureTime: '18:00',
                arrivalTime: '20:10',
                duration: 130,
                distance: 195,
                from: { code: 'PRYJ', name: 'Prayagraj Junction' },
                to: { code: 'CNB', name: 'Kanpur Central' },
              },
            ],
          };
        }
        return { success: true, trains: [] };
      },
      getAvailability: async () => ({
        success: true,
        normalizedStatus: 'AVAILABLE',
        seatsAvailable: 42,
        isLive: true,
      }),
    };

    const testAvailService = new (availabilityService.constructor)({
      railKit: mockRailRadar,
    });

    const recovery = new (journeyRecoveryService.constructor)({
      railKit: mockRailRadar,
      stationExpansion: stationExpansionService,
      connectionValidator,
      availabilityService: testAvailService,
      fareService,
      distanceService: journeyRecoveryService.distanceService,
      rankingEngine: journeyRecoveryService.rankingEngine,
    });

    const result = await recovery.recoverJourneys({
      origin: 'BSB',
      destination: 'CNB',
      departureDate: '2026-11-15',
    });

    assert.equal(result.status, 'RECOVERED_ALTERNATIVES_FOUND');
    assert.ok(result.journeys.length > 0);
    const twoLeg = result.journeys.find((j) => j.legs.length === 2);
    assert.ok(twoLeg);
    assert.equal(twoLeg.numberOfTransfers, 1);
    assert.equal(twoLeg.legs[0].destination, 'PRYJ');
    assert.equal(twoLeg.legs[1].origin, 'PRYJ');
  });

  // 5. A valid three-train combination is discovered when allowed
  it('Requirement 5: Discovers a valid three-train combination with two interchanges when maxTransfers >= 2', async () => {
    // 3 legs: BSB -> PRYJ -> CNB -> NDLS
    const mockRailRadar = {
      searchDirectTrains: async (from, to) => {
        if (from === 'BSB' && to === 'PRYJ') {
          return {
            success: true,
            trains: [
              {
                trainNumber: '22436',
                trainName: 'Vande Bharat Express',
                departureTime: '08:00',
                arrivalTime: '09:30',
                duration: 90,
                distance: 125,
                from: { code: 'BSB', name: 'Varanasi' },
                to: { code: 'PRYJ', name: 'Prayagraj' },
              },
            ],
          };
        }
        if (from === 'PRYJ' && to === 'CNB') {
          return {
            success: true,
            trains: [
              {
                trainNumber: '12417',
                trainName: 'Prayagraj Express',
                departureTime: '11:00',
                arrivalTime: '13:00',
                duration: 120,
                distance: 195,
                from: { code: 'PRYJ', name: 'Prayagraj' },
                to: { code: 'CNB', name: 'Kanpur' },
              },
            ],
          };
        }
        if (from === 'CNB' && to === 'NDLS') {
          return {
            success: true,
            trains: [
              {
                trainNumber: '12003',
                trainName: 'Lucknow Shatabdi',
                departureTime: '16:00',
                arrivalTime: '21:30',
                duration: 330,
                distance: 440,
                from: { code: 'CNB', name: 'Kanpur' },
                to: { code: 'NDLS', name: 'New Delhi' },
              },
            ],
          };
        }
        return { success: true, trains: [] };
      },
      getAvailability: async () => ({
        success: true,
        normalizedStatus: 'AVAILABLE',
        seatsAvailable: 42,
        isLive: true,
      }),
    };

    const testAvailService = new (availabilityService.constructor)({
      railKit: mockRailRadar,
    });

    const recovery = new (journeyRecoveryService.constructor)({
      railKit: mockRailRadar,
      stationExpansion: stationExpansionService,
      connectionValidator,
      availabilityService: testAvailService,
      fareService,
      distanceService: journeyRecoveryService.distanceService,
      rankingEngine: journeyRecoveryService.rankingEngine,
    });

    const result = await recovery.recoverJourneys(
      {
        origin: 'BSB',
        destination: 'NDLS',
        departureDate: '2026-11-15',
      },
      { maxTransfers: 2 }
    );

    assert.equal(result.status, 'RECOVERED_ALTERNATIVES_FOUND');
    const threeLeg = result.journeys.find((j) => j.legs.length === 3);
    assert.ok(threeLeg, 'Should discover a 3-leg journey when maxTransfers is 2');
    assert.equal(threeLeg.numberOfTransfers, 2);
    assert.equal(threeLeg.interchanges.length, 2);
  });

  // 6. A disconnected station combination is rejected
  it('Requirement 6: Disconnected station combination without verified connectivity is rejected', async () => {
    const isConn = stationExpansionService.hasRailwayConnectivity('DISCONNECTED_FAKE_STN');
    assert.equal(isConn, false);

    const result = await journeyRecoveryService.recoverJourneys({
      origin: 'DISCONNECTED_FAKE_STN',
      destination: 'NDLS',
      departureDate: '2026-11-15',
    });

    assert.equal(result.status, 'NO_ALTERNATIVES_FOUND');
    assert.equal(result.reason, 'UNVERIFIED_STATION_CONNECTIVITY');
  });

  // 7. Duplicate route queries are eliminated
  it('Requirement 7: Duplicate route queries are eliminated via RequestBudgetTracker and cache', () => {
    const tracker = new RequestBudgetTracker({ maxRecoveryRequests: 10 });
    const queryKey = 'direct:NDLS:CNB';

    assert.equal(tracker.isDuplicateQuery(queryKey), false);
    tracker.recordOutboundRequest({ isRecovery: true, queryKey });

    // Second check on identical queryKey
    assert.equal(tracker.isDuplicateQuery(queryKey), true);
    assert.equal(tracker.deduplicatedCount, 1);
  });

  // 8. The station expansion never exceeds its configured bounds
  it('Requirement 8: Station expansion never exceeds configured bounds of 5 before and 5 after', () => {
    // NDLS is in the middle of a 30-station corridor
    const expansion = stationExpansionService.expandStationDirectional('NDLS', {
      maxBefore: 5,
      maxAfter: 5,
    });

    assert.ok(expansion.hasConnectivity);
    assert.ok(expansion.before.length <= 5, 'Before stations must not exceed 5');
    assert.ok(expansion.after.length <= 5, 'After stations must not exceed 5');
    assert.ok(expansion.allAlternatives.every((stn) => stn.code !== 'NDLS'), 'Original station must be excluded');

    // Test with tighter bounds (e.g. 3)
    const tightExpansion = stationExpansionService.expandStationDirectional('NDLS', {
      maxBefore: 3,
      maxAfter: 3,
    });
    assert.ok(tightExpansion.before.length <= 3);
    assert.ok(tightExpansion.after.length <= 3);
  });

  // 9. The API request budget is respected
  it('Requirement 9: API request budget is strictly respected and terminates outbound requests when exhausted', () => {
    const tracker = new RequestBudgetTracker({
      maxRecoveryRequests: 3,
      maxTotalRequests: 5,
    });

    assert.equal(tracker.canMakeRecoveryRequest(), true);
    assert.equal(tracker.recordOutboundRequest({ isRecovery: true, queryKey: 'q1' }), true);
    assert.equal(tracker.recordOutboundRequest({ isRecovery: true, queryKey: 'q2' }), true);
    assert.equal(tracker.recordOutboundRequest({ isRecovery: true, queryKey: 'q3' }), true);

    // 4th request must be denied
    assert.equal(tracker.canMakeRecoveryRequest(), false);
    assert.equal(tracker.recordOutboundRequest({ isRecovery: true, queryKey: 'q4' }), false);
    assert.equal(tracker.recoveryRequestsUsed, 3);
    assert.equal(tracker.remainingRecoveryRequests, 0);

    const summary = tracker.getSummary();
    assert.equal(summary.isBudgetExhausted, true);
    assert.equal(summary.recoveryRequestsUsed, 3);
  });

  // 10. Minimum interchange time is enforced
  it('Requirement 10: Minimum interchange time (25m same-station, 60m cross-station) is enforced', () => {
    // Same station transfer with 20 minutes (too tight)
    const tightSameStation = connectionValidator.validateConnectingLegs(
      { destination: 'PRYJ', arrivalTime: '2026-11-15T10:00:00.000Z' },
      { origin: 'PRYJ', departureTime: '2026-11-15T10:20:00.000Z' }
    );
    assert.equal(tightSameStation.isValid, false);
    assert.equal(tightSameStation.reason, 'TIGHT_CONNECTION');

    // Same station transfer with 35 minutes (valid >= 25m)
    const validSameStation = connectionValidator.validateConnectingLegs(
      { destination: 'PRYJ', arrivalTime: '2026-11-15T10:00:00.000Z' },
      { origin: 'PRYJ', departureTime: '2026-11-15T10:35:00.000Z' }
    );
    assert.equal(validSameStation.isValid, true);
    assert.equal(validSameStation.layoverMinutes, 35);

    // Cross station transfer (NDLS -> DLI) with 45 minutes (< 60m required)
    const tightCrossStation = connectionValidator.validateConnectingLegs(
      { destination: 'NDLS', arrivalTime: '2026-11-15T10:00:00.000Z' },
      { origin: 'DLI', departureTime: '2026-11-15T10:45:00.000Z' }
    );
    assert.equal(tightCrossStation.isValid, false);
    assert.equal(tightCrossStation.minBufferRequired, 60);
  });

  // 11. Overnight journeys use the correct dates
  it('Requirement 11: Overnight journeys and date rollovers use correct calendar dates in IST', () => {
    const leg1 = {
      origin: { code: 'NDLS' },
      destination: { code: 'CNB' },
      departureTime: '2026-11-15T18:00:00.000Z',
      arrivalTime: '2026-11-16T02:00:00.000Z', // arrives 2:00 AM next day
    };

    const leg2 = {
      origin: { code: 'CNB' },
      destination: { code: 'PRYJ' },
      departureTime: '2026-11-16T04:30:00.000Z', // departs 4:30 AM next day
      arrivalTime: '2026-11-16T07:00:00.000Z',
    };

    const validation = connectionValidator.validateConnectingLegs(leg1, leg2);
    assert.equal(validation.isValid, true);
    assert.equal(validation.layoverMinutes, 150); // 2h 30m layover
  });

  // 12. Alternate boarding and arrival stations are represented correctly
  it('Requirement 12: Alternate boarding and arrival stations are represented with explicit metadata', () => {
    const legItems = [
      {
        edge: {
          from: 'SNP',
          to: 'NDLS',
          fromStationName: 'Sonipat',
          toStationName: 'New Delhi',
          distanceKm: 44,
          trainNumber: '12460',
          trainName: 'Intercity',
        },
        timing: {
          departureTime: new Date('2026-11-15T08:00:00.000Z'),
          arrivalTime: new Date('2026-11-15T09:15:00.000Z'),
          departureLocalTime: '13:30',
          arrivalLocalTime: '14:45',
          departureLocalDate: '2026-11-15',
          arrivalLocalDate: '2026-11-15',
          dayOffset: 0,
          durationMinutes: 75,
        },
      },
      {
        edge: {
          from: 'NDLS',
          to: 'PNBE',
          fromStationName: 'New Delhi',
          toStationName: 'Patna',
          distanceKm: 1000,
          trainNumber: '12310',
          trainName: 'Rajdhani',
        },
        timing: {
          departureTime: new Date('2026-11-15T11:40:00.000Z'),
          arrivalTime: new Date('2026-11-15T23:45:00.000Z'),
          departureLocalTime: '17:10',
          arrivalLocalTime: '05:15',
          departureLocalDate: '2026-11-15',
          arrivalLocalDate: '2026-11-16',
          dayOffset: 1,
          durationMinutes: 725,
        },
      },
    ];

    const assembled = journeyRecoveryService.assembleCandidateFromLegs(
      legItems,
      { code: 'DLI', name: 'Old Delhi' },
      { code: 'PNBE', name: 'Patna' },
      'DLI',
      'PNBE'
    );

    assert.equal(assembled.requestedOrigin, 'DLI');
    assert.equal(assembled.actualOrigin, 'SNP');
    assert.equal(assembled.isAlternateBoarding, true);
    assert.equal(assembled.requestedDestination, 'PNBE');
    assert.equal(assembled.actualDestination, 'PNBE');
    assert.equal(assembled.isAlternateArrival, false);
    assert.equal(assembled.metadata.isAlternateBoarding, true);
  });

  // 13. Unknown availability is not reported as confirmed
  it('Requirement 13: Unknown availability is never reported as confirmed or bookable', () => {
    const legs = [
      {
        trainNumber: '12392',
        availability: {
          normalizedStatus: AVAILABILITY_STATUS.UNKNOWN,
          status: 'UNKNOWN',
          isLive: false,
        },
      },
    ];

    const evaluation = availabilityService.evaluateJourneyAvailability(legs);
    assert.equal(evaluation.status, JOURNEY_AVAILABILITY.UNKNOWN);
    assert.equal(evaluation.isBookable, false);
    assert.notEqual(evaluation.status, JOURNEY_AVAILABILITY.AVAILABILITY_VERIFIED);
  });

  // 14. Rate limits do not cause unbounded retries
  it('Requirement 14: Rate limits (HTTP 429) do not cause unbounded retries and engage local protection', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      const err = new Error('Too Many Requests');
      err.status = 429;
      throw err;
    };

    const adapter = new RailKitAdapter({ fetchFn: mockFetch, disablePersistentCache: true });
    const tracker = new RequestBudgetTracker();
    const res = await adapter.getAvailability('12004', 'NDLS', 'LKO', '2026-11-15', '3A', 'GN', {
      budgetTracker: tracker,
      isRecovery: false,
    });

    assert.equal(callCount, 1, 'HTTP 429 must never be retried');
    assert.equal(res.reason, 'RATE_LIMITED');
  });

  // 15. Provider failure is not misclassified as no trains
  it('Requirement 15: Provider failure (timeout, 500, quota) is not misclassified as no trains found', async () => {
    const mockFailedAdapter = {
      searchDirectTrains: async () => ({
        success: false,
        trains: [],
        statusCode: 504,
        error: 'Upstream gateway timeout',
      }),
    };

    const directService = new (directJourneyService.constructor)({
      railKit: mockFailedAdapter,
      availabilityService,
      fareService,
    });

    const result = await directService.searchDirectTrains({
      origin: 'NDLS',
      destination: 'PNBE',
      departureDate: '2026-11-15',
    });

    assert.equal(result.status, DIRECT_SEARCH_STATUS.DIRECT_SEARCH_FAILED);
    assert.notEqual(result.status, DIRECT_SEARCH_STATUS.DIRECT_NOT_FOUND);
    assert.equal(result.shouldTriggerRecovery, false, 'Provider failure must not trigger recovery as if 0 trains exist');
  });

  // 16. Existing direct-search behavior remains compatible
  it('Requirement 16: Existing direct-search response contract remains backward-compatible', async () => {
    // When direct train is found and available
    const directTrains = [
      {
        train: { number: '12310', name: 'Patna Rajdhani Express' },
        trainNumber: '12310',
        trainName: 'Patna Rajdhani Express',
        from: { code: 'NDLS', name: 'New Delhi', departure: '17:10', day: 1 },
        to: { code: 'PNBE', name: 'Patna Junction', arrival: '05:15', day: 2 },
        departureTime: '17:10',
        arrivalTime: '05:15',
        duration: 725,
        distance: 1000,
        runDays: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
      },
    ];

    const mockAdapter = {
      searchDirectTrains: async () => ({
        success: true,
        trains: directTrains,
      }),
      getAvailability: async () => ({
        success: true,
        normalizedStatus: 'AVAILABLE',
        seatsAvailable: 25,
        isLive: true,
      }),
      getFare: async () => ({
        success: true,
        baseFare: 1720,
        totalFare: 1735,
        currency: 'INR',
        isEstimated: false,
      }),
    };

    const testAvailService = new (availabilityService.constructor)({
      railRadar: mockAdapter,
    });
    const testFareService = new (fareService.constructor)({
      railRadar: mockAdapter,
    });
    const service = new (directJourneyService.constructor)({
      railRadar: mockAdapter,
      availabilityService: testAvailService,
      fareService: testFareService,
    });

    const result = await service.searchDirectTrains({
      origin: { stationCode: 'NDLS', name: 'New Delhi' },
      destination: { stationCode: 'PNBE', name: 'Patna' },
      departureDate: '2026-11-15',
    });

    assert.equal(result.status, DIRECT_SEARCH_STATUS.DIRECT_AVAILABLE);
    assert.equal(result.shouldTriggerRecovery, false);
    assert.ok(result.directJourneys.length > 0);
    const j = result.directJourneys[0];
    assert.ok(j.departureTime);
    assert.ok(j.arrivalTime);
    assert.equal(j.numberOfTransfers, 0);
    assert.equal(j.legs.length, 1);
  });

  // 17. Partial provider failures do not corrupt valid results
  it('Requirement 17: Partial provider failures on individual legs do not corrupt valid results', async () => {
    const mixedCandidatePool = [
      {
        id: 'valid-candidate-1',
        duration: 650,
        totalPrice: 1450,
        numberOfTransfers: 1,
        availability: { journeyStatus: 'AVAILABILITY_VERIFIED', isBookable: true },
        pricing: { totalPrice: 1450, containsUnavailableFare: false },
        legs: [{ trainNumber: '12418' }, { trainNumber: '12398' }],
      },
      {
        id: 'partial-fail-candidate-2',
        duration: 720,
        totalPrice: null, // fare check failed upstream
        numberOfTransfers: 1,
        availability: { journeyStatus: 'UNKNOWN', isBookable: false },
        pricing: { totalPrice: null, containsUnavailableFare: true },
        legs: [{ trainNumber: '12418' }, { trainNumber: '99999' }],
      },
    ];

    const ranked = journeyRecoveryService.categorizeAndRank(mixedCandidatePool, {});
    assert.ok(ranked.length > 0);
    // The valid candidate should be ranked #1
    assert.equal(ranked[0].id, 'valid-candidate-1');
    assert.equal(ranked[0].ranking?.category, 'BEST_OVERALL');
  });
});
