import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import config from '../src/config/index.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup.js';
import { createApp } from '../src/app.js';

import Location from '../src/models/Location.js';
import User from '../src/models/User.js';
import Journey from '../src/models/Journey.js';
import JourneyLeg from '../src/models/JourneyLeg.js';
import SearchRequest from '../src/models/SearchRequest.js';
import SearchResult from '../src/models/SearchResult.js';
import TransportProvider from '../src/models/TransportProvider.js';

import { JourneyOrchestrator } from '../src/orchestration/journeyOrchestrator.js';
import { JourneyNormalizer } from '../src/normalization/journeyNormalizer.js';
import { validateJourneyCandidate } from '../src/normalization/journeyValidator.js';
import { JourneyDeduplicator } from '../src/deduplication/journeyDeduplicator.js';
import { rankingEngine } from '../src/ranking/rankingEngine.js';
import { httpFetch } from '../src/providers/transport/httpClient.js';
import { ProviderError, sanitizeCredentials } from '../src/providers/transport/errors.js';
import {
  createSuccessEnvelope,
  createEmptyEnvelope,
} from '../src/providers/transport/envelope.js';
import { isPastDate, isValidCalendarDate } from '../src/middleware/validate.middleware.js';

describe('Yatrai Phase 16 — Edge Cases & Failure Resilience Suite', () => {
  let app;
  let server;
  let baseUrl;
  let sonipatLoc;
  let patnaLoc;
  let delhiLoc;
  let testUser;
  let validUserToken;

  before(async () => {
    await setupTestDb();
    await Promise.all([
      Location.init(),
      User.init(),
      Journey.init(),
      JourneyLeg.init(),
      SearchRequest.init(),
      SearchResult.init(),
      TransportProvider.init(),
    ]);

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

    sonipatLoc = await Location.create({
      name: 'Sonipat Junction Railway Station',
      displayName: 'Sonipat, Haryana',
      city: 'Sonipat',
      state: 'Haryana',
      country: 'India',
      countryCode: 'IN',
      type: 'railway_station',
      location: {
        type: 'Point',
        coordinates: [77.0163, 28.9958],
      },
      aliases: ['Sonipat', 'SNP', 'Sonipat Jn'],
    });

    patnaLoc = await Location.create({
      name: 'Patna Junction Railway Station',
      displayName: 'Patna, Bihar',
      city: 'Patna',
      state: 'Bihar',
      country: 'India',
      countryCode: 'IN',
      type: 'railway_station',
      location: {
        type: 'Point',
        coordinates: [85.1376, 25.6022],
      },
      aliases: ['Patna', 'PNBE', 'Patna Jn'],
    });

    delhiLoc = await Location.create({
      name: 'New Delhi Railway Station',
      displayName: 'New Delhi, Delhi',
      city: 'Delhi',
      state: 'Delhi',
      country: 'India',
      countryCode: 'IN',
      type: 'railway_station',
      location: {
        type: 'Point',
        coordinates: [77.2218, 28.6431],
      },
      aliases: ['New Delhi', 'NDLS', 'Delhi'],
    });

    testUser = await User.create({
      name: 'Resilience Test User',
      email: 'resilience@yatrai.test',
      password: 'SecurePassword123!',
      role: 'user',
      status: 'active',
    });

    validUserToken = jwt.sign(
      { sub: testUser._id.toString(), role: 'user' },
      config.auth.jwtAccessSecret,
      { expiresIn: '15m' }
    );
  });

  // ============================================================================
  // 1. ORIGIN = DESTINATION
  // ============================================================================
  describe('1. Origin = Destination Edge Case', () => {
    it('rejects identical string names with 400 VALIDATION_ERROR', async () => {
      const res = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Sonipat',
          departureDate: '2026-10-01',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
      assert.match(data.error.message, /Origin and destination cannot be the same/i);
    });

    it('rejects identical case-insensitive names (e.g. "sonipat" vs "SONIPAT")', async () => {
      const res = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'sonipat',
          destination: 'SONIPAT',
          departureDate: '2026-10-01',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('rejects in orchestrator when resolved to identical canonical location ID', async () => {
      const orchestrator = new JourneyOrchestrator({
        locationResolver: {
          resolveLocation: async () => sonipatLoc,
        },
      });

      await assert.rejects(
        async () => {
          await orchestrator.orchestrateSearch({
            origin: 'Sonipat Station',
            destination: 'Sonipat Junction',
            departureDate: '2026-10-01',
          });
        },
        (err) => {
          assert.equal(err.code, 'SAME_ORIGIN_DESTINATION');
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    });
  });

  // ============================================================================
  // 2. INVALID LOCATION
  // ============================================================================
  describe('2. Invalid Location Handling', () => {
    it('rejects empty, null, or whitespace location with 400', async () => {
      const res = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: '   ',
          destination: 'Patna',
          departureDate: '2026-10-01',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('rejects unresolvable location with 404 LOCATION_NOT_FOUND without calling providers', async () => {
      let providersCalled = false;
      const fakeProvider = {
        mode: 'rail',
        search: async () => {
          providersCalled = true;
          return { status: 'success', candidates: [] };
        },
      };

      const orchestrator = new JourneyOrchestrator({
        providerRegistry: { getProviders: () => [fakeProvider] },
      });

      await assert.rejects(
        async () => {
          await orchestrator.orchestrateSearch({
            origin: 'UnknownPlace9999999999',
            destination: 'Patna Junction Railway Station',
            departureDate: '2026-10-01',
          });
        },
        (err) => {
          assert.equal(err.code, 'LOCATION_NOT_FOUND');
          assert.equal(err.statusCode, 404);
          return true;
        }
      );

      assert.equal(providersCalled, false, 'Providers must NOT be called when location resolution fails');
    });
  });

  // ============================================================================
  // 3. DATE VALIDATION: INVALID & PAST DATES
  // ============================================================================
  describe('3. Strict Calendar & Past Date Validation', () => {
    it('detects past dates correctly in Asia/Kolkata timezone context', () => {
      assert.equal(isPastDate('2020-01-01'), true);
      assert.equal(isPastDate('2025-05-15'), true);
      assert.equal(isPastDate('2099-12-31'), false);
    });

    it('rejects departureDate in the past with 400 VALIDATION_ERROR', async () => {
      const res = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Patna',
          departureDate: '2024-01-01',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
      assert.match(data.error.message, /Departure date cannot be in the past/i);
    });

    it('rejects calendar rollover dates like 2026-02-31 without silent normalization', async () => {
      assert.equal(isValidCalendarDate('2026-02-31'), false);
      assert.equal(isValidCalendarDate('2026-04-31'), false);
      assert.equal(isValidCalendarDate('2026-99-99'), false);
      assert.equal(isValidCalendarDate('invalid-date'), false);

      const res = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Patna',
          departureDate: '2026-02-31',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('rejects return date earlier than departure date', async () => {
      const res = await fetch(`${baseUrl}/api/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'Sonipat',
          destination: 'Patna',
          departureDate: '2026-10-15',
          returnDate: '2026-10-10',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'VALIDATION_ERROR');
      assert.match(data.error.message, /Return date cannot be earlier than departure date/i);
    });
  });

  // ============================================================================
  // 4. AUTHENTICATION EDGE CASES
  // ============================================================================
  describe('4. Authentication Edge Cases', () => {
    it('rejects expired user access token with 401 TOKEN_EXPIRED', async () => {
      const expiredToken = jwt.sign(
        { sub: testUser._id.toString(), role: 'user' },
        config.auth.jwtAccessSecret,
        { expiresIn: '-10s' }
      );

      const res = await fetch(`${baseUrl}/api/saved-journeys`, {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error.code, 'TOKEN_EXPIRED');
    });

    it('rejects malformed token with 401 UNAUTHORIZED', async () => {
      const res = await fetch(`${baseUrl}/api/saved-journeys`, {
        headers: { Authorization: 'Bearer this-is-not-a-valid-jwt-token' },
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error.code, 'UNAUTHORIZED');
    });

    it('rejects non-admin accessing admin endpoints with 403 FORBIDDEN', async () => {
      const res = await fetch(`${baseUrl}/api/admin/metrics`, {
        headers: { Authorization: `Bearer ${validUserToken}` },
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.error.code, 'FORBIDDEN');
    });
  });

  // ============================================================================
  // 5. PROVIDER RESILIENCE: TIMEOUT, RATE LIMIT, AUTH, NETWORK, MALFORMED
  // ============================================================================
  describe('5. Provider Resilience & Fault Isolation', () => {
    it('classifies provider HTTP 429 as PROVIDER_RATE_LIMITED without crashing', async () => {
      const mockFetch = async () => ({
        ok: false,
        status: 429,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'Too Many Requests' }),
      });

      await assert.rejects(
        async () => {
          await httpFetch('https://api.test/rate-limited', {
            provider: 'test-rail',
            fetchFn: mockFetch,
            maxRetries: 0,
          });
        },
        (err) => {
          assert.equal(err.code, 'PROVIDER_RATE_LIMITED');
          assert.equal(err.statusCode, 429);
          return true;
        }
      );
    });

    it('classifies external provider 401/403 as PROVIDER_AUTH_ERROR without leaking secrets', async () => {
      const mockFetch = async () => ({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Invalid API Key', apiKey: 'secret-key-12345' }),
      });

      await assert.rejects(
        async () => {
          await httpFetch('https://api.test/protected', {
            provider: 'test-flight',
            fetchFn: mockFetch,
            maxRetries: 0,
          });
        },
        (err) => {
          assert.equal(err.code, 'PROVIDER_AUTH_ERROR');
          assert.equal(err.statusCode, 401);
          // Verify details sanitized credentials
          assert.equal(err.details?.apiKey, '[REDACTED]');
          return true;
        }
      );
    });

    it('classifies provider timeout as PROVIDER_TIMEOUT', async () => {
      const mockFetch = async (_url, { signal }) => {
        return new Promise((_, reject) => {
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      };

      await assert.rejects(
        async () => {
          await httpFetch('https://api.test/slow', {
            provider: 'test-bus',
            timeoutMs: 50,
            maxRetries: 0,
            fetchFn: mockFetch,
          });
        },
        (err) => {
          assert.equal(err.code, 'PROVIDER_TIMEOUT');
          assert.equal(err.statusCode, 504);
          return true;
        }
      );
    });

    it('classifies network failure (e.g. DNS / ECONNREFUSED) as NETWORK_ERROR', async () => {
      const mockFetch = async () => {
        const netErr = new Error('connect ECONNREFUSED 127.0.0.1:9999');
        netErr.code = 'ECONNREFUSED';
        throw netErr;
      };

      await assert.rejects(
        async () => {
          await httpFetch('https://api.test/unreachable', {
            provider: 'test-road',
            maxRetries: 0,
            fetchFn: mockFetch,
          });
        },
        (err) => {
          assert.equal(err.code, 'NETWORK_ERROR');
          assert.equal(err.statusCode, 503);
          return true;
        }
      );
    });

    it('sanitizes credentials and secrets recursively across data objects', () => {
      const dirty = {
        apiKey: 'irctc-secret-token',
        nested: {
          client_secret: 'super-secret',
          authToken: 'bearer xyz',
          normalData: 'Delhi to Patna',
        },
        list: [{ password: 'mypassword', station: 'NDLS' }],
      };

      const clean = sanitizeCredentials(dirty);
      assert.equal(clean.apiKey, '[REDACTED]');
      assert.equal(clean.nested.client_secret, '[REDACTED]');
      assert.equal(clean.nested.authToken, '[REDACTED]');
      assert.equal(clean.nested.normalData, 'Delhi to Patna');
      assert.equal(clean.list[0].password, '[REDACTED]');
      assert.equal(clean.list[0].station, 'NDLS');
    });
  });

  // ============================================================================
  // 6. PARTIAL PROVIDER FAILURE VS ALL PROVIDERS FAILURE
  // ============================================================================
  describe('6. Partial Success vs All Providers Failure', () => {
    it('partial failure: Rail ❌, Bus ✅, Flight ❌, Road ✅ returns Bus + Road results', async () => {
      const depTime = new Date('2026-10-01T08:00:00.000Z');
      const arrTime = new Date('2026-10-01T14:00:00.000Z');

      const railProvider = {
        mode: 'rail',
        search: async () => {
          throw new ProviderError('Rail API 500 error', { code: 'PROVIDER_ERROR' });
        },
      };

      const busProvider = {
        mode: 'bus',
        search: async () =>
          createSuccessEnvelope({
            provider: 'bus',
            candidates: [
              {
                mode: 'bus',
                origin: sonipatLoc._id,
                destination: patnaLoc._id,
                departureTime: depTime,
                arrivalTime: arrTime,
                duration: 360,
                price: 850,
                currency: 'INR',
                legs: [
                  {
                    sequence: 1,
                    mode: 'bus',
                    origin: sonipatLoc._id,
                    destination: patnaLoc._id,
                    departureTime: depTime,
                    arrivalTime: arrTime,
                    duration: 360,
                    price: 850,
                  },
                ],
              },
            ],
          }),
      };

      const flightProvider = {
        mode: 'flight',
        search: async () => {
          throw new ProviderError('Flight gateway timeout', { code: 'PROVIDER_TIMEOUT' });
        },
      };

      const roadProvider = {
        mode: 'road',
        search: async () =>
          createSuccessEnvelope({
            provider: 'road',
            candidates: [
              {
                mode: 'road',
                origin: sonipatLoc._id,
                destination: patnaLoc._id,
                departureTime: depTime,
                arrivalTime: new Date('2026-10-01T18:00:00.000Z'),
                duration: 600,
                price: 3500,
                currency: 'INR',
                legs: [
                  {
                    sequence: 1,
                    mode: 'road',
                    origin: sonipatLoc._id,
                    destination: patnaLoc._id,
                    departureTime: depTime,
                    arrivalTime: new Date('2026-10-01T18:00:00.000Z'),
                    duration: 600,
                    price: 3500,
                  },
                ],
              },
            ],
          }),
      };

      const orchestrator = new JourneyOrchestrator({
        providerRegistry: {
          getProviders: () => [railProvider, busProvider, flightProvider, roadProvider],
        },
      });

      const response = await orchestrator.orchestrateSearch(
        {
          origin: sonipatLoc._id,
          destination: patnaLoc._id,
          departureDate: '2026-10-01',
        },
        { includeDevelopment: false }
      );

      assert.equal(response.status, 'completed');
      assert.equal(response.journeys.length, 2);
      const modes = response.journeys.map((j) => j.transportModes[0]);
      assert.ok(modes.includes('bus'));
      assert.ok(modes.includes('road'));
      assert.ok(!modes.includes('rail'));
      assert.ok(!modes.includes('flight'));

      // Verify provider statuses reflect partial failures
      const failed = response.meta.providers.filter((p) => p.status === 'failed');
      assert.equal(failed.length, 2);
    });

    it('all providers fail: throws ALL_PROVIDERS_FAILED (HTTP 502), NOT "no routes found"', async () => {
      const p1 = {
        mode: 'rail',
        search: async () => {
          throw new Error('Rail network connection refused');
        },
      };
      const p2 = {
        mode: 'bus',
        search: async () => {
          throw new Error('Bus gateway timeout');
        },
      };

      const orchestrator = new JourneyOrchestrator({
        providerRegistry: { getProviders: () => [p1, p2] },
      });

      await assert.rejects(
        async () => {
          await orchestrator.orchestrateSearch(
            {
              origin: sonipatLoc._id,
              destination: patnaLoc._id,
              departureDate: '2026-10-01',
            },
            { includeDevelopment: false }
          );
        },
        (err) => {
          assert.equal(err.code, 'ALL_PROVIDERS_FAILED');
          assert.equal(err.statusCode, 502);
          return true;
        }
      );
    });

    it('all providers succeed with 0 results: returns 200 with empty journeys [], NOT 502', async () => {
      const p1 = {
        mode: 'rail',
        search: async () => createEmptyEnvelope({ provider: 'rail' }),
      };
      const p2 = {
        mode: 'bus',
        search: async () => createEmptyEnvelope({ provider: 'bus' }),
      };

      const orchestrator = new JourneyOrchestrator({
        providerRegistry: { getProviders: () => [p1, p2] },
      });

      const response = await orchestrator.orchestrateSearch(
        {
          origin: sonipatLoc._id,
          destination: patnaLoc._id,
          departureDate: '2026-10-01',
        },
        { includeDevelopment: false }
      );

      assert.equal(response.status, 'completed');
      assert.equal(response.count, 0);
      assert.deepEqual(response.journeys, []);
    });
  });

  // ============================================================================
  // 7. NORMALIZATION CANDIDATE FAULT ISOLATION
  // ============================================================================
  describe('7. Normalization Candidate Fault Isolation', () => {
    it('safely rejects malformed candidate without discarding valid candidate in same search', () => {
      const normalizer = new JourneyNormalizer();
      const depTime = new Date('2026-10-01T08:00:00.000Z');
      const arrTime = new Date('2026-10-01T14:00:00.000Z');

      const envelope = {
        provider: 'rail',
        status: 'success',
        candidates: [
          // Malformed candidate (missing departure and arrival times, invalid price)
          {
            trainNumber: '12424',
            price: 'not-a-number',
            duration: -50,
          },
          // Valid candidate
          {
            mode: 'rail',
            origin: sonipatLoc._id,
            destination: patnaLoc._id,
            departureTime: depTime,
            arrivalTime: arrTime,
            duration: 360,
            price: 1200,
            currency: 'INR',
            legs: [
              {
                sequence: 1,
                mode: 'rail',
                origin: sonipatLoc._id,
                destination: patnaLoc._id,
                departureTime: depTime,
                arrivalTime: arrTime,
                duration: 360,
                price: 1200,
              },
            ],
          },
        ],
      };

      const results = normalizer.normalize(envelope, {}, { validate: true });
      assert.equal(results.length, 1);
      assert.equal(results[0].legs[0].mode, 'rail');
    });

    it('rejects candidate with broken leg sequence or broken transfer continuity', () => {
      const depTime = new Date('2026-10-01T08:00:00.000Z');
      const arrTime1 = new Date('2026-10-01T12:00:00.000Z');
      const depTime2 = new Date('2026-10-01T11:00:00.000Z'); // Departs BEFORE leg 1 arrives!
      const arrTime2 = new Date('2026-10-01T16:00:00.000Z');

      const invalidCandidate = {
        origin: sonipatLoc._id,
        destination: patnaLoc._id,
        departureTime: depTime,
        arrivalTime: arrTime2,
        duration: 480,
        price: 1500,
        legs: [
          {
            sequence: 1,
            mode: 'rail',
            origin: sonipatLoc._id,
            destination: delhiLoc._id,
            departureTime: depTime,
            arrivalTime: arrTime1,
            duration: 240,
            price: 500,
          },
          {
            sequence: 2,
            mode: 'rail',
            origin: delhiLoc._id,
            destination: patnaLoc._id,
            departureTime: depTime2,
            arrivalTime: arrTime2,
            duration: 300,
            price: 1000,
          },
        ],
      };

      const validation = validateJourneyCandidate(invalidCandidate);
      assert.equal(validation.valid, false);
      assert.ok(validation.errors.some((e) => /Leg timing continuity broken/i.test(e)));
    });
  });

  // ============================================================================
  // 8. MULTI-TRANSFER JOURNEYS (0, 1, 2, 3+ TRANSFERS)
  // ============================================================================
  describe('8. Multi-Transfer Journey Canonical Integrity', () => {
    it('validates 0 transfers journey correctly', () => {
      const candidate = {
        origin: sonipatLoc._id,
        destination: patnaLoc._id,
        departureTime: new Date('2026-10-01T06:00:00Z'),
        arrivalTime: new Date('2026-10-01T12:00:00Z'),
        duration: 360,
        totalPrice: 1000,
        legs: [
          {
            sequence: 1,
            mode: 'rail',
            origin: sonipatLoc._id,
            destination: patnaLoc._id,
            departureTime: new Date('2026-10-01T06:00:00Z'),
            arrivalTime: new Date('2026-10-01T12:00:00Z'),
            duration: 360,
            price: 1000,
          },
        ],
      };

      const val = validateJourneyCandidate(candidate);
      assert.equal(val.valid, true);
    });

    it('validates 2 transfers (3 sequential legs) with contiguous sequence and station continuity', () => {
      const intermediateLoc1 = delhiLoc._id;
      const intermediateLoc2 = '654321098765432109876543';

      const candidate = {
        origin: sonipatLoc._id,
        destination: patnaLoc._id,
        departureTime: new Date('2026-10-01T06:00:00Z'),
        arrivalTime: new Date('2026-10-01T20:00:00Z'),
        duration: 840,
        totalPrice: 2200,
        legs: [
          {
            sequence: 1,
            mode: 'road',
            origin: sonipatLoc._id,
            destination: intermediateLoc1,
            departureTime: new Date('2026-10-01T06:00:00Z'),
            arrivalTime: new Date('2026-10-01T07:30:00Z'),
            duration: 90,
            price: 300,
          },
          {
            sequence: 2,
            mode: 'rail',
            origin: intermediateLoc1,
            destination: intermediateLoc2,
            departureTime: new Date('2026-10-01T08:30:00Z'),
            arrivalTime: new Date('2026-10-01T15:00:00Z'),
            duration: 390,
            price: 1100,
          },
          {
            sequence: 3,
            mode: 'bus',
            origin: intermediateLoc2,
            destination: patnaLoc._id,
            departureTime: new Date('2026-10-01T16:00:00Z'),
            arrivalTime: new Date('2026-10-01T20:00:00Z'),
            duration: 240,
            price: 800,
          },
        ],
      };

      const val = validateJourneyCandidate(candidate);
      assert.equal(val.valid, true);
      assert.equal(val.errors.length, 0);
    });
  });

  // ============================================================================
  // 9. DEDUPLICATION: DUPLICATE VS MATERIALLY DIFFERENT JOURNEYS
  // ============================================================================
  describe('9. Deduplication Precision (Exact, Near, and Distinct Journeys)', () => {
    it('deduplicates exact same journey and retains richer data candidate', () => {
      const deduplicator = new JourneyDeduplicator();
      const dep = new Date('2026-10-01T06:00:00.000Z');
      const arr = new Date('2026-10-01T18:00:00.000Z');

      const journeyA = {
        id: 'journey-a',
        origin: sonipatLoc._id,
        destination: patnaLoc._id,
        transportModes: ['rail'],
        departureTime: dep,
        arrivalTime: arr,
        duration: 720,
        totalPrice: 1200,
        legs: [
          {
            sequence: 1,
            service: { number: '12424' },
          },
        ],
      };

      const journeyB = {
        id: 'journey-b',
        origin: sonipatLoc._id,
        destination: patnaLoc._id,
        transportModes: ['rail'],
        departureTime: dep,
        arrivalTime: arr,
        duration: 720,
        totalPrice: 1200,
        legs: [
          {
            sequence: 1,
            service: { number: '12424', name: 'Rajdhani Express' },
            booking: { url: 'https://irctc.co.in' },
          },
        ],
      };

      const { journeys: uniqueJourneys, report: deduplicationReport } = deduplicator.deduplicateWithReport(
        [journeyA, journeyB],
        {}
      );

      assert.equal(uniqueJourneys.length, 1);
      assert.equal(deduplicationReport.duplicatesRemoved, 1);
      // Retained the richer candidate (journeyB with name and booking)
      assert.equal(uniqueJourneys[0].id, 'journey-b');
    });

    it('does NOT deduplicate journeys with different departure times (06:00 vs 08:00)', () => {
      const deduplicator = new JourneyDeduplicator();
      const journey1 = {
        origin: sonipatLoc._id,
        destination: patnaLoc._id,
        transportModes: ['rail'],
        departureTime: new Date('2026-10-01T06:00:00.000Z'),
        arrivalTime: new Date('2026-10-01T18:00:00.000Z'),
        legs: [{ sequence: 1, service: { number: '12424' } }],
      };

      const journey2 = {
        origin: sonipatLoc._id,
        destination: patnaLoc._id,
        transportModes: ['rail'],
        departureTime: new Date('2026-10-01T08:00:00.000Z'), // Different departure!
        arrivalTime: new Date('2026-10-01T20:00:00.000Z'),
        legs: [{ sequence: 1, service: { number: '12424' } }],
      };

      const { journeys: uniqueJourneys } = deduplicator.deduplicateWithReport([journey1, journey2], {});
      assert.equal(uniqueJourneys.length, 2, 'Distinct departure times must be preserved');
    });

    it('does NOT deduplicate journeys with different transport modes (rail vs flight)', () => {
      const deduplicator = new JourneyDeduplicator();
      const dep = new Date('2026-10-01T06:00:00.000Z');
      const arr = new Date('2026-10-01T10:00:00.000Z');

      const railJourney = {
        origin: sonipatLoc._id,
        destination: patnaLoc._id,
        transportModes: ['rail'],
        departureTime: dep,
        arrivalTime: arr,
        legs: [{ sequence: 1 }],
      };

      const flightJourney = {
        origin: sonipatLoc._id,
        destination: patnaLoc._id,
        transportModes: ['flight'],
        departureTime: dep,
        arrivalTime: arr,
        legs: [{ sequence: 1 }],
      };

      const { journeys: uniqueJourneys } = deduplicator.deduplicateWithReport([railJourney, flightJourney], {});
      assert.equal(uniqueJourneys.length, 2, 'Different transport modes must never be merged');
    });
  });

  // ============================================================================
  // 10. RANKING ENGINE EDGE CASES
  // ============================================================================
  describe('10. Ranking Engine Edge Cases', () => {
    it('returns empty array when input is empty without throwing', () => {
      const ranked = rankingEngine.rank([], 'cheapest');
      assert.deepEqual(ranked, []);
    });

    it('handles single journey without corruption', () => {
      const single = [
        {
          id: 'j-1',
          totalPrice: 500,
          duration: 120,
          numberOfTransfers: 0,
        },
      ];
      const ranked = rankingEngine.rank(single, 'fastest');
      assert.equal(ranked.length, 1);
      assert.equal(ranked[0].id, 'j-1');
    });

    it('handles journeys with equal values deterministically (stable ordering)', () => {
      const equalJourneys = [
        { id: 'j-first', totalPrice: 1000, duration: 300, numberOfTransfers: 1 },
        { id: 'j-second', totalPrice: 1000, duration: 300, numberOfTransfers: 1 },
      ];
      const ranked = rankingEngine.rank(equalJourneys, 'overall');
      assert.equal(ranked.length, 2);
      assert.equal(ranked[0].id, 'j-first');
      assert.equal(ranked[1].id, 'j-second');
    });

    it('gracefully handles missing optional ranking fields without throwing', () => {
      const sparseJourneys = [
        { id: 'j-sparse', totalPrice: 500 }, // missing duration, transfers, scores
        { id: 'j-full', totalPrice: 600, duration: 180, numberOfTransfers: 0 },
      ];
      const ranked = rankingEngine.rank(sparseJourneys, 'overall');
      assert.equal(ranked.length, 2);
    });
  });

  // ============================================================================
  // 11. EXTREME DISTANCE / OUT-OF-BOUNDS COORDINATES
  // ============================================================================
  describe('11. Extreme Distance and Geospatial Bounds Safety', () => {
    it('Location model rejects coordinates outside valid WGS-84 / GeoJSON range [-180..180, -90..90]', async () => {
      await assert.rejects(
        async () => {
          await Location.create({
            name: 'Invalid Coordinates Station',
            city: 'Unknown',
            type: 'city',
            location: {
              type: 'Point',
              coordinates: [250, 105], // Out of bounds!
            },
          });
        },
        (err) => {
          assert.match(err.message, /Invalid coordinates/i);
          return true;
        }
      );
    });

    it('ensures duration and prices remain non-negative, finite numbers on extreme routes', () => {
      const candidate = {
        origin: sonipatLoc._id,
        destination: patnaLoc._id,
        departureTime: new Date('2026-10-01T00:00:00Z'),
        arrivalTime: new Date('2026-10-05T00:00:00Z'),
        duration: 5760, // 4 days continuous
        totalDistance: 15000, // 15,000 km
        totalPrice: 120000,
        legs: [
          {
            sequence: 1,
            mode: 'flight',
            origin: sonipatLoc._id,
            destination: patnaLoc._id,
            departureTime: new Date('2026-10-01T00:00:00Z'),
            arrivalTime: new Date('2026-10-05T00:00:00Z'),
            duration: 5760,
            price: 120000,
          },
        ],
      };

      const val = validateJourneyCandidate(candidate);
      assert.equal(val.valid, true);
      assert.ok(Number.isFinite(candidate.duration));
      assert.ok(Number.isFinite(candidate.totalPrice));
    });
  });
});
