import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterJourneys,
  deriveFilterBounds,
  getDefaultFilters,
  countActiveFilters,
} from '../client/src/utils/journeyFilters.js';
import {
  formatDuration,
  formatPrice,
  formatTime,
  formatDateDisplay,
  formatTransportModes,
  formatTransfers,
} from '../client/src/utils/formatters.js';

describe('Phase 10 — End-to-End Search & Filtering with Real Backend Candidates', async () => {
  let backendJourneys = [];

  it('1. Fetches canonical journeys for Sonipat -> Patna on 2026-10-01', async () => {
    const res = await fetch('http://localhost:5000/api/journeys/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: 'Sonipat',
        destination: 'Patna',
        departureDate: '2026-10-01',
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.data?.journeys?.length > 0);
    backendJourneys = data.data.journeys;
    console.log(`Discovered ${backendJourneys.length} backend candidate(s)`);
  });

  it('2. Formatter utilities render canonical fields accurately', () => {
    const sample = backendJourneys[0];
    assert.ok(sample);

    const price = formatPrice(sample.totalPrice, sample.currency);
    assert.ok(price.includes('₹') || price.includes('INR'));

    const duration = formatDuration(sample.duration);
    assert.match(duration, /^\d+h(\s+\d+m)?$/);

    const time = formatTime(sample.departureTime);
    assert.match(time, /^\d{2}:\d{2}$/);

    const modes = formatTransportModes(sample.transportModes);
    assert.ok(modes.length > 0);

    const transfers = formatTransfers(sample.numberOfTransfers);
    assert.ok(transfers === 'Direct' || transfers.includes('transfer'));
  });

  it('3. Derives bounds from real backend candidate set', () => {
    const bounds = deriveFilterBounds(backendJourneys);
    assert.ok(bounds.minPrice <= bounds.maxPrice);
    assert.ok(bounds.minDuration <= bounds.maxDuration);
    assert.ok(bounds.availableModes.length > 0);
  });

  it('4. Filters by Price on real backend candidates', () => {
    const bounds = deriveFilterBounds(backendJourneys);
    // Filter to lowest half of price range
    const midPrice = Math.floor((bounds.minPrice + bounds.maxPrice) / 2);
    const filtered = filterJourneys(backendJourneys, { maxPrice: midPrice });

    assert.ok(filtered.length <= backendJourneys.length);
    for (const j of filtered) {
      assert.ok(j.totalPrice <= midPrice);
    }
  });

  it('5. Filters by Transport Mode on real backend candidates', () => {
    const bounds = deriveFilterBounds(backendJourneys);
    const firstMode = bounds.availableModes[0];
    const filtered = filterJourneys(backendJourneys, { transportModes: [firstMode] });

    for (const j of filtered) {
      const normalizedModes = j.transportModes.map((m) => m.toLowerCase());
      assert.ok(normalizedModes.includes(firstMode.toLowerCase()));
    }
  });

  it('6. Filters by Transfers on real backend candidates', () => {
    const directOnly = filterJourneys(backendJourneys, { transfers: '0' });
    for (const j of directOnly) {
      assert.equal(j.numberOfTransfers, 0);
    }
  });

  it('7. Overly restrictive filters produce empty set (Filter-Empty State)', () => {
    const bounds = deriveFilterBounds(backendJourneys);
    const impossible = filterJourneys(backendJourneys, {
      maxPrice: bounds.minPrice - 100, // Price lower than lowest available
    });
    assert.equal(impossible.length, 0);
  });

  it('8. Resetting/Clearing filters restores all backend journeys', () => {
    const defaults = getDefaultFilters();
    const restored = filterJourneys(backendJourneys, defaults);
    assert.equal(restored.length, backendJourneys.length);
  });
});
