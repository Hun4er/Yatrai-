import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiBaseUrl, buildApiUrl } from '../src/services/api.js';

describe('Authoritative API URL Construction Suite', () => {
  describe('resolveApiBaseUrl', () => {
    it('1. Base URL without a trailing slash', () => {
      const result = resolveApiBaseUrl('https://yatrai-backend.onrender.com');
      assert.equal(result, 'https://yatrai-backend.onrender.com/api');
    });

    it('2. Base URL with a trailing slash', () => {
      const result = resolveApiBaseUrl('https://yatrai-backend.onrender.com/');
      assert.equal(result, 'https://yatrai-backend.onrender.com/api');
    });

    it('2b. Base URL with multiple trailing slashes', () => {
      const result = resolveApiBaseUrl('https://yatrai-backend.onrender.com///');
      assert.equal(result, 'https://yatrai-backend.onrender.com/api');
    });

    it('3. Base URL already containing /api without trailing slash', () => {
      const result = resolveApiBaseUrl('https://yatrai-backend.onrender.com/api');
      assert.equal(result, 'https://yatrai-backend.onrender.com/api');
    });

    it('3b. Base URL already containing /api with trailing slash', () => {
      const result = resolveApiBaseUrl('https://yatrai-backend.onrender.com/api/');
      assert.equal(result, 'https://yatrai-backend.onrender.com/api');
    });

    it('4. Relative /api configuration', () => {
      assert.equal(resolveApiBaseUrl('/api'), '/api');
      assert.equal(resolveApiBaseUrl('/api/'), '/api');
    });

    it('4b. Relative path without /api appends /api', () => {
      assert.equal(resolveApiBaseUrl('/backend'), '/backend/api');
      assert.equal(resolveApiBaseUrl('/backend/'), '/backend/api');
    });

    it('4c. Empty or undefined defaults safely to /api', () => {
      assert.equal(resolveApiBaseUrl(''), '/api');
      assert.equal(resolveApiBaseUrl(null), '/api');
      assert.equal(resolveApiBaseUrl(undefined), '/api');
      assert.equal(resolveApiBaseUrl('   '), '/api');
    });

    it('Prevention of duplicate /api/api in base URL', () => {
      const result = resolveApiBaseUrl('https://yatrai-backend.onrender.com/api/api');
      assert.equal(result, 'https://yatrai-backend.onrender.com/api');
    });
  });

  describe('buildApiUrl', () => {
    it('5. Endpoint with a leading slash', () => {
      const url = buildApiUrl('https://yatrai-backend.onrender.com', '/locations/search');
      assert.equal(url, 'https://yatrai-backend.onrender.com/api/locations/search');
    });

    it('6. Endpoint without a leading slash', () => {
      const url = buildApiUrl('https://yatrai-backend.onrender.com', 'locations/search');
      assert.equal(url, 'https://yatrai-backend.onrender.com/api/locations/search');
    });

    it('7. Query parameters are preserved correctly', () => {
      const url = buildApiUrl(
        'https://yatrai-backend.onrender.com',
        '/locations/search?q=ndls&limit=6&railwayOnly=true'
      );
      assert.equal(
        url,
        'https://yatrai-backend.onrender.com/api/locations/search?q=ndls&limit=6&railwayOnly=true'
      );
    });

    it('7b. Preserves query parameters when endpoint has no leading slash', () => {
      const url = buildApiUrl(
        'https://yatrai-backend.onrender.com',
        'locations/search?q=ndls&limit=6&railwayOnly=true'
      );
      assert.equal(
        url,
        'https://yatrai-backend.onrender.com/api/locations/search?q=ndls&limit=6&railwayOnly=true'
      );
    });

    it('8. Prevention of double slashes when base ends with slash and endpoint starts with slash', () => {
      const url = buildApiUrl('https://yatrai-backend.onrender.com/', '//locations/search');
      assert.equal(url, 'https://yatrai-backend.onrender.com/api/locations/search');
      assert.ok(!url.includes('com//'));
      assert.ok(!url.includes('api//'));
    });

    it('9. Prevention of duplicate /api/api when endpoint mistakenly includes /api', () => {
      const url1 = buildApiUrl('https://yatrai-backend.onrender.com', '/api/locations/search');
      assert.equal(url1, 'https://yatrai-backend.onrender.com/api/locations/search');

      const url2 = buildApiUrl('https://yatrai-backend.onrender.com/api', '/api/v2/journeys/search');
      assert.equal(url2, 'https://yatrai-backend.onrender.com/api/v2/journeys/search');

      const url3 = buildApiUrl('/api', '/api/auth/refresh');
      assert.equal(url3, '/api/auth/refresh');
    });

    it('Regression: Exactly fixes observed production bug', () => {
      // Production setting: VITE_API_BASE_URL=https://yatrai-backend.onrender.com
      const baseUrl = 'https://yatrai-backend.onrender.com';
      const endpoint = '/locations/search?q=ndls&limit=6&railwayOnly=true';
      const actual = buildApiUrl(baseUrl, endpoint);

      assert.notEqual(
        actual,
        'https://yatrai-backend.onrender.com//locations/search?q=ndls&limit=6&railwayOnly=true',
        'Must NOT produce double-slash or omit /api'
      );
      assert.equal(
        actual,
        'https://yatrai-backend.onrender.com/api/locations/search?q=ndls&limit=6&railwayOnly=true'
      );
    });

    it('Validates all canonical production endpoints', () => {
      const base = 'https://yatrai-backend.onrender.com';

      assert.equal(
        buildApiUrl(base, '/auth/refresh'),
        'https://yatrai-backend.onrender.com/api/auth/refresh'
      );
      assert.equal(
        buildApiUrl(base, '/journeys/preview'),
        'https://yatrai-backend.onrender.com/api/journeys/preview'
      );
      assert.equal(
        buildApiUrl(base, '/v2/journeys/search'),
        'https://yatrai-backend.onrender.com/api/v2/journeys/search'
      );
      assert.equal(
        buildApiUrl(base, '/pnr/1234567890/pdf'),
        'https://yatrai-backend.onrender.com/api/pnr/1234567890/pdf'
      );
      assert.equal(
        buildApiUrl(base, '/booking/my-bookings'),
        'https://yatrai-backend.onrender.com/api/booking/my-bookings'
      );
    });

    it('Validates relative development proxy endpoints', () => {
      const base = '/api';

      assert.equal(
        buildApiUrl(base, '/locations/search?q=ndls'),
        '/api/locations/search?q=ndls'
      );
      assert.equal(
        buildApiUrl(base, '/auth/refresh'),
        '/api/auth/refresh'
      );
      assert.equal(
        buildApiUrl(base, '/v2/journeys/search'),
        '/api/v2/journeys/search'
      );
    });
  });
});

