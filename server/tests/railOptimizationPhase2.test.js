import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RequestBudgetTracker } from '../src/services/rail/requestBudget.js';
import { AvailabilityService, AVAILABILITY_STATUS } from '../src/services/rail/availability.service.js';
import { LiveStatusService } from '../src/services/rail/liveStatus.service.js';
import { JourneyRecoveryService } from '../src/services/rail/journeyRecovery.service.js';
import stationExpansionService from '../src/services/rail/stationExpansion.service.js';
import connectionValidator from '../src/services/rail/connectionValidator.js';
import fareService from '../src/services/rail/fare.service.js';

describe('Phase 2: RailKit Usage Optimization & Invariants', () => {
  // Invariant 1: Strict budget pre-reservation
  it('Invariant 1: Atomic budget reservation strictly caps outbound availability calls', async () => {
    const tracker = new RequestBudgetTracker({ maxRecoveryRequests: 3, maxTotalRequests: 5 });
    let providerCalls = 0;

    const mockRailKit = {
      getAvailability: async () => {
        const res = tracker.reserve('recovery');
        if (!res) {
          return {
            success: false,
            normalizedStatus: AVAILABILITY_STATUS.UNKNOWN,
            isBudgetExhausted: true,
            isUnchecked: true,
          };
        }
        providerCalls++;
        res.commit();
        return {
          success: true,
          normalizedStatus: AVAILABILITY_STATUS.AVAILABLE,
          seatsAvailable: 15,
        };
      },
    };

    const service = new AvailabilityService({ railKit: mockRailKit });

    const results = [];
    for (let i = 1; i <= 5; i++) {
      const res = await service.checkLegAvailability({
        trainNumber: `1200${i}`,
        fromCode: 'BSB',
        toCode: 'PRYJ',
        date: '2026-10-19',
        budgetTracker: tracker,
        isRecovery: true,
      });
      results.push(res);
    }

    assert.equal(providerCalls, 3, 'Must make exactly 3 outbound calls when budget is 3');
    assert.equal(tracker.recoveryRequestsUsed, 3);
    assert.equal(results[0].normalizedStatus, AVAILABILITY_STATUS.AVAILABLE);
    assert.equal(results[1].normalizedStatus, AVAILABILITY_STATUS.AVAILABLE);
    assert.equal(results[2].normalizedStatus, AVAILABILITY_STATUS.AVAILABLE);
    assert.equal(results[3].isBudgetExhausted, true);
    assert.equal(results[4].isBudgetExhausted, true);
  });

  // Invariant 2: Zero Leg 2 checks dispatched after non-bookable Leg 1
  it('Invariant 2: Zero Leg 2 requests are made after a non-bookable Leg 1', async () => {
    let leg1Queries = 0;
    let leg2Queries = 0;

    const mockRailRadar = {
      searchDirectTrains: async (from, to) => {
        if (from === 'BSB' && to === 'PRYJ') {
          return {
            success: true,
            trains: [
              {
                trainNumber: '11062',
                trainName: 'Kamayani Express',
                departureTime: '06:00',
                arrivalTime: '08:30',
                distance: 125,
                duration: 150,
                from: { code: 'BSB', name: 'Varanasi' },
                to: { code: 'PRYJ', name: 'Prayagraj' },
              },
            ],
          };
        }
        if (from === 'PRYJ' && to === 'GAYA') {
          return {
            success: true,
            trains: [
              {
                trainNumber: '12802',
                trainName: 'Purushottam Express',
                departureTime: '10:00',
                arrivalTime: '15:30',
                distance: 360,
                duration: 330,
                from: { code: 'PRYJ', name: 'Prayagraj' },
                to: { code: 'GAYA', name: 'Gaya' },
              },
            ],
          };
        }
        return { success: true, trains: [] };
      },
      getAvailability: async () => ({
        success: true,
        normalizedStatus: 'AVAILABLE',
      }),
    };

    const mockAvailService = {
      evaluateJourneyAvailability: () => ({ isBookable: false, journeyStatus: 'UNAVAILABLE' }),
      checkLegAvailability: async ({ trainNumber }) => {
        if (trainNumber === '12802') {
          // Bottleneck leg (PRYJ -> GAYA, 360 km) checked first!
          leg2Queries++;
          return {
            success: true,
            trainNumber: '12802',
            normalizedStatus: 'REGRET',
            rawStatus: 'REGRET',
            isAvailable: false,
          };
        }
        if (trainNumber === '11062') {
          leg1Queries++;
          return {
            success: true,
            trainNumber: '11062',
            normalizedStatus: 'AVAILABLE',
            isAvailable: true,
          };
        }
        return { success: false, normalizedStatus: 'UNKNOWN' };
      },
    };

    const recovery = new JourneyRecoveryService({
      railRadar: mockRailRadar,
      stationExpansion: stationExpansionService,
      connectionValidator,
      availabilityService: mockAvailService,
      fareService,
    });

    await recovery.recoverJourneys(
      {
        origin: 'BSB',
        destination: 'GAYA',
        departureDate: '2026-10-19',
      },
      { maxTransfers: 1, maxHubsToSearch: 1 }
    );

    // Bottleneck-first: Train 12802 (PRYJ->GAYA, 360km) is checked first.
    // Since it returns REGRET, Train 11062 (BSB->PRYJ) is NEVER queried!
    assert.equal(leg2Queries, 1, 'Bottleneck leg (12802) was checked first');
    assert.equal(leg1Queries, 0, 'Secondary leg (11062) was skipped after non-bookable bottleneck leg');
  });

  // Invariant 3: Early stopping halts lookups after confirmed itineraries target is reached
  it('Invariant 3: Early stop halts availability lookups once 2 confirmed itineraries are found', async () => {
    let availCalls = 0;

    const mockRailRadar = {
      searchDirectTrains: async (from, to) => {
        if (from === 'BSB' && to === 'PRYJ') {
          return {
            success: true,
            trains: [
              {
                trainNumber: '22436',
                trainName: 'Vande Bharat',
                departureTime: '06:00',
                arrivalTime: '08:00',
                distance: 125,
                duration: 120,
                from: { code: 'BSB', name: 'Varanasi' },
                to: { code: 'PRYJ', name: 'Prayagraj' },
              },
              {
                trainNumber: '12417',
                trainName: 'Prayagraj Express',
                departureTime: '07:00',
                arrivalTime: '09:00',
                distance: 125,
                duration: 120,
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
                trainNumber: '12003',
                trainName: 'Shatabdi',
                departureTime: '10:00',
                arrivalTime: '12:00',
                distance: 195,
                duration: 120,
                from: { code: 'PRYJ', name: 'Prayagraj' },
                to: { code: 'CNB', name: 'Kanpur' },
              },
              {
                trainNumber: '12555',
                trainName: 'Gorakhdham',
                departureTime: '11:00',
                arrivalTime: '13:00',
                distance: 195,
                duration: 120,
                from: { code: 'PRYJ', name: 'Prayagraj' },
                to: { code: 'CNB', name: 'Kanpur' },
              },
            ],
          };
        }
        return { success: true, trains: [] };
      },
    };

    const mockAvailService = {
      evaluateJourneyAvailability: () => ({ isBookable: true, journeyStatus: 'AVAILABLE' }),
      checkLegAvailability: async () => {
        availCalls++;
        return {
          success: true,
          normalizedStatus: AVAILABILITY_STATUS.AVAILABLE,
          seatsAvailable: 20,
          isAvailable: true,
        };
      },
    };

    const recovery = new JourneyRecoveryService({
      railRadar: mockRailRadar,
      stationExpansion: stationExpansionService,
      connectionValidator,
      availabilityService: mockAvailService,
      fareService,
    });

    const res = await recovery.recoverJourneys(
      {
        origin: 'BSB',
        destination: 'CNB',
        departureDate: '2026-10-19',
      },
      {
        maxTransfers: 1,
        earlyStopGoodItineraries: 2, // stop after 2 confirmed
      }
    );

    assert.ok(res.journeys.length >= 2, 'Should have at least 2 journeys');
    // 2 journeys * 2 legs = 4 lookups maximum
    assert.ok(availCalls <= 4, `Expected at most 4 availability calls due to early stopping, got ${availCalls}`);
  });

  // Invariant 4: Future travel dates bypass live tracking
  it('Invariant 4: Future travel dates bypass live train tracking calls', async () => {
    let liveCalls = 0;
    const mockRailRadar = {
      getLiveStatus: async () => {
        liveCalls++;
        return { isLive: true, delayMinutes: 45 };
      },
    };

    const liveService = new LiveStatusService({ railRadar: mockRailRadar });

    const arrivalLeg = {
      departureTime: '2026-10-19T06:00:00.000Z',
      arrivalTime: '2026-10-19T09:00:00.000Z',
      vehicle: { identifier: '12417' },
    };
    const departureLeg = {
      departureTime: '2026-10-19T10:00:00.000Z',
      arrivalTime: '2026-10-19T14:00:00.000Z',
      vehicle: { identifier: '12004' },
    };

    const risk = await liveService.evaluateTransferRisk(arrivalLeg, departureLeg, 30);

    assert.equal(liveCalls, 0, 'Must NOT query live train tracking for future travel dates');
    assert.equal(risk.feasible, true);
    assert.equal(risk.scheduledBufferMinutes, 60);
    assert.equal(risk.riskLevel, 'LOW');
  });

  // Invariant 5: Origin cluster shift labeling
  it('Invariant 5: Labels isClusterShift and clusterNote when origin shifts from BSBS to BSB', () => {
    const recovery = new JourneyRecoveryService({
      stationExpansion: stationExpansionService,
      connectionValidator,
      fareService,
    });

    const legItems = [
      {
        edge: {
          from: 'BSB',
          to: 'PRYJ',
          trainNumber: '11062',
          fromStationName: 'Varanasi Junction',
          toStationName: 'Prayagraj Junction',
          distanceKm: 125,
        },
        timing: {
          departureTime: new Date('2026-10-19T06:00:00Z'),
          arrivalTime: new Date('2026-10-19T08:30:00Z'),
          departureLocalTime: '06:00',
          arrivalLocalTime: '08:30',
          departureLocalDate: '2026-10-19',
          arrivalLocalDate: '2026-10-19',
        },
      },
      {
        edge: {
          from: 'PRYJ',
          to: 'GAYA',
          trainNumber: '12802',
          fromStationName: 'Prayagraj Junction',
          toStationName: 'Gaya Junction',
          distanceKm: 360,
        },
        timing: {
          departureTime: new Date('2026-10-19T10:00:00Z'),
          arrivalTime: new Date('2026-10-19T15:30:00Z'),
          departureLocalTime: '10:00',
          arrivalLocalTime: '15:30',
          departureLocalDate: '2026-10-19',
          arrivalLocalDate: '2026-10-19',
        },
      },
    ];

    const journey = recovery.assembleCandidateFromLegs(legItems, null, null, 'BSBS', 'GAYA');

    assert.equal(journey.isClusterShift, true);
    assert.ok(journey.clusterNote.toLowerCase().includes('varanasi'));
    assert.equal(journey.legs[0].isClusterShift, true);
  });

  // Invariant 6: Cache hits consume zero budget
  it('Invariant 6: Cache hits consume zero budget requests', async () => {
    const tracker = new RequestBudgetTracker({ maxRecoveryRequests: 5 });
    let outboundCalls = 0;

    const mockRailKit = {
      getAvailability: async () => {
        const res = tracker.reserve('recovery');
        if (!res) return { isBudgetExhausted: true };
        outboundCalls++;
        res.commit();
        return {
          success: true,
          normalizedStatus: AVAILABILITY_STATUS.AVAILABLE,
          seatsAvailable: 25,
        };
      },
    };

    const service = new AvailabilityService({ railKit: mockRailKit });

    // First call: consumes 1 budget
    await service.checkLegAvailability({
      trainNumber: '12417',
      fromCode: 'PRYJ',
      toCode: 'NDLS',
      date: '2026-10-19',
      budgetTracker: tracker,
      isRecovery: true,
    });
    assert.equal(outboundCalls, 1);
    assert.equal(tracker.recoveryRequestsUsed, 1);

    // Second call: exact same query, should hit cache
    const cachedRes = await service.checkLegAvailability({
      trainNumber: '12417',
      fromCode: 'PRYJ',
      toCode: 'NDLS',
      date: '2026-10-19',
      budgetTracker: tracker,
      isRecovery: true,
    });

    assert.equal(outboundCalls, 1, 'Outbound provider calls must remain 1');
    assert.equal(tracker.recoveryRequestsUsed, 1, 'Budget used must remain 1');
    assert.equal(tracker.cacheHits, 1, 'Cache hits must increment to 1');
    assert.equal(cachedRes.normalizedStatus, AVAILABILITY_STATUS.AVAILABLE);
  });
});
