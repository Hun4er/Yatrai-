import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { hashToken } from '../src/services/auth.service.js';
import config from '../src/config/index.js';

describe('Yatrai Production Fix — Authentication & Session Persistence', () => {
  let app;
  let server;
  let baseUrl;

  before(async () => {
    await setupTestDb();
    await Promise.all([User.init(), RefreshSession.init()]);

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

  function getCookieValue(response, cookieName) {
    let cookies = [];
    if (typeof response.headers.getSetCookie === 'function') {
      cookies = response.headers.getSetCookie();
    } else {
      const raw = response.headers.get('set-cookie');
      if (raw) cookies = [raw];
    }

    for (const cookie of cookies) {
      if (cookie.startsWith(`${cookieName}=`)) {
        const parts = cookie.split(';')[0];
        return parts.substring(`${cookieName}=`.length);
      }
    }
    return null;
  }

  function getCookieHeader(response, cookieName) {
    let cookies = [];
    if (typeof response.headers.getSetCookie === 'function') {
      cookies = response.headers.getSetCookie();
    } else {
      const raw = response.headers.get('set-cookie');
      if (raw) cookies = [raw];
    }
    return cookies.find((c) => c.startsWith(`${cookieName}=`)) || null;
  }

  // ============================================================================
  // 1. SIGNUP & DUPLICATE ACCOUNT TESTS
  // ============================================================================
  describe('Signup Behavior & Duplicate Prevention', () => {
    it('creates single account and rejects duplicate with clear "This account already exists. Sign in instead."', async () => {
      const signupPayload = {
        name: 'Kabir Verma',
        email: 'kabir.verma@example.com',
        password: 'securePassword789!',
      };

      const res1 = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signupPayload),
      });
      assert.equal(res1.status, 201);
      const json1 = await res1.json();
      assert.equal(json1.success, true);
      assert.equal(json1.data.user.email, 'kabir.verma@example.com');

      // Attempt duplicate signup with different letter casing and surrounding whitespace
      const res2 = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Kabir Duplicate',
          email: '  KABIR.VERMA@EXAMPLE.COM  ',
          password: 'anotherPassword123!',
        }),
      });

      assert.equal(res2.status, 409);
      const json2 = await res2.json();
      assert.equal(json2.success, false);
      assert.equal(json2.error.code, 'DUPLICATE_EMAIL');
      assert.match(json2.error.message, /This account already exists\. Sign in instead/i);
      assert.equal(json2.error.details.canSignIn, true);
      assert.equal(json2.error.details.email, 'kabir.verma@example.com');

      // Verify in DB that only 1 account exists
      const userCount = await User.countDocuments({ email: 'kabir.verma@example.com' });
      assert.equal(userCount, 1, 'Only exactly 1 user record must exist in DB');
    });

    it('concurrent duplicate signup requests cannot create duplicate users (race condition resilience)', async () => {
      const email = 'concurrent.race@example.com';
      const requests = Array.from({ length: 5 }, (_, i) =>
        fetch(`${baseUrl}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `User ${i}`,
            email,
            password: 'passwordRace123!',
          }),
        })
      );

      const responses = await Promise.all(requests);
      const statuses = responses.map((r) => r.status);

      // Exactly ONE request must succeed (201) and all others must return 409 Conflict
      const createdCount = statuses.filter((s) => s === 201).length;
      const conflictCount = statuses.filter((s) => s === 409).length;

      assert.equal(createdCount, 1, 'Exactly one concurrent signup must create the account');
      assert.equal(conflictCount, 4, 'Remaining concurrent signups must fail with 409');

      const userDocs = await User.find({ email });
      assert.equal(userDocs.length, 1, 'DB must contain only 1 user document');
    });
  });

  // ============================================================================
  // 2. LOGIN BEHAVIOR & SESSION RESTORATION
  // ============================================================================
  describe('Login & Existing Account Recovery', () => {
    it('existing user can sign in with original credentials after previous session was invalidated', async () => {
      // 1. Initial Registration
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Persistent Traveler',
          email: 'persistent.traveler@example.com',
          password: 'originalPassword99!',
        }),
      });
      assert.equal(regRes.status, 201);
      const initialCookie = getCookieValue(regRes, config.auth.cookieName);

      // 2. Simulate session expiration or explicit logout
      await RefreshSession.deleteMany({ user: (await User.findOne({ email: 'persistent.traveler@example.com' }))._id });

      // Refreshing with the old cookie now fails
      const failedRefresh = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `${config.auth.cookieName}=${initialCookie}` },
      });
      assert.equal(failedRefresh.status, 401);

      // 3. User signs in with original credentials
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: '  persistent.traveler@example.com  ',
          password: 'originalPassword99!',
        }),
      });

      assert.equal(loginRes.status, 200, 'Existing user must be able to log in with original credentials');
      const loginJson = await loginRes.json();
      assert.equal(loginJson.success, true);
      assert.ok(loginJson.data.accessToken);
      assert.equal(loginJson.data.user.email, 'persistent.traveler@example.com');

      // Verify that login never returns the signup duplicate error
      assert.notEqual(loginJson.error?.code, 'DUPLICATE_EMAIL');

      // Verify new session is valid
      const newCookie = getCookieValue(loginRes, config.auth.cookieName);
      assert.ok(newCookie);
      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${loginJson.data.accessToken}` },
      });
      assert.equal(meRes.status, 200);
    });

    it('login with incorrect password returns generic 401 error, never duplicate account error', async () => {
      await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Security User',
          email: 'security.user@example.com',
          password: 'realPassword123',
        }),
      });

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'security.user@example.com',
          password: 'wrongPasswordXYZ',
        }),
      });

      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.error.message, 'Invalid email or password');
      assert.equal(json.error.code, 'INVALID_CREDENTIALS');
      assert.notEqual(json.error.code, 'DUPLICATE_EMAIL');
    });
  });

  // ============================================================================
  // 3. COOKIE & CORS CONFIGURATION
  // ============================================================================
  describe('Cookie & CORS Security Settings', () => {
    it('sets HTTP-only cookie with configured path and attributes', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Cookie Test User',
          email: 'cookie.test@example.com',
          password: 'password12345',
        }),
      });

      assert.equal(res.status, 201);
      const cookieHeader = getCookieHeader(res, config.auth.cookieName);
      assert.ok(cookieHeader, 'Cookie header must be present');

      // Assert HttpOnly flag
      assert.match(cookieHeader, /HttpOnly/i, 'Cookie must be HttpOnly');

      // Assert Path
      assert.match(cookieHeader, /Path=\/api\/auth/i, 'Cookie Path must be /api/auth');

      // Assert SameSite
      assert.match(cookieHeader, /SameSite=Lax/i, 'Cookie SameSite must be configured');
    });

    it('responds with CORS headers permitting client origin with credentials', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type,Authorization',
        },
      });

      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
      assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
    });

    it('clears cookie cleanly on logout with matching path and options', async () => {
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Logout Clear User',
          email: 'logout.clear@example.com',
          password: 'password12345',
        }),
      });
      const cookie = getCookieValue(regRes, config.auth.cookieName);

      const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { Cookie: `${config.auth.cookieName}=${cookie}` },
      });

      assert.equal(logoutRes.status, 200);
      const clearCookieHeader = getCookieHeader(logoutRes, config.auth.cookieName);
      assert.ok(clearCookieHeader);
      // Cleared cookie has empty or epoch value
      assert.match(clearCookieHeader, /Path=\/api\/auth/i);
    });
  });
});
