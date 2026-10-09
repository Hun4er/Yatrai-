import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRailwayDateTime,
  formatInIST,
  calculateJourneyTiming,
  IST_OFFSET_STR,
  IST_OFFSET_MS,
} from '../src/utils/railwayTime.js';

describe('Railway Time Normalization Suite (Indian Standard Time UTC+05:30)', () => {
  // =========================================================================
  // 1. Same-Day Journeys
  // =========================================================================
  describe('1. Same-Day Train Journeys', () => {
    it('normalizes daytime departure and arrival on the same calendar day', () => {
      const travelDate = '2026-10-15';
      const depTime = '06:00';
      const arrTime = '14:30';

      const timing = calculateJourneyTiming(depTime, arrTime, travelDate);

      assert.equal(timing.departureLocalTime, '06:00');
      assert.equal(timing.arrivalLocalTime, '14:30');
      assert.equal(timing.departureLocalDate, '2026-10-15');
      assert.equal(timing.arrivalLocalDate, '2026-10-15');
      assert.equal(timing.dayOffset, 0);
      assert.equal(timing.durationMinutes, 510, 'Duration should be 8 hours 30 mins (510 mins)');

      // UTC ISO verification: 06:00 IST is 00:30 UTC
      assert.equal(timing.departureTime.toISOString(), '2026-10-15T00:30:00.000Z');
      // 14:30 IST is 09:00 UTC
      assert.equal(timing.arrivalTime.toISOString(), '2026-10-15T09:00:00.000Z');
    });

    it('handles departure in the morning and arrival late evening same day', () => {
      const travelDate = '2026-10-20';
      const timing = calculateJourneyTiming('08:15', '23:45', travelDate);

      assert.equal(timing.departureLocalTime, '08:15');
      assert.equal(timing.arrivalLocalTime, '23:45');
      assert.equal(timing.departureLocalDate, '2026-10-20');
      assert.equal(timing.arrivalLocalDate, '2026-10-20');
      assert.equal(timing.dayOffset, 0);
      assert.equal(timing.durationMinutes, 930); // 15h 30m = 930m
    });
  });

  // =========================================================================
  // 2. Overnight Journeys & Midnight Rollovers
  // =========================================================================
  describe('2. Overnight Journeys and Midnight Rollovers', () => {
    it('detects overnight rollover automatically when arrival hour < departure hour', () => {
      const travelDate = '2026-10-15';
      const depTime = '17:30';
      const arrTime = '06:15';

      const timing = calculateJourneyTiming(depTime, arrTime, travelDate);

      assert.equal(timing.departureLocalTime, '17:30');
      assert.equal(timing.arrivalLocalTime, '06:15');
      assert.equal(timing.departureLocalDate, '2026-10-15');
      assert.equal(timing.arrivalLocalDate, '2026-10-16', 'Arrival date must roll forward to next calendar day');
      assert.equal(timing.dayOffset, 1);
      assert.equal(timing.durationMinutes, 765, 'Duration should be 12 hours 45 mins (765 mins)');

      // UTC ISO verification: 17:30 IST is 12:00 UTC
      assert.equal(timing.departureTime.toISOString(), '2026-10-15T12:00:00.000Z');
      // 06:15 IST next day is 00:45 UTC on 2026-10-16
      assert.equal(timing.arrivalTime.toISOString(), '2026-10-16T00:45:00.000Z');
    });

    it('handles tight midnight crossing (23:55 to 00:10)', () => {
      const travelDate = '2026-10-15';
      const timing = calculateJourneyTiming('23:55', '00:10', travelDate);

      assert.equal(timing.departureLocalTime, '23:55');
      assert.equal(timing.arrivalLocalTime, '00:10');
      assert.equal(timing.departureLocalDate, '2026-10-15');
      assert.equal(timing.arrivalLocalDate, '2026-10-16');
      assert.equal(timing.dayOffset, 1);
      assert.equal(timing.durationMinutes, 15, 'Duration must be exactly 15 minutes');
    });

    it('honors explicit dayOffset from provider metadata (e.g. to.day - from.day = 1)', () => {
      const travelDate = '2026-10-15';
      // Train departing 10:00 AM on Day 1 and arriving 11:30 AM on Day 2 (arrival hour > departure hour)
      const timing = calculateJourneyTiming('10:00', '11:30', travelDate, 1);

      assert.equal(timing.departureLocalTime, '10:00');
      assert.equal(timing.arrivalLocalTime, '11:30');
      assert.equal(timing.departureLocalDate, '2026-10-15');
      assert.equal(timing.arrivalLocalDate, '2026-10-16');
      assert.equal(timing.dayOffset, 1);
      assert.equal(timing.durationMinutes, 1530, '25 hours 30 mins = 1530 mins');
    });

    it('handles multi-day runs (Day 1 to Day 3 with dayOffset = 2)', () => {
      const travelDate = '2026-10-15';
      const timing = calculateJourneyTiming('14:00', '18:00', travelDate, 2);

      assert.equal(timing.departureLocalDate, '2026-10-15');
      assert.equal(timing.arrivalLocalDate, '2026-10-17');
      assert.equal(timing.dayOffset, 2);
      assert.equal(timing.durationMinutes, 3120, '52 hours = 3120 mins');
    });
  });

  // =========================================================================
  // 3. formatInIST Utility
  // =========================================================================
  describe('3. formatInIST Helper', () => {
    it('converts UTC Date objects to exact Asia/Kolkata local time and date', () => {
      // 2026-10-15 00:30:00 UTC + 5:30 = 2026-10-15 06:00:00 IST
      const utcDate = new Date('2026-10-15T00:30:00.000Z');
      const ist = formatInIST(utcDate);

      assert.equal(ist.localTime, '06:00');
      assert.equal(ist.localDate, '2026-10-15');
    });

    it('handles boundary where UTC is previous day but IST is current day', () => {
      // 2026-10-14 20:30:00 UTC + 5:30 = 2026-10-15 02:00:00 IST
      const utcDate = new Date('2026-10-14T20:30:00.000Z');
      const ist = formatInIST(utcDate);

      assert.equal(ist.localTime, '02:00');
      assert.equal(ist.localDate, '2026-10-15');
    });

    it('handles null and invalid inputs gracefully', () => {
      assert.equal(formatInIST(null).localTime, '--:--');
      assert.equal(formatInIST(new Date('invalid')).localTime, '--:--');
    });
  });

  // =========================================================================
  // 4. normalizeRailwayDateTime Versatility
  // =========================================================================
  describe('4. normalizeRailwayDateTime Format Handling', () => {
    it('normalizes time strings with seconds (e.g. 17:30:00)', () => {
      const res = normalizeRailwayDateTime('17:30:00', '2026-10-15');
      assert.equal(res.localTime, '17:30');
      assert.equal(res.localDate, '2026-10-15');
      assert.equal(res.date.toISOString(), '2026-10-15T12:00:00.000Z');
    });

    it('normalizes ISO strings with +05:30 offset', () => {
      const res = normalizeRailwayDateTime('2026-10-15T17:30:00+05:30');
      assert.equal(res.localTime, '17:30');
      assert.equal(res.localDate, '2026-10-15');
      assert.equal(res.date.toISOString(), '2026-10-15T12:00:00.000Z');
    });

    it('never treats local date-time strings without offset as UTC (appends IST +05:30)', () => {
      const res = normalizeRailwayDateTime('2026-10-15T17:30:00');
      assert.equal(res.localTime, '17:30');
      assert.equal(res.localDate, '2026-10-15');
      // Should be 12:00:00 UTC, NOT 17:30:00 UTC!
      assert.equal(res.date.toISOString(), '2026-10-15T12:00:00.000Z');
    });

    it('throws descriptive error on invalid time strings', () => {
      assert.throws(() => {
        normalizeRailwayDateTime('25:00', '2026-10-15');
      }, /Invalid railway time string values/);

      assert.throws(() => {
        normalizeRailwayDateTime('');
      }, /Railway time value is required/);
    });
  });

  // =========================================================================
  // 5. Reported Duration Preservation
  // =========================================================================
  describe('5. Reported Duration vs Calculated Duration', () => {
    it('uses reported duration if explicitly provided and valid', () => {
      const timing = calculateJourneyTiming('06:00', '14:30', '2026-10-15', 0, 500);
      assert.equal(timing.durationMinutes, 500);
    });

    it('falls back to exact timestamp difference if reported duration is 0 or null', () => {
      const timing = calculateJourneyTiming('06:00', '14:30', '2026-10-15', 0, null);
      assert.equal(timing.durationMinutes, 510);
    });
  });
});
