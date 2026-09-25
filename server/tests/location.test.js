import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Location } from '../src/models/Location.js';
import { locationService } from '../src/services/locationService.js';
import { parseTravelIntent } from '../src/utils/locationParser.js';
import {
  mapProviderType,
  normalizeNominatimResult,
  nominatimAdapter,
} from '../src/providers/location/nominatim.adapter.js';

describe('Yatrai Phase 3 — Location Resolution Suite', () => {
  let app;
  let server;
  let baseUrl;

  before(async () => {
    await setupTestDb();
    await Location.init();

    app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  // ============================================================================
  // 1. NATURAL LANGUAGE TRAVEL INTENT PARSER
  // ============================================================================
  describe('Natural Language Travel Intent Parser', () => {
    it('extracts origin and destination from simple travel phrases', () => {
      const phrase1 = parseTravelIntent('I need to go from Sonipat to Patna');
      assert.equal(phrase1.isTravelIntent, true);
      assert.equal(phrase1.origin, 'Sonipat');
      assert.equal(phrase1.destination, 'Patna');

      const phrase2 = parseTravelIntent('How to reach Patna from Sonipat');
      assert.equal(phrase2.isTravelIntent, true);
      assert.equal(phrase2.origin, 'Sonipat');
      assert.equal(phrase2.destination, 'Patna');

      const phrase3 = parseTravelIntent('Sonipat to Patna');
      assert.equal(phrase3.isTravelIntent, true);
      assert.equal(phrase3.origin, 'Sonipat');
      assert.equal(phrase3.destination, 'Patna');

      const phrase4 = parseTravelIntent('travel from Delhi to Varanasi tomorrow');
      assert.equal(phrase4.isTravelIntent, true);
      assert.equal(phrase4.origin, 'Delhi');
      assert.equal(phrase4.destination, 'Varanasi');
    });

    it('rejects ambiguous phrases without inventing locations', () => {
      const res1 = parseTravelIntent('Delhi');
      assert.equal(res1.isTravelIntent, false);
      assert.equal(res1.query, 'Delhi');

      const res2 = parseTravelIntent('I want to travel');
      assert.equal(res2.isTravelIntent, false);

      const res3 = parseTravelIntent('take me somewhere');
      assert.equal(res3.isTravelIntent, false);

      const res4 = parseTravelIntent('SRM University Delhi NCR');
      assert.equal(res4.isTravelIntent, false);
      assert.equal(res4.query, 'SRM University Delhi NCR');
    });
  });

  // ============================================================================
  // 2. PROVIDER ADAPTER & NORMALIZATION
  // ============================================================================
  describe('Provider Adapter & Normalizer', () => {
    it('normalizes provider place types into canonical Yatrai categories', () => {
      assert.equal(mapProviderType({ class: 'aeroway', type: 'aerodrome' }), 'airport');
      assert.equal(mapProviderType({ class: 'railway', type: 'station' }), 'railway_station');
      assert.equal(mapProviderType({ class: 'bus', type: 'bus_station' }), 'bus_station');
      assert.equal(mapProviderType({ class: 'place', type: 'city' }), 'city');
      assert.equal(mapProviderType({ class: 'boundary', type: 'administrative' }), 'region');
      assert.equal(mapProviderType({ class: 'amenity', type: 'university' }), 'landmark');
      assert.equal(mapProviderType({ class: 'tourism', type: 'museum' }), 'landmark');
      assert.equal(mapProviderType({ class: 'building', type: 'residential' }), 'address');
    });

    it('validates coordinates and outputs GeoJSON in strict [longitude, latitude] order', () => {
      const raw = {
        name: 'Sonipat',
        display_name: 'Sonipat, Haryana, India',
        lat: '28.9931',
        lon: '77.0151',
        class: 'place',
        type: 'city',
        place_id: 123456,
        address: {
          city: 'Sonipat',
          state: 'Haryana',
          country: 'India',
          country_code: 'in',
        },
      };

      const normalized = normalizeNominatimResult(raw);
      assert.ok(normalized);
      assert.equal(normalized.name, 'Sonipat');
      assert.equal(normalized.type, 'city');
      assert.equal(normalized.state, 'Haryana');
      assert.equal(normalized.country, 'India');
      assert.equal(normalized.countryCode, 'IN');
      assert.equal(normalized.placeId, 'nominatim:123456');

      // STRICT GeoJSON ORDER: [longitude, latitude]
      assert.equal(normalized.location.coordinates[0], 77.0151); // Longitude first
      assert.equal(normalized.location.coordinates[1], 28.9931); // Latitude second
    });

    it('rejects provider items with invalid or out-of-bounds coordinates', () => {
      // Out of bounds latitude (> 90)
      const invalidLat = normalizeNominatimResult({
        name: 'Bad Lat Place',
        lat: '95.0000',
        lon: '77.0000',
      });
      assert.equal(invalidLat, null);

      // Out of bounds longitude (> 180)
      const invalidLon = normalizeNominatimResult({
        name: 'Bad Lon Place',
        lat: '28.0000',
        lon: '185.0000',
      });
      assert.equal(invalidLon, null);

      // Non-numeric coordinates
      const nonNumeric = normalizeNominatimResult({
        name: 'Non Numeric',
        lat: 'not-a-number',
        lon: 'not-a-number',
      });
      assert.equal(nonNumeric, null);
    });

    it('translates provider rate limit HTTP 429 into controlled Yatrai error', async () => {
      const mockFetch429 = async () => ({
        ok: false,
        status: 429,
      });

      await assert.rejects(
        async () => {
          await nominatimAdapter.search('Delhi', { fetchFn: mockFetch429 });
        },
        (err) => err.code === 'PROVIDER_RATE_LIMITED' && err.status === 429
      );
    });

    it('translates provider malformed payload into controlled Yatrai error', async () => {
      const mockFetchMalformed = async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      });

      await assert.rejects(
        async () => {
          await nominatimAdapter.search('Delhi', { fetchFn: mockFetchMalformed });
        },
        (err) => err.code === 'PROVIDER_MALFORMED_RESPONSE' && err.status === 502
      );
    });
  });

  // ============================================================================
  // 3. LOCATION RESOLUTION SERVICE & CACHING
  // ============================================================================
  describe('Location Resolution Service & Caching', () => {
    it('returns existing MongoDB locations without hitting external provider', async () => {
      // Seed pre-existing location in DB
      const seeded = await locationService.create({
        name: 'Sonipat',
        displayName: 'Sonipat, Haryana, India',
        type: 'city',
        city: 'Sonipat',
        state: 'Haryana',
        country: 'India',
        countryCode: 'IN',
        location: {
          type: 'Point',
          coordinates: [77.0151, 28.9931],
        },
        placeId: 'test:sonipat-seed',
      });

      // Provider mock that throws if called
      const mockAdapter = {
        async search() {
          throw new Error('Provider should NOT be called when local cache exists!');
        },
      };

      // Search with exact match
      const results1 = await locationService.search('Sonipat', { providerAdapter: mockAdapter });
      assert.equal(results1.length, 1);
      assert.equal(results1[0]._id.toString(), seeded._id.toString());

      // Search with whitespace and case variations
      const results2 = await locationService.search('  sonipat  ', {
        providerAdapter: mockAdapter,
      });
      assert.equal(results2.length, 1);
      assert.equal(results2[0].name, 'Sonipat');
    });

    it('persists newly resolved locations and deduplicates identical results', async () => {
      const mockAdapter = {
        async search() {
          return [
            {
              name: 'Patna Junction',
              displayName: 'Patna Junction, Fraser Road Area, Patna, Bihar, India',
              type: 'railway_station',
              city: 'Patna',
              state: 'Bihar',
              country: 'India',
              countryCode: 'IN',
              location: {
                type: 'Point',
                coordinates: [85.1376, 25.6022],
              },
              placeId: 'nominatim:patna-junction-1',
              timezone: 'Asia/Kolkata',
            },
          ];
        },
      };

      // First query: creates new record in MongoDB
      const res1 = await locationService.search('Patna Junction', { providerAdapter: mockAdapter });
      assert.equal(res1.length, 1);
      const count1 = await Location.countDocuments({ placeId: 'nominatim:patna-junction-1' });
      assert.equal(count1, 1);

      // Second query: reuses existing record, does not create duplicate
      const res2 = await locationService.search('Patna Junction', { providerAdapter: mockAdapter });
      assert.equal(res2.length, 1);
      const count2 = await Location.countDocuments({ placeId: 'nominatim:patna-junction-1' });
      assert.equal(count2, 1, 'Duplicate Location document must NOT be created');
    });

    it('resolves natural-language travel phrase into structured origin and destination', async () => {
      const mockAdapter = {
        async search(query) {
          if (/sonipat/i.test(query)) {
            return [
              {
                name: 'Sonipat',
                displayName: 'Sonipat, Haryana, India',
                type: 'city',
                city: 'Sonipat',
                state: 'Haryana',
                country: 'India',
                countryCode: 'IN',
                location: { type: 'Point', coordinates: [77.0151, 28.9931] },
                placeId: 'nominatim:sonipat',
              },
            ];
          }
          if (/patna/i.test(query)) {
            return [
              {
                name: 'Patna',
                displayName: 'Patna, Bihar, India',
                type: 'city',
                city: 'Patna',
                state: 'Bihar',
                country: 'India',
                countryCode: 'IN',
                location: { type: 'Point', coordinates: [85.1376, 25.5941] },
                placeId: 'nominatim:patna',
              },
            ];
          }
          return [];
        },
      };

      const resolved = await locationService.resolve('I need to go from Sonipat to Patna', {
        providerAdapter: mockAdapter,
      });

      assert.equal(resolved.isNaturalLanguage, true);
      assert.equal(resolved.extraction.origin.query, 'Sonipat');
      assert.equal(resolved.extraction.origin.location.name, 'Sonipat');
      assert.equal(resolved.extraction.origin.location.state, 'Haryana');
      assert.equal(resolved.extraction.destination.query, 'Patna');
      assert.equal(resolved.extraction.destination.location.name, 'Patna');
      assert.equal(resolved.extraction.destination.location.state, 'Bihar');
    });
  });

  // ============================================================================
  // 4. API ENDPOINTS (HTTP INTEGRATION)
  // ============================================================================
  describe('Location API Endpoints', () => {
    beforeEach(async () => {
      // Seed Delhi, Sonipat, Patna
      await Location.create([
        {
          name: 'Delhi',
          displayName: 'New Delhi, Delhi, India',
          type: 'city',
          city: 'Delhi',
          state: 'Delhi',
          country: 'India',
          countryCode: 'IN',
          location: { type: 'Point', coordinates: [77.209, 28.6139] },
          placeId: 'seed:delhi',
        },
        {
          name: 'SRM University Delhi NCR',
          displayName: 'SRM University, Delhi-NCR, Sonipat, Haryana, India',
          type: 'landmark',
          city: 'Sonipat',
          state: 'Haryana',
          country: 'India',
          countryCode: 'IN',
          location: { type: 'Point', coordinates: [77.0674, 28.9723] },
          placeId: 'seed:srm-sonipat',
        },
      ]);
    });

    it('GET /api/locations/search?q=Delhi returns matching canonical locations', async () => {
      const res = await fetch(`${baseUrl}/api/locations/search?q=Delhi`);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.data.locations.length >= 1);
      assert.equal(json.data.locations[0].name, 'Delhi');
      assert.equal(json.data.locations[0].countryCode, 'IN');
      assert.equal(json.data.locations[0].location.type, 'Point');
    });

    it('GET /api/locations/search returns 400 when query parameter "q" is missing', async () => {
      const res = await fetch(`${baseUrl}/api/locations/search`);
      assert.equal(res.status, 400);

      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, 'VALIDATION_ERROR');
    });

    it('GET /api/locations/search returns empty array without fabrication for no-match', async () => {
      const res = await fetch(`${baseUrl}/api/locations/search?q=XYZNonExistentPlace999`);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.count, 0);
      assert.deepEqual(json.data.locations, []);
    });

    it('POST /api/locations/resolve resolves place name into canonical location', async () => {
      const res = await fetch(`${baseUrl}/api/locations/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'SRM University Delhi NCR' }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.isNaturalLanguage, false);
      assert.ok(json.data.location);
      assert.equal(json.data.location.name, 'SRM University Delhi NCR');
      assert.equal(json.data.location.type, 'landmark');
    });

    it('POST /api/locations/resolve extracts origin/dest from natural-language travel query', async () => {
      // Seed Patna for fast local resolution
      await Location.create({
        name: 'Patna',
        displayName: 'Patna, Bihar, India',
        type: 'city',
        city: 'Patna',
        state: 'Bihar',
        country: 'India',
        countryCode: 'IN',
        location: { type: 'Point', coordinates: [85.1376, 25.5941] },
        placeId: 'seed:patna',
      });

      const res = await fetch(`${baseUrl}/api/locations/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'I need to go from Delhi to Patna' }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.isNaturalLanguage, true);
      assert.equal(json.data.extraction.origin.query, 'Delhi');
      assert.equal(json.data.extraction.origin.location.name, 'Delhi');
      assert.equal(json.data.extraction.destination.query, 'Patna');
      assert.equal(json.data.extraction.destination.location.name, 'Patna');
    });

    it('GET /api/locations/:id retrieves location by MongoDB ID', async () => {
      const existing = await Location.findOne({ name: 'Delhi' });
      assert.ok(existing);

      const res = await fetch(`${baseUrl}/api/locations/${existing._id}`);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.location.name, 'Delhi');
    });

    it('GET /api/locations/:id returns 404 for unknown ID and 400 for malformed ID', async () => {
      const res404 = await fetch(`${baseUrl}/api/locations/507f1f77bcf86cd799439011`);
      assert.equal(res404.status, 404);

      const res400 = await fetch(`${baseUrl}/api/locations/invalid-id-format`);
      assert.equal(res400.status, 400);
    });

    it('GET /api exposes location endpoints in discovery document', async () => {
      const res = await fetch(`${baseUrl}/api`);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(json.endpoints.locations);
      assert.ok(json.endpoints.locations.search);
      assert.ok(json.endpoints.locations.resolve);
      assert.ok(json.endpoints.locations.getById);
    });
  });
});
