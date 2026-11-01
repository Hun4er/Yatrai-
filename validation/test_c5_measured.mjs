import assert from 'node:assert/strict';
import railKitAdapter from '../server/src/providers/rail/railKit.adapter.js';

console.log('--- TESTING C5: MEASURING WARM CACHE RESPONSE LATENCY & ZERO-COST ---');

// Populate cache with dummy data
const key = 'test:warm:route:NDLS:PNBE';
railKitAdapter._cache.set(key, {
  data: { success: true, trains: [{ trainNumber: '12310', name: 'Rajdhani' }] },
  expiresAt: Date.now() + 600000,
});

// Run 10 consecutive warm cache lookups
const latencies = [];
for (let i = 0; i < 10; i++) {
  const start = performance.now();
  let outboundCalled = false;
  const result = await railKitAdapter._cachedFetch(key, 60000, () => {
    outboundCalled = true;
    return Promise.resolve({ success: false });
  });
  const elapsed = performance.now() - start;
  latencies.push(elapsed);
  assert.equal(outboundCalled, false, 'Warm cache must NOT make outbound call');
  assert.equal(result.success, true);
}

latencies.sort((a, b) => a - b);
const min = latencies[0];
const max = latencies[latencies.length - 1];
const median = (latencies[4] + latencies[5]) / 2;

console.log('Latency over 10 warm cache hits:');
console.log(`  Min:    ${min.toFixed(4)} ms`);
console.log(`  Median: ${median.toFixed(4)} ms`);
console.log(`  Max:    ${max.toFixed(4)} ms`);
console.log(`  Under 50ms requirement: ${max < 50 ? 'PASS (All < 50ms)' : 'FAIL'}`);

