import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { hashToken } from '../src/services/auth.service.js';
import config from '../src/config/index.js';

describe('Yatrai Phase 2 — Authentication Suite', () => {
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

  // Helper to extract a cookie value from Set-Cookie header array or string
  function getCookieValue(response, cookieName) {
    // node fetch headers can have getSetCookie() or get('set-cookie')
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

  // ============================================================================
  // 1. REGISTRATION TESTS
  // ============================================================================
  describe('POST /api/auth/register', () => {
    it('successfully registers a new user with email and password', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Vikram Seth',
          email: 'vikram.seth@example.com',
          password: 'superSecretPassword123!',
        }),
      });

      assert.equal(res.status, 201);
      const json = await res.json();

      assert.equal(json.success, true);
      assert.ok(json.data.accessToken, 'Access token should be returned');
      assert.ok(json.data.user, 'User data should be returned');
      assert.equal(json.data.user.name, 'Vikram Seth');
      assert.equal(json.data.user.email, 'vikram.seth@example.com');
      assert.equal(json.data.user.status, 'active');

      // Ensure password and passwordHash are NEVER returned
      assert.equal(json.data.user.password, undefined);
      assert.equal(json.data.user.passwordHash, undefined);
      assert.equal(json.data.refreshToken, undefined);

      // Verify refresh cookie is set
      const refreshTokenCookie = getCookieValue(res, config.auth.cookieName);
      assert.ok(refreshTokenCookie, 'HTTP-only refresh cookie must be set');

      // Verify database record
      const dbUser = await User.findOne({ email: 'vikram.seth@example.com' }).select(
        '+passwordHash'
      );
      assert.ok(dbUser, 'User must exist in DB');
      assert.ok(dbUser.passwordHash, 'Password hash must be stored');
      assert.notEqual(
        dbUser.passwordHash,
        'superSecretPassword123!',
        'Plaintext password must never be stored'
      );
      assert.ok(dbUser.passwordHash.startsWith('$2'), 'Bcrypt hash format expected');

      // Verify RefreshSession created in DB
      const session = await RefreshSession.findOne({ user: dbUser._id });
      assert.ok(session, 'RefreshSession record must exist in DB');
      assert.equal(session.tokenHash, hashToken(refreshTokenCookie));
      assert.equal(session.revokedAt, null);
    });

    it('rejects registration with invalid email format', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid Email',
          email: 'invalid-email-address',
          password: 'validPassword123',
        }),
      });

      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, 'VALIDATION_ERROR');
    });

    it('rejects registration with password shorter than 8 characters', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Short Password',
          email: 'shortpass@example.com',
          password: 'short',
        }),
      });

      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.match(json.error.message, /at least 8 characters/i);
    });

    it('rejects registration with duplicate email (enforcing uniqueness)', async () => {
      const payload = {
        name: 'Original User',
        email: 'duplicate.check@example.com',
        password: 'password12345',
      };

      const res1 = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(res1.status, 201);

      // Attempt duplicate registration with different casing
      const res2 = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Duplicate User',
          email: 'DUPLICATE.CHECK@EXAMPLE.COM',
          password: 'differentPassword987',
        }),
      });

      assert.equal(res2.status, 409);
      const json = await res2.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, 'DUPLICATE_EMAIL');
    });

    it('does not alter or trim registration passwords with whitespace', async () => {
      const rawPasswordWithSpaces = '  spacesAroundPassword123  ';
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Space User',
          email: 'spaces@example.com',
          password: rawPasswordWithSpaces,
        }),
      });
      assert.equal(res.status, 201);

      // Login with trimmed password should FAIL
      const loginTrimmed = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'spaces@example.com',
          password: 'spacesAroundPassword123',
        }),
      });
      assert.equal(loginTrimmed.status, 401);

      // Login with exact password including spaces should SUCCEED
      const loginExact = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'spaces@example.com',
          password: rawPasswordWithSpaces,
        }),
      });
      assert.equal(loginExact.status, 200);
    });
  });

  // ============================================================================
  // 2. LOGIN TESTS
  // ============================================================================
  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Register a standard user
      await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Ananya Rao',
          email: 'ananya.rao@example.com',
          password: 'correctPassword123!',
        }),
      });
    });

    it('logs in with valid credentials and receives access token and cookie', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'ananya.rao@example.com',
          password: 'correctPassword123!',
        }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.data.accessToken);
      assert.equal(json.data.user.email, 'ananya.rao@example.com');
      assert.equal(json.data.user.passwordHash, undefined);

      const cookie = getCookieValue(res, config.auth.cookieName);
      assert.ok(cookie, 'Refresh cookie should be present');
    });

    it('returns generic error for wrong password without revealing detail', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'ananya.rao@example.com',
          password: 'wrongPasswordXYZ',
        }),
      });

      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.message, 'Invalid email or password');
    });

    it('returns same generic error for non-existent email', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent.user@example.com',
          password: 'anyPassword123',
        }),
      });

      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.message, 'Invalid email or password');
    });

    it('rejects login when user status is suspended or inactive', async () => {
      await User.updateOne({ email: 'ananya.rao@example.com' }, { status: 'suspended' });

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'ananya.rao@example.com',
          password: 'correctPassword123!',
        }),
      });

      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, 'ACCOUNT_DISABLED');
    });
  });

  // ============================================================================
  // 3. REFRESH SESSION & TOKEN ROTATION TESTS
  // ============================================================================
  describe('POST /api/auth/refresh', () => {
    it('rotates refresh token, invalidates previous session, and issues new access token', async () => {
      // 1. Register
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Session User',
          email: 'session.user@example.com',
          password: 'password12345',
        }),
      });
      const initialCookie = getCookieValue(regRes, config.auth.cookieName);
      assert.ok(initialCookie);

      // Verify 1 active session in DB
      const initialSession = await RefreshSession.findOne({ tokenHash: hashToken(initialCookie) });
      assert.ok(initialSession);
      assert.equal(initialSession.revokedAt, null);

      // 2. Refresh with cookie
      const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: `${config.auth.cookieName}=${initialCookie}`,
        },
      });

      assert.equal(refreshRes.status, 200);
      const refreshJson = await refreshRes.json();
      assert.equal(refreshJson.success, true);
      assert.ok(refreshJson.data.accessToken);

      const rotatedCookie = getCookieValue(refreshRes, config.auth.cookieName);
      assert.ok(rotatedCookie);
      assert.notEqual(rotatedCookie, initialCookie, 'Refresh token must be rotated');

      // 3. Verify old session is now REVOKED in DB
      const oldSession = await RefreshSession.findOne({ tokenHash: hashToken(initialCookie) });
      assert.ok(oldSession.revokedAt !== null, 'Old session must be marked revoked');

      // 4. Verify new session is ACTIVE in DB
      const newSession = await RefreshSession.findOne({ tokenHash: hashToken(rotatedCookie) });
      assert.ok(newSession);
      assert.equal(newSession.revokedAt, null);

      // 5. Attempting to use the OLD revoked refresh token must be rejected
      const replayRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: `${config.auth.cookieName}=${initialCookie}`,
        },
      });

      assert.equal(replayRes.status, 401);
      const replayJson = await replayRes.json();
      assert.equal(replayJson.error.code, 'REVOKED_REFRESH_TOKEN');
    });

    it('rejects refresh request when no refresh cookie is provided', async () => {
      const res = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
      });

      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, 'VALIDATION_ERROR');
    });

    it('rejects refresh when session has expired', async () => {
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Expired Session User',
          email: 'expired.session@example.com',
          password: 'password12345',
        }),
      });
      const cookie = getCookieValue(regRes, config.auth.cookieName);

      // Manually backdate the session expiration
      await RefreshSession.updateOne(
        { tokenHash: hashToken(cookie) },
        { expiresAt: new Date(Date.now() - 10000) }
      );

      const res = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: `${config.auth.cookieName}=${cookie}`,
        },
      });

      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.error.code, 'EXPIRED_REFRESH_TOKEN');
    });
  });

  // ============================================================================
  // 4. LOGOUT TESTS
  // ============================================================================
  describe('POST /api/auth/logout', () => {
    it('revokes server-side session and clears cookie upon logout', async () => {
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Logout User',
          email: 'logout.user@example.com',
          password: 'password12345',
        }),
      });
      const cookie = getCookieValue(regRes, config.auth.cookieName);

      // Perform logout
      const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Cookie: `${config.auth.cookieName}=${cookie}`,
        },
      });

      assert.equal(logoutRes.status, 200);
      const logoutJson = await logoutRes.json();
      assert.equal(logoutJson.success, true);

      // Verify session in DB is revoked
      const session = await RefreshSession.findOne({ tokenHash: hashToken(cookie) });
      assert.ok(session.revokedAt !== null, 'Session must be revoked in DB');

      // Verify that refreshing with the logged out cookie fails
      const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: `${config.auth.cookieName}=${cookie}`,
        },
      });
      assert.equal(refreshRes.status, 401);
    });
  });

  // ============================================================================
  // 5. CURRENT USER & AUTH MIDDLEWARE TESTS (/api/auth/me)
  // ============================================================================
  describe('GET /api/auth/me', () => {
    it('retrieves current authenticated user with valid Bearer token', async () => {
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Me Profile User',
          email: 'me.profile@example.com',
          password: 'password12345',
        }),
      });
      const { data } = await regRes.json();
      const accessToken = data.accessToken;

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.user.name, 'Me Profile User');
      assert.equal(json.data.user.email, 'me.profile@example.com');
      assert.equal(json.data.user.passwordHash, undefined);
    });

    it('rejects request with 401 when Authorization header is missing', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`);
      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, 'UNAUTHORIZED');
    });

    it('rejects request with 401 when Authorization format is not Bearer', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Authorization: 'Basic dXNlcjpwYXNz',
        },
      });
      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.error.code, 'UNAUTHORIZED');
    });

    it('rejects request with 401 when token signature is invalid', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Authorization: 'Bearer invalid.tampered.token',
        },
      });
      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.error.code, 'UNAUTHORIZED');
    });

    it('rejects request with 401 when access token is expired', async () => {
      // Create user and sign an immediately expired token
      const user = await User.create({
        name: 'Expired Token User',
        email: 'expired.token@example.com',
      });
      const jwt = (await import('jsonwebtoken')).default;
      const expiredToken = jwt.sign({ sub: user._id.toString() }, config.auth.jwtAccessSecret, {
        expiresIn: '0s',
      });

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${expiredToken}`,
        },
      });

      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.error.code, 'TOKEN_EXPIRED');
    });

    it('rejects request with 403 when authenticated user is suspended', async () => {
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Suspended Me User',
          email: 'suspended.me@example.com',
          password: 'password12345',
        }),
      });
      const { data } = await regRes.json();
      const accessToken = data.accessToken;

      // Suspend user
      await User.updateOne({ email: 'suspended.me@example.com' }, { status: 'suspended' });

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.error.code, 'ACCOUNT_DISABLED');
    });
  });

  // ============================================================================
  // 6. VALIDATION & ROOT API TESTS
  // ============================================================================
  describe('Authentication Validation & Endpoints', () => {
    it('rejects registration when name is missing or password exceeds 128 characters', async () => {
      const longPassword = 'a'.repeat(129);
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '',
          email: 'valid.email@example.com',
          password: longPassword,
        }),
      });

      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error.code, 'VALIDATION_ERROR');
    });

    it('rejects login when email or password is missing or malformed', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'bad-email-format',
          password: '',
        }),
      });

      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error.code, 'VALIDATION_ERROR');
    });

    it('rejects refresh when user is inactive or suspended', async () => {
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Deactivated User',
          email: 'deactivated.refresh@example.com',
          password: 'password12345',
        }),
      });
      const cookie = getCookieValue(regRes, config.auth.cookieName);

      // Set user status to inactive
      await User.updateOne({ email: 'deactivated.refresh@example.com' }, { status: 'inactive' });

      const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: `${config.auth.cookieName}=${cookie}`,
        },
      });

      assert.equal(refreshRes.status, 403);
      const json = await refreshRes.json();
      assert.equal(json.error.code, 'ACCOUNT_DISABLED');
    });

    it('exposes auth endpoints in GET /api discovery document', async () => {
      const res = await fetch(`${baseUrl}/api`);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.endpoints.auth);
      assert.equal(json.endpoints.auth.register, '/api/auth/register');
      assert.equal(json.endpoints.auth.login, '/api/auth/login');
      assert.equal(json.endpoints.auth.refresh, '/api/auth/refresh');
      assert.equal(json.endpoints.auth.logout, '/api/auth/logout');
      assert.equal(json.endpoints.auth.me, '/api/auth/me');
    });
  });
});
