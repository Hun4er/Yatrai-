import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Location } from '../src/models/Location.js';
import { Journey } from '../src/models/Journey.js';
import { SearchRequest } from '../src/models/SearchRequest.js';
import { TransportProvider } from '../src/models/TransportProvider.js';
import { ErrorLog } from '../src/models/ErrorLog.js';
import config from '../src/config/index.js';

describe('Phase 15 — Yatrai Admin Dashboard Suite', () => {
  let app;
  let server;
  let baseUrl;

  let normalUser;
  let adminUser;
  let suspendedAdminUser;

  let normalToken;
  let adminToken;
  let suspendedAdminToken;

  let testOrigin;
  let testDestination;
  let testJourney;
  let testSearchRequest;
  let testProvider;

  before(async () => {
    await setupTestDb();
    await Promise.all([
      User.init(),
      Location.init(),
      Journey.init(),
      SearchRequest.init(),
      TransportProvider.init(),
      ErrorLog.init(),
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

  function generateToken(user) {
    return jwt.sign(
      { sub: user._id.toString(), role: user.role || 'user' },
      config.auth.jwtAccessSecret,
      { expiresIn: '15m' }
    );
  }

  beforeEach(async () => {
    await clearTestDb();

    // 1. Create standard normal user
    normalUser = await User.create({
      name: 'Regular Traveler',
      email: 'regular@example.com',
      passwordHash: '$2b$10$eFfTZVRO571dHuc.12Cljum5aRbZaA6xzWXKrf9T8upjBX0ae3BQS',
      role: 'user',
      status: 'active',
    });
    normalToken = generateToken(normalUser);

    // 2. Create verified admin user
    adminUser = await User.create({
      name: 'Operations Admin',
      email: 'admin@yatrai.com',
      passwordHash: '$2b$10$eFfTZVRO571dHuc.12Cljum5aRbZaA6xzWXKrf9T8upjBX0ae3BQS',
      role: 'admin',
      status: 'active',
    });
    adminToken = generateToken(adminUser);

    // 3. Create suspended admin user
    suspendedAdminUser = await User.create({
      name: 'Suspended Admin',
      email: 'suspended.admin@yatrai.com',
      passwordHash: '$2b$10$eFfTZVRO571dHuc.12Cljum5aRbZaA6xzWXKrf9T8upjBX0ae3BQS',
      role: 'admin',
      status: 'suspended',
    });
    suspendedAdminToken = generateToken(suspendedAdminUser);

    // 4. Create Locations
    testOrigin = await Location.create({
      name: 'New Delhi Railway Station',
      displayName: 'New Delhi (NDLS)',
      city: 'Delhi',
      state: 'Delhi',
      type: 'railway_station',
      location: { type: 'Point', coordinates: [77.2197, 28.6428] },
    });

    testDestination = await Location.create({
      name: 'Agra Cantt Railway Station',
      displayName: 'Agra Cantt (AGC)',
      city: 'Agra',
      state: 'Uttar Pradesh',
      type: 'railway_station',
      location: { type: 'Point', coordinates: [78.0081, 27.1593] },
    });

    // 5. Create Journey
    testJourney = await Journey.create({
      origin: testOrigin._id,
      destination: testDestination._id,
      departureTime: new Date(Date.now() + 3600000),
      arrivalTime: new Date(Date.now() + 7200000),
      duration: 120,
      totalDistance: 200,
      totalPrice: 450,
      currency: 'INR',
      numberOfTransfers: 0,
      transportModes: ['rail'],
      status: 'scheduled',
    });

    // 6. Create SearchRequest
    testSearchRequest = await SearchRequest.create({
      user: normalUser._id,
      origin: testOrigin._id,
      destination: testDestination._id,
      departureDate: new Date(),
      passengers: 1,
      requestedModes: ['rail'],
      status: 'completed',
    });

    // 7. Create TransportProvider
    testProvider = await TransportProvider.create({
      name: 'Indian Railways (IRCTC)',
      code: 'IRCTC',
      type: 'rail',
      website: 'https://irctc.co.in',
      supportedModes: ['rail'],
      status: 'active',
      capabilities: { realtime: true },
    });
  });

  // ============================================================================
  // 1. ADMIN AUTHORIZATION & SECURITY
  // ============================================================================
  describe('1. Security & Admin Authorization Boundary', () => {
    it('rejects unauthenticated request to /api/admin/overview with 401', async () => {
      const res = await fetch(`${baseUrl}/api/admin/overview`);
      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, 'UNAUTHORIZED');
    });

    it('rejects normal authenticated user (role=user) with 403 FORBIDDEN', async () => {
      const res = await fetch(`${baseUrl}/api/admin/overview`, {
        headers: { Authorization: `Bearer ${normalToken}` },
      });
      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, 'FORBIDDEN');
    });

    it('rejects suspended admin user with 403 ACCOUNT_DISABLED', async () => {
      const res = await fetch(`${baseUrl}/api/admin/overview`, {
        headers: { Authorization: `Bearer ${suspendedAdminToken}` },
      });
      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, 'ACCOUNT_DISABLED');
    });

    it('allows verified active admin user to access /api/admin/overview with 200', async () => {
      const res = await fetch(`${baseUrl}/api/admin/overview`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.data.users, 'Users summary should exist');
      assert.ok(json.data.searches, 'Searches summary should exist');
      assert.ok(json.data.journeys, 'Journeys summary should exist');
      assert.ok(json.data.systemHealth, 'System health summary should exist');
    });

    it('prevents privilege escalation via fake headers or queries (IDOR Defense)', async () => {
      // Normal user trying to pass ?role=admin or header
      const res = await fetch(`${baseUrl}/api/admin/overview?role=admin`, {
        headers: {
          Authorization: `Bearer ${normalToken}`,
          'X-User-Role': 'admin',
          'X-Admin': 'true',
        },
      });
      assert.equal(res.status, 403);
    });
  });

  // ============================================================================
  // 2. USERS MANAGEMENT & SAFE SERIALIZATION
  // ============================================================================
  describe('2. Admin Users Inspection', () => {
    it('lists registered users with pagination', async () => {
      const res = await fetch(`${baseUrl}/api/admin/users?page=1&limit=10`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const json = await res.json();

      assert.equal(json.success, true);
      assert.ok(Array.isArray(json.data), 'Data should be an array');
      assert.ok(json.pagination, 'Pagination object must exist');
      assert.equal(json.pagination.page, 1);
      assert.equal(json.pagination.limit, 10);
      assert.ok(json.pagination.total >= 3, 'At least 3 users should exist');

      // Verify safe serialization: passwordHash and sensitive fields MUST NEVER be present
      for (const user of json.data) {
        assert.equal(user.passwordHash, undefined, 'passwordHash must never be returned');
        assert.equal(user.password, undefined, 'password must never be returned');
        assert.equal(user.tokens, undefined, 'tokens must never be returned');
        assert.ok(user.id || user._id, 'User ID must exist');
        assert.ok(user.email, 'User email must exist');
        assert.ok(user.role, 'User role must exist');
      }
    });

    it('filters users by search query (name or email)', async () => {
      const res = await fetch(`${baseUrl}/api/admin/users?search=regular`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data.length, 1);
      assert.equal(json.data[0].email, 'regular@example.com');
    });

    it('filters users by role', async () => {
      const res = await fetch(`${baseUrl}/api/admin/users?role=admin`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(json.data.length >= 2, 'Should find at least 2 admin accounts');
      for (const u of json.data) {
        assert.equal(u.role, 'admin');
      }
    });
  });

  // ============================================================================
  // 3. SEARCHES INSPECTION
  // ============================================================================
  describe('3. Admin Searches Inspection', () => {
    it('lists persisted search requests with pagination and populated origins/destinations', async () => {
      const res = await fetch(`${baseUrl}/api/admin/searches?page=1&limit=10`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const json = await res.json();

      assert.equal(json.success, true);
      assert.ok(Array.isArray(json.data));
      assert.ok(json.pagination);
      assert.ok(json.data.length >= 1);

      const firstSearch = json.data[0];
      assert.ok(firstSearch.id);
      assert.equal(firstSearch.status, 'completed');
      assert.ok(firstSearch.origin, 'Origin should be populated');
      assert.ok(firstSearch.destination, 'Destination should be populated');
      assert.equal(firstSearch.origin.city, 'Delhi');
      assert.equal(firstSearch.destination.city, 'Agra');

      if (firstSearch.user) {
        assert.equal(firstSearch.user.passwordHash, undefined);
      }
    });

    it('filters searches by status', async () => {
      const res = await fetch(`${baseUrl}/api/admin/searches?status=completed`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const json = await res.json();
      for (const item of json.data) {
        assert.equal(item.status, 'completed');
      }
    });
  });

  // ============================================================================
  // 4. JOURNEYS INSPECTION
  // ============================================================================
  describe('4. Admin Journeys Inspection', () => {
    it('lists canonical persisted journeys with populated locations', async () => {
      const res = await fetch(`${baseUrl}/api/admin/journeys`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const json = await res.json();

      assert.equal(json.success, true);
      assert.ok(Array.isArray(json.data));
      assert.ok(json.data.length >= 1);

      const journey = json.data[0];
      assert.ok(journey.id);
      assert.equal(journey.duration, 120);
      assert.equal(journey.totalPrice, 450);
      assert.deepEqual(journey.transportModes, ['rail']);
      assert.ok(journey.origin);
      assert.ok(journey.destination);
    });

    it('filters journeys by transport mode', async () => {
      const res = await fetch(`${baseUrl}/api/admin/journeys?mode=rail`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(json.data.length >= 1);
      assert.ok(json.data[0].transportModes.includes('rail'));
    });
  });

  // ============================================================================
  // 5. PROVIDERS STATUS & MASKED CREDENTIALS
  // ============================================================================
  describe('5. Admin Providers Inspection', () => {
    it('returns configured database providers and registered runtime adapters', async () => {
      const res = await fetch(`${baseUrl}/api/admin/providers`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const json = await res.json();

      assert.equal(json.success, true);
      assert.ok(Array.isArray(json.data.databaseProviders));
      assert.ok(Array.isArray(json.data.runtimeAdapters));
      assert.ok(json.data.summary);

      // Verify secrets, credentials, and API keys are strictly NOT present
      for (const p of json.data.databaseProviders) {
        assert.equal(p.apiKey, undefined, 'API key must not be exposed');
        assert.equal(p.secret, undefined, 'Secret must not be exposed');
        assert.equal(p.password, undefined, 'Password must not be exposed');
      }

      for (const a of json.data.runtimeAdapters) {
        assert.equal(a.apiKey, undefined, 'Runtime API key must not be exposed');
        assert.ok(a.mode, 'Adapter mode must be present');
        assert.ok(a.capabilities, 'Adapter capabilities must be present');
      }
    });
  });

  // ============================================================================
  // 6. ERRORS & DIAGNOSTICS
  // ============================================================================
  describe('6. Admin Errors & Diagnostics', () => {
    let createdErrorId;

    beforeEach(async () => {
      const errDoc = await ErrorLog.create({
        timestamp: new Date(),
        severity: 'error',
        service: 'yatrai-api',
        module: 'journey-search',
        endpoint: '/api/journeys/search',
        method: 'POST',
        statusCode: 502,
        errorCode: 'PROVIDER_TIMEOUT',
        message: 'Upstream IRCTC gateway timed out after 5000ms',
        stack: 'Error: Upstream IRCTC gateway timed out\n    at ProviderAdapter.search (file:///server.js:42:15)',
        provider: 'IRCTC',
        details: { timeoutMs: 5000, sensitiveKey: '[REDACTED]' },
      });
      createdErrorId = errDoc._id.toString();
    });

    it('lists operational errors with pagination and filtering', async () => {
      const res = await fetch(`${baseUrl}/api/admin/errors?severity=error`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const json = await res.json();

      assert.equal(json.success, true);
      assert.ok(Array.isArray(json.data));
      assert.ok(json.data.length >= 1);

      const err = json.data[0];
      assert.equal(err.severity, 'error');
      assert.equal(err.statusCode, 502);
      assert.equal(err.provider, 'IRCTC');
      // Stack trace omitted in list view for performance and data hygiene
      assert.equal(err.stack, undefined);
    });

    it('retrieves detailed error with diagnostic stack trace for admin', async () => {
      const res = await fetch(`${baseUrl}/api/admin/errors/${createdErrorId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const json = await res.json();

      assert.equal(json.success, true);
      assert.equal(json.data.id, createdErrorId);
      assert.ok(json.data.stack, 'Stack trace should be included in admin detail view');
      assert.ok(json.data.stack.includes('ProviderAdapter.search'));
    });

    it('returns 404 for non-existent error ID', async () => {
      const res = await fetch(`${baseUrl}/api/admin/errors/6ab9f44fe4382e04c0577a99`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 404);
    });
  });

  // ============================================================================
  // 7. ANALYTICS
  // ============================================================================
  describe('7. Admin Operational Analytics', () => {
    it('calculates real aggregations for users, searches, journeys, and errors', async () => {
      const res = await fetch(`${baseUrl}/api/admin/analytics`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const json = await res.json();

      assert.equal(json.success, true);
      const a = json.data;

      assert.ok(a.users.byRole);
      assert.ok(a.users.byStatus);

      assert.ok(a.searches.total >= 1);
      assert.equal(a.searches.completed, 1);
      assert.equal(a.searches.successRatePercentage, 100);
      assert.ok(Array.isArray(a.searches.byRequestedMode));

      assert.equal(a.journeys.total, 1);
      assert.equal(a.journeys.averageDurationMinutes, 120);
      assert.equal(a.journeys.averagePriceINR, 450);

      assert.ok(a.errors.bySeverity);
      assert.ok(a.notifications);
    });
  });

  // ============================================================================
  // 8. SYSTEM HEALTH
  // ============================================================================
  describe('8. Admin System Health', () => {
    it('returns HEALTHY status with liveness and readiness breakdowns', async () => {
      const res = await fetch(`${baseUrl}/api/admin/system-health`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const json = await res.json();

      assert.equal(json.success, true);
      const h = json.data;

      assert.equal(h.status, 'HEALTHY');
      assert.ok(h.timestamp);

      // Liveness
      assert.equal(h.liveness.status, 'healthy');
      assert.equal(h.liveness.service, 'yatrai-api');
      assert.ok(typeof h.liveness.uptimeSeconds === 'number');

      // Readiness
      assert.equal(h.readiness.checks.database.status, 'healthy');
      assert.equal(h.readiness.checks.database.state, 'connected');
      assert.equal(h.readiness.checks.providers.status, 'healthy');
      assert.ok(h.readiness.checks.memory.heapUsedMB > 0);
    });
  });
});
