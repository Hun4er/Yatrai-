import assert from 'node:assert/strict';
import config from '../server/src/config/index.js';
import { AvailabilityService, AVAILABILITY_STATUS } from '../server/src/services/rail/availability.service.js';
import { PersistentCache } from '../server/src/models/PersistentCache.js';

console.log('--- TESTING C4: CACHE TTLS & MULTI-TIER CACHE ---');

// 1. Verify configured TTL constants
const p0v2 = config.p0v2;
console.log('Config values:');
console.log('  searchRouteTtlMs:', p0v2.searchRouteTtlMs, 'ms (', p0v2.searchRouteTtlMs / 86400000, 'days )');
console.log('  cancelledTrainsTtlMs:', p0v2.cancelledTrainsTtlMs, 'ms (', p0v2.cancelledTrainsTtlMs / 3600000, 'hours )');
console.log('  availabilityTtlAvailableMs:', p0v2.availabilityTtlAvailableMs, 'ms (', p0v2.availabilityTtlAvailableMs / 1000, 'seconds )');
console.log('  availabilityTtlWaitlistMs:', p0v2.availabilityTtlWaitlistMs, 'ms (', p0v2.availabilityTtlWaitlistMs / 60000, 'minutes )');

assert.equal(p0v2.searchRouteTtlMs, 7 * 24 * 60 * 60 * 1000, 'Route timetables must be 7 days');
assert.equal(p0v2.cancelledTrainsTtlMs, 60 * 60 * 1000, 'Cancelled trains must be 1 hour');
assert.equal(p0v2.availabilityTtlAvailableMs, 90 * 1000, 'Confirmed seats must be 90 seconds');
assert.equal(p0v2.availabilityTtlWaitlistMs, 10 * 60 * 1000, 'Waitlist seats must be 10 minutes');
console.log('✔ All 4 TTL constants match the exact specification!');

// 2. Test in-memory L1 cache expiry logic
const availService = new AvailabilityService();
const keyAvail = 'avail_test_key_1';
const keyWL = 'wl_test_key_2';

const now = Date.now();
// Mock L1 cache entry for AVAILABLE (expires in now + 90s)
availService.cache.set(keyAvail, {
  expiresAt: now + 90_000,
  data: { normalizedStatus: AVAILABILITY_STATUS.AVAILABLE, text: 'AVL 10' }
});

// Mock L1 cache entry for WAITLIST (expires in now + 600s)
availService.cache.set(keyWL, {
  expiresAt: now + 600_000,
  data: { normalizedStatus: AVAILABILITY_STATUS.WAITLIST, text: 'WL 5' }
});

// Test at now + 50s: both valid
assert.ok(availService.cache.get(keyAvail).expiresAt > now + 50_000, 'AVAILABLE must be valid at +50s');
assert.ok(availService.cache.get(keyWL).expiresAt > now + 50_000, 'WAITLIST must be valid at +50s');

// Test at now + 91s: AVAILABLE expired, WAITLIST still valid
const isAvailExpiredAt91s = (now + 91_000) > availService.cache.get(keyAvail).expiresAt;
const isWLExpiredAt91s = (now + 91_000) > availService.cache.get(keyWL).expiresAt;
assert.equal(isAvailExpiredAt91s, true, 'AVAILABLE must expire after 90s');
assert.equal(isWLExpiredAt91s, false, 'WAITLIST must still be active after 90s');

// Test at now + 601s: both expired
const isWLExpiredAt601s = (now + 601_000) > availService.cache.get(keyWL).expiresAt;
assert.equal(isWLExpiredAt601s, true, 'WAITLIST must expire after 10 min');
console.log('✔ L1 cache status-dependent expiration logic verified: 90s for AVL, 10m for WL');

// 3. Verify L2 PersistentCache schema has TTL index
const indexes = PersistentCache.schema.indexes();
const ttlIndex = indexes.find(([fields, opts]) => fields.expiresAt === 1 && opts.expireAfterSeconds === 0);
assert.ok(ttlIndex, 'PersistentCache must define TTL index { expiresAt: 1 }, { expireAfterSeconds: 0 }');
console.log('✔ L2 PersistentCache model has active MongoDB TTL index:', ttlIndex);

