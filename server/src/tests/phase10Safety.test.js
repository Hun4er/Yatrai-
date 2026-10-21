import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';

describe('Phase 10 — Safety and Cleanup', () => {
  let app;
  let server;
  let baseUrl;

  before(async () => {
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
  });

  describe('Retired Legacy Journey Endpoints (HTTP 410)', () => {
    it('GET /api/journeys/:id/availability returns 410 Gone with clear deprecation explanation', async () => {
      const res = await fetch(`${baseUrl}/api/journeys/test-journey-id/availability`);
      assert.strictEqual(res.status, 410);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.error.code, 'ENDPOINT_RETIRED');
      assert.match(data.error.message, /retired \(HTTP 410 Gone\)/i);
    });

    it('GET /api/journeys/:id/fare returns 410 Gone with clear deprecation explanation', async () => {
      const res = await fetch(`${baseUrl}/api/journeys/test-journey-id/fare`);
      assert.strictEqual(res.status, 410);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.error.code, 'ENDPOINT_RETIRED');
      assert.match(data.error.message, /retired \(HTTP 410 Gone\)/i);
    });
  });

  describe('Admin Usage Route Protection (/api/admin/usage)', () => {
    it('returns 401 when no secret and no auth token provided', async () => {
      const res = await fetch(`${baseUrl}/api/admin/usage`);
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.error.code, 'UNAUTHORIZED');
    });

    it('returns 401 when an invalid secret is provided via header', async () => {
      const res = await fetch(`${baseUrl}/api/admin/usage`, {
        headers: { 'x-admin-secret': 'wrong-secret-value' }
      });
      assert.strictEqual(res.status, 401);
    });

    it('returns 200 when valid admin secret is provided via x-admin-secret header', async () => {
      const secret = process.env.ADMIN_SECRET || 'yatrai_admin_secret_key';
      const res = await fetch(`${baseUrl}/api/admin/usage`, {
        headers: { 'x-admin-secret': secret }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok('callsToday' in data.data);
      assert.ok(Array.isArray(data.data.last50Actions));
    });

    it('returns 200 when valid admin secret is provided via query parameter', async () => {
      const secret = process.env.ADMIN_SECRET || 'yatrai_admin_secret_key';
      const res = await fetch(`${baseUrl}/api/admin/usage?secret=${encodeURIComponent(secret)}`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok('callsToday' in data.data);
    });
  });
});
