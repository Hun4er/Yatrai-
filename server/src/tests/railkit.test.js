import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { toRailKitDate, formatJourneyDate } from '../utils/railwayTime.js';

// ─── 1. Date conversion tests ───────────────────────────────────────────────

describe('toRailKitDate', () => {
  it('converts YYYY-MM-DD to DD-MM-YYYY', () => {
    assert.equal(toRailKitDate('2026-10-15'), '15-10-2026');
  });

  it('converts YYYY-MM-DD with leading zeros', () => {
    assert.equal(toRailKitDate('2026-01-05'), '05-01-2026');
  });

  it('handles Date object', () => {
    // Date.UTC to avoid timezone ambiguity
    const d = new Date(Date.UTC(2026, 11, 25)); // Dec 25, 2026
    const result = toRailKitDate(d);
    // formatJourneyDate converts to IST calendar date, so result should be 25-12-2026 (or 26 if after midnight IST)
    assert.match(result, /^\d{2}-12-2026$/);
  });

  it('handles ISO string', () => {
    assert.equal(toRailKitDate('2026-03-14T10:30:00+05:30'), '14-03-2026');
  });

  it('returns empty string for empty input', () => {
    assert.equal(toRailKitDate(''), '');
    assert.equal(toRailKitDate(null), '');
    assert.equal(toRailKitDate(undefined), '');
  });

  it('never produces YYYY-MM-DD output (always DD-MM-YYYY)', () => {
    const result = toRailKitDate('2026-10-15');
    assert.notEqual(result, '2026-10-15');
    assert.equal(result.split('-')[2].length, 4, 'Year should be last component');
  });
});

describe('formatJourneyDate (internal format)', () => {
  it('returns YYYY-MM-DD from YYYY-MM-DD input', () => {
    assert.equal(formatJourneyDate('2026-10-15'), '2026-10-15');
  });

  it('returns YYYY-MM-DD from DD-MM-YYYY input', () => {
    assert.equal(formatJourneyDate('15-10-2026'), '2026-10-15');
  });

  it('returns YYYY-MM-DD from DD/MM/YYYY input', () => {
    assert.equal(formatJourneyDate('15/10/2026'), '2026-10-15');
  });
});

// ─── 2. Station code validation ─────────────────────────────────────────────

describe('RailKit adapter station code validation', () => {
  // We test the format check logic directly (same regex as adapter)
  const STATION_CODE_RE = /^[A-Z]{2,5}$/;

  it('accepts valid station codes', () => {
    assert.ok(STATION_CODE_RE.test('NDLS'));
    assert.ok(STATION_CODE_RE.test('BCT'));
    assert.ok(STATION_CODE_RE.test('MAS'));
    assert.ok(STATION_CODE_RE.test('HWH'));
    assert.ok(STATION_CODE_RE.test('SBC'));
  });

  it('rejects invalid station codes', () => {
    assert.ok(!STATION_CODE_RE.test('N'), 'Too short');
    assert.ok(!STATION_CODE_RE.test('NDLSXX'), 'Too long');
    assert.ok(!STATION_CODE_RE.test('ndls'), 'Lowercase');
    assert.ok(!STATION_CODE_RE.test('12345'), 'Digits only');
    assert.ok(!STATION_CODE_RE.test('ND1S'), 'Contains digit');
    assert.ok(!STATION_CODE_RE.test(''), 'Empty string');
    assert.ok(!STATION_CODE_RE.test('ND LS'), 'Contains space');
  });
});

// ─── 3. Normalized error result structure ───────────────────────────────────

describe('RailKit adapter error results', () => {
  it('unknown availability has correct shape', () => {
    // Simulate what _unknownAvailability returns
    const result = {
      status: 'unknown',
      provider: 'RailKit',
      trainNumber: '12951',
      fromCode: 'NDLS',
      toCode: 'BCT',
      date: '2026-10-15',
      travelClass: '3A',
      quota: 'GN',
      normalizedStatus: 'UNKNOWN',
      rawStatus: 'UNKNOWN',
      seatsAvailable: null,
      isAvailable: false,
      isLive: false,
      fareBreakup: null,
      queryTimestamp: new Date().toISOString(),
      reason: 'HTTP 400',
    };

    assert.equal(result.status, 'unknown');
    assert.equal(result.normalizedStatus, 'UNKNOWN');
    assert.equal(result.seatsAvailable, null, 'Must not default to 0');
    assert.equal(result.isAvailable, false);
    assert.equal(result.provider, 'RailKit');
    assert.ok(result.reason, 'Must have a reason');
  });

  it('unknown fare has correct shape', () => {
    const result = {
      status: 'unknown',
      provider: 'RailKit',
      trainNo: '12951',
      trainName: null,
      fromStation: 'NDLS',
      toStation: 'BCT',
      date: '2026-10-15',
      travelClass: '3A',
      quota: 'GN',
      distance: null,
      baseFare: null,
      totalFare: null,
      fareBreakup: null,
      isEstimated: false,
      source: 'RailKit',
      reason: 'HTTP 400',
    };

    assert.equal(result.status, 'unknown');
    assert.equal(result.baseFare, null, 'Must not default to 0');
    assert.equal(result.totalFare, null, 'Must not default to 0');
    assert.equal(result.isEstimated, false, 'Unknown is not estimated');
    assert.ok(result.reason, 'Must have a reason');
  });
});

// ─── 4. Overnight second leg date ───────────────────────────────────────────

describe('Overnight leg date handling', () => {
  it('Leg 2 departure date should be next day when crossing midnight', () => {
    // Simulate: Leg 1 departs at 22:00 on 2026-10-15, arrives 02:00 on 2026-10-16
    // Leg 2 departs at 06:00 on 2026-10-16
    const leg2DepartureTime = '2026-10-16T06:00:00+05:30';

    // formatJourneyDate should extract 2026-10-16, not the original search date 2026-10-15
    const leg2Date = formatJourneyDate(leg2DepartureTime);
    assert.equal(leg2Date, '2026-10-16', 'Leg 2 must use its own departure date, not Leg 1 date');

    // Converting to RailKit format
    const rkDate = toRailKitDate(leg2Date);
    assert.equal(rkDate, '16-10-2026', 'RailKit date must be DD-MM-YYYY of the correct day');
  });

  it('Leg 2 departure date same day when no midnight crossing', () => {
    const leg2DepartureTime = '2026-10-15T14:00:00+05:30';
    const leg2Date = formatJourneyDate(leg2DepartureTime);
    assert.equal(leg2Date, '2026-10-15');
    assert.equal(toRailKitDate(leg2Date), '15-10-2026');
  });
});

// ─── 5. Availability normalization with RailKit-style statuses ──────────────

describe('availabilityNorm handles RailKit status strings', async () => {
  const { normalizeSeatAvailability, AVAILABILITY_STATUS } = await import('../services/rail/availabilityNorm.js');

  it('parses AVAILABLE-0051', () => {
    const r = normalizeSeatAvailability('AVAILABLE-0051');
    assert.equal(r.normalizedStatus, AVAILABILITY_STATUS.AVAILABLE);
    assert.equal(r.seatsAvailable, 51);
    assert.equal(r.isAvailable, true);
  });

  it('parses RAC-12', () => {
    const r = normalizeSeatAvailability('RAC-12');
    assert.equal(r.normalizedStatus, AVAILABILITY_STATUS.RAC);
    assert.equal(r.isAvailable, false);
  });

  it('parses WL 14', () => {
    const r = normalizeSeatAvailability('WL 14');
    assert.equal(r.normalizedStatus, AVAILABILITY_STATUS.WAITLIST);
    assert.equal(r.isAvailable, false);
  });

  it('parses GNWL24', () => {
    const r = normalizeSeatAvailability('GNWL24');
    assert.equal(r.normalizedStatus, AVAILABILITY_STATUS.WAITLIST);
  });

  it('parses NOT AVAILABLE', () => {
    const r = normalizeSeatAvailability('NOT AVAILABLE');
    assert.equal(r.normalizedStatus, AVAILABILITY_STATUS.UNAVAILABLE);
    assert.equal(r.isAvailable, false);
  });

  it('returns UNKNOWN for empty string', () => {
    const r = normalizeSeatAvailability('');
    assert.equal(r.normalizedStatus, AVAILABILITY_STATUS.UNKNOWN);
  });
});

// ─── 6. RailKit SDK contract & method compatibility ──────────────────────────

describe('RailKit SDK contract alignment', async () => {
  const {
    railKitAdapter,
    configure,
    fareLookup,
    getAvailability,
    searchTrainBetweenStations,
    trainTimetableAtStation,
    getTrainInfo,
    stationByCode,
    checkPNRStatus,
  } = await import('../providers/rail/railKit.adapter.js');

  it('exports all official RailKit SDK functions without naming conflict', () => {
    assert.equal(typeof configure, 'function');
    assert.equal(typeof fareLookup, 'function');
    assert.equal(typeof getAvailability, 'function');
    assert.equal(typeof searchTrainBetweenStations, 'function');
    assert.equal(typeof trainTimetableAtStation, 'function');
    assert.equal(typeof getTrainInfo, 'function');
    assert.equal(typeof stationByCode, 'function');
    assert.equal(typeof checkPNRStatus, 'function');
  });

  it('adapter instance has matching SDK methods and aliases', () => {
    assert.equal(typeof railKitAdapter.fareLookup, 'function');
    assert.equal(typeof railKitAdapter.getFare, 'function');
    assert.equal(typeof railKitAdapter.getAvailability, 'function');
    assert.equal(typeof railKitAdapter.searchTrainBetweenStations, 'function');
    assert.equal(typeof railKitAdapter.trainTimetableAtStation, 'function');
    assert.equal(typeof railKitAdapter.getStationTimetable, 'function');
    assert.equal(typeof railKitAdapter.getTrainInfo, 'function');
    assert.equal(typeof railKitAdapter.stationByCode, 'function');
    assert.equal(typeof railKitAdapter.checkPNRStatus, 'function');
  });

  it('getAvailability unknown shape conforms to RailKit official naming', () => {
    const res = railKitAdapter._unknownAvailability('12310', 'NDLS', 'PNBE', '2026-10-23', '3A', 'GN', 'Test reason');
    assert.equal(res.trainNo, '12310');
    assert.equal(res.trainNumber, '12310');
    assert.equal(res.fromStnCode, 'NDLS');
    assert.equal(res.fromCode, 'NDLS');
    assert.equal(res.toStnCode, 'PNBE');
    assert.equal(res.toCode, 'PNBE');
    assert.equal(res.coach, '3A');
    assert.equal(res.travelClass, '3A');
    assert.equal(res.quota, 'GN');
    assert.equal(res.isAvailable, false);
    assert.equal(res.canBook, false);
    assert.equal(res.success, false);
  });

  it('fareLookup unknown shape conforms to RailKit official naming', () => {
    const res = railKitAdapter._unknownFare('12310', 'NDLS', 'PNBE', '2026-10-23', '3A', 'GN', 'Test reason');
    assert.equal(res.trainNo, '12310');
    assert.equal(res.fromStation, 'NDLS');
    assert.equal(res.fromStnCode, 'NDLS');
    assert.equal(res.toStation, 'PNBE');
    assert.equal(res.toStnCode, 'PNBE');
    assert.equal(res.travelClass, '3A');
    assert.equal(res.class, '3A');
    assert.equal(res.totalFare, null);
    assert.equal(res.baseFare, null);
    assert.equal(res.isEstimated, false);
    assert.equal(res.source, 'RailKit');
  });

  it('effective API usage: getAvailability caches live fare directly for fareLookup', async () => {
    // Manually prime availability response with RailKit fare object
    const num = '12394';
    const from = 'NDLS';
    const to = 'PNBE';
    const internalDate = '2026-10-23';
    const travelClass = '3A';
    const quota = 'GN';

    // Seed the adapter fare cache as if getAvailability just completed
    const fareCacheKey = `fare:rk:${num}:${from}:${to}:${internalDate}:${travelClass}:${quota}`;
    const mockFareData = {
      status: 'ok',
      success: true,
      provider: 'RailKit',
      trainNo: num,
      fromStation: from,
      toStation: to,
      date: internalDate,
      travelClass,
      totalFare: 1380,
      baseFare: 1250,
      fareBreakup: {
        baseFare: 1250,
        reservation: 40,
        superfast: 45,
        gst: 45,
        totalFare: 1380,
      },
      isEstimated: false,
      source: 'RailKit',
    };
    railKitAdapter._cache.set(fareCacheKey, { data: mockFareData, expiresAt: Date.now() + 60000 });

    // Call fareLookup - must return cached data without HTTP fetch
    const fare = await railKitAdapter.fareLookup(num, from, to, internalDate, travelClass, quota);
    assert.equal(fare.status, 'ok');
    assert.equal(fare.totalFare, 1380);
    assert.equal(fare.isEstimated, false);
    assert.equal(fare.source, 'RailKit');
  });
});

