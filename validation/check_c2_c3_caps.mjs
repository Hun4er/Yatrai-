import assert from 'node:assert/strict';
import { ActionBudgetService, getCapForActionType } from '../server/src/services/rail/actionBudget.service.js';

console.log('--- TESTING C2: CALL CAPS (40, 60, 100) & C3: SHARED ACTION_ID ---');

const service = new ActionBudgetService();

// 1. Check cap values
assert.equal(getCapForActionType('default'), 40, 'Default cap must be 40');
assert.equal(getCapForActionType('alternatives_button'), 60, 'Alternatives button cap must be 60');
assert.equal(getCapForActionType('deep'), 100, 'Deep cap must be 100');
console.log('✔ Cap values match: default=40, alternatives_button=60, deep=100');

// 2. Force default to exceed cap 40
const actDefault = 'test_cap_default_' + Date.now();
await service.getOrCreate(actDefault, 'default');
for (let i = 0; i < 40; i++) {
  const ok = await service.recordCall({ actionId: actDefault, phase: 'direct', endpoint: 'test', cost: 1 });
  assert.equal(ok, true, `Call ${i+1} should succeed within cap 40`);
}
// 41st call must fail
const okOverDefault = await service.recordCall({ actionId: actDefault, phase: 'direct', endpoint: 'test', cost: 1 });
assert.equal(okOverDefault, false, 'Call 41 must be rejected by cap');
const stateDefault = await service.getOrCreate(actDefault);
assert.equal(stateDefault.used, 40, 'Used must stop at 40');
assert.equal(stateDefault.partial, true, 'Partial must be true');
console.log(`✔ Default cap strictly enforced: used=${stateDefault.used}/${stateDefault.cap}, call 41 rejected`);

// 3. Force alternatives_button to exceed cap 60
const actAlt = 'test_cap_alt_' + Date.now();
await service.getOrCreate(actAlt, 'alternatives_button');
for (let i = 0; i < 60; i++) {
  const ok = await service.recordCall({ actionId: actAlt, phase: 'sameTrain', endpoint: 'test', cost: 1 });
  assert.equal(ok, true, `Call ${i+1} should succeed within cap 60`);
}
const okOverAlt = await service.recordCall({ actionId: actAlt, phase: 'sameTrain', endpoint: 'test', cost: 1 });
assert.equal(okOverAlt, false, 'Call 61 must be rejected by cap 60');
const stateAlt = await service.getOrCreate(actAlt);
assert.equal(stateAlt.used, 60, 'Used must stop at 60');
console.log(`✔ Alternatives button cap strictly enforced: used=${stateAlt.used}/${stateAlt.cap}, call 61 rejected`);

// 4. Force deep to exceed cap 100
const actDeep = 'test_cap_deep_' + Date.now();
await service.getOrCreate(actDeep, 'deep');
for (let i = 0; i < 100; i++) {
  const ok = await service.recordCall({ actionId: actDeep, phase: 'crossTrain', endpoint: 'test', cost: 1 });
  assert.equal(ok, true, `Call ${i+1} should succeed within cap 100`);
}
const okOverDeep = await service.recordCall({ actionId: actDeep, phase: 'crossTrain', endpoint: 'test', cost: 1 });
assert.equal(okOverDeep, false, 'Call 101 must be rejected by cap 100');
const stateDeep = await service.getOrCreate(actDeep);
assert.equal(stateDeep.used, 100, 'Used must stop at 100');
console.log(`✔ Deep cap strictly enforced: used=${stateDeep.used}/${stateDeep.cap}, call 101 rejected`);

// 5. C3: Shared actionId across direct and alternatives
const sharedAct = 'test_shared_' + Date.now();
await service.getOrCreate(sharedAct, 'default'); // cap = 40
// Direct phase uses 14 calls
for (let i = 0; i < 14; i++) {
  await service.recordCall({ actionId: sharedAct, phase: 'direct', endpoint: 'searchTrains', cost: 1 });
}
let sharedState = await service.getOrCreate(sharedAct);
assert.equal(sharedState.used, 14);

// Follow-up alternatives phase continues using the SAME actionId
for (let i = 0; i < 26; i++) {
  const ok = await service.recordCall({ actionId: sharedAct, phase: 'sameTrain', endpoint: 'seatAvailability', cost: 1 });
  assert.equal(ok, true, `Call ${14 + i + 1} should be allowed`);
}
sharedState = await service.getOrCreate(sharedAct);
assert.equal(sharedState.used, 40, 'Total shared usage must be 40');

// Next call from alternatives must be blocked
const okSharedExceeded = await service.recordCall({ actionId: sharedAct, phase: 'crossTrain', endpoint: 'seatAvailability', cost: 1 });
assert.equal(okSharedExceeded, false, 'Subsequent call after 40 total must be rejected');
sharedState = await service.getOrCreate(sharedAct);
assert.equal(sharedState.used, 40, 'Total shared usage cannot exceed 40');
console.log(`✔ C3: Shared actionId verified: Direct (14) + Alternatives (26) = 40/40, call 41 rejected`);

