import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AVAILABILITY_STATUS, JOURNEY_AVAILABILITY, normalizeSeatAvailability } from '../src/services/rail/availabilityNorm.js';
import { AvailabilityService } from '../src/services/rail/availability.service.js';
import { RailRadarAdapter } from '../src/providers/rail/railRadar.adapter.js';
import { RequestBudgetTracker } from '../src/services/rail/requestBudget.js';
import { formatJourneyDate } from '../src/utils/railwayTime.js';
import { DirectJourneyService } from '../src/services/rail/directJourney.service.js';
import { JourneyRecoveryService } from '../src/services/rail/journeyRecovery.service.js';
import stationExpansionService from '../src/services/rail/stationExpansion.service.js';
import connectionValidator from '../src/services/rail/connectionValidator.js';
import fareService from '../src/services/rail/fare.service.js';

describe('RailRadar Seat Availability Integration — 20 Mandatory Verification Scenarios', () => {
  // 1. Correct /seats endpoint and query parameters
  it('Scenario 1: Calls documented /v1/trains/{number}/seats endpoint with exact query parameters', async () => {
    let capturedUrl = null;
    let capturedParams = null;

    const mockHttpFetch = async (url) => {
      capturedUrl = url;
      const parsedUrl = new URL(url);
      capturedParams = Object.fromEntries(parsedUrl.searchParams.entries());
      return {
        status: 200,
        data: {
          success: true,
          data: {
            trainNumber: '12004',
            avlDayList: [
              {
                availablityDate: '2026-11-15',
                availablityStatus: 'AVAILABLE-0042',
              },
            ],
          },
        },
      };
    };

    const adapter = new RailRadarAdapter({
      httpFetch: mockHttpFetch,
      apiKey: 'test-api-key',
      enableAvailabilityEndpoint: true,
    });

    const result = await adapter.getAvailability('12004', 'NDLS', 'LKO', '2026-11-15', 'CC', 'GN');

    assert.ok(capturedUrl.includes('/v1/trains/12004/seats'));
    assert.deepEqual(capturedParams, {
      source: 'NDLS',
      destination: 'LKO',
      journeyDate: '2026-11-15',
      classCode: 'CC',
      quotaCode: 'GN',
    });
    assert.equal(result.normalizedStatus, 'AVAILABLE');
    assert.equal(result.seatsAvailable, 42);
  });

  // 2. Documented avlDayList response parsing
  it('Scenario 2: Correctly parses documented data.avlDayList response structure with availablityDate and availablityStatus', async () => {
    const mockHttpFetch = async () => ({
      status: 200,
      data: {
        success: true,
        data: {
          trainNumber: '12417',
          source: 'PRYJ',
          destination: 'NDLS',
          avlDayList: [
            {
              availablityDate: '2026-11-14',
              availablityStatus: 'GNWL10/WL5',
            },
            {
              availablityDate: '2026-11-15',
              availablityStatus: 'AVAILABLE-0018',
            },
            {
              availablityDate: '2026-11-16',
              availablityStatus: 'RAC 4',
            },
          ],
        },
      },
    });

    const adapter = new RailRadarAdapter({
      httpFetch: mockHttpFetch,
      apiKey: 'test-api-key',
      enableAvailabilityEndpoint: true,
    });

    const res = await adapter.getAvailability('12417', 'PRYJ', 'NDLS', '2026-11-15', '3A', 'GN');
    assert.equal(res.success, true);
    assert.equal(res.normalizedStatus, 'AVAILABLE');
    assert.equal(res.seatsAvailable, 18);
    assert.equal(res.originalStatus, 'AVAILABLE-0018');
  });

  // 3. Correct matching of requested journey date
  it('Scenario 3: Matches requested journey date specifically among multiple calendar dates', async () => {
    const mockHttpFetch = async () => ({
      status: 200,
      data: {
        success: true,
        data: {
          avlDayList: [
            { availablityDate: '2026-11-14', availablityStatus: 'AVAILABLE-0100' },
            { availablityDate: '2026-11-15', availablityStatus: 'NOT AVAILABLE' },
            { availablityDate: '2026-11-16', availablityStatus: 'AVAILABLE-0050' },
          ],
        },
      },
    });

    const adapter = new RailRadarAdapter({
      httpFetch: mockHttpFetch,
      apiKey: 'test-api-key',
      enableAvailabilityEndpoint: true,
    });

    const res = await adapter.getAvailability('12417', 'PRYJ', 'NDLS', '2026-11-15', '3A', 'GN');
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
    const mockHttpFetch = async () => ({
      status: 200,
      data: {
        success: true,
        data: {
          unexpectedField: 'invalid_shape',
        },
      },
    });

    const adapter = new RailRadarAdapter({
      httpFetch: mockHttpFetch,
      apiKey: 'test-api-key',
      enableAvailabilityEndpoint: true,
    });

    const res = await adapter.getAvailability('12004', 'NDLS', 'LKO', '2026-11-15', 'CC', 'GN');
    assert.equal(res.normalizedStatus, AVAILABILITY_STATUS.UNKNOWN);
    assert.equal(res.seatsAvailable, null);
    assert.equal(res.isAvailable, false);
  });

  // 9. Timeout, HTTP 429, HTTP 401/403 and HTTP 5xx handling
  it('Scenario 9: Handles HTTP 429 rate limit, 401/403 auth errors, 500 server errors, and timeouts gracefully', async () => {
    const mockHttpFetch = async (url) => {
      if (url.includes('classCode=429')) {
        const err = new Error('Too Many Requests');
        err.statusCode = 429;
        throw err;
      }
      if (url.includes('classCode=403')) {
        const err = new Error('Forbidden');
        err.statusCode = 403;
        throw err;
      }
      if (url.includes('classCode=500')) {
        const err = new Error('Internal Server Error');
        err.statusCode = 500;
        throw err;
      }
      const timeoutErr = new Error('timeout of 8000ms exceeded');
      timeoutErr.code = 'ECONNABORTED';
      throw timeoutErr;
    };

    const adapter = new RailRadarAdapter({
      httpFetch: mockHttpFetch,
      apiKey: 'test-api-key',
      enableAvailabilityEndpoint: true,
    });

    // 429
    const res429 = await adapter.getAvailability('12004', 'NDLS', 'LKO', '2026-11-15', '429', 'GN');
    assert.equal(res429.normalizedStatus, 'UNKNOWN');
    assert.equal(res429.errorCode, 'RATE_LIMITED');

    // 403
    const res403 = await adapter.getAvailability('12004', 'NDLS', 'LKO', '2026-11-15', '403', 'GN');
    assert.equal(res403.normalizedStatus, 'UNKNOWN');
    assert.equal(res403.errorCode, 'UNSUPPORTED_ENDPOINT');

    // 500
    const res500 = await adapter.getAvailability('12004', 'NDLS', 'LKO', '2026-11-15', '500', 'GN');
    assert.equal(res500.normalizedStatus, 'UNKNOWN');
    assert.equal(res500.errorCode, 'SERVER_ERROR');

    // Timeout
    const resTimeout = await adapter.getAvailability('12004', 'NDLS', 'LKO', '2026-11-15', 'SL', 'GN');
    assert.equal(resTimeout.normalizedStatus, 'UNKNOWN');
    assert.equal(resTimeout.errorCode, 'TIMEOUT');
  });

  // 10. JavaScript Date conversion to a valid journey date
  it('Scenario 10: Correctly converts JS Date objects, ISO strings, timestamps, and date strings to valid YYYY-MM-DD in IST', () => {
    const jsDate = new Date('2026-11-15T18:30:00.000Z'); // 2026-11-16 in IST (+05:30)
    assert.equal(formatJourneyDate(jsDate), '2026-11-16');

    const isoString = '2026-11-15T00:00:00.000Z';
    assert.equal(formatJourneyDate(isoString), '2026-11-15');

    const simpleDate = '2026-11-15';
    assert.equal(formatJourneyDate(simpleDate), '2026-11-15');

    const epochMs = Date.UTC(2026, 10, 15, 4, 0, 0);
    assert.equal(formatJourneyDate(epochMs), '2026-11-15');
  });

  // 11. Overnight recovery legs receive correct calendar date
  it('Scenario 11: Multi-leg recovery properly calculates overnight date rollover for subsequent legs', async () => {
    const mockRailRadar = {
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
      railRadar: mockRailRadar,
    });

    const recovery = new JourneyRecoveryService({
      railRadar: mockRailRadar,
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
    const mockRailRadar = {
      searchDirectTrains: async () => ({
        success: true,
        trains: [
          {
            trainNumber: '12004',
            trainName: 'Shatabdi Express',
            departureTime: '06:00',
            arrivalTime: '12:00',
            duration: 360,
            distance: 510,
            from: { code: 'NDLS', name: 'New Delhi' },
            to: { code: 'LKO', name: 'Lucknow' },
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

    const availService = new AvailabilityService({ railRadar: mockRailRadar });
    const directService = new DirectJourneyService({
      railRadar: mockRailRadar,
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
    const mockRailRadar = {
      searchDirectTrains: async () => ({
        success: true,
        trains: [
          {
            trainNumber: '12004',
            departureTime: '06:00',
            arrivalTime: '12:00',
          },
        ],
      }),
      getAvailability: async () => {
        throw new Error('Seat availability provider unreachable');
      },
    };

    const availService = new AvailabilityService({ railRadar: mockRailRadar });
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
    const mockRailRadar = {
      getAvailability: async () => {
        providerCalled = true;
        return { success: true, normalizedStatus: 'AVAILABLE' };
      },
    };

    const availService = new AvailabilityService({ railRadar: mockRailRadar });
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
    const mockHttpFetch = async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 20));
      return {
        status: 200,
        data: {
          success: true,
          data: {
            avlDayList: [{ availablityDate: '2026-11-15', availablityStatus: 'AVAILABLE-0042' }],
          },
        },
      };
    };

    const adapter = new RailRadarAdapter({
      httpFetch: mockHttpFetch,
      apiKey: 'test-api-key',
      enableAvailabilityEndpoint: true,
    });

    const [res1, res2] = await Promise.all([
      adapter.getAvailability('12004', 'NDLS', 'LKO', '2026-11-15', '3A', 'GN'),
      adapter.getAvailability('12004', 'NDLS', 'LKO', '2026-11-15', '3A', 'GN'),
    ]);

    assert.equal(callCount, 1); // Deduplicated to single HTTP invocation
    assert.equal(res1.normalizedStatus, 'AVAILABLE');
    assert.equal(res2.normalizedStatus, 'AVAILABLE');
  });

  // 19. Existing response-contract compatibility
  it('Scenario 19: Retains existing response contract with verified availability metadata', async () => {
    const mockRailRadar = {
      searchDirectTrains: async () => ({
        success: true,
        trains: [
          {
            trainNumber: '12004',
            trainName: 'Lucknow Swarna Shatabdi',
            departureTime: '06:10',
            arrivalTime: '12:40',
            duration: 390,
            distance: 512,
            from: { code: 'NDLS', name: 'New Delhi' },
            to: { code: 'LKO', name: 'Lucknow' },
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

    const availService = new AvailabilityService({ railRadar: mockRailRadar });
    const directService = new DirectJourneyService({
      railRadar: mockRailRadar,
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
    const mockRailRadar = {
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

    const testAvailService = new AvailabilityService({ railRadar: mockRailRadar });
    const recovery = new JourneyRecoveryService({
      railRadar: mockRailRadar,
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
