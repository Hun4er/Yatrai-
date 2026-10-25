import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setAccessToken,
  getAccessToken,
  setOnSessionExpired,
  api,
} from '../src/services/api.js';

describe('Frontend Auth Client & Session Persistence Suite', () => {
  beforeEach(() => {
    setAccessToken(null);
    setOnSessionExpired(null);
  });

  it('manages in-memory access token without storing in localStorage', () => {
    setAccessToken('jwt-test-token-123');
    assert.equal(getAccessToken(), 'jwt-test-token-123');
    setAccessToken(null);
    assert.equal(getAccessToken(), null);
  });

  it('triggers session expired notification when refresh fails', async () => {
    let expiredMessage = null;
    setOnSessionExpired((msg) => {
      expiredMessage = msg;
    });

    // Mock global fetch to return 401 for /auth/refresh
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return {
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: { message: 'Refresh token has expired', code: 'EXPIRED_REFRESH_TOKEN' },
        }),
      };
    };

    try {
      await api.auth.refresh();
      assert.fail('Should have thrown on failed refresh');
    } catch (err) {
      assert.equal(err.status, 401);
      assert.match(expiredMessage, /session has expired/i);
      assert.equal(getAccessToken(), null, 'Access token should be cleared');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('deduplicates concurrent refresh calls into a single in-flight HTTP request', async () => {
    let fetchCount = 0;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (url) => {
      if (url.includes('/auth/refresh')) {
        fetchCount++;
        // Add small latency
        await new Promise((r) => setTimeout(r, 20));
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: { accessToken: 'deduped-access-token-999' },
          }),
        };
      }
      return originalFetch(url);
    };

    try {
      // Dispatch 3 concurrent refresh calls
      const [r1, r2, r3] = await Promise.all([
        api.auth.refresh(),
        api.auth.refresh(),
        api.auth.refresh(),
      ]);

      assert.equal(fetchCount, 1, 'Only exactly 1 network request should be sent for concurrent refreshes');
      assert.equal(r1.data.accessToken, 'deduped-access-token-999');
      assert.equal(r2.data.accessToken, 'deduped-access-token-999');
      assert.equal(r3.data.accessToken, 'deduped-access-token-999');
      assert.equal(getAccessToken(), 'deduped-access-token-999');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('transparently retries protected request once after token renewal on 401', async () => {
    let callCount = 0;
    let refreshCalled = false;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (url, options) => {
      if (url.includes('/auth/refresh')) {
        refreshCalled = true;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: { accessToken: 'renewed-token-xyz' },
          }),
        };
      }

      if (url.includes('/users/me')) {
        callCount++;
        if (callCount === 1) {
          // First attempt: token expired
          return {
            ok: false,
            status: 401,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              success: false,
              error: { message: 'Authentication token has expired', code: 'TOKEN_EXPIRED' },
            }),
          };
        }
        // Second attempt: verify renewed Authorization header was attached
        const authHeader = options?.headers?.Authorization || options?.headers?.authorization;
        assert.equal(authHeader, 'Bearer renewed-token-xyz');
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: { user: { name: 'Refreshed User', email: 'user@example.com' } },
          }),
        };
      }

      return originalFetch(url, options);
    };

    try {
      setAccessToken('initial-expired-token');
      const res = await api.users.me();
      assert.equal(res.success, true);
      assert.equal(res.data.user.name, 'Refreshed User');
      assert.equal(callCount, 2, 'Should have called endpoint twice (initial + retry)');
      assert.equal(refreshCalled, true, 'Refresh must have been triggered');
      assert.equal(getAccessToken(), 'renewed-token-xyz');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
