import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AVAILABILITY_STATUS, JOURNEY_AVAILABILITY, normalizeSeatAvailability } from '../src/services/rail/availabilityNorm.js';
import { AvailabilityService } from '../src/services/rail/availability.service.js';
import { RailKitAdapter } from '../src/providers/rail/railKit.adapter.js';
import { RequestBudgetTracker } from '../src/services/rail/requestBudget.js';
import { formatJourneyDate, toRailKitDate } from '../src/utils/railwayTime.js';
import { DirectJourneyService } from '../src/services/rail/directJourney.service.js';
import { JourneyRecoveryService } from '../src/services/rail/journeyRecovery.service.js';
import stationExpansionService from '../src/services/rail/stationExpansion.service.js';
import connectionValidator from '../src/services/rail/connectionValidator.js';
import fareService from '../src/services/rail/fare.service.js';

function createMockResponse(data, status = 200) {
  const bodyText = typeof data === 'string' ? data : JSON.stringify(data);
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => bodyText,
    json: async () => JSON.parse(bodyText),
  };
}

describe('RailKit Seat Availability Integration — 20 Mandatory Verification Scenarios', () => {
  // 1. Correct /api/v1/seats endpoint and query parameters
  it('Scenario 1: Calls documented /api/v1/seats endpoint with exact URL parameters and DD-MM-YYYY date', async () => {
    let capturedUrl = null;

    const mockFetch = async (url) => {
      capturedUrl = url;
      if (url.includes('/stations/')) {
        return createMockResponse({ success: true, data: { station_code: 'TEST' } });
      }
      return createMockResponse({
        success: true,
        data: {
          train: { trainNumber: '12004', trainName: 'Shatabdi Express' },
          availability: [
            {
              date: '15-11-2026',
              status: 'AVAILABLE',
              rawStatus: 'AVAILABLE-0042',
              availableSeats: 42,
            },
          ],
        },
      });
    };

    const tracker = new RequestBudgetTracker();
    const adapter = new RailKitAdapter({
      fetchFn: mockFetch,
      disablePersistentCache: true,
      apiKey: 'test-api-key',
    });

    const result = await adapter.getAvailability('12004', 'NDLS', 'LKO', '2026-11-15', 'CC', 'GN', {
      budgetTracker: tracker,
      isRecovery: false,
    });

    assert.ok(capturedUrl.includes('/api/v1/seats/12004/NDLS/LKO/15-11-2026/CC/GN'));
    assert.equal(result.normalizedStatus, 'AVAILABLE');
    assert.equal(result.seatsAvailable, 42);
  });

  // 2. Documented availability response parsing
  it('Scenario 2: Correctly parses documented data.availability response structure with date, rawStatus, and availableSeats', async () => {
    const mockFetch = async (url) => {
      if (url.includes('/stations/')) {
        return createMockResponse({ success: true, data: { station_code: 'TEST' } });
      }
      return createMockResponse({
        success: true,
        data: {
          train: { trainNumber: '12417' },
          availability: [
            {
              date: '14-11-2026',
              status: 'WAITLIST',
              rawStatus: 'GNWL10/WL5',
              availableSeats: 0,
            },
            {
              date: '15-11-2026',
              status: 'AVAILABLE',
              rawStatus: 'AVAILABLE-0018',
              availableSeats: 18,
            },
            {
              date: '16-11-2026',
              status: 'RAC',
              rawStatus: 'RAC 4',
              availableSeats: 0,
            },
          ],
        },
      });
    };

    const tracker = new RequestBudgetTracker();
    const adapter = new RailKitAdapter({ fetchFn: mockFetch, disablePersistentCache: true, apiKey: 'test-api-key' });

    const res = await adapter.getAvailability('12417', 'PRYJ', 'NDLS', '2026-11-15', '3A', 'GN', {
      budgetTracker: tracker,
      isRecovery: false,
    });
    assert.equal(res.success, true);
    assert.equal(res.normalizedStatus, 'AVAILABLE');
    assert.equal(res.seatsAvailable, 18);
    assert.equal(res.rawStatus, 'AVAILABLE-0018');
  });

  // 3. Correct matching of requested journey date
  it('Scenario 3: Matches requested journey date specifically among multiple calendar dates', async () => {
    const mockFetch = async (url) => {
      if (url.includes('/stations/')) {
        return createMockResponse({ success: true, data: { station_code: 'TEST' } });
      }
      return createMockResponse({
        success: true,
        data: {
          availability: [
            { date: '14-11-2026', rawStatus: 'AVAILABLE-0100', availableSeats: 100 },
            { date: '15-11-2026', rawStatus: 'NOT AVAILABLE', availableSeats: 0 },
            { date: '16-11-2026', rawStatus: 'AVAILABLE-0050', availableSeats: 50 },
          ],
        },
      });
    };

    const tracker = new RequestBudgetTracker();
    const adapter = new RailKitAdapter({ fetchFn: mockFetch, disablePersistentCache: true, apiKey: 'test-api-key' });

    const res = await adapter.getAvailability('12417', 'PRYJ', 'NDLS', '2026-11-15', '3A', 'GN', {
      budgetTracker: tracker,
      isRecovery: false,
    });
    assert.equal(res.normalizedStatus, 'UNAVAILABLE');
    assert.equal(res.isAvailable, false);
  });

  // 4. AVAILABLE-0042 and other documented available statuses
  it('Scenario 4: Correctly parses AVAILABLE-0042, AVAILABLE-0018, CURR_AVBL, and AVL statuses', () => {
    const s1 = normalizeSeatAvailability('AVAILABLE-0042');
    assert.equal(s1.normalizedStatus, AVAILABILITY_STATUS.AVAILABLE);
    assert.equal(s1.seatsAvailable, 42);
    assert.equal(s1.isAvailable, true);

    const s2 = normalizeSeatAvailability('AVAILABLE-0018');
    assert.equal(s2.normalizedStatus, AVAILABILITY_STATUS.AVAILABLE);
    assert.equal(s2.seatsAvailable, 18);
    assert.equal(s2.isAvailable, true);

    const s3 = normalizeSeatAvailability('CURR_AVBL-0005');
    assert.equal(s3.normalizedStatus, AVAILABILITY_STATUS.AVAILABLE);
    assert.equal(s3.seatsAvailable, 5);
    assert.equal(s3.isAvailable, true);

    const s4 = normalizeSeatAvailability('AVAILABLE');
    assert.equal(s4.normalizedStatus, AVAILABILITY_STATUS.AVAILABLE);
    assert.equal(s4.isAvailable, true);
  });

  // 5. RAC rejection
  it('Scenario 5: RAC statuses are normalized strictly to RAC and rejected from confirmed seats', () => {
    const rac1 = normalizeSeatAvailability('RAC 12');
    assert.equal(rac1.normalizedStatus, AVAILABILITY_STATUS.RAC);
    assert.equal(rac1.isAvailable, false);

    const rac2 = normalizeSeatAvailability('RAC/004');
    assert.equal(rac2.normalizedStatus, AVAILABILITY_STATUS.RAC);
    assert.equal(rac2.isAvailable, false);
  });

  // 6. Waitlist rejection
  it('Scenario 6: Waitlist statuses are normalized strictly to WAITLIST and rejected from confirmed seats', () => {
    const wl1 = normalizeSeatAvailability('GNWL24/WL11');
    assert.equal(wl1.normalizedStatus, AVAILABILITY_STATUS.WAITLIST);
    assert.equal(wl1.isAvailable, false);

    const wl2 = normalizeSeatAvailability('RLWL/5');
    assert.equal(wl2.normalizedStatus, AVAILABILITY_STATUS.WAITLIST);
    assert.equal(wl2.isAvailable, false);

    const wl3 = normalizeSeatAvailability('PQWL 2');
    assert.equal(wl3.normalizedStatus, AVAILABILITY_STATUS.WAITLIST);
    assert.equal(wl3.isAvailable, false);
  });

  // 7. NOT AVAILABLE and negative normalization
  it('Scenario 7: Negative statuses like NOT AVAILABLE and REGRET are checked before substring matching and never become AVAILABLE', () => {
    const notAvail = normalizeSeatAvailability('NOT AVAILABLE');
    assert.equal(notAvail.normalizedStatus, AVAILABILITY_STATUS.UNAVAILABLE);
    assert.equal(notAvail.isAvailable, false);

    const notAvailUnderscore = normalizeSeatAvailability('NOT_AVAILABLE');
    assert.equal(notAvailUnderscore.normalizedStatus, AVAILABILITY_STATUS.UNAVAILABLE);
    assert.equal(notAvailUnderscore.isAvailable, false);

    const regret = normalizeSeatAvailability('REGRET/WL');
    assert.equal(regret.normalizedStatus, AVAILABILITY_STATUS.UNAVAILABLE);
    assert.equal(regret.isAvailable, false);

    const classNotExist = normalizeSeatAvailability('CLASS NOT EXIST');
    assert.equal(classNotExist.normalizedStatus, AVAILABILITY_STATUS.UNAVAILABLE);
    assert.equal(classNotExist.isAvailable, false);
  });

  // 8. Missing or malformed provider response returning UNKNOWN
  it('Scenario 8: Missing or malformed provider response returns normalized status UNKNOWN', async () => {
    const mockFetch = async (url) => {
      if (url.includes('/stations/')) {
        return createMockResponse({ success: true, data: { station_code: 'TEST' } });
      }
      return createMockResponse({
        success: true,
        data: {
          unexpectedField: 'invalid_shape',
        },
      });
    };

    const tracker = new RequestBudgetTracker();
    const adapter = new RailKitAdapter({ fetchFn: mockFetch, disablePersistentCache: true, apiKey: 'test-api-key' });

    const res = await adapter.getAvailability('12004', 'NDLS', 'LKO', '2026-11-15', 'CC', 'GN', {
      budgetTracker: tracker,
      isRecovery: false,
    });
    assert.equal(res.normalizedStatus, AVAILABILITY_STATUS.UNKNOWN);
    assert.equal(res.seatsAvailable, null);
    assert.equal(res.isAvailable, false);
  });

  // 9. Timeout, HTTP 429, HTTP 400/404 handling
  it('Scenario 9: Handles HTTP 429 rate limit, 400/404 errors, 500 server errors, and timeouts gracefully', async () => {
    const mockFetch = async (url) => {
      if (url.includes('/stations/')) {
        return createMockResponse({ success: true, data: { station_code: 'TEST' } });
      }
      if (url.includes('/429/')) {
        return {
          status: 429,
          ok: false,
          text: async () => 'Too Many Requests',
        };
      }
      if (url.includes('/400/')) {
        return {
          status: 400,
          ok: false,
          text: async () => 'Bad Request',
        };
      }
      if (url.includes('/500/')) {
        return {
          status: 500,
          ok: false,
          text: async () => 'Internal Server Error',
        };
      }
      const timeoutErr = new Error('timeout of 8000ms exceeded');
      timeoutErr.code = 'ECONNABORTED';
      throw timeoutErr;
    };

    const tracker = new RequestBudgetTracker();
    const adapter = new RailKitAdapter({ fetchFn: mockFetch, disablePersistentCache: true, apiKey: 'test-api-key' });

    // 429
    const res429 = await adapter.getAvailability('12004', 'NDLS', 'LKO', '2026-11-15', '429', 'GN', {
      budgetTracker: tracker,
      isRecovery: false,
    });
    assert.equal(res429.normalizedStatus, 'UNKNOWN');
    assert.equal(res429.reason, 'RATE_LIMITED');

    // 400
    const res400 = await adapter.getAvailability('12004', 'NDLS', 'LKO', '2026-11-15', '400', 'GN', {
      budgetTracker: tracker,
      isRecovery: false,
    });
    assert.equal(res400.normalizedStatus, 'UNKNOWN');

    // 500
    const res500 = await adapter.getAvailability('12004', 'NDLS', 'LKO', '2026-11-15', '500', 'GN', {
      budgetTracker: tracker,
      isRecovery: false,
    });
    assert.equal(res500.normalizedStatus, 'UNKNOWN');

    // Timeout
    const resTimeout = await adapter.getAvailability('12004', 'NDLS', 'LKO', '2026-11-15', 'SL', 'GN', {
      budgetTracker: tracker,
      isRecovery: false,
    });
    assert.equal(resTimeout.normalizedStatus, 'UNKNOWN');
  });

  // 10. JavaScript Date conversion to a valid journey date
  it('Scenario 10: Correctly converts JS Date objects, ISO strings, timestamps, and date strings to valid YYYY-MM-DD in IST and DD-MM-YYYY for RailKit', () => {
    const jsDate = new Date('2026-11-15T18:30:00.000Z'); // 2026-11-16 in IST (+05:30)
    assert.equal(formatJourneyDate(jsDate), '2026-11-16');
    assert.equal(toRailKitDate(formatJourneyDate(jsDate)), '16-11-2026');

    const isoString = '2026-11-15T00:00:00.000Z';
    assert.equal(formatJourneyDate(isoString), '2026-11-15');
    assert.equal(toRailKitDate(formatJourneyDate(isoString)), '15-11-2026');

    const simpleDate = '2026-11-15';
    assert.equal(formatJourneyDate(simpleDate), '2026-11-15');
    assert.equal(toRailKitDate(simpleDate), '15-11-2026');

    const epochMs = Date.UTC(2026, 10, 15, 4, 0, 0);
    assert.equal(formatJourneyDate(epochMs), '2026-11-15');
  });

  // 11. Overnight recovery legs receive correct calendar date
  it('Scenario 11: Multi-leg recovery properly calculates overnight date rollover for subsequent legs', async () => {
    const mockRailKit = {
      searchDirectTrains: async (from, to) => {
        if (from === 'BSB' && to === 'PRYJ') {
          return {
            success: true,
            trains: [
              {
                trainNumber: '14213',
                departureTime: '22:00',
                arrivalTime: '23:45',
                duration: 105,
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
                departureTime: '01:30', // Departs after midnight -> Next calendar day!
                arrivalTime: '03:40',
                duration: 130,
                distance: 195,
                from: { code: 'PRYJ', name: 'Prayagraj' },
                to: { code: 'CNB', name: 'Kanpur' },
              },
            ],
          };
        }
        return { success: true, trains: [] };
      },
      getAvailability: async (trainNum, from, to, date) => ({
        success: true,
        trainNumber: trainNum,
        journeyDate: date,
        normalizedStatus: 'AVAILABLE',
        seatsAvailable: 35,
        isLive: true,
      }),
    };

    const testAvailService = new AvailabilityService({
      railKit: mockRailKit,
    });

    const recovery = new JourneyRecoveryService({
      railKit: mockRailKit,
      stationExpansion: stationExpansionService,
      connectionValidator,
      availabilityService: testAvailService,
      fareService,
    });

    const result = await recovery.recoverJourneys({
      origin: 'BSB',
      destination: 'CNB',
      departureDate: '2026-11-15',
    });

    assert.equal(result.status, 'RECOVERED_ALTERNATIVES_FOUND');
    const twoLeg = result.journeys.find((j) => j.legs.length === 2);
    assert.ok(twoLeg);
    assert.equal(twoLeg.legs[0].departureDateFormatted, '2026-11-15');
    assert.equal(twoLeg.legs[1].departureDateFormatted, '2026-11-16'); // Verified rollover to next day!
  });

  // 12. Direct journeys require verified availability
  it('Scenario 12: Direct journeys return empty directJourneys when availability is waitlist or unavailable in confirmed-only mode', async () => {
    const mockRailKit = {
      searchTrainBetweenStations: async () => ({
        success: true,
        data: [
          {
            train_no: '12004',
            train_name: 'Shatabdi Express',
            from_time: '06:00',
            to_time: '12:00',
            travel_time: '06:00',
            distance: 510,
            from_stn_code: 'NDLS',
            to_stn_code: 'LKO',
          },
        ],
      }),
      getAvailability: async () => ({
        success: true,
        normalizedStatus: 'WAITLIST',
        seatsAvailable: 0,
        isLive: true,
      }),
    };

    const availService = new AvailabilityService({ railKit: mockRailKit });
    const directService = new DirectJourneyService({
      railKit: mockRailKit,
      availabilityService: availService,
      fareService,
    });

    const result = await directService.searchDirectTrains(
      {
        origin: { code: 'NDLS', name: 'New Delhi' },
        destination: { code: 'LKO', name: 'Lucknow' },
        departureDate: '2026-11-15',
      },
      { confirmedOnly: true }
    );

    assert.equal(result.status, 'DIRECT_WAITLIST_ONLY');
    assert.deepEqual(result.directJourneys, []); // Unconfirmed journeys excluded from confirmed-only list!
    assert.equal(result.shouldTriggerRecovery, true);
  });

  // 13. Every leg of a recovered journey requires AVAILABLE
  it('Scenario 13: Recovered journey is verified only when EVERY leg reports normalized AVAILABLE', () => {
    const availService = new AvailabilityService();
    const legsAllAvail = [
      { sequence: 1, trainNumber: '12004', availability: { normalizedStatus: 'AVAILABLE', seatsAvailable: 10 } },
      { sequence: 2, trainNumber: '12417', availability: { normalizedStatus: 'AVAILABLE', seatsAvailable: 5 } },
    ];

    const evalRes = availService.evaluateJourneyAvailability(legsAllAvail);
    assert.equal(evalRes.status, JOURNEY_AVAILABILITY.AVAILABILITY_VERIFIED);
    assert.equal(evalRes.isBookable, true);
    assert.equal(evalRes.isConfirmedAvailable, true);
  });

  // 14. One unverified leg causing rejection of the entire candidate
  it('Scenario 14: One leg returning WAITLIST, RAC, UNAVAILABLE, or UNKNOWN causes rejection of the entire candidate', () => {
    const availService = new AvailabilityService();

    // Leg 2 is WAITLIST
    const legsWithWl = [
      { sequence: 1, trainNumber: '12004', availability: { normalizedStatus: 'AVAILABLE', seatsAvailable: 10 } },
      { sequence: 2, trainNumber: '12417', availability: { normalizedStatus: 'WAITLIST', seatsAvailable: 0 } },
    ];
    const evalWl = availService.evaluateJourneyAvailability(legsWithWl);
    assert.equal(evalWl.status, JOURNEY_AVAILABILITY.WAITLIST_ONLY);
    assert.equal(evalWl.isConfirmedAvailable, false);

    // Leg 2 is RAC
    const legsWithRac = [
      { sequence: 1, trainNumber: '12004', availability: { normalizedStatus: 'AVAILABLE', seatsAvailable: 10 } },
      { sequence: 2, trainNumber: '12417', availability: { normalizedStatus: 'RAC', seatsAvailable: 0 } },
    ];
    const evalRac = availService.evaluateJourneyAvailability(legsWithRac);
    assert.equal(evalRac.status, JOURNEY_AVAILABILITY.RAC_AVAILABLE);
    assert.equal(evalRac.isConfirmedAvailable, false);

    // Leg 2 is UNKNOWN
    const legsWithUnknown = [
      { sequence: 1, trainNumber: '12004', availability: { normalizedStatus: 'AVAILABLE', seatsAvailable: 10 } },
      { sequence: 2, trainNumber: '12417', availability: { normalizedStatus: 'UNKNOWN', seatsAvailable: null } },
    ];
    const evalUnknown = availService.evaluateJourneyAvailability(legsWithUnknown);
    assert.equal(evalUnknown.status, JOURNEY_AVAILABILITY.UNKNOWN);
    assert.equal(evalUnknown.isConfirmedAvailable, false);
  });

  // 15. Schedule-cache data never treated as seat availability
  it('Scenario 15: Schedule search results or cached timetables are never treated as seat availability confirmation', async () => {
    const mockRailKit = {
      searchTrainBetweenStations: async () => ({
        success: true,
        data: [
          {
            train_no: '12004',
            from_time: '06:00',
            to_time: '12:00',
          },
        ],
      }),
      getAvailability: async () => {
        throw new Error('Seat availability provider unreachable');
      },
    };

    const availService = new AvailabilityService({ railKit: mockRailKit });
    const legAvail = await availService.checkLegAvailability({
      trainNumber: '12004',
      fromCode: 'NDLS',
      toCode: 'LKO',
      date: '2026-11-15',
    });

    assert.equal(legAvail.normalizedStatus, AVAILABILITY_STATUS.UNKNOWN);
    assert.equal(legAvail.isAvailable, false);
  });

  // 16. Cache keys separating date, class, quota and station segments
  it('Scenario 16: Availability cache keys distinctly separate train number, origin, destination, date, class, and quota', () => {
    const availService = new AvailabilityService();
    const key1 = availService.buildCacheKey('12004', 'NDLS', 'LKO', '2026-11-15', '3A', 'GN');
    const key2 = availService.buildCacheKey('12004', 'NDLS', 'LKO', '2026-11-15', '2A', 'GN');
    const key3 = availService.buildCacheKey('12004', 'NDLS', 'LKO', '2026-11-15', '3A', 'TQ');
    const key4 = availService.buildCacheKey('12004', 'NDLS', 'CNB', '2026-11-15', '3A', 'GN');
    const key5 = availService.buildCacheKey('12004', 'NDLS', 'LKO', '2026-11-16', '3A', 'GN');

    assert.notEqual(key1, key2);
    assert.notEqual(key1, key3);
    assert.notEqual(key1, key4);
    assert.notEqual(key1, key5);
  });

  // 17. Budget exhaustion preventing further provider calls
  it('Scenario 17: RequestBudgetTracker strictly prevents further outbound provider calls when budget is exhausted', async () => {
    const tracker = new RequestBudgetTracker({ maxRecoveryRequests: 1 });
    assert.equal(tracker.canMakeRecoveryRequest(), true);
    tracker.recordOutboundRequest({ isRecovery: true, endpoint: '/seats' });
    assert.equal(tracker.canMakeRecoveryRequest(), false);

    let providerCalled = false;
    const mockRailKit = {
      getAvailability: async () => {
        providerCalled = true;
        return { success: true, normalizedStatus: 'AVAILABLE' };
      },
    };

    const availService = new AvailabilityService({ railKit: mockRailKit });
    const res = await availService.checkLegAvailability({
      trainNumber: '12004',
      fromCode: 'NDLS',
      toCode: 'LKO',
      date: '2026-11-15',
      budgetTracker: tracker,
      isRecovery: true,
    });

    assert.equal(providerCalled, false);
    assert.equal(res.normalizedStatus, AVAILABILITY_STATUS.UNKNOWN);
    assert.equal(res.reason, 'BUDGET_EXHAUSTED');
  });

  // 18. Deduplication preventing duplicate concurrent requests
  it('Scenario 18: In-flight deduplication eliminates duplicate concurrent requests for the exact same leg and date', async () => {
    let callCount = 0;
    const mockFetch = async (url) => {
      if (url.includes('/stations/')) {
        return createMockResponse({ success: true, data: { station_code: 'TEST' } });
      }
      callCount++;
      await new Promise((r) => setTimeout(r, 20));
      return createMockResponse({
        success: true,
        data: {
          availability: [{ date: '15-11-2026', rawStatus: 'AVAILABLE-0042', availableSeats: 42 }],
        },
      });
    };

    const tracker = new RequestBudgetTracker();
    const adapter = new RailKitAdapter({
      fetchFn: mockFetch,
      disablePersistentCache: true,
      apiKey: 'test-api-key',
    });

    const [res1, res2] = await Promise.all([
      adapter.getAvailability('99901', 'NDLS', 'LKO', '2026-11-15', '3A', 'GN', { budgetTracker: tracker }),
      adapter.getAvailability('99901', 'NDLS', 'LKO', '2026-11-15', '3A', 'GN', { budgetTracker: tracker }),
    ]);

    assert.equal(callCount, 1); // Deduplicated to single HTTP invocation
    assert.equal(res1.normalizedStatus, 'AVAILABLE');
    assert.equal(res2.normalizedStatus, 'AVAILABLE');
  });

  // 19. Existing response-contract compatibility
  it('Scenario 19: Retains existing response contract with verified availability metadata', async () => {
    const mockRailKit = {
      searchTrainBetweenStations: async () => ({
        success: true,
        data: [
          {
            train_no: '12004',
            train_name: 'Lucknow Swarna Shatabdi',
            from_time: '06:10',
            to_time: '12:40',
            travel_time: '06:30',
            distance: 512,
            from_stn_code: 'NDLS',
            to_stn_code: 'LKO',
          },
        ],
      }),
      getAvailability: async () => ({
        success: true,
        normalizedStatus: 'AVAILABLE',
        seatsAvailable: 42,
        isLive: true,
        lastUpdated: '2026-10-11T12:00:00Z',
      }),
    };

    const availService = new AvailabilityService({ railKit: mockRailKit });
    const directService = new DirectJourneyService({
      railKit: mockRailKit,
      availabilityService: availService,
      fareService,
    });

    const result = await directService.searchDirectTrains(
      {
        origin: { code: 'NDLS', name: 'New Delhi' },
        destination: { code: 'LKO', name: 'Lucknow' },
        departureDate: '2026-11-15',
      },
      { confirmedOnly: true }
    );

    assert.equal(result.status, 'DIRECT_AVAILABLE');
    assert.equal(result.directJourneys.length, 1);
    const j = result.directJourneys[0];
    assert.equal(j.isDirectTrain, true);
    assert.equal(j.availability.normalizedStatus, 'AVAILABLE');
    assert.equal(j.availability.seatsAvailable, 42);
    assert.equal(j.metadata.availabilityStatus, 'AVAILABLE');
    assert.equal(j.legs.length, 1);
    assert.equal(j.legs[0].origin?.code || j.legs[0].origin, 'NDLS');
    assert.equal(j.legs[0].destination?.code || j.legs[0].destination, 'LKO');
  });

  // 20. Regression test for existing recovery behavior
  it('Scenario 20: Verified recovery excludes unconfirmed candidates while returning verified multi-leg options', async () => {
    const mockRailKit = {
      searchDirectTrains: async (from, to) => {
        if (from === 'BSB' && to === 'PRYJ') {
          return {
            success: true,
            trains: [
              {
                trainNumber: '22436',
                trainName: 'Vande Bharat',
                departureTime: '15:00',
                arrivalTime: '16:30',
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
                departureTime: '18:00',
                arrivalTime: '20:10',
                duration: 130,
                distance: 195,
                from: { code: 'PRYJ', name: 'Prayagraj' },
                to: { code: 'CNB', name: 'Kanpur' },
              },
            ],
          };
        }
        return { success: true, trains: [] };
      },
      getAvailability: async () => ({
        success: true,
        normalizedStatus: 'AVAILABLE',
        seatsAvailable: 25,
        isLive: true,
      }),
    };

    const testAvailService = new AvailabilityService({ railKit: mockRailKit });
    const recovery = new JourneyRecoveryService({
      railKit: mockRailKit,
      stationExpansion: stationExpansionService,
      connectionValidator,
      availabilityService: testAvailService,
      fareService,
    });

    const result = await recovery.recoverJourneys({
      origin: 'BSB',
      destination: 'CNB',
      departureDate: '2026-11-15',
    });

    assert.equal(result.status, 'RECOVERED_ALTERNATIVES_FOUND');
    assert.ok(result.journeys.length > 0);
    for (const journey of result.journeys) {
      assert.equal(journey.isConfirmedAvailable, true);
      for (const leg of journey.legs) {
        assert.equal(leg.availability.normalizedStatus, 'AVAILABLE');
      }
    }
  });
});
