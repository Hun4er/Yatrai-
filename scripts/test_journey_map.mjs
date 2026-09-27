import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidCoordinate,
  calculateBounds,
  getModeColor,
  getModeDashArray,
  MODE_COLORS,
} from '../client/src/components/map/mapUtils.js';
import { journeyToGeoJSON } from '../client/src/components/map/journeyGeoJson.js';

describe('Phase 12 — Maps & Journey Route Visualization Suite', () => {
  describe('1. Coordinate Validation (PRD Section 21)', () => {
    it('accepts valid geographic coordinates [longitude, latitude]', () => {
      assert.equal(isValidCoordinate([77.0233, 28.9953]), true);
      assert.equal(isValidCoordinate([85.1376, 25.6032]), true);
      assert.equal(isValidCoordinate([-180, -90]), true);
      assert.equal(isValidCoordinate([180, 90]), true);
      assert.equal(isValidCoordinate([0, 0]), true);
    });

    it('rejects coordinates with longitude outside [-180, 180]', () => {
      assert.equal(isValidCoordinate([180.1, 25.0]), false);
      assert.equal(isValidCoordinate([-180.1, 25.0]), false);
      assert.equal(isValidCoordinate([200, 28]), false);
    });

    it('rejects coordinates with latitude outside [-90, 90]', () => {
      assert.equal(isValidCoordinate([77.0, 90.1]), false);
      assert.equal(isValidCoordinate([77.0, -90.1]), false);
      assert.equal(isValidCoordinate([77.0, 150]), false);
    });

    it('rejects malformed types, NaN, Infinity, and empty inputs', () => {
      assert.equal(isValidCoordinate(null), false);
      assert.equal(isValidCoordinate(undefined), false);
      assert.equal(isValidCoordinate([]), false);
      assert.equal(isValidCoordinate([77.0]), false);
      assert.equal(isValidCoordinate([77.0, NaN]), false);
      assert.equal(isValidCoordinate([NaN, 28.0]), false);
      assert.equal(isValidCoordinate([Infinity, 28.0]), false);
      assert.equal(isValidCoordinate(['77.0', '28.0']), false);
    });
  });

  describe('2. Dynamic Bounds Calculation (PRD Section 19 & 20)', () => {
    it('calculates correct [[minLng, minLat], [maxLng, maxLat]] for a multi-point route', () => {
      const coords = [
        [77.023, 28.995], // Sonipat
        [77.219, 28.632], // Delhi
        [85.137, 25.603], // Patna
      ];
      const bounds = calculateBounds(coords);
      assert.ok(bounds);
      assert.equal(bounds.length, 2);

      const [sw, ne] = bounds;
      assert.equal(sw[0], 77.023); // minLng
      assert.equal(sw[1], 25.603); // minLat
      assert.equal(ne[0], 85.137); // maxLng
      assert.equal(ne[1], 28.995); // maxLat
    });

    it('adds delta buffer for identical or single point bounds without producing NaN', () => {
      const singleCoord = [[77.023, 28.995]];
      const bounds = calculateBounds(singleCoord);
      assert.ok(bounds);
      const [sw, ne] = bounds;
      assert.ok(sw[0] < ne[0]);
      assert.ok(sw[1] < ne[1]);
      assert.ok(!isNaN(sw[0]) && !isNaN(ne[0]));
    });

    it('returns null for empty or invalid coordinate lists', () => {
      assert.equal(calculateBounds([]), null);
      assert.equal(calculateBounds([[NaN, 20]]), null);
      assert.equal(calculateBounds(null), null);
    });
  });

  describe('3. Visual Mode Palette & Design System Styling (PRD Section 13)', () => {
    it('returns distinct design tokens for rail, road, bus, and flight', () => {
      assert.equal(getModeColor('rail'), MODE_COLORS.rail);
      assert.equal(getModeColor('road'), MODE_COLORS.road);
      assert.equal(getModeColor('bus'), MODE_COLORS.bus);
      assert.equal(getModeColor('flight'), MODE_COLORS.flight);
      assert.equal(getModeColor('unknown'), MODE_COLORS.default);
    });

    it('applies dashed lines for flights and solid lines for ground transport', () => {
      assert.deepEqual(getModeDashArray('flight'), [2, 2]);
      assert.deepEqual(getModeDashArray('rail'), []);
      assert.deepEqual(getModeDashArray('road'), []);
    });
  });

  describe('4. Pure GeoJSON Transformation (PRD Section 10 & 30)', () => {
    it('converts a multi-modal 2-leg journey (Sonipat -> Delhi -> Patna) into GeoJSON', () => {
      const mockJourney = {
        id: 'journey-multi-123',
        origin: { name: 'Sonipat', coordinates: [77.023, 28.995] },
        destination: { name: 'Patna Junction', coordinates: [85.137, 25.603] },
        departureTime: '2026-10-01T06:30:00Z',
        arrivalTime: '2026-10-01T19:20:00Z',
        duration: 770,
        totalDistance: 1050,
        totalPrice: 1700,
        currency: 'INR',
        transportModes: ['road', 'rail'],
        legs: [
          {
            id: 'leg-1',
            sequence: 1,
            mode: 'road',
            origin: { name: 'Sonipat', coordinates: [77.023, 28.995] },
            destination: { name: 'Delhi', coordinates: [77.219, 28.632] },
            departureTime: '2026-10-01T06:30:00Z',
            arrivalTime: '2026-10-01T07:45:00Z',
            duration: 75,
            distance: 50,
            price: 450,
          },
          {
            id: 'leg-2',
            sequence: 2,
            mode: 'rail',
            origin: { name: 'Delhi', coordinates: [77.219, 28.632] },
            destination: { name: 'Patna Junction', coordinates: [85.137, 25.603] },
            departureTime: '2026-10-01T08:15:00Z',
            arrivalTime: '2026-10-01T19:20:00Z',
            duration: 665,
            distance: 1000,
            price: 1250,
          },
        ],
      };

      const geo = journeyToGeoJSON(mockJourney, 2);

      // Verify route features
      assert.equal(geo.routes.features.length, 2);
      assert.equal(geo.routes.features[0].properties.mode, 'road');
      assert.equal(geo.routes.features[0].properties.isSelected, false);
      assert.equal(geo.routes.features[1].properties.mode, 'rail');
      assert.equal(geo.routes.features[1].properties.isSelected, true); // focused leg 2

      // Verify stop features: origin, transfer, destination
      assert.equal(geo.stops.features.length, 3);
      assert.equal(geo.stops.features[0].properties.type, 'origin');
      assert.equal(geo.stops.features[0].properties.name, 'Sonipat');
      assert.equal(geo.stops.features[1].properties.type, 'transfer');
      assert.equal(geo.stops.features[1].properties.name, 'Delhi');
      assert.equal(geo.stops.features[2].properties.type, 'destination');
      assert.equal(geo.stops.features[2].properties.name, 'Patna Junction');

      // Verify bounds
      assert.ok(geo.bounds);
      assert.equal(geo.hasValidGeometry, true);
    });

    it('gracefully handles missing coordinates without throwing (Level 3 Fallback)', () => {
      const brokenJourney = {
        origin: { name: 'Unknown A' },
        destination: { name: 'Unknown B' },
        legs: [
          {
            sequence: 1,
            mode: 'road',
            origin: { name: 'Unknown A' },
            destination: { name: 'Unknown B' },
          },
        ],
      };

      const geo = journeyToGeoJSON(brokenJourney);
      assert.equal(geo.routes.features.length, 0);
      assert.equal(geo.stops.features.length, 0);
      assert.equal(geo.hasValidGeometry, false);
      assert.equal(geo.bounds, null);
    });

    it('handles null, undefined, or empty objects safely', () => {
      const geo1 = journeyToGeoJSON(null);
      assert.equal(geo1.hasValidGeometry, false);

      const geo2 = journeyToGeoJSON({});
      assert.equal(geo2.hasValidGeometry, false);
    });
  });

  describe('5. Real Backend Search Integration & Route Synthesis (PRD Section 41)', () => {
    it('executes search against live backend and converts all candidates to valid GeoJSON', async () => {
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
      assert.ok(data.data?.journeys?.length > 0);

      data.data.journeys.forEach((j, idx) => {
        const geo = journeyToGeoJSON(j);
        assert.ok(geo.hasValidGeometry, `Journey ${idx} must have valid geometry`);
        assert.ok(geo.routes.features.length > 0, `Journey ${idx} must have route features`);
        assert.ok(geo.stops.features.length >= 2, `Journey ${idx} must have at least origin and destination`);
        assert.ok(geo.bounds !== null, `Journey ${idx} must have calculable bounds`);
      });
    });
  });
});
