import assert from 'node:assert/strict';
import { alternativesEngineService } from '../server/src/services/rail/alternativesEngine.service.js';
import { actionBudgetService } from '../server/src/services/rail/actionBudget.service.js';

console.log('--- TESTING ALTERNATIVES FARES & CALL BOUNDS ---');

async function testAlternativesFares() {
  const actionId = `act_test_alt_${Date.now()}`;
  await actionBudgetService.getOrCreate(actionId, 'alternatives_button');

  // Run alternative search with mock/service
  const result = await alternativesEngineService.run({
    originCode: 'NDLS',
    destCode: 'PNBE',
    dateStr: '2026-11-30',
    laneClass: '3A',
    quota: 'GN',
    actionId,
    actionType: 'alternatives_button',
    budget: actionBudgetService,
    directDistanceKm: 1000,
    referenceTrains: [
      {
        trainNumber: '12310',
        trainName: 'Tejas Rajdhani Express',
        classes: ['3A', '2A', '1A'],
        distance: 1000,
      },
    ],
  });

  const budgetSummary = await actionBudgetService.getBudgetSummary(actionId);
  console.log('Alternatives found:', result.alternatives.length);
  console.log(`Action Budget used: ${budgetSummary.used}/${budgetSummary.cap}`);
  assert.ok(budgetSummary.used <= 60, 'Budget must never exceed ALTERNATIVES_BUTTON cap (60)');

  for (let i = 0; i < result.alternatives.length; i++) {
    const alt = result.alternatives[i];
    console.log(`\nAlternative #${i + 1} (${alt.type}):`);
    console.log(`  Hub: ${alt.hubCode}`);
    console.log(`  Total Fare: ₹${alt.totalFare}`);
    console.log(`  Total Price: ₹${alt.totalPrice}`);
    console.log(`  Legs count: ${alt.legs.length}`);

    assert.ok(alt.totalFare > 0, `Alternative #${i + 1} totalFare must be positive`);
    assert.ok(alt.totalPrice > 0, `Alternative #${i + 1} totalPrice must be positive`);

    let legSum = 0;
    for (let j = 0; j < alt.legs.length; j++) {
      const leg = alt.legs[j];
      if (leg.isTransfer) continue;
      console.log(`    Leg ${j + 1} (${leg.trainNo || leg.trainNumber}): ${leg.from || leg.fromCode} → ${leg.to || leg.toCode} | Fare: ₹${leg.fare} | Price: ₹${leg.price}`);
      assert.ok(typeof leg.fare === 'number' && leg.fare > 0, `Leg ${j + 1} fare must be a positive number`);
      assert.ok(typeof leg.price === 'number' && leg.price > 0, `Leg ${j + 1} price must be a positive number`);
      assert.ok(leg.departureTime, `Leg ${j + 1} departureTime must be defined`);
      assert.ok(leg.arrivalTime, `Leg ${j + 1} arrivalTime must be defined`);
      legSum += leg.fare;
    }
    console.log(`  Sum of leg fares: ₹${legSum} | Total Fare: ₹${alt.totalFare}`);
    assert.equal(alt.totalFare, legSum, `Alternative #${i + 1} totalFare must equal sum of legs`);
  }

  console.log('\n✓ ALL ALTERNATIVES RETURN ACCURATE FARES ON ALL LEGS!');
}

testAlternativesFares().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
