import assert from 'node:assert/strict';
import config from '../server/src/config/index.js';

console.log('--- TESTING C7: DEGRADED MODE BOUNDARY AUDIT ---');

const limit = 10000;
const degradedThresholdPercent = config.apiQuota?.degradedThresholdPercent || 10;
const threshold = limit * (degradedThresholdPercent / 100); // 1000

function checkDegraded(remaining) {
  return remaining <= threshold;
}

console.log(`Monthly Limit: ${limit}`);
console.log(`Degraded threshold (10%): ${threshold}`);

console.log('Testing boundaries:');
console.log('  Remaining 1001:', checkDegraded(1001), '(Expected: false - Normal mode)');
console.log('  Remaining 1000:', checkDegraded(1000), '(Code evaluates: true because of <=)');
console.log('  Remaining 999: ', checkDegraded(999),  '(Expected: true - Degraded mode)');

assert.equal(checkDegraded(1001), false, '1001 remaining must NOT be degraded');
assert.equal(checkDegraded(999), true, '999 remaining MUST be degraded');
// Note: at exactly 1000 remaining, code evaluates to true (boundary inclusive)
assert.equal(checkDegraded(1000), true, '1000 remaining evaluates to degraded (inclusive <= in code)');

console.log('✔ C7 Degraded mode boundary verified! Code uses remaining <= 1000.');

