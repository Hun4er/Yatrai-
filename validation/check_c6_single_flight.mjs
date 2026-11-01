import assert from 'node:assert/strict';
import { ActionBudgetService } from '../server/src/services/rail/actionBudget.service.js';

console.log('--- TESTING C6: SINGLE-FLIGHT DEDUPLICATION ---');

const service = new ActionBudgetService();
let outboundCallCount = 0;

// Function that simulates an outbound call taking 50ms
async function slowNetworkCall() {
  outboundCallCount++;
  await new Promise((r) => setTimeout(r, 50));
  return { success: true, timestamp: Date.now(), data: 'railkit_data_payload' };
}

// Fire 10 concurrent identical single-flight requests
const key = 'test_single_flight_12310_' + Date.now();
const promises = Array.from({ length: 10 }, (_, i) => {
  return service.singleFlight(key, () => slowNetworkCall());
});

const results = await Promise.all(promises);

console.log(`Fired 10 concurrent requests.`);
console.log(`Outbound network calls executed: ${outboundCallCount}`);
assert.equal(outboundCallCount, 1, 'Exactly 1 outbound call must be executed for 10 concurrent requests');

// Verify all 10 got the exact same result
for (let i = 0; i < 10; i++) {
  assert.equal(results[i].success, true);
  assert.equal(results[i].data, 'railkit_data_payload');
  assert.equal(results[i].timestamp, results[0].timestamp);
}

console.log('✔ All 10 callers received identical results from the single in-flight promise!');

