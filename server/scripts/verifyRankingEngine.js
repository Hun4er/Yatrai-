import mongoose from 'mongoose';
import {
  rankingEngine,
  rankingRegistry,
  BaseRankingStrategy,
  overallStrategy,
  fastestStrategy,
  cheapestStrategy,
  fewestTransfersStrategy,
  mostConvenientStrategy,
  normalizeLowerIsBetter,
  normalizeHigherIsBetter,
  getMetricBounds,
  OVERALL_WEIGHTS,
  CONVENIENCE_WEIGHTS,
} from '../src/ranking/index.js';
import { createApp } from '../src/app.js';
import { setupTestDb, teardownTestDb } from '../tests/setup.js';
import Location from '../src/models/Location.js';

console.log('='.repeat(70));
console.log('  YATRAI PHASE 7 — RANKING ENGINE SYSTEM VERIFICATION');
console.log('='.repeat(70));

const mockOriginId = new mongoose.Types.ObjectId();
const mockDestId = new mongoose.Types.ObjectId();

const makeJourney = (id, overrides = {}) => ({
  id,
  origin: mockOriginId,
  destination: mockDestId,
  departureTime: new Date('2026-10-01T08:00:00+05:30'),
  arrivalTime: new Date('2026-10-01T18:00:00+05:30'),
  duration: 600,
  totalDistance: 800,
  totalPrice: 1000,
  currency: 'INR',
  numberOfTransfers: 0,
  transportModes: ['rail'],
  status: 'scheduled',
  legs: [
    {
      mode: 'rail',
      origin: mockOriginId,
      destination: mockDestId,
      departureTime: new Date('2026-10-01T08:00:00+05:30'),
      arrivalTime: new Date('2026-10-01T18:00:00+05:30'),
      duration: 600,
      price: 1000,
      currency: 'INR',
    },
  ],
  ...overrides,
});

let passed = 0;
let total = 0;

function assertCheck(desc, condition) {
  total++;
  if (condition) {
    passed++;
    console.log(`  [PASS] ${desc}`);
  } else {
    console.error(`  [FAIL] ${desc}`);
  }
}

async function runVerification() {
  // 1. Contract & Immutability
  console.log('\n1. Verifying Strategy Contract & Immutability...');
  const input = [makeJourney('J1')];
  const deepCopy = JSON.stringify(input);
  const result = rankingEngine.rank(input, 'fastest');
  assertCheck('Result returns decorated clone', result[0].ranking.rank === 1);
  assertCheck('Input array is not mutated', JSON.stringify(input) === deepCopy);
  assertCheck('Empty journey array returns empty array', rankingEngine.rank([], 'fastest').length === 0);

  // 2. Fastest Strategy
  console.log('\n2. Verifying Fastest Strategy (PRD Section 13)...');
  const fastestInput = [
    makeJourney('B', { duration: 720 }),
    makeJourney('A', { duration: 600 }),
    makeJourney('C', { duration: 900 }),
  ];
  const rankedFastest = rankingEngine.rank(fastestInput, 'fastest');
  assertCheck('Orders A (600m) < B (720m) < C (900m)', 
    rankedFastest[0].id === 'A' && rankedFastest[1].id === 'B' && rankedFastest[2].id === 'C'
  );
  assertCheck('Assigns rank 1, 2, 3 properly',
    rankedFastest[0].ranking.rank === 1 && rankedFastest[1].ranking.rank === 2 && rankedFastest[2].ranking.rank === 3
  );

  // 3. Cheapest Strategy
  console.log('\n3. Verifying Cheapest Strategy (PRD Section 14)...');
  const cheapestInput = [
    makeJourney('A', { totalPrice: 850 }),
    makeJourney('B', { totalPrice: 1200 }),
    makeJourney('C', { totalPrice: 600 }),
  ];
  const rankedCheapest = rankingEngine.rank(cheapestInput, 'cheapest');
  assertCheck('Orders C (600) < A (850) < B (1200)',
    rankedCheapest[0].id === 'C' && rankedCheapest[1].id === 'A' && rankedCheapest[2].id === 'B'
  );

  // Missing price should not be treated as 0
  const missingPriceInput = [
    makeJourney('Known', { totalPrice: 500 }),
    makeJourney('Missing', { totalPrice: null }),
  ];
  const rankedMissingPrice = rankingEngine.rank(missingPriceInput, 'cheapest');
  assertCheck('Missing price is placed after known price (not treated as 0)',
    rankedMissingPrice[0].id === 'Known' && rankedMissingPrice[1].id === 'Missing'
  );

  // 4. Fewest Transfers Strategy
  console.log('\n4. Verifying Fewest Transfers Strategy (PRD Section 15)...');
  const transfersInput = [
    makeJourney('B', { numberOfTransfers: 2 }),
    makeJourney('A', { numberOfTransfers: 0 }),
    makeJourney('C', { numberOfTransfers: 1 }),
  ];
  const rankedTransfers = rankingEngine.rank(transfersInput, 'fewest_transfers');
  assertCheck('Orders A (0 transfers) < C (1 transfer) < B (2 transfers)',
    rankedTransfers[0].id === 'A' && rankedTransfers[1].id === 'C' && rankedTransfers[2].id === 'B'
  );

  // 5. Best Overall Composite Scoring
  console.log('\n5. Verifying Best Overall Composite Scoring (PRD Section 10 & 50)...');
  const overallInput = [
    makeJourney('CheapSlow', { totalPrice: 300, duration: 1200, numberOfTransfers: 2 }),
    makeJourney('FastExpensive', { totalPrice: 3000, duration: 200, numberOfTransfers: 0 }),
    makeJourney('Balanced', { totalPrice: 900, duration: 400, numberOfTransfers: 0 }),
  ];
  const rankedOverall = rankingEngine.rank(overallInput, 'overall');
  assertCheck('Balanced option wins Best Overall composite score', rankedOverall[0].id === 'Balanced');
  assertCheck('Composite scores decrease monotonically', 
    rankedOverall[0].ranking.score >= rankedOverall[1].ranking.score &&
    rankedOverall[1].ranking.score >= rankedOverall[2].ranking.score
  );
  const weightSum = OVERALL_WEIGHTS.durationWeight + OVERALL_WEIGHTS.priceWeight + OVERALL_WEIGHTS.transferWeight + OVERALL_WEIGHTS.convenienceWeight;
  assertCheck('Overall weights sum to 1.0', Math.abs(weightSum - 1.0) < 1e-9);

  // 6. Most Convenient Strategy
  console.log('\n6. Verifying Most Convenient Strategy (PRD Section 16 & 51)...');
  const convInput = [
    makeJourney('RedEye', { departureTime: new Date('2026-10-01T02:00:00+05:30'), numberOfTransfers: 0, duration: 400 }),
    makeJourney('Daytime', { departureTime: new Date('2026-10-01T09:30:00+05:30'), numberOfTransfers: 0, duration: 400 }),
  ];
  const rankedConv = rankingEngine.rank(convInput, 'most_convenient');
  assertCheck('Daytime departure ranks higher than 2 AM red-eye', rankedConv[0].id === 'Daytime');

  // 7. Deterministic Tie-breaking
  console.log('\n7. Verifying Deterministic Tie-Breaking (PRD Section 18 & 19)...');
  const tieInput = [
    makeJourney('A', { duration: 600, totalPrice: 1000, numberOfTransfers: 1 }),
    makeJourney('B', { duration: 600, totalPrice: 800, numberOfTransfers: 1 }), // cheaper
  ];
  const rankedTie = rankingEngine.rank(tieInput, 'fastest');
  assertCheck('Tie on duration broken by secondary price criterion', rankedTie[0].id === 'B');

  // 8. Normalization Edge Cases
  console.log('\n8. Verifying Normalization Edge Cases (PRD Section 37-40)...');
  assertCheck('Equal values normalize safely to 1.0', normalizeLowerIsBetter(500, 500, 500) === 1.0);
  assertCheck('Out of range values clamp safely', normalizeLowerIsBetter(120, 0, 100) === 0.0);
  assertCheck('Null value normalized safely to fallback', normalizeLowerIsBetter(null, 10, 100, 0.0) === 0.0);

  // 9. Currency Homogeneity Safety
  console.log('\n9. Verifying Currency Safety (PRD Section 24 & 53)...');
  const multiCurrencyInput = [
    makeJourney('INR_850', { totalPrice: 850, currency: 'INR' }),
    makeJourney('USD_20', { totalPrice: 20, currency: 'USD' }),
  ];
  const rankedMultiCurrency = rankingEngine.rank(multiCurrencyInput, 'cheapest');
  assertCheck('Multi-currency prevents raw number comparison ($20 raw < ₹850)', 
    rankedMultiCurrency[0].id === 'INR_850'
  );

  // 10. Multi-category rankAll
  console.log('\n10. Verifying rankAll Multi-Category Output (PRD Section 32)...');
  const allResults = rankingEngine.rankAll(overallInput);
  assertCheck('rankAll produces overall', Array.isArray(allResults.overall));
  assertCheck('rankAll produces fastest', Array.isArray(allResults.fastest));
  assertCheck('rankAll produces cheapest', Array.isArray(allResults.cheapest));
  assertCheck('rankAll produces fewest_transfers', Array.isArray(allResults.fewest_transfers));
  assertCheck('rankAll produces most_convenient', Array.isArray(allResults.most_convenient));

  // 11. Strategy Registry Extensibility
  console.log('\n11. Verifying Extensibility via Strategy Registry...');
  class CustomEcoStrategy extends BaseRankingStrategy {
    constructor() {
      super('eco_friendly', 'Eco Friendly', 'Ranks by lowest carbon emission');
    }
    rank(journeys) {
      const working = this.prepareJourneys(journeys);
      return this.decorateResults(working, () => 1.0);
    }
  }
  rankingRegistry.register('eco_friendly', new CustomEcoStrategy());
  assertCheck('Custom strategy can be registered dynamically', rankingRegistry.has('eco_friendly'));
  const ecoRanked = rankingEngine.rank([makeJourney('J1')], 'eco_friendly');
  assertCheck('Custom strategy executed via ranking engine', ecoRanked[0].ranking.strategy === 'eco_friendly');
  rankingRegistry.unregister('eco_friendly');

  // 12. Search API Integration
  console.log('\n12. Verifying Search API HTTP Integration (PRD Section 55 & 56)...');
  await setupTestDb();
  await Location.init();

  let sonipatDoc = await Location.findOne({ city: 'Sonipat' });
  if (!sonipatDoc) {
    sonipatDoc = await Location.create({
      name: 'Sonipat Junction Railway Station',
      city: 'Sonipat',
      state: 'Haryana',
      country: 'India',
      type: 'railway_station',
      location: { type: 'Point', coordinates: [77.0151, 28.9931] },
    });
  }

  let patnaDoc = await Location.findOne({ city: 'Patna' });
  if (!patnaDoc) {
    patnaDoc = await Location.create({
      name: 'Patna Junction Railway Station',
      city: 'Patna',
      state: 'Bihar',
      country: 'India',
      type: 'railway_station',
      location: { type: 'Point', coordinates: [85.1376, 25.6022] },
    });
  }

  const app = createApp();
  let server;
  let baseUrl;

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });

  try {
    // Test 1: Invalid ranking strategy rejection
    const invalidRes = await fetch(`${baseUrl}/api/journeys/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: 'Sonipat',
        destination: 'Patna',
        departureDate: '2026-10-01',
        ranking: 'invalid_strategy_name',
      }),
    });
    const invalidData = await invalidRes.json();
    assertCheck('API rejects invalid ranking strategy with HTTP 400', invalidRes.status === 400);
    assertCheck('API returns VALIDATION_ERROR code', invalidData.error?.code === 'VALIDATION_ERROR');

    // Test 2: Valid ranking strategy integration
    const validRes = await fetch(`${baseUrl}/api/journeys/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: 'Sonipat',
        destination: 'Patna',
        departureDate: '2026-10-01',
        ranking: 'fastest',
      }),
    });
    const validData = await validRes.json();
    assertCheck('API accepts valid ranking strategy with HTTP 200', validRes.status === 200);
    assertCheck('API returns ranking metadata in response', validData.data?.ranking?.strategy === 'fastest');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await teardownTestDb();
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log(`VERIFICATION SUMMARY: ${passed}/${total} checks passed (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('='.repeat(70));

  if (passed !== total) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Unhandled error during verification:', err);
  process.exit(1);
});
