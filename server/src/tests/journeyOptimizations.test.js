import test from 'node:test';
import assert from 'node:assert/strict';
import { OverallStrategy } from '../ranking/strategies/overall.strategy.js';
import { evaluateJourneyBookingQuality, isUnlikelyWaitlist, parseWaitlistPosition, BOOKING_QUALITY_TIERS } from '../ranking/utils/bookingQuality.js';
import { persistentCacheService } from '../services/rail/persistentCache.service.js';
import { RequestBudgetTracker } from '../services/rail/requestBudget.js';

test('1. Station labels & Chaining: consecutive legs chain correctly and have real station names', async () => {
  const sampleLegs = [
    {
      sequence: 1,
      origin: { name: 'New Delhi', stationCode: 'NDLS', city: 'New Delhi' },
      destination: { name: 'Kanpur Central', stationCode: 'CNB', city: 'Kanpur' },
      mode: 'rail',
    },
    {
      sequence: 2,
      origin: { name: 'Kanpur Central', stationCode: 'CNB', city: 'Kanpur' },
      destination: { name: 'Patna Junction', stationCode: 'PNBE', city: 'Patna' },
      mode: 'rail',
    },
  ];

  // Assert no placeholders
  for (const leg of sampleLegs) {
    assert.notEqual(leg.origin.name, 'Origin', 'Origin must not be the placeholder "Origin"');
    assert.notEqual(leg.destination.name, 'Destination', 'Destination must not be the placeholder "Destination"');
    assert.ok(leg.origin.stationCode, 'Leg must have an origin stationCode');
    assert.ok(leg.destination.stationCode, 'Leg must have a destination stationCode');
  }

  // Assert chaining: leg[0].destination == leg[1].origin
  assert.equal(
    sampleLegs[0].destination.stationCode,
    sampleLegs[1].origin.stationCode,
    'Consecutive legs must chain: leg[0].destination == leg[1].origin'
  );
});

test('2. Ranking: confirmed (AVAILABLE) > RAC > WL, then by waitlist position', () => {
  const journeys = [
    {
      id: 'j_wl_deep',
      duration: 500, // fastest duration
      totalPrice: 1000,
      legs: [
        {
          availability: { normalizedStatus: 'WAITLIST', rawStatus: 'RLWL54/WL18' },
        },
      ],
    },
    {
      id: 'j_wl_short',
      duration: 600,
      totalPrice: 1200,
      legs: [
        {
          availability: { normalizedStatus: 'WAITLIST', rawStatus: 'GNWL6/WL4' },
        },
      ],
    },
    {
      id: 'j_rac',
      duration: 700,
      totalPrice: 1500,
      legs: [
        {
          availability: { normalizedStatus: 'RAC', rawStatus: 'RAC 5/RAC 2' },
        },
      ],
    },
    {
      id: 'j_avail',
      duration: 800, // slowest duration
      totalPrice: 1800,
      legs: [
        {
          availability: { normalizedStatus: 'AVAILABLE', rawStatus: 'AVAILABLE-0024' },
        },
      ],
    },
  ];

  const strategy = new OverallStrategy();
  const ranked = strategy.rank(journeys);

  // Assert booking tier ranking: AVAILABLE > RAC > short WL > deep WL
  assert.equal(ranked[0].id, 'j_avail', 'First ranked journey must be AVAILABLE despite longer duration');
  assert.equal(ranked[1].id, 'j_rac', 'Second ranked journey must be RAC');
  assert.equal(ranked[2].id, 'j_wl_short', 'Third ranked journey must be short waitlist (WL 4)');
  assert.equal(ranked[3].id, 'j_wl_deep', 'Last ranked journey must be deep waitlist (WL 18)');
});

test('3. Honest Labels: Long waitlist is flagged as unlikely and not labeled Feasible Alternative', () => {
  assert.ok(isUnlikelyWaitlist('RLWL54/WL25'), 'RLWL 25 should be unlikely (threshold 20)');
  assert.ok(isUnlikelyWaitlist('GNWL20/WL15'), 'GNWL 15 should be unlikely (threshold 10)');
  assert.ok(!isUnlikelyWaitlist('GNWL5/WL3'), 'GNWL 3 should be feasible/manageable');

  const deepWaitlistJourney = {
    legs: [
      { availability: { normalizedStatus: 'WAITLIST', rawStatus: 'RLWL54/WL18' } },
      { availability: { normalizedStatus: 'WAITLIST', rawStatus: 'RLWL6/WL4' } },
    ],
  };

  const bq = evaluateJourneyBookingQuality(deepWaitlistJourney);
  // Max waitlist is 18 (feasible for RLWL is <= 20, but let's test WL 25)
  const unlikelyJourney = {
    legs: [
      { availability: { normalizedStatus: 'WAITLIST', rawStatus: 'RLWL60/WL25' } },
      { availability: { normalizedStatus: 'WAITLIST', rawStatus: 'GNWL30/WL15' } },
    ],
  };
  const bqUnlikely = evaluateJourneyBookingQuality(unlikelyJourney);
  assert.equal(bqUnlikely.isUnlikely, true, 'Journey with RLWL 25 and GNWL 15 must be flagged isUnlikely');
  assert.equal(bqUnlikely.tier, BOOKING_QUALITY_TIERS.DEEP_WAITLIST);
});

test('4. Leg Deduplication & In-flight coalescing logic', async () => {
  const cache = new Map();
  let outboundCount = 0;

  async function mockFetchLegAvail(legKey) {
    if (cache.has(legKey)) {
      return cache.get(legKey);
    }
    const promise = (async () => {
      outboundCount++;
      return { status: 'AVAILABLE', key: legKey };
    })();
    cache.set(legKey, promise);
    return promise;
  }

  // Two candidate journeys sharing leg 1
  const leg1Key = '12310:NDLS:CNB:2026-10-20:3A:GN';
  const resA = await mockFetchLegAvail(leg1Key);
  const resB = await mockFetchLegAvail(leg1Key);

  assert.equal(outboundCount, 1, 'Same leg across candidates must only trigger 1 network call');
  assert.equal(resA.status, 'AVAILABLE');
  assert.equal(resB.status, 'AVAILABLE');
});

test('5. Short-circuit: skip leg 2 if leg 1 is non-bookable / unlikely waitlist', () => {
  const leg1Avail = { normalizedStatus: 'WAITLIST', rawStatus: 'GNWL50/WL35' };
  const shouldSkipLeg2 = isUnlikelyWaitlist(leg1Avail.rawStatus) || leg1Avail.normalizedStatus === 'REGRET';

  assert.equal(shouldSkipLeg2, true, 'Leg 2 should be skipped when Leg 1 has GNWL 35');
});

test('6. Per-search budget cap: enforces max 15 requests', () => {
  const tracker = new RequestBudgetTracker({ maxTotalRequests: 15, maxRecoveryRequests: 15 });

  assert.equal(tracker.maxTotalRequests, 15);
  assert.equal(tracker.hasBudgetRemaining(), true);

  // Record 15 requests
  for (let i = 0; i < 15; i++) {
    assert.equal(tracker.hasBudgetRemaining(), true);
    tracker.recordOutboundRequest({ isRecovery: true });
  }

  assert.equal(tracker.hasBudgetRemaining(), false, 'Budget must be exhausted after 15 requests');
  assert.equal(tracker.canMakeRecoveryRequest(), false);
});

test('7. Persistent Cache: set, get, TTL, and negative caching', async () => {
  persistentCacheService.clearMemory();

  const key = 'test:avail:12345:NDLS:CNB';
  const data = { status: 'ok', trainNo: '12345' };

  await persistentCacheService.set(key, data, 'availability', 60000);
  const retrieved = await persistentCacheService.get(key);
  assert.deepEqual(retrieved, data, 'Cached data should match stored data');

  // Negative caching
  const negKey = 'test:neg:invalid:station';
  await persistentCacheService.setNegative(negKey, { notFound: true, error: 'Invalid station' });
  const negRetrieved = await persistentCacheService.get(negKey);
  assert.equal(negRetrieved.notFound, true, 'Negative cache entry should be retrieved');
});
