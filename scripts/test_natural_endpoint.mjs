import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Phase 11 — Natural Language Search Endpoint Integration Tests', () => {
  it('1. Executes natural language search with full constraint interpretation and orchestrator execution', async () => {
    const res = await fetch('http://localhost:5000/api/journeys/search/natural', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'I need to reach Patna from Sonipat on 2026-10-01 morning and I prefer train',
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.parsedRequest);
    assert.equal(data.parsedRequest.origin, 'Sonipat');
    assert.equal(data.parsedRequest.destination, 'Patna');
    assert.equal(data.parsedRequest.departureDate, '2026-10-01');
    assert.deepEqual(data.parsedRequest.requestedModes, ['rail']);
    assert.ok(Array.isArray(data.data?.journeys));
    console.log(`Discovered ${data.data.journeys.length} journey(s) via natural language execution.`);
  });

  it('2. Returns clarification state when required origin is missing in natural language query', async () => {
    const res = await fetch('http://localhost:5000/api/journeys/search/natural', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'Take me to Patna tomorrow morning',
        referenceDate: '2026-09-28',
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.status, 'needs_clarification');
    assert.ok(data.missingFields.includes('origin'));
    assert.ok(data.message.includes('from'));
  });

  it('3. Rejects empty query with HTTP 400', async () => {
    const res = await fetch('http://localhost:5000/api/journeys/search/natural', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: '   ',
      }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
  });
});
