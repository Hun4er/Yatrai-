import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { getAdvanceBookingWindow } from '../utils/bookingWindow.js';
import journeyV2Router from '../routes/journeyV2.routes.js';
import { formatInIST } from '../utils/railwayTime.js';

describe('Phase 6 — Advance Booking Window (60 Days) Suite', () => {
  it('correctly calculates Day 60 within window and Day 61 beyond window', () => {
    const fixedNow = new Date('2026-10-22T10:00:00.000Z');
    const window = getAdvanceBookingWindow(fixedNow);
    assert.equal(window.advanceDays, 60);

    // Today in IST
    const today = formatInIST(fixedNow).localDate; // '2026-10-22'
    assert.equal(window.todayIST, today);

    // Day 60 date (Oct 22 + 60 days = Dec 21, 2026)
    const day60Epoch = fixedNow.getTime() + 60 * 24 * 60 * 60 * 1000;
    const day60Date = formatInIST(new Date(day60Epoch)).localDate;
    assert.equal(window.isBeyondWindow(day60Date), false, 'Day 60 must be within advance window');

    // Day 61 date (Oct 22 + 61 days = Dec 22, 2026)
    const day61Epoch = fixedNow.getTime() + 61 * 24 * 60 * 60 * 1000;
    const day61Date = formatInIST(new Date(day61Epoch)).localDate;
    assert.equal(window.isBeyondWindow(day61Date), true, 'Day 61 must be beyond advance window');

    // Past date (Oct 21, 2026)
    const pastEpoch = fixedNow.getTime() - 1 * 24 * 60 * 60 * 1000;
    const pastDate = formatInIST(new Date(pastEpoch)).localDate;
    assert.equal(window.isPast(pastDate), true, 'Yesterday must be detected as past');
  });

  it('configurable by ADVANCE_DAYS env var', () => {
    const orig = process.env.ADVANCE_DAYS;
    try {
      process.env.ADVANCE_DAYS = '30';
      const fixedNow = new Date('2026-10-22T10:00:00.000Z');
      const window = getAdvanceBookingWindow(fixedNow);
      assert.equal(window.advanceDays, 30);

      const day30Date = formatInIST(new Date(fixedNow.getTime() + 30 * 24 * 3600 * 1000)).localDate;
      const day31Date = formatInIST(new Date(fixedNow.getTime() + 31 * 24 * 3600 * 1000)).localDate;

      assert.equal(window.isBeyondWindow(day30Date), false);
      assert.equal(window.isBeyondWindow(day31Date), true);
    } finally {
      if (orig !== undefined) process.env.ADVANCE_DAYS = orig;
      else delete process.env.ADVANCE_DAYS;
    }
  });

  it('HTTP integration: past date returns 400 PAST_DATE, day 61 returns 200 with notice', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v2/journeys', journeyV2Router);
    app.use((err, req, res, next) => {
      res.status(err.status || 500).json({ success: false, error: { message: err.message, code: err.code } });
    });

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/api/v2/journeys/search`;

    try {
      // 1. Past date -> 400 PAST_DATE
      const resPast = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionId: 'test_past_' + Date.now(),
          origins: ['NDLS'],
          destinations: ['PNBE'],
          date: '2020-01-01',
        }),
      });
      const bodyPast = await resPast.json();
      assert.equal(resPast.status, 400);
      assert.equal(bodyPast.error?.code, 'PAST_DATE');

      // 2. Day 61 (beyond window) -> 200 with notice 'booking may not be open for this date yet'
      const now = new Date();
      const day61Date = formatInIST(new Date(now.getTime() + 65 * 24 * 60 * 60 * 1000)).localDate;
      const resDay61 = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionId: 'test_day61_' + Date.now(),
          origins: ['NDLS'],
          destinations: ['PNBE'],
          date: day61Date,
        }),
      });
      const bodyDay61 = await resDay61.json();
      assert.equal(resDay61.status, 200, 'Day 61 beyond window must return 200');
      assert.equal(bodyDay61.success, true);
      assert.ok(
        bodyDay61.data?.providerNotice?.includes('booking may not be open for this date yet'),
        'Must include booking may not be open notice'
      );
    } finally {
      server.close();
    }
  });
});
