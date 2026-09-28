import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb, teardownTestDb, clearTestDb } from '../server/tests/setup.js';
import { createApp } from '../server/src/app.js';
import { User } from '../server/src/models/User.js';
import { Location } from '../server/src/models/Location.js';
import { Journey } from '../server/src/models/Journey.js';
import { SearchRequest } from '../server/src/models/SearchRequest.js';
import { TransportProvider } from '../server/src/models/TransportProvider.js';
import { ErrorLog } from '../server/src/models/ErrorLog.js';
import bcrypt from 'bcryptjs';

describe('Phase 15 — Yatrai Admin Operational E2E Suite', () => {
  let app;
  let server;
  let baseUrl;

  let normalToken;
  let adminToken;

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

    await clearTestDb();

    const hashedPassword = await bcrypt.hash('YatraiPass@123', 10);

    // Create normal user
    await User.create({
      name: 'Regular Explorer',
      email: 'traveler@yatrai.com',
      passwordHash: hashedPassword,
      role: 'user',
      status: 'active',
    });

    // Create admin user
    await User.create({
      name: 'Head Administrator',
      email: 'ops.admin@yatrai.com',
      passwordHash: hashedPassword,
      role: 'admin',
      status: 'active',
    });

    // Populate a location, journey, and search request for inspection
    const loc1 = await Location.create({
      name: 'Delhi Anand Vihar',
      city: 'Delhi',
      state: 'Delhi',
      type: 'bus_station',
      location: { type: 'Point', coordinates: [77.3153, 28.6506] },
    });

    const loc2 = await Location.create({
      name: 'Lucknow Charbagh',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      type: 'railway_station',
      location: { type: 'Point', coordinates: [80.9238, 26.8322] },
    });

    await Journey.create({
      origin: loc1._id,
      destination: loc2._id,
      departureTime: new Date(Date.now() + 86400000),
      arrivalTime: new Date(Date.now() + 86400000 + 21600000),
      duration: 360,
      totalDistance: 500,
      totalPrice: 850,
      transportModes: ['rail', 'bus'],
      status: 'scheduled',
    });

    await SearchRequest.create({
      origin: loc1._id,
      destination: loc2._id,
      departureDate: new Date(Date.now() + 86400000),
      passengers: 2,
      requestedModes: ['rail', 'bus'],
      status: 'completed',
    });

    await TransportProvider.create({
      name: 'UPSRTC Express',
      code: 'UPSRTC',
      type: 'bus',
      supportedModes: ['bus'],
      status: 'active',
    });

    await ErrorLog.create({
      severity: 'warn',
      service: 'yatrai-api',
      module: 'search',
      endpoint: '/api/journeys/search',
      method: 'POST',
      statusCode: 404,
      errorCode: 'LOCATION_NOT_FOUND',
      message: 'Origin location not found during test run',
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await teardownTestDb();
  });

  // Step 1: Login flows
  it('1. Authenticates normal user and stores token', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'traveler@yatrai.com',
        password: 'YatraiPass@123',
      }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.user.role, 'user');
    normalToken = json.data.accessToken;
    assert.ok(normalToken);
  });

  it('2. Authenticates admin user and confirms role is admin', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ops.admin@yatrai.com',
        password: 'YatraiPass@123',
      }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.user.role, 'admin');
    adminToken = json.data.accessToken;
    assert.ok(adminToken);
  });

  // Step 2: Access Control Verification
  it('3. Normal user is rejected with 403 on all admin endpoints', async () => {
    const adminEndpoints = [
      '/api/admin/overview',
      '/api/admin/users',
      '/api/admin/searches',
      '/api/admin/journeys',
      '/api/admin/providers',
      '/api/admin/errors',
      '/api/admin/analytics',
      '/api/admin/system-health',
    ];

    for (const ep of adminEndpoints) {
      const res = await fetch(`${baseUrl}${ep}`, {
        headers: { Authorization: `Bearer ${normalToken}` },
      });
      assert.equal(res.status, 403, `Endpoint ${ep} must reject non-admin with 403`);
    }
  });

  // Step 3: Admin User Authorized Operations
  it('4. Admin accesses /api/admin/overview and receives operational summaries', async () => {
    const res = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.users.total, 2);
    assert.equal(json.data.searches.total, 1);
    assert.equal(json.data.journeys.total, 1);
    assert.equal(json.data.systemHealth.status, 'HEALTHY');
  });

  it('5. Admin accesses /api/admin/users and verifies safe fields without password exposure', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.length, 2);

    for (const u of json.data) {
      assert.equal(u.passwordHash, undefined);
      assert.equal(u.password, undefined);
      assert.ok(['user', 'admin'].includes(u.role));
      assert.ok(u.email);
    }
  });

  it('6. Admin accesses /api/admin/searches and validates corridor & status', async () => {
    const res = await fetch(`${baseUrl}/api/admin/searches`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.length, 1);
    assert.equal(json.data[0].status, 'completed');
    assert.equal(json.data[0].origin.city, 'Delhi');
    assert.equal(json.data[0].destination.city, 'Lucknow');
  });

  it('7. Admin accesses /api/admin/journeys and inspects canonical multimodal journey', async () => {
    const res = await fetch(`${baseUrl}/api/admin/journeys`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.length, 1);
    assert.equal(json.data[0].totalPrice, 850);
    assert.equal(json.data[0].duration, 360);
    assert.deepEqual(json.data[0].transportModes, ['rail', 'bus']);
  });

  it('8. Admin accesses /api/admin/providers and validates runtime adapters & masked credentials', async () => {
    const res = await fetch(`${baseUrl}/api/admin/providers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.summary.configuredCount, 1);
    assert.ok(json.data.summary.activeAdaptersCount >= 4);

    for (const p of json.data.databaseProviders) {
      assert.equal(p.apiKey, undefined);
      assert.equal(p.secret, undefined);
    }
  });

  it('9. Admin accesses /api/admin/errors and verifies operational error entry', async () => {
    const res = await fetch(`${baseUrl}/api/admin/errors`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.length, 1);
    assert.equal(json.data[0].errorCode, 'LOCATION_NOT_FOUND');
    assert.equal(json.data[0].statusCode, 404);
  });

  it('10. Admin accesses /api/admin/analytics and verifies MongoDB aggregation output', async () => {
    const res = await fetch(`${baseUrl}/api/admin/analytics`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.users.byRole.admin, 1);
    assert.equal(json.data.users.byRole.user, 1);
    assert.equal(json.data.searches.total, 1);
    assert.equal(json.data.searches.successRatePercentage, 100);
    assert.equal(json.data.journeys.total, 1);
  });

  it('11. Admin accesses /api/admin/system-health and verifies liveness and readiness metrics', async () => {
    const res = await fetch(`${baseUrl}/api/admin/system-health`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.status, 'HEALTHY');
    assert.equal(json.data.liveness.status, 'healthy');
    assert.equal(json.data.readiness.checks.database.status, 'healthy');
    assert.equal(json.data.readiness.checks.providers.status, 'healthy');
  });
});
