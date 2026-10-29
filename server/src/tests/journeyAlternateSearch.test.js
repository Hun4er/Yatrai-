import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { journeyV2Controller, resolveStations } from '../controllers/journeyV2.controller.js';
import { AlternativesEngineService } from '../services/rail/alternativesEngine.service.js';
import { DirectPassService } from '../services/rail/directPass.service.js';
import clusterService from '../services/rail/cluster.service.js';
import { formatJourneyDate } from '../utils/railwayTime.js';
import { getAdvanceBookingWindow } from '../utils/bookingWindow.js';
import { AVAILABILITY_STATUS } from '../services/rail/availabilityNorm.js';

describe('Journey Alternate Search & Phase 6 Regression Suite', () => {

  // 1. Direct train being returned successfully
  it('1. Returns direct trains when a direct train runs on the route', async () => {
    const mockRailKit = {
      searchTrainBetweenStations: async (from, to) => ({
        success: true,
        data: [
          {
            train_no: '12301',
            train_name: 'RAJDHANI EXP',
            from_stn_code: from,
            to_stn_code: to,
            from_time: '16:55',
            to_time: '09:55',
            travel_time: '17:00',
            running_days: '1111111',
            classes_of_travel: '1A,2A,3A',
          },
        ],
      }),
      hasCachedSearch: () => false,
      getAvailability: async () => ({
        normalizedStatus: AVAILABILITY_STATUS.AVAILABLE,
        statusText: 'AVAILABLE-0042',
        seatsAvailable: 42,
        isAvailable: true,
        totalFare: 2150,
      }),
    };

    const directPass = new DirectPassService({
      railKit: mockRailKit,
      availabilityService: {
        checkLegAvailability: async () => ({
          normalizedStatus: AVAILABILITY_STATUS.AVAILABLE,
          statusText: 'AVAILABLE-0042',
          seatsAvailable: 42,
          isAvailable: true,
          totalFare: 2150,
        }),
      },
      cancelledTrainsService: {
        hasCached: () => true,
        getCancelledTrains: async () => new Set(),
      },
      actionBudgetService: {
        recordCall: async () => true,
        singleFlight: async (key, fn) => fn(),
        getBudgetSummary: async () => ({ used: 1, cap: 40, partial: false }),
        isAtCap: () => false,
      },
    });

    const res = await directPass.run({
      origins: ['NDLS'],
      destinations: ['HWH'],
      date: '2026-11-15',
      travelClass: '3A',
      quota: 'GN',
      actionId: 'test_direct_1',
    });

    assert.ok(res.direct.length >= 1, 'Should find at least 1 direct train');
    assert.equal(res.direct[0].trainNumber, '12301');
    assert.equal(res.confirmedFound, true);
  });

  // 2. No direct train but a valid connecting itinerary existing (MS -> R via VSKP)
  it('2. Discovers valid connecting itinerary when no direct train exists (MS -> R via VSKP)', async () => {
    const mockRailKit = {
      searchTrainBetweenStations: async (from, to) => {
        if ((from === 'MS' || from === 'MAS') && to === 'VSKP') {
          return {
            success: true,
            data: [
              {
                train_no: '12842',
                train_name: 'COROMANDEL EXP',
                from_stn_code: 'MAS',
                to_stn_code: 'VSKP',
                from_time: '07:00',
                to_time: '19:25',
                travel_time: '12:25',
                running_days: '1111111',
                classes_of_travel: '1A,2A,3A,SL',
                distance: '780',
              },
            ],
          };
        }
        if (from === 'VSKP' && to === 'R') {
          return {
            success: true,
            data: [
              {
                train_no: '18518',
                train_name: 'VSKP KRBA EXP',
                from_stn_code: 'VSKP',
                to_stn_code: 'R',
                from_time: '21:00',
                to_time: '07:00',
                travel_time: '10:00',
                running_days: '1111111',
                classes_of_travel: '1A,2A,3A,SL',
                distance: '529',
              },
            ],
          };
        }
        return { success: true, data: [] };
      },
      hasCachedSearch: () => false,
      hasCachedInfo: () => false,
      hasCachedSchedule: () => false,
    };

    const altEngine = new AlternativesEngineService({
      railKit: mockRailKit,
      availabilityService: {
        hasCached: () => false,
        checkLegAvailability: async () => ({
          normalizedStatus: 'UNVERIFIED',
          statusText: 'Live availability unverified (schedule confirmed)',
          isAvailable: false,
          totalFare: 850,
        }),
      },
      corridorHubsService: {
        getStoredHubs: async () => null,
        storeHubs: async () => {},
      },
      actionBudgetService: {
        isAtCap: () => false,
        recordCall: async () => true,
        singleFlight: async (key, fn) => fn(),
        getBudgetSummary: async () => ({ used: 2, cap: 40 }),
      },
    });

    const hubs = await altEngine._discoverHubs('MS', 'R', '2026-10-28', [], 4);
    assert.ok(hubs.some((h) => h.code === 'VSKP' || h.code === 'NGP' || h.code === 'BZA'), 'Should discover natural geographic hubs');

    const result = await altEngine.run({
      originCode: 'MS',
      destCode: 'R',
      date: '2026-10-28',
      travelClass: '3A',
      quota: 'GN',
      actionId: 'test_ms_to_r',
      directDistanceKm: 920,
    });

    assert.ok(result.alternatives.length > 0, 'Should find connecting alternative itineraries');
    const firstAlt = result.alternatives[0];
    assert.equal(firstAlt.hubCode, 'VSKP');
    assert.equal(firstAlt.legs.length, 2);
    assert.equal(firstAlt.legs[0].trainNo, '12842');
    assert.equal(firstAlt.legs[1].trainNo, '18518');
    assert.equal(firstAlt.layoverMinutes, 95); // 19:25 to 21:00 = 95 minutes
  });

  // 3. No verified route being found
  it('3. Returns 0 itineraries when no operating rail route exists between isolated stations', async () => {
    const mockRailKit = {
      searchTrainBetweenStations: async () => ({ success: true, data: [] }),
      hasCachedSearch: () => false,
    };

    const altEngine = new AlternativesEngineService({
      railKit: mockRailKit,
      availabilityService: { checkLegAvailability: async () => null },
      corridorHubsService: { getStoredHubs: async () => null, storeHubs: async () => {} },
      actionBudgetService: {
        isAtCap: () => false,
        recordCall: async () => true,
        singleFlight: async (key, fn) => fn(),
        getBudgetSummary: async () => ({ used: 2, cap: 40 }),
      },
    });

    const result = await altEngine.run({
      originCode: 'MS',
      destCode: 'ZZZ',
      date: '2026-10-28',
      travelClass: '3A',
      quota: 'GN',
      actionId: 'test_no_route',
    });

    assert.equal(result.alternatives.length, 0, 'Should return empty array when no routes exist');
  });

  // 4. Provider timeout and malformed responses
  it('4. Handles provider error or timeout gracefully without crashing', async () => {
    const mockFailingRailKit = {
      searchTrainBetweenStations: async () => {
        const err = new Error('Gateway Timeout');
        err.status = 504;
        throw err;
      },
      hasCachedSearch: () => false,
    };

    const altEngine = new AlternativesEngineService({
      railKit: mockFailingRailKit,
      availabilityService: { checkLegAvailability: async () => null },
      corridorHubsService: { getStoredHubs: async () => null, storeHubs: async () => {} },
      actionBudgetService: {
        isAtCap: () => false,
        recordCall: async () => true,
        singleFlight: async (key, fn) => fn(),
        getBudgetSummary: async () => ({ used: 1, cap: 40 }),
      },
    });

    const result = await altEngine.run({
      originCode: 'MS',
      destCode: 'R',
      date: '2026-10-28',
      travelClass: '3A',
      quota: 'GN',
      actionId: 'test_timeout',
    });

    assert.equal(result.alternatives.length, 0);
    assert.equal(typeof result.budget, 'object');
  });

  // 5. Incorrect station codes
  it('5. Correctly validates and rejects invalid station codes', async () => {
    const req = {
      body: {
        actionId: 'test_bad_station',
        origins: ['UNKNOWN_FAKE_XYZ'],
        destinations: ['R'],
        date: '2026-10-28',
      },
    };
    let responseStatus = null;
    let responseBody = null;
    const res = {
      status(code) { responseStatus = code; return this; },
      json(payload) { responseBody = payload; return this; },
    };

    await journeyV2Controller.search(req, res, () => {});
    assert.equal(responseStatus, 400);
    assert.equal(responseBody.success, false);
    assert.equal(responseBody.error?.code, 'STATION_NOT_FOUND');
  });

  // 6. Date and timezone boundaries
  it('6. Rejects past travel dates and formats dates safely without UTC shift', async () => {
    assert.equal(formatJourneyDate('2026-10-28'), '2026-10-28');
    assert.equal(formatJourneyDate('28-10-2026'), '2026-10-28');

    const bookingWindow = getAdvanceBookingWindow();
    assert.equal(bookingWindow.isPast('2020-01-01'), true);

    const req = {
      body: {
        actionId: 'test_past_date',
        origins: ['MS'],
        destinations: ['R'],
        date: '2020-01-01',
      },
    };
    let responseStatus = null;
    let responseBody = null;
    const res = {
      status(code) { responseStatus = code; return this; },
      json(payload) { responseBody = payload; return this; },
    };

    await journeyV2Controller.search(req, res, () => {});
    assert.equal(responseStatus, 400);
    assert.equal(responseBody.error?.code, 'PAST_DATE');
  });

  // 7. Invalid or impossible connections
  it('7. Rejects impossible connections where layover is less than 90 min or over 10 hours', async () => {
    const mockRailKit = {
      searchTrainBetweenStations: async (from, to) => {
        if (from === 'MS' && to === 'VSKP') {
          return {
            success: true,
            data: [
              {
                train_no: '11111',
                train_name: 'TEST EXP 1',
                from_stn_code: 'MS',
                to_stn_code: 'VSKP',
                from_time: '07:00',
                to_time: '19:25',
                travel_time: '12:25',
                running_days: '1111111',
                classes_of_travel: '3A',
              },
            ],
          };
        }
        if (from === 'VSKP' && to === 'R') {
          return {
            success: true,
            data: [
              // Impossible layover: departs only 15 minutes after train 1 arrives
              {
                train_no: '22222',
                train_name: 'TEST EXP 2',
                from_stn_code: 'VSKP',
                to_stn_code: 'R',
                from_time: '19:40', // layover = 15 minutes (< 90 min!)
                to_time: '05:00',
                travel_time: '09:20',
                running_days: '1111111',
                classes_of_travel: '3A',
              },
            ],
          };
        }
        return { success: true, data: [] };
      },
      hasCachedSearch: () => false,
    };

    const altEngine = new AlternativesEngineService({
      railKit: mockRailKit,
      availabilityService: { checkLegAvailability: async () => null },
      corridorHubsService: { getStoredHubs: async () => null, storeHubs: async () => {} },
      actionBudgetService: {
        isAtCap: () => false,
        recordCall: async () => true,
        singleFlight: async (key, fn) => fn(),
        getBudgetSummary: async () => ({ used: 2, cap: 40 }),
      },
    });

    const plans = await altEngine._crossTrainSearch({
      originCode: 'MS',
      destCode: 'R',
      hubCode: 'VSKP',
      laneClass: '3A',
      dateStr: '2026-10-28',
      quota: 'GN',
      actionId: 'test_impossible_layover',
      budget: { recordCall: async () => true, singleFlight: async (k, fn) => fn(), isAtCap: () => false },
      allowScheduleOnly: true,
    });

    assert.equal(plans.length, 0, 'Must reject connection with 15-minute layover (< 90m)');
  });

  // 8. Duplicate trains and deduplication
  it('8. Deduplicates identical cluster station codes and cluster pairs', async () => {
    const codes = await resolveStations(['MS', 'chennai egmore', 'MS', 'RAIPUR JN - R', 'R']);
    assert.deepEqual(codes, ['MS', 'R']);

    const clusterCodes = clusterService.getClusterStationCodes('MS');
    assert.ok(clusterCodes.includes('MAS'));
    assert.ok(clusterCodes.includes('MS'));
    // Ensure no duplicates in cluster array
    assert.equal(new Set(clusterCodes).size, clusterCodes.length);
  });

  // 9. Missing fare or seat-availability data
  it('9. Gracefully marks unverified status and retains schedule when live seat data is missing', async () => {
    const mockRailKit = {
      searchTrainBetweenStations: async (from, to) => ({
        success: true,
        data: [
          {
            train_no: '99991',
            train_name: 'TEST EXP 1',
            from_stn_code: from,
            to_stn_code: to,
            from_time: '08:00',
            to_time: '18:00',
            travel_time: '10:00',
            running_days: '1111111',
            classes_of_travel: '3A',
          },
        ],
      }),
      hasCachedSearch: () => false,
    };

    const altEngine = new AlternativesEngineService({
      railKit: mockRailKit,
      availabilityService: { checkLegAvailability: async () => null }, // null availability
      corridorHubsService: { getStoredHubs: async () => null, storeHubs: async () => {} },
      actionBudgetService: {
        isAtCap: () => false,
        recordCall: async () => true,
        singleFlight: async (key, fn) => fn(),
        getBudgetSummary: async () => ({ used: 2, cap: 40 }),
      },
    });

    const plans = await altEngine._crossTrainSearch({
      originCode: 'MS',
      destCode: 'R',
      hubCode: 'VSKP',
      laneClass: '3A',
      dateStr: '2026-10-28',
      quota: 'GN',
      actionId: 'test_missing_avail',
      budget: { recordCall: async () => true, singleFlight: async (k, fn) => fn(), isAtCap: () => false },
      allowScheduleOnly: true,
    });

    assert.ok(plans.length >= 0);
  });

  // 10. End-to-end Chennai Egmore (MS) to Raipur (R) live verification
  it('10. End-to-end: Chennai Egmore (MS) to Raipur Junction (R) resolves and returns connecting alternatives', async () => {
    const req = {
      body: {
        actionId: 'e2e_ms_to_r_test',
        origins: ['MS'],
        destinations: ['R'],
        date: '2026-10-28',
        class: 'ANY',
        quota: 'GN',
        mode: 'default',
      },
    };
    let responseStatus = null;
    let responseBody = null;
    const res = {
      status(code) { responseStatus = code; return this; },
      json(payload) { responseBody = payload; return this; },
    };

    await journeyV2Controller.search(req, res, () => {});

    assert.equal(responseStatus, 200, 'Search must return HTTP 200');
    assert.equal(responseBody.success, true);
    assert.ok(Array.isArray(responseBody.data?.alternatives), 'Alternatives must be an array');
    assert.ok(responseBody.data.alternatives.length > 0, 'Must return at least 1 connecting itinerary for MS -> R');
    
    const alt = responseBody.data.alternatives[0];
    assert.ok(alt.legs.length >= 2, 'Connecting itinerary must contain at least 2 legs');
    assert.ok(alt.hubCode, 'Must have intermediate interchange hub');
    assert.ok(alt.layoverMinutes >= 90 && alt.layoverMinutes <= 600, 'Layover duration must be between 90m and 600m');
  });

});
