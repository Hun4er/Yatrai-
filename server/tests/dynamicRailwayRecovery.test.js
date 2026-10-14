import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JourneyRecoveryService } from '../src/services/rail/journeyRecovery.service.js';
import { StationExpansionService } from '../src/services/rail/stationExpansion.service.js';
import { availabilityService } from '../src/services/rail/availability.service.js';
import { fareService } from '../src/services/rail/fare.service.js';
import { connectionValidator } from '../src/services/rail/connectionValidator.js';
import RequestBudgetTracker from '../src/services/rail/requestBudget.js';

describe('Yatrai Task 7 — Dynamic Railway Recovery Outside Hardcoded Corridors', () => {
  const stationExpansion = new StationExpansionService();

  it('Scenario 1: Discovers and verifies valid 2-train route via intermediate station absent from hardcoded corridors', async () => {
    // Intermediate hub 'KPD' (Katpadi)
    // Origin: SBC (Bengaluru), Dest: MAS (Chennai)
    // Direct search returns no trains, but 2-leg route via KPD has confirmed seats.
    const mockRailRadar = {
      searchDirectTrains: async (from, to, opts) => {
        if (opts?.budgetTracker) {
          opts.budgetTracker.recordOutboundRequest({ isRecovery: true });
        }
        if (from === 'SBC' && to === 'KPD') {
          return {
            success: true,
            trains: [
              {
                trainNumber: '12640',
                trainName: 'Brindavan Express Leg 1',
                origin: 'SBC',
                destination: 'KPD',
                departureTime: '14:00',
                arrivalTime: '17:30',
                duration: 210,
                distance: 215,
                source: 'live_search',
              },
            ],
          };
        }
        if (from === 'KPD' && to === 'MAS') {
          return {
            success: true,
            trains: [
              {
                trainNumber: '12676',
                trainName: 'Kovai Express Leg 2',
                origin: 'KPD',
                destination: 'MAS',
                departureTime: '19:00',
                arrivalTime: '21:30',
                duration: 150,
                distance: 130,
                source: 'live_search',
              },
            ],
          };
        }
        return { success: true, trains: [] };
      },
      getAvailability: async () => ({
        success: true,
        normalizedStatus: 'AVAILABLE',
        seatsAvailable: 45,
        isLive: true,
      }),
    };

    const testAvailService = new (availabilityService.constructor)({
      railRadar: mockRailRadar,
    });

    const recoveryService = new JourneyRecoveryService({
      stationExpansion,
      railRadar: mockRailRadar,
      availabilityService: testAvailService,
      fareService,
      connectionValidator,
    });

    const searchContext = {
      origin: 'SBC',
      destination: 'MAS',
      departureDate: '2026-10-14',
      passengers: 1,
      travelClass: '3A',
      quota: 'GN',
    };

    const result = await recoveryService.recoverJourneys(searchContext, {
      maxTransfers: 1,
      viaStations: ['KPD'],
      budgetTracker: new RequestBudgetTracker({ maxRecoveryRequests: 10 }),
    });

    assert.ok(result.recoveredJourneys.length > 0, 'Should find at least 1 recovered journey via dynamic hub');
    const journey = result.recoveredJourneys[0];
    assert.equal(journey.legs.length, 2);
    assert.equal(journey.legs[0].origin?.stationCode || journey.legs[0].origin, 'SBC');
    assert.equal(journey.legs[0].destination?.stationCode || journey.legs[0].destination, 'KPD');
    assert.equal(journey.legs[1].origin?.stationCode || journey.legs[1].origin, 'KPD');
    assert.equal(journey.legs[1].destination?.stationCode || journey.legs[1].destination, 'MAS');
    assert.equal(journey.isConfirmedAvailable, true);
    assert.equal(journey.availabilityStatus, 'AVAILABILITY_VERIFIED');
  });

  it('Negative 1: One leg waitlisted is strictly rejected from confirmed alternatives', async () => {
    const mockRailRadar = {
      searchDirectTrains: async (from, to) => {
        if (from === 'SBC' && to === 'KPD') {
          return {
            success: true,
            trains: [{ trainNumber: '12640', departureTime: '14:00', arrivalTime: '17:30', duration: 210, distance: 215 }],
          };
        }
        if (from === 'KPD' && to === 'MAS') {
          return {
            success: true,
            trains: [{ trainNumber: '12676', departureTime: '19:00', arrivalTime: '21:30', duration: 150, distance: 130 }],
          };
        }
        return { success: true, trains: [] };
      },
      getAvailability: async (trainNo) => {
        if (trainNo === '12640') {
          return { success: true, normalizedStatus: 'AVAILABLE', seatsAvailable: 10 };
        }
        return { success: true, normalizedStatus: 'WAITLIST', seatsAvailable: 0 };
      },
    };

    const testAvailService = new (availabilityService.constructor)({
      railRadar: mockRailRadar,
    });

    const recoveryService = new JourneyRecoveryService({
      stationExpansion,
      railRadar: mockRailRadar,
      availabilityService: testAvailService,
      fareService,
      connectionValidator,
    });

    const result = await recoveryService.recoverJourneys({
      origin: 'SBC',
      destination: 'MAS',
      departureDate: '2026-10-14',
    }, {
      maxTransfers: 1,
      viaStations: ['KPD'],
      confirmedOnly: true,
    });

    assert.equal(result.recoveredJourneys.length, 0, 'Must reject journey with a waitlisted leg');
  });

  it('Negative 2: One leg unknown availability is strictly rejected from confirmed alternatives', async () => {
    const mockRailRadar = {
      searchDirectTrains: async (from, to) => {
        if (from === 'SBC' && to === 'KPD') {
          return {
            success: true,
            trains: [{ trainNumber: '12640', departureTime: '14:00', arrivalTime: '17:30', duration: 210, distance: 215 }],
          };
        }
        if (from === 'KPD' && to === 'MAS') {
          return {
            success: true,
            trains: [{ trainNumber: '12676', departureTime: '19:00', arrivalTime: '21:30', duration: 150, distance: 130 }],
          };
        }
        return { success: true, trains: [] };
      },
      getAvailability: async (trainNo) => {
        if (trainNo === '12640') {
          return { success: true, normalizedStatus: 'AVAILABLE', seatsAvailable: 10 };
        }
        return { success: false, normalizedStatus: 'UNKNOWN', seatsAvailable: 0 };
      },
    };

    const testAvailService = new (availabilityService.constructor)({
      railRadar: mockRailRadar,
    });

    const recoveryService = new JourneyRecoveryService({
      stationExpansion,
      railRadar: mockRailRadar,
      availabilityService: testAvailService,
      fareService,
      connectionValidator,
    });

    const result = await recoveryService.recoverJourneys({
      origin: 'SBC',
      destination: 'MAS',
      departureDate: '2026-10-14',
    }, {
      maxTransfers: 1,
      viaStations: ['KPD'],
      confirmedOnly: true,
    });

    assert.equal(result.recoveredJourneys.length, 0, 'Must reject journey with an unknown availability leg');
  });

  it('Negative 3: Impossible transfer timing (leg 2 departs before leg 1 arrives) is strictly rejected', async () => {
    const mockRailRadar = {
      searchDirectTrains: async (from, to) => {
        if (from === 'SBC' && to === 'KPD') {
          return {
            success: true,
            trains: [{ trainNumber: '12640', departureTime: '15:00', arrivalTime: '18:00', duration: 180, distance: 215 }],
          };
        }
        if (from === 'KPD' && to === 'MAS') {
          return {
            success: true,
            // Departs at 17:00, which is BEFORE 18:00 arrival of Leg 1
            trains: [{ trainNumber: '12676', departureTime: '17:00', arrivalTime: '19:30', duration: 150, distance: 130 }],
          };
        }
        return { success: true, trains: [] };
      },
      getAvailability: async () => ({ success: true, normalizedStatus: 'AVAILABLE', seatsAvailable: 10 }),
    };

    const testAvailService = new (availabilityService.constructor)({
      railRadar: mockRailRadar,
    });

    const recoveryService = new JourneyRecoveryService({
      stationExpansion,
      railRadar: mockRailRadar,
      availabilityService: testAvailService,
      fareService,
      connectionValidator,
    });

    const result = await recoveryService.recoverJourneys({
      origin: 'SBC',
      destination: 'MAS',
      departureDate: '2026-10-14',
    }, {
      maxTransfers: 1,
      viaStations: ['KPD'],
    });

    assert.equal(result.recoveredJourneys.length, 0, 'Must reject impossible transfer timing');
  });

  it('Negative 4: Upstream provider error is safely handled without fabricating journeys', async () => {
    const mockRailRadar = {
      searchDirectTrains: async () => ({
        success: false,
        error: 'Upstream gateway 504 timeout',
        statusCode: 504,
      }),
    };

    const testAvailService = new (availabilityService.constructor)({
      railRadar: mockRailRadar,
    });

    const recoveryService = new JourneyRecoveryService({
      stationExpansion,
      railRadar: mockRailRadar,
      availabilityService: testAvailService,
      fareService,
      connectionValidator,
    });

    const result = await recoveryService.recoverJourneys({
      origin: 'SBC',
      destination: 'MAS',
      departureDate: '2026-10-14',
    }, {
      maxTransfers: 1,
      viaStations: ['KPD'],
    });

    assert.equal(result.recoveredJourneys.length, 0);
  });

  it('Negative 5: Request budget exhaustion halts stage queries and leaves unverified journeys unreturned', async () => {
    let callsCount = 0;
    const mockRailRadar = {
      searchDirectTrains: async (from, to, opts) => {
        callsCount++;
        if (opts?.budgetTracker) {
          opts.budgetTracker.recordOutboundRequest({ isRecovery: true });
        }
        return { success: true, trains: [] };
      },
    };

    const budgetTracker = new RequestBudgetTracker({ maxRecoveryRequests: 1 });

    const recoveryService = new JourneyRecoveryService({
      stationExpansion,
      railRadar: mockRailRadar,
      availabilityService: availabilityService,
      fareService,
      connectionValidator,
    });

    const result = await recoveryService.recoverJourneys({
      origin: 'SBC',
      destination: 'MAS',
      departureDate: '2026-10-14',
    }, {
      maxTransfers: 1,
      viaStations: ['KPD'],
      budgetTracker,
    });

    assert.ok(callsCount <= 1, 'Outbound stage queries must respect budget maxRecoveryRequests');
    assert.equal(result.recoveredJourneys.length, 0);
  });
});
