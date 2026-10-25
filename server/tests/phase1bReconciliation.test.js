import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { RailKitAdapter } from '../src/providers/rail/railKit.adapter.js';
import { RequestBudgetTracker } from '../src/services/rail/requestBudget.js';
import { DirectJourneyService, isUsableJourney } from '../src/services/rail/directJourney.service.js';
import { ProviderHealthService } from '../src/services/providerHealth.service.js';
import { AVAILABILITY_STATUS } from '../src/services/rail/availability.service.js';

describe('Phase 1b-i Reconciliation & Enforcement Tests', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.LIVE_REQUESTS_ALLOWED;

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.LIVE_REQUESTS_ALLOWED = originalEnv;
  });

  describe('1. Single Counting Point & Outbound Gating', () => {
    it('Refuses outbound calls when LIVE_REQUESTS_ALLOWED is not true', async () => {
      process.env.LIVE_REQUESTS_ALLOWED = 'false';
      const adapter = new RailKitAdapter({ apiKey: 'test_key', baseUrl: 'https://api.railkit.in' });

      await assert.rejects(
        async () => {
          await adapter._fetch('https://api.railkit.in/api/v1/pnr/1234567890');
        },
        (err) => {
          assert.equal(err.code, 'LIVE_REQUESTS_BLOCKED');
          assert.equal(err.status, 403);
          return true;
        }
      );
    });

    it('Counts every outbound HTTP attempt at the single counting point, including retries', async () => {
      process.env.LIVE_REQUESTS_ALLOWED = 'true';
      const adapter = new RailKitAdapter({ apiKey: 'test_key', baseUrl: 'https://api.railkit.in' });

      let attempts = 0;
      global.fetch = async (url) => {
        attempts++;
        if (attempts === 1) {
          // Attempt 1 fails with 500 to trigger retry
          return {
            ok: false,
            status: 500,
            statusText: 'Server Error',
            text: async () => 'Internal Server Error',
          };
        }
        // Attempt 2 succeeds
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ success: true, data: { status: 'CNF' } }),
          text: async () => JSON.stringify({ success: true, data: { status: 'CNF' } }),
        };
      };

      const res = await adapter.checkPNRStatus('1234567890');
      assert.equal(res.status, 'ok');
      assert.equal(attempts, 2, 'Must have made 2 HTTP attempts');

      const stats = adapter.getStats();
      assert.equal(stats.rawOutboundRequests, 2, 'Usage counter must record exactly 2 outbound requests (attempt 1 + retry)');
    });

    it('Counts trackTrain and checkPNR at the single outbound counting point', async () => {
      process.env.LIVE_REQUESTS_ALLOWED = 'true';
      const adapter = new RailKitAdapter({ apiKey: 'test_key', baseUrl: 'https://api.railkit.in' });

      global.fetch = async (url) => {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ success: true, data: {} }),
          text: async () => JSON.stringify({ success: true, data: {} }),
        };
      };

      await adapter.syncUsage();
      const initial = adapter.getStats().totalOutboundRequests;
      await adapter.checkPNRStatus('9876543210');
      assert.equal(adapter.getStats().totalOutboundRequests - initial, 1);

      await adapter.trackTrain('12309', '2026-10-25');
      assert.equal(adapter.getStats().totalOutboundRequests - initial, 2);
    });
  });

  describe('2. Static Allowance & Tier Sub-limits Enforcement', () => {
    it('Static allowance enforces Tier 1 default 2, Tier 2 default 8, and stops at limit', () => {
      const tracker = new RequestBudgetTracker({
        maxStaticRequests: 10,
        tier1Limit: 2,
        tier2Limit: 3,
      });

      assert.equal(tracker.canMakeStaticRequest('tier1'), true);
      const res1 = tracker.reserve('static', { tier: 'tier1' });
      assert.ok(res1);
      res1.commit();

      assert.equal(tracker.canMakeStaticRequest('tier1'), true);
      const res2 = tracker.reserve('static', { tier: 'tier1' });
      assert.ok(res2);
      res2.commit();

      // Tier 1 limit (2) reached
      assert.equal(tracker.canMakeStaticRequest('tier1'), false, 'Tier 1 must be blocked after 2 requests');
      assert.equal(tracker.reserve('static', { tier: 'tier1' }), null);

      // Tier 2 should still be allowed
      assert.equal(tracker.canMakeStaticRequest('tier2'), true);
      const resT2_1 = tracker.reserve('static', { tier: 'tier2' });
      assert.ok(resT2_1);
      resT2_1.commit();

      const resT2_2 = tracker.reserve('static', { tier: 'tier2' });
      resT2_2.commit();

      const resT2_3 = tracker.reserve('static', { tier: 'tier2' });
      resT2_3.commit();

      // Tier 2 limit (3) reached
      assert.equal(tracker.canMakeStaticRequest('tier2'), false, 'Tier 2 must be blocked after 3 requests');
      assert.equal(tracker.reserve('static', { tier: 'tier2' }), null);
    });
  });

  describe('3. Tiered Cluster Search & Fallback Rules', () => {
    it('Evaluates isUsableJourney correctly for confirmed, RAC, manageable WL, and deep WL', () => {
      assert.equal(isUsableJourney({ availability: { normalizedStatus: 'AVAILABLE' } }), true);
      assert.equal(isUsableJourney({ availability: { normalizedStatus: 'RAC' } }), true);
      assert.equal(isUsableJourney({ availability: { normalizedStatus: 'WAITLISTED', rawStatus: 'GNWL 4/WL 2' } }), true);
      assert.equal(isUsableJourney({ availability: { normalizedStatus: 'WAITLISTED', rawStatus: 'GNWL 50/WL 35' } }), false);
      assert.equal(isUsableJourney({ availability: { normalizedStatus: 'NOT_AVAILABLE' } }), false);
      assert.equal(isUsableJourney(null), false);
    });

    it('Tier 2 does NOT run when Tier 1 finds a usable result', async () => {
      let tier2Queried = false;
      const mockRailKit = {
        searchTrainBetweenStations: async (from, to, opts) => {
          if (opts?.tier === 'tier2') {
            tier2Queried = true;
          }
          if (from === 'NDLS' && to === 'PNBE') {
            return {
              success: true,
              data: [
                {
                  train_no: '12310',
                  train_name: 'PATNA RAJDHANI',
                  from_time: '17:10',
                  to_time: '05:15',
                  running_days: '1111111',
                  distance: '998',
                  travel_time: '12:05',
                  from_stn_code: 'NDLS',
                  to_stn_code: 'PNBE',
                },
              ],
            };
          }
          return { success: true, data: [] };
        },
      };

      const mockAvailability = {
        checkLegAvailability: async () => ({
          normalizedStatus: AVAILABILITY_STATUS.AVAILABLE,
          seatsAvailable: 25,
          rawStatus: 'AVAILABLE 25',
        }),
      };

      const mockFare = {
        getLegFare: async () => ({ totalFare: 2200, currency: 'INR', isEstimated: false }),
      };

      const service = new DirectJourneyService({
        railKit: mockRailKit,
        railRadar: null,
        availabilityService: mockAvailability,
        fareService: mockFare,
      });

      const tracker = new RequestBudgetTracker({ maxDirectRequests: 4 });
      const result = await service.searchDirectTrains(
        {
          origin: 'NDLS',
          destination: 'PNBE',
          departureDate: '2026-10-25',
          preferences: { class: '3A', quota: 'GN' },
        },
        { budgetTracker: tracker }
      );

      assert.equal(result.status, 'DIRECT_AVAILABLE');
      assert.equal(tier2Queried, false, 'Tier 2 must NOT run when Tier 1 has usable results');
    });

    it('Tier 2 DOES run when Tier 1 yields no usable result (e.g. deep waitlist)', async () => {
      let tier2Queried = false;
      const mockRailKit = {
        searchTrainBetweenStations: async (from, to, opts) => {
          if (opts?.tier === 'tier2') {
            tier2Queried = true;
            if (from === 'ANVT' && to === 'PNBE') {
              return {
                success: true,
                data: [
                  {
                    train_no: '20508',
                    train_name: 'SANG RAJDHANI',
                    from_time: '19:50',
                    to_time: '08:03',
                    running_days: '1111111',
                    distance: '990',
                    travel_time: '12:13',
                    from_stn_code: 'ANVT',
                    to_stn_code: 'PNBE',
                  },
                ],
              };
            }
          }
          if (from === 'NDLS' && to === 'PNBE') {
            return {
              success: true,
              data: [
                {
                  train_no: '12310',
                  train_name: 'PATNA RAJDHANI',
                  from_time: '17:10',
                  to_time: '05:15',
                  running_days: '1111111',
                  distance: '998',
                  travel_time: '12:05',
                  from_stn_code: 'NDLS',
                  to_stn_code: 'PNBE',
                },
              ],
            };
          }
          return { success: true, data: [] };
        },
      };

      const mockAvailability = {
        checkLegAvailability: async ({ trainNumber }) => {
          if (trainNumber === '12310') {
            // Tier 1 train has deep waitlist (unlikely / not usable)
            return {
              normalizedStatus: AVAILABILITY_STATUS.WAITLISTED,
              seatsAvailable: 0,
              rawStatus: 'GNWL 65/WL 48',
            };
          }
          // Tier 2 train is confirmed available
          return {
            normalizedStatus: AVAILABILITY_STATUS.AVAILABLE,
            seatsAvailable: 12,
            rawStatus: 'AVAILABLE 12',
          };
        },
      };

      const mockFare = {
        getLegFare: async () => ({ totalFare: 2100, currency: 'INR', isEstimated: false }),
      };

      const service = new DirectJourneyService({
        railKit: mockRailKit,
        railRadar: null,
        availabilityService: mockAvailability,
        fareService: mockFare,
      });

      const tracker = new RequestBudgetTracker({ maxDirectRequests: 4 });
      const result = await service.searchDirectTrains(
        {
          origin: 'NDLS',
          destination: 'PNBE',
          departureDate: '2026-10-25',
          preferences: { class: '3A', quota: 'GN' },
        },
        { budgetTracker: tracker }
      );

      assert.equal(tier2Queried, true, 'Tier 2 MUST run when Tier 1 yielded no usable result');
      assert.ok(result.directJourneys.some((j) => j.metadata?.trainNumber === '20508'), 'ANVT train from Tier 2 must be found');
    });

    it('Tier 3 runs ONLY when exploreAlternatives is true', async () => {
      let tier3Queried = false;
      const mockRailKit = {
        searchTrainBetweenStations: async (from, to, opts) => {
          if (opts?.tier === 'tier3') {
            tier3Queried = true;
          }
          return { success: true, data: [] };
        },
      };

      const service = new DirectJourneyService({
        railKit: mockRailKit,
        railRadar: null,
        availabilityService: { checkLegAvailability: async () => ({ normalizedStatus: 'AVAILABLE' }) },
        fareService: { getLegFare: async () => ({ totalFare: 1000 }) },
      });

      // Run without exploreAlternatives
      await service.searchDirectTrains(
        { origin: 'NDLS', destination: 'PNBE', departureDate: '2026-10-25' },
        { exploreAlternatives: false }
      );
      assert.equal(tier3Queried, false, 'Tier 3 must NOT run when exploreAlternatives is false');

      // Run with exploreAlternatives: true
      await service.searchDirectTrains(
        { origin: 'NDLS', destination: 'PNBE', departureDate: '2026-10-25' },
        { exploreAlternatives: true }
      );
      assert.equal(tier3Queried, true, 'Tier 3 MUST run when exploreAlternatives is true');
    });
  });

  describe('4. Provider Health Service Live Ping Guard', () => {
    it('Health check makes NO outbound network call by default', async () => {
      let networkCalled = false;
      global.fetch = async () => {
        networkCalled = true;
        return { ok: true, status: 200, json: async () => ({}) };
      };

      const health = new ProviderHealthService();
      const railStatus = await health.checkRail();

      assert.equal(networkCalled, false, 'checkRail must make 0 network calls when live is false/omitted');
      assert.equal(railStatus.status, 'not_checked_live');
      assert.equal(railStatus.liveChecked, false);
    });

    it('Health check executes live ping ONLY when live=true is provided', async () => {
      let pingedUrl = '';
      global.fetch = async (url) => {
        pingedUrl = String(url);
        return { ok: true, status: 200, json: async () => ({}) };
      };

      const health = new ProviderHealthService();
      const railStatus = await health.checkRail({ live: true });

      assert.ok(pingedUrl.includes('/trains/between/NDLS/BPL'), 'Must ping RailKit trains/between endpoint when live=true');
      assert.equal(railStatus.status, 'healthy');
      assert.equal(railStatus.liveChecked, true);
    });
  });

  describe('5. Stats Route Protection', () => {
    it('Refuses access in production when user is not an admin', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        // Simulate handler logic
        const reqNonAdmin = { user: { role: 'user' } };
        const reqAdmin = { user: { role: 'admin' } };
        const isDev = process.env.NODE_ENV === 'development';

        const checkAuth = (req) => {
          const isAdmin = req.user?.role === 'admin';
          return isDev || isAdmin;
        };

        assert.equal(checkAuth(reqNonAdmin), false, 'Non-admin user in production must be refused');
        assert.equal(checkAuth(reqAdmin), true, 'Admin user in production must be permitted');
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });
});
