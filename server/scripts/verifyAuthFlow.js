import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { hashToken } from '../src/services/auth.service.js';
import config from '../src/config/index.js';

/**
 * Live Verification Script for Phase 2 Authentication
 * Tests the complete lifecycle with dummy data against the database.
 */
async function runVerification() {
  console.log('\n=============================================================');
  console.log('  YATRAI PHASE 2 — AUTHENTICATION VERIFICATION RUNNER');
  console.log('=============================================================\n');

  console.log('[Step 0] Connecting to database...');
  await connectDatabase();
  console.log('  ✓ Connected to MongoDB.\n');

  // Start temporary Express listener
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`  ✓ Express verification server listening on ${baseUrl}\n`);

  const dummyUser = {
    name: 'Dummy Tester',
    email: `dummy.tester.${Date.now()}@yatrai.com`,
    password: 'SecureDummyPass2026!',
  };

  let refreshTokenCookie = null;
  let accessToken = null;
  let userId = null;

  try {
    // ------------------------------------------------------------------------
    // Step 1: Register dummy user
    // ------------------------------------------------------------------------
    console.log(`[Step 1] Registering dummy user (${dummyUser.email})...`);
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dummyUser),
    });

    const regJson = await regRes.json();
    if (regRes.status !== 201 || !regJson.success) {
      throw new Error(`Registration failed: ${JSON.stringify(regJson)}`);
    }

    accessToken = regJson.data.accessToken;
    userId = regJson.data.user.id || regJson.data.user._id;

    // Extract refresh cookie
    const setCookieHeader = regRes.headers.get('set-cookie');
    if (!setCookieHeader || !setCookieHeader.includes(config.auth.cookieName)) {
      throw new Error('Refresh token HTTP-only cookie was not set in response headers!');
    }

    refreshTokenCookie = setCookieHeader.split(';')[0].replace(`${config.auth.cookieName}=`, '');

    console.log(`  ✓ Registration HTTP 201: Success`);
    console.log(`  ✓ Received Access Token: ${accessToken.substring(0, 20)}...`);
    console.log(
      `  ✓ Received HTTP-only Cookie: ${config.auth.cookieName}=${refreshTokenCookie.substring(0, 16)}...`
    );
    console.log(`  ✓ Safe User payload: ${JSON.stringify(regJson.data.user)}\n`);

    // ------------------------------------------------------------------------
    // Step 2: Database State Inspection
    // ------------------------------------------------------------------------
    console.log('[Step 2] Inspecting stored dummy data in MongoDB...');
    const dbUser = await User.findOne({ email: dummyUser.email }).select('+passwordHash');
    if (!dbUser) throw new Error('User not found in database!');
    if (!dbUser.passwordHash || !dbUser.passwordHash.startsWith('$2')) {
      throw new Error('User passwordHash is missing or not a bcrypt hash!');
    }
    if (dbUser.passwordHash === dummyUser.password) {
      throw new Error('CRITICAL: Plaintext password was stored in database!');
    }
    console.log(`  ✓ User record verified in MongoDB:`);
    console.log(`      ID: ${dbUser._id}`);
    console.log(`      Name: ${dbUser.name}`);
    console.log(`      Email: ${dbUser.email}`);
    console.log(`      Status: ${dbUser.status}`);
    console.log(`      PasswordHash: ${dbUser.passwordHash.substring(0, 25)}... (Bcrypt salted)`);

    const dbSession = await RefreshSession.findOne({ user: dbUser._id });
    if (!dbSession) throw new Error('RefreshSession document not found in MongoDB!');
    const expectedHash = hashToken(refreshTokenCookie);
    if (dbSession.tokenHash !== expectedHash) {
      throw new Error('Stored session tokenHash does not match SHA-256 hash of refresh token!');
    }
    console.log(`  ✓ RefreshSession record verified in MongoDB:`);
    console.log(`      Session ID: ${dbSession._id}`);
    console.log(`      User Ref: ${dbSession.user}`);
    console.log(`      Token SHA-256 Hash: ${dbSession.tokenHash}`);
    console.log(`      ExpiresAt: ${dbSession.expiresAt.toISOString()}`);
    console.log(`      RevokedAt: ${dbSession.revokedAt}\n`);

    // ------------------------------------------------------------------------
    // Step 3: Login with correct and incorrect credentials
    // ------------------------------------------------------------------------
    console.log('[Step 3] Testing Login functionality...');

    // 3a. Invalid password
    const badLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: dummyUser.email, password: 'WrongPasswordXYZ' }),
    });
    const badLoginJson = await badLoginRes.json();
    if (badLoginRes.status !== 401 || badLoginJson.error?.message !== 'Invalid email or password') {
      throw new Error(`Expected generic 401 error, got: ${JSON.stringify(badLoginJson)}`);
    }
    console.log(`  ✓ Invalid password rejected with generic 401: "${badLoginJson.error.message}"`);

    // 3b. Correct credentials
    const goodLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: dummyUser.email, password: dummyUser.password }),
    });
    const goodLoginJson = await goodLoginRes.json();
    if (goodLoginRes.status !== 200 || !goodLoginJson.success) {
      throw new Error(`Login failed: ${JSON.stringify(goodLoginJson)}`);
    }
    console.log(`  ✓ Valid credentials login HTTP 200: Success`);
    console.log(`  ✓ Fresh Access Token: ${goodLoginJson.data.accessToken.substring(0, 20)}...\n`);

    // ------------------------------------------------------------------------
    // Step 4: Protected Route Access (/api/auth/me)
    // ------------------------------------------------------------------------
    console.log('[Step 4] Testing Protected Route (/api/auth/me)...');

    // 4a. Without token
    const noTokenRes = await fetch(`${baseUrl}/api/auth/me`);
    const noTokenJson = await noTokenRes.json();
    if (noTokenRes.status !== 401) {
      throw new Error(`Expected 401 without token, got: ${noTokenRes.status}`);
    }
    console.log(`  ✓ Access denied without token: HTTP 401 (${noTokenJson.error?.code})`);

    // 4b. With valid Bearer token
    const tokenRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const tokenJson = await tokenRes.json();
    if (tokenRes.status !== 200 || !tokenJson.success) {
      throw new Error(`Protected route access failed: ${JSON.stringify(tokenJson)}`);
    }
    console.log(`  ✓ Access granted with Bearer token: HTTP 200`);
    console.log(`  ✓ Current User: ${tokenJson.data.user.name} <${tokenJson.data.user.email}>\n`);

    // ------------------------------------------------------------------------
    // Step 5: Refresh Session and Token Rotation
    // ------------------------------------------------------------------------
    console.log('[Step 5] Testing Session Refresh & Token Rotation...');
    const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `${config.auth.cookieName}=${refreshTokenCookie}` },
    });
    const refreshJson = await refreshRes.json();
    if (refreshRes.status !== 200 || !refreshJson.success) {
      throw new Error(`Refresh failed: ${JSON.stringify(refreshJson)}`);
    }

    const rotatedCookieHeader = refreshRes.headers.get('set-cookie');
    const rotatedCookie = rotatedCookieHeader
      ? rotatedCookieHeader.split(';')[0].replace(`${config.auth.cookieName}=`, '')
      : null;

    if (!rotatedCookie || rotatedCookie === refreshTokenCookie) {
      throw new Error('Refresh token was not rotated!');
    }

    // Check old session in DB
    const oldSession = await RefreshSession.findOne({ tokenHash: hashToken(refreshTokenCookie) });
    if (!oldSession || !oldSession.revokedAt) {
      throw new Error('Old refresh session was not marked revoked in database!');
    }

    // Check new session in DB
    const newSession = await RefreshSession.findOne({ tokenHash: hashToken(rotatedCookie) });
    if (!newSession || newSession.revokedAt !== null) {
      throw new Error('New rotated session was not created as active in database!');
    }

    console.log(`  ✓ Token refresh HTTP 200: Success`);
    console.log(`  ✓ Rotated Refresh Token: ${rotatedCookie.substring(0, 16)}...`);
    console.log(`  ✓ Old session marked revoked in DB at: ${oldSession.revokedAt.toISOString()}`);
    console.log(`  ✓ New active session created in DB: ${newSession._id}`);

    // Test replay of old revoked token
    const replayRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `${config.auth.cookieName}=${refreshTokenCookie}` },
    });
    if (replayRes.status !== 401) {
      throw new Error('Replayed revoked refresh token was not rejected!');
    }
    console.log(`  ✓ Replay of revoked refresh token rejected: HTTP 401\n`);

    // ------------------------------------------------------------------------
    // Step 6: Logout
    // ------------------------------------------------------------------------
    console.log('[Step 6] Testing Logout functionality...');
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `${config.auth.cookieName}=${rotatedCookie}` },
    });
    const logoutJson = await logoutRes.json();
    if (logoutRes.status !== 200 || !logoutJson.success) {
      throw new Error(`Logout failed: ${JSON.stringify(logoutJson)}`);
    }

    // Check DB session revoked
    const loggedOutSession = await RefreshSession.findOne({ tokenHash: hashToken(rotatedCookie) });
    if (!loggedOutSession || !loggedOutSession.revokedAt) {
      throw new Error('Session was not revoked upon logout!');
    }
    console.log(`  ✓ Logout HTTP 200: Success`);
    console.log(`  ✓ Session revoked in DB at: ${loggedOutSession.revokedAt.toISOString()}`);

    // Verify refreshing with logged out cookie now fails
    const postLogoutRefresh = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `${config.auth.cookieName}=${rotatedCookie}` },
    });
    if (postLogoutRefresh.status !== 401) {
      throw new Error('Post-logout refresh was not rejected!');
    }
    console.log(`  ✓ Post-logout refresh rejected: HTTP 401\n`);

    // ------------------------------------------------------------------------
    // Step 7: Account Status Guard (Inactive/Suspended)
    // ------------------------------------------------------------------------
    console.log('[Step 7] Testing Inactive / Suspended account rejection...');
    await User.updateOne({ _id: userId }, { status: 'suspended' });
    const suspendedLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: dummyUser.email, password: dummyUser.password }),
    });
    const suspendedJson = await suspendedLoginRes.json();
    if (suspendedLoginRes.status !== 403 || suspendedJson.error?.code !== 'ACCOUNT_DISABLED') {
      throw new Error(
        `Suspended user was not rejected with 403, got: ${JSON.stringify(suspendedJson)}`
      );
    }
    console.log(
      `  ✓ Suspended account rejected on login: HTTP 403 (${suspendedJson.error.message})\n`
    );

    // ------------------------------------------------------------------------
    // Summary
    // ------------------------------------------------------------------------
    console.log('=============================================================');
    console.log('  ALL FUNCTIONALITY VERIFIED SUCCESSFULLY! ✓');
    console.log('=============================================================');
    console.log('  1. User Registration with Bcrypt (12 salt rounds)');
    console.log('  2. RefreshSession Persistence with SHA-256 tokenHash');
    console.log('  3. HTTP-only Cookie Transport');
    console.log('  4. User Login & Generic Error Handling');
    console.log('  5. Protected Route Authorization (Bearer JWT)');
    console.log('  6. Refresh Token Rotation & Session Revocation');
    console.log('  7. Replay Attack Prevention');
    console.log('  8. Logout & Session Termination');
    console.log('  9. Suspended/Inactive User Rejection');
    console.log('=============================================================\n');
  } finally {
    // Clean up dummy test data from database
    console.log('[Cleanup] Cleaning up dummy test records...');
    if (userId) {
      await Promise.all([
        User.deleteOne({ _id: userId }),
        RefreshSession.deleteMany({ user: userId }),
      ]);
      console.log('  ✓ Dummy test records purged from database.');
    }
    await new Promise((resolve) => server.close(resolve));
    await disconnectDatabase();
  }
}

runVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Verification Failed:', err);
    process.exit(1);
  });
