import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { hashToken } from '../src/services/auth.service.js';
import config from '../src/config/index.js';

describe('Yatrai Complete Authentication Lifecycle & Security Suite', () => {
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
  // 1. SIGNUP TESTS
  // ============================================================================
  describe('1. Signup Lifecycle & Account Creation', () => {
    it('creates a persistent user account with bcrypt hash and HTTP-only cookie', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Ananya Roy',
          email: 'ananya.roy@example.com',
          password: 'Password1234!',
        }),
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.data.accessToken, 'Access token must be returned');
      assert.equal(json.data.user.name, 'Ananya Roy');
      assert.equal(json.data.user.email, 'ananya.roy@example.com');
      assert.equal(json.data.user.password, undefined);
      assert.equal(json.data.user.passwordHash, undefined);

      const cookie = getCookieValue(res, config.auth.cookieName);
      assert.ok(cookie, 'Refresh cookie must be present');

      // Verify DB
      const dbUser = await User.findOne({ email: 'ananya.roy@example.com' }).select('+passwordHash');
      assert.ok(dbUser);
      assert.ok(dbUser.passwordHash.startsWith('$2'));
      assert.notEqual(dbUser.passwordHash, 'Password1234!');
    });

    it('supports POST /api/auth/signup alias identically to /register', async () => {
      const res = await fetch(`${baseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Sameer Sen',
          email: 'sameer.sen@example.com',
          password: 'ValidPassword999!',
        }),
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.user.email, 'sameer.sen@example.com');
      assert.ok(json.data.accessToken);
    });

    it('enforces email normalization during signup (trim and lowercase)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Rohan Mehra',
          email: '  ROHAN.MEHRA@EXAMPLE.COM  ',
          password: 'RohanSecret2026!',
        }),
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.equal(json.data.user.email, 'rohan.mehra@example.com');

      const dbUser = await User.findOne({ email: 'rohan.mehra@example.com' });
      assert.ok(dbUser, 'User must be found under lowercased trimmed email');
    });

    it('rejects duplicate email and returns actionable DUPLICATE_EMAIL error', async () => {
      await User.create({
        name: 'Existing Member',
        email: 'member@example.com',
        passwordHash: await bcrypt.hash('Secret1234!', 12),
      });

      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Duplicate Member',
          email: '  MEMBER@EXAMPLE.COM  ',
          password: 'DifferentPass123!',
        }),
      });

      assert.equal(res.status, 409);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, 'DUPLICATE_EMAIL');
      assert.match(json.error.message, /already exists/i);
    });

    it('safely handles concurrent duplicate signup attempts without race condition duplicates', async () => {
      const payload = {
        name: 'Concurrent Runner',
        email: 'concurrent@example.com',
        password: 'ConcurrentPass123!',
      };

      const promises = Array.from({ length: 4 }, () =>
        fetch(`${baseUrl}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      );

      const responses = await Promise.all(promises);
      const statuses = responses.map((r) => r.status);

      const successCount = statuses.filter((s) => s === 201).length;
      const duplicateCount = statuses.filter((s) => s === 409).length;

      assert.equal(successCount, 1, 'Exactly one concurrent signup must succeed');
      assert.equal(duplicateCount, 3, 'Other concurrent signups must receive 409 duplicate error');

      const count = await User.countDocuments({ email: 'concurrent@example.com' });
      assert.equal(count, 1, 'Only one user record must exist in DB');
    });
  });

  // ============================================================================
  // 2. LOGIN TESTS
  // ============================================================================
  describe('2. Login Lifecycle & Existing Account Verification', () => {
    it('authenticates valid credentials and returns new session tokens', async () => {
      const plainPassword = 'MySecretPassword2026!';
      const user = await User.create({
        name: 'Kavita Rao',
        email: 'kavita.rao@example.com',
        passwordHash: await bcrypt.hash(plainPassword, 12),
      });

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: '  Kavita.Rao@example.com  ',
          password: plainPassword,
        }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.user.email, 'kavita.rao@example.com');
      assert.ok(json.data.accessToken);

      const cookie = getCookieValue(res, config.auth.cookieName);
      assert.ok(cookie);

      const session = await RefreshSession.findOne({ user: user._id });
      assert.ok(session);
      assert.equal(session.tokenHash, hashToken(cookie));
    });

    it('rejects incorrect password with generic 401 error', async () => {
      await User.create({
        name: 'Test User',
        email: 'test@example.com',
        passwordHash: await bcrypt.hash('CorrectPassword123!', 12),
      });

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'WrongPassword999!',
        }),
      });

      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.message, 'Invalid email or password');
    });

    it('rejects unknown email with the exact same generic 401 error (no user enumeration)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent.traveler@example.com',
          password: 'AnyPassword123!',
        }),
      });

      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.error.message, 'Invalid email or password');
    });

    it('authenticates legacy SHA-256 hashed accounts and safely upgrades to bcrypt 12', async () => {
      const plainPassword = 'LegacyShaPassword2026!';
      const sha256Hash = crypto.createHash('sha256').update(plainPassword).digest('hex');

      const user = await User.create({
        name: 'Legacy User',
        email: 'legacy.sha@example.com',
        passwordHash: sha256Hash,
      });

      // Login with original credentials
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'legacy.sha@example.com',
          password: plainPassword,
        }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.user.email, 'legacy.sha@example.com');

      // Verify that the hash in the DB was upgraded to a modern bcrypt hash
      const updatedUser = await User.findById(user._id).select('+passwordHash');
      assert.ok(updatedUser.passwordHash.startsWith('$2'));
      const isBcryptValid = await bcrypt.compare(plainPassword, updatedUser.passwordHash);
      assert.equal(isBcryptValid, true, 'Upgraded bcrypt hash must match original password');
    });

    it('authenticates legacy Bcrypt 10 rounds accounts and upgrades to Bcrypt 12', async () => {
      const plainPassword = 'LegacyBcryptPass!';
      const salt10Hash = await bcrypt.hash(plainPassword, 10);

      const user = await User.create({
        name: 'Bcrypt 10 User',
        email: 'bcrypt10@example.com',
        passwordHash: salt10Hash,
      });

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'bcrypt10@example.com',
          password: plainPassword,
        }),
      });

      assert.equal(res.status, 200);
      const updatedUser = await User.findById(user._id).select('+passwordHash');
      assert.ok(updatedUser.passwordHash.startsWith('$2'));
      const isMatch = await bcrypt.compare(plainPassword, updatedUser.passwordHash);
      assert.equal(isMatch, true);
    });

    it('rejects suspended accounts with 403 ACCOUNT_DISABLED', async () => {
      await User.create({
        name: 'Suspended Traveler',
        email: 'suspended@example.com',
        passwordHash: await bcrypt.hash('Suspended123!', 12),
        status: 'suspended',
      });

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'suspended@example.com',
          password: 'Suspended123!',
        }),
      });

      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.error.code, 'ACCOUNT_DISABLED');
    });

    it('login failure never invokes signup logic or alters database records', async () => {
      const countBefore = await User.countDocuments();
      await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'FailedPassword123!',
        }),
      });
      const countAfter = await User.countDocuments();
      assert.equal(countBefore, countAfter, 'User count must remain unchanged');
    });
  });

  // ============================================================================
  // 3. SESSION PERSISTENCE & REFRESH TESTS
  // ============================================================================
  describe('3. Session Persistence, Rotation & Expiration', () => {
    it('successfully restores session via refresh endpoint and rotates refresh token', async () => {
      // 1. Signup to get initial cookie
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Refresh Tester',
          email: 'refresh.test@example.com',
          password: 'RefreshPassword123!',
        }),
      });
      assert.equal(regRes.status, 201);
      const firstCookie = getCookieValue(regRes, config.auth.cookieName);

      // 2. Refresh session with first cookie
      const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `${config.auth.cookieName}=${firstCookie}` },
      });

      assert.equal(refreshRes.status, 200);
      const refreshJson = await refreshRes.json();
      assert.ok(refreshJson.data.accessToken);
      assert.equal(refreshJson.data.user.email, 'refresh.test@example.com');

      const secondCookie = getCookieValue(refreshRes, config.auth.cookieName);
      assert.ok(secondCookie);
      assert.notEqual(firstCookie, secondCookie, 'Refresh token must be rotated');

      // 3. Replay attack: using the old firstCookie must fail with 401
      const replayRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `${config.auth.cookieName}=${firstCookie}` },
      });
      assert.equal(replayRes.status, 401);
    });

    it('rejects expired refresh sessions with 401 EXPIRED_REFRESH_TOKEN', async () => {
      const user = await User.create({
        name: 'Expired Session User',
        email: 'expired.session@example.com',
        passwordHash: await bcrypt.hash('ValidPass123!', 12),
      });

      const rawToken = crypto.randomBytes(40).toString('hex');
      await RefreshSession.create({
        user: user._id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() - 60000), // Expired 1 min ago
      });

      const res = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `${config.auth.cookieName}=${rawToken}` },
      });

      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.error.code, 'EXPIRED_REFRESH_TOKEN');
    });

    it('revokes server-side session and clears cookie upon explicit logout', async () => {
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Logout User',
          email: 'logout.user@example.com',
          password: 'LogoutPassword123!',
        }),
      });
      const cookie = getCookieValue(regRes, config.auth.cookieName);

      // Perform Logout
      const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { Cookie: `${config.auth.cookieName}=${cookie}` },
      });
      assert.equal(logoutRes.status, 200);

      // Verify DB session revoked
      const session = await RefreshSession.findOne({ tokenHash: hashToken(cookie) });
      assert.ok(session);
      assert.ok(session.revokedAt, 'Session must be marked revoked');

      // Subsequent refresh must fail
      const postLogoutRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `${config.auth.cookieName}=${cookie}` },
      });
      assert.equal(postLogoutRes.status, 401);
    });
  });

  // ============================================================================
  // 4. PROTECTED ROUTES & SECURITY CONTROLS
  // ============================================================================
  describe('4. Protected Routes & Security Guarantees', () => {
    it('verifies GET /api/auth/me returns current user with valid Bearer token', async () => {
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Protected Tester',
          email: 'protected.test@example.com',
          password: 'ProtectedPass123!',
        }),
      });
      const { accessToken } = (await regRes.json()).data;

      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      assert.equal(meRes.status, 200);
      const meJson = await meRes.json();
      assert.equal(meJson.data.user.email, 'protected.test@example.com');
      assert.equal(meJson.data.user.passwordHash, undefined);
    });

    it('rejects protected routes when Bearer token is missing or malformed', async () => {
      const resNoAuth = await fetch(`${baseUrl}/api/auth/me`);
      assert.equal(resNoAuth.status, 401);

      const resBadFormat = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      });
      assert.equal(resBadFormat.status, 401);

      const resTampered = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: 'Bearer fake.invalid.jwt.token' },
      });
      assert.equal(resTampered.status, 401);
    });

    it('attaches proper cookie security flags (HttpOnly and configured path)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Cookie Security',
          email: 'cookie.sec@example.com',
          password: 'CookieSecurity123!',
        }),
      });

      const header = getCookieHeader(res, config.auth.cookieName);
      assert.ok(header);
      assert.match(header, /HttpOnly/i, 'Cookie must be HttpOnly');
      assert.match(header, /Path=\//i, 'Cookie must have Path defined');
    });
  });
});
