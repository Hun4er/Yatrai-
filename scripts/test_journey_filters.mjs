import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterJourneys,
  deriveFilterBounds,
  matchesDepartureTime,
  matchesTransfers,
  matchesTransportModes,
  countActiveFilters,
  getDefaultFilters,
} from '../client/src/utils/journeyFilters.js';

describe('Phase 10 — Journey Filtering Unit Tests', () => {
  const mockJourneys = [
    {
      id: 'j1',
      totalPrice: 850,
      duration: 720, // 12h
      numberOfTransfers: 0,
      transportModes: ['rail'],
      departureTime: '2026-10-01T06:30:00.000Z', // Morning (06:30 UTC or local)
    },
    {
      id: 'j2',
      totalPrice: 1200,
      duration: 540, // 9h
      numberOfTransfers: 1,
      transportModes: ['rail', 'road'],
      departureTime: '2026-10-01T14:15:00.000Z', // Afternoon
    },
    {
      id: 'j3',
      totalPrice: 4500,
      duration: 300, // 5h
      numberOfTransfers: 2,
      transportModes: ['flight', 'road'],
      departureTime: '2026-10-01T20:00:00.000Z', // Evening
    },
    {
      id: 'j4',
      totalPrice: 600,
      duration: 900, // 15h
      numberOfTransfers: 0,
      transportModes: ['bus'],
      departureTime: '2026-10-01T04:00:00.000Z', // Early morning
    },
  ];

  it('1. deriveFilterBounds accurately extracts min/max metrics', () => {
    const bounds = deriveFilterBounds(mockJourneys);
    assert.equal(bounds.minPrice, 600);
    assert.equal(bounds.maxPrice, 4500);
    assert.equal(bounds.minDuration, 300);
    assert.equal(bounds.maxDuration, 900);
    assert.deepEqual(bounds.availableModes.sort(), ['bus', 'flight', 'rail', 'road'].sort());
  });

  it('2. filters by minimum and maximum price', () => {
    // Under 1000
    const cheap = filterJourneys(mockJourneys, { maxPrice: 1000 });
    assert.equal(cheap.length, 2);
    assert.deepEqual(cheap.map((j) => j.id).sort(), ['j1', 'j4'].sort());

    // Between 800 and 1500
    const mid = filterJourneys(mockJourneys, { minPrice: 800, maxPrice: 1500 });
    assert.equal(mid.length, 2);
    assert.deepEqual(mid.map((j) => j.id).sort(), ['j1', 'j2'].sort());
  });

  it('3. filters by maximum duration', () => {
    // Max 10 hours (600 mins)
    const fast = filterJourneys(mockJourneys, { maxDuration: 600 });
    assert.equal(fast.length, 2);
    assert.deepEqual(fast.map((j) => j.id).sort(), ['j2', 'j3'].sort());
  });

  it('4. filters by number of transfers', () => {
    // Direct only (0 transfers)
    const direct = filterJourneys(mockJourneys, { transfers: '0' });
    assert.equal(direct.length, 2);
    assert.deepEqual(direct.map((j) => j.id).sort(), ['j1', 'j4'].sort());

    // 1 transfer
    const oneTransfer = filterJourneys(mockJourneys, { transfers: '1' });
    assert.equal(oneTransfer.length, 1);
    assert.equal(oneTransfer[0].id, 'j2');

    // 2+ transfers
    const multiTransfer = filterJourneys(mockJourneys, { transfers: '2+' });
    assert.equal(multiTransfer.length, 1);
    assert.equal(multiTransfer[0].id, 'j3');
  });

  it('5. filters by transport modes (including multimodal match)', () => {
    // Rail only
    const rail = filterJourneys(mockJourneys, { transportModes: ['rail'] });
    assert.equal(rail.length, 2);
    assert.deepEqual(rail.map((j) => j.id).sort(), ['j1', 'j2'].sort());

    // Road only (matches j2 and j3)
    const road = filterJourneys(mockJourneys, { transportModes: ['road'] });
    assert.equal(road.length, 2);
    assert.deepEqual(road.map((j) => j.id).sort(), ['j2', 'j3'].sort());

    // Bus only
    const bus = filterJourneys(mockJourneys, { transportModes: ['bus'] });
    assert.equal(bus.length, 1);
    assert.equal(bus[0].id, 'j4');
  });

  it('6. filters by combined multi-criteria filters', () => {
    // Price <= 1000 AND transfers == 0 AND mode includes 'rail'
    const combined = filterJourneys(mockJourneys, {
      maxPrice: 1000,
      transfers: '0',
      transportModes: ['rail'],
    });
    assert.equal(combined.length, 1);
    assert.equal(combined[0].id, 'j1');
  });

  it('7. returns empty array when filters eliminate all journeys without crashing', () => {
    const none = filterJourneys(mockJourneys, {
      maxPrice: 200, // No journeys <= 200
    });
    assert.equal(none.length, 0);
  });

  it('8. countActiveFilters accurately detects non-default filter settings', () => {
    const bounds = deriveFilterBounds(mockJourneys);
    const defaults = getDefaultFilters();
    assert.equal(countActiveFilters(defaults, bounds), 0);

    const active = {
      ...defaults,
      maxPrice: 2000,
      transfers: '1',
      transportModes: ['rail'],
    };
    assert.equal(countActiveFilters(active, bounds), 3);
  });
});
