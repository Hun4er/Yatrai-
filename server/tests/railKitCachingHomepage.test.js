import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { RailKitAdapter, buildRailKitCacheKey } from '../src/providers/rail/railKit.adapter.js';
import persistentCacheService, { CACHE_TTL_CONFIG } from '../src/services/rail/persistentCache.service.js';

describe('RailKit API Caching & Homepage Discovery Architecture', () => {
  afterEach(async () => {
    await persistentCacheService.clearAll();
  });

  describe('1. Deterministic Cache Keys', () => {
    it('generates consistent, normalized cache keys for availability', () => {
      const key1 = buildRailKitCacheKey('availability', {
        trainNo: '12310',
        from: 'ndls',
        to: 'pnbe',
        date: '2026-11-12',
        coach: '3a',
        quota: 'gn',
      });

      const key2 = buildRailKitCacheKey('availability', {
        trainNo: ' 012310 ',
        from: 'NDLS',
        to: 'PNBE',
        date: '2026-11-12',
        coach: '3A',
        quota: 'GN',
      });

      assert.equal(key1, 'railkit:availability:12310:NDLS:PNBE:2026-11-12:3A:GN');
      assert.equal(key1, key2);
    });

    it('generates distinct cache keys for different dates or classes', () => {
      const keyA = buildRailKitCacheKey('availability', {
        trainNo: '12310',
        from: 'NDLS',
        to: 'PNBE',
        date: '2026-11-12',
        coach: '3A',
        quota: 'GN',
      });

      const keyB = buildRailKitCacheKey('availability', {
        trainNo: '12310',
        from: 'NDLS',
        to: 'PNBE',
        date: '2026-11-13',
        coach: '3A',
        quota: 'GN',
      });

      const keyC = buildRailKitCacheKey('availability', {
        trainNo: '12310',
        from: 'NDLS',
        to: 'PNBE',
        date: '2026-11-12',
        coach: '2A',
        quota: 'GN',
      });

      assert.notEqual(keyA, keyB);
      assert.notEqual(keyA, keyC);
    });

    it('generates deterministic keys for station, search, schedule, PNR and live tracking', () => {
      assert.equal(
        buildRailKitCacheKey('station', { code: 'ndls' }),
        'railkit:station:NDLS'
      );
      assert.equal(
        buildRailKitCacheKey('search', { from: 'ndls', to: 'pnbe', date: '2026-11-12' }),
        'railkit:search:NDLS:PNBE:2026-11-12'
      );
      assert.equal(
        buildRailKitCacheKey('schedule', { trainNo: '12310' }),
        'railkit:schedule:12310'
      );
      assert.equal(
        buildRailKitCacheKey('pnr', { pnr: '234-567-8901' }),
        'railkit:pnr:2345678901'
      );
      assert.equal(
        buildRailKitCacheKey('live', { trainNo: '12310', date: '2026-11-12' }),
        'railkit:live:12310:2026-11-12'
      );
    });
  });

  describe('2. Persistent Cache Service (L1 Memory & Metadata)', () => {
    it('stores and retrieves items with freshness metadata', async () => {
      const key = 'test:preview:1';
      const sample = [{ trainNumber: '12310', trainName: 'Rajdhani Express' }];

      await persistentCacheService.set(key, sample, 'preview', 60000);

      const cached = await persistentCacheService.getWithMeta(key);
      assert.ok(cached);
      assert.equal(cached.meta.cached, true);
      assert.equal(cached.meta.stale, false);
      assert.deepEqual(cached.data, sample);
      assert.ok(cached.meta.fetchedAt);
      assert.ok(cached.meta.expiresAt);
    });

    it('tracks cache hit and miss statistics', async () => {
      const initialStats = persistentCacheService.getStats();
      const testKey = 'test:stats:key';

      // 1. Miss
      const miss = await persistentCacheService.get(testKey);
      assert.equal(miss, null);

      // 2. Set
      await persistentCacheService.set(testKey, { val: 42 }, 'availability', 60000);

      // 3. Hit
      const hit = await persistentCacheService.get(testKey);
      assert.deepEqual(hit, { val: 42 });

      const updatedStats = persistentCacheService.getStats();
      assert.ok(updatedStats.totalHits >= initialStats.totalHits + 1);
    });

    it('negative caching stores not-found outcomes with short TTL', async () => {
      const key = 'test:negative:key';
      await persistentCacheService.setNegative(key, { notFound: true, reason: '404' });

      const cached = await persistentCacheService.get(key);
      assert.deepEqual(cached, { notFound: true, reason: '404' });
    });
  });

  describe('3. RailKit Adapter Request Coalescing & Observability', () => {
    it('coalesces concurrent in-flight requests into a single upstream call', async () => {
      let callCount = 0;
      const mockFetch = async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 40));
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ success: true, data: { status: 'AVAILABLE' } }),
        };
      };

      const adapter = new RailKitAdapter({ fetchFn: mockFetch, disablePersistentCache: true });
      process.env.LIVE_REQUESTS_ALLOWED = 'true';

      const key = 'test:coalesce:avail';
      const [r1, r2, r3] = await Promise.all([
        adapter._cachedFetch(key, 5000, () => adapter._fetch('https://api.railkit.in/api/v1/test')),
        adapter._cachedFetch(key, 5000, () => adapter._fetch('https://api.railkit.in/api/v1/test')),
        adapter._cachedFetch(key, 5000, () => adapter._fetch('https://api.railkit.in/api/v1/test')),
      ]);

      assert.equal(callCount, 1, 'Only one upstream request should be executed');
      assert.deepEqual(r1, r2);
      assert.deepEqual(r2, r3);

      const stats = adapter.getStats();
      assert.equal(stats.cacheMetrics.inFlightCoalesced, 2);
    });

    it('caches PNR status and live tracking responses with configurable TTLs', async () => {
      let pnrCalls = 0;
      const mockFetch = async (url) => {
        if (url.includes('/api/v1/pnr/')) {
          pnrCalls++;
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ success: true, data: { pnr: '1234567890', status: 'CNF' } }),
          };
        }
        return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, data: {} }) };
      };

      const adapter = new RailKitAdapter({ fetchFn: mockFetch, disablePersistentCache: true });
      process.env.LIVE_REQUESTS_ALLOWED = 'true';

      const res1 = await adapter.checkPNRStatus('1234567890');
      const res2 = await adapter.checkPNRStatus('1234567890');

      assert.equal(pnrCalls, 1, 'Subsequent PNR call should hit cache without network request');
      assert.equal(res1.status, 'ok');
      assert.equal(res2.status, 'ok');
    });

    it('never poisons cache with failed 500 responses', async () => {
      let attempts = 0;
      const mockFetch = async () => {
        attempts++;
        return {
          ok: false,
          status: 500,
          text: async () => JSON.stringify({ success: false, message: 'Server Internal Error' }),
        };
      };

      const adapter = new RailKitAdapter({ fetchFn: mockFetch, disablePersistentCache: true });
      process.env.LIVE_REQUESTS_ALLOWED = 'true';

      const key = 'test:fail:key';
      await assert.rejects(
        () => adapter._cachedFetch(key, 5000, () => adapter._fetch('https://api.railkit.in/api/v1/fail')),
        /500/
      );

      // Verify key was not stored in memory cache as valid data
      assert.equal(adapter._cache.has(key), false);
    });
  });

  describe('4. Configurable Cache TTL Configuration', () => {
    it('defines distinct TTL policies across data categories', () => {
      assert.ok(CACHE_TTL_CONFIG.station >= 24 * 60 * 60 * 1000, 'Station metadata TTL >= 24h');
      assert.ok(CACHE_TTL_CONFIG.fare >= 24 * 60 * 60 * 1000, 'Fare tariff TTL >= 24h');
      assert.ok(CACHE_TTL_CONFIG.schedule >= 15 * 60 * 1000, 'Schedule TTL >= 15m');
      assert.ok(CACHE_TTL_CONFIG.search >= 15 * 60 * 1000, 'Search route TTL >= 15m');
      assert.ok(CACHE_TTL_CONFIG.availability <= 60 * 1000, 'Availability TTL <= 60s');
      assert.ok(CACHE_TTL_CONFIG.pnr <= 30 * 1000, 'PNR TTL <= 30s');
      assert.ok(CACHE_TTL_CONFIG.live <= 30 * 1000, 'Live tracking TTL <= 30s');
      assert.ok(CACHE_TTL_CONFIG.negative === 5 * 60 * 1000, 'Negative outcome TTL = 5m');
    });
  });
});
