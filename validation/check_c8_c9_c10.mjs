import assert from 'node:assert/strict';
import { isIrctcMaintenanceWindow } from '../server/src/utils/railwayTime.js';
import config from '../server/src/config/index.js';

console.log('--- TESTING C8: IRCTC MAINTENANCE GUARD ---');
// Enable test flag for maintenance window testing
process.env.TEST_MAINTENANCE_WINDOW = 'true';

// Helper to create Date for a specific IST time today
function createIstDate(hours, minutes) {
  // IST is UTC+5:30.
  // To create a Date that represents `hours:minutes` IST on 2026-11-01:
  // UTC time = IST time - 5h 30m.
  const utcHours = hours - 5;
  const utcMinutes = minutes - 30;
  const d = new Date(Date.UTC(2026, 10, 1, utcHours, utcMinutes, 0));
  return d;
}

const t2344 = createIstDate(23, 44);
const t2345 = createIstDate(23, 45);
const t0015 = createIstDate(0, 15);
const t0016 = createIstDate(0, 16);

console.log('Testing timestamps:');
console.log('  23:44 IST -> isIrctcMaintenanceWindow:', isIrctcMaintenanceWindow(t2344));
console.log('  23:45 IST -> isIrctcMaintenanceWindow:', isIrctcMaintenanceWindow(t2345));
console.log('  00:14 IST -> isIrctcMaintenanceWindow:', isIrctcMaintenanceWindow(createIstDate(0, 14)));
console.log('  00:15 IST -> isIrctcMaintenanceWindow:', isIrctcMaintenanceWindow(t0015));
console.log('  00:16 IST -> isIrctcMaintenanceWindow:', isIrctcMaintenanceWindow(t0016));

assert.equal(isIrctcMaintenanceWindow(t2344), false, '23:44 IST must NOT be maintenance window');
assert.equal(isIrctcMaintenanceWindow(t2345), true, '23:45 IST MUST be maintenance window');
assert.equal(isIrctcMaintenanceWindow(createIstDate(0, 14)), true, '00:14 IST MUST be maintenance window');
assert.equal(isIrctcMaintenanceWindow(t0015), false, '00:15 IST reopens (timeInMinutes = 15 is NOT < 15, NOT >= 1425)');
assert.equal(isIrctcMaintenanceWindow(t0016), false, '00:16 IST must NOT be maintenance window');
console.log('✔ C8 Maintenance window boundary verified: active from 23:45 to 00:14:59 IST, reopens 00:15 IST');

console.log('\n--- TESTING C9: LAYOVER RULES (90 to 600 min, tight < 180 min) ---');
const { layoverMinMinutes, layoverMaxMinutes, layoverTightMinutes } = config.p0v2;
console.log('Config values:');
console.log('  layoverMinMinutes:', layoverMinMinutes);
console.log('  layoverMaxMinutes:', layoverMaxMinutes);
console.log('  layoverTightMinutes:', layoverTightMinutes);

function evaluateLayover(layover) {
  const isValid = layover >= layoverMinMinutes && layover <= layoverMaxMinutes;
  const isTight = isValid && layover < layoverTightMinutes;
  return { isValid, isTight };
}

// Test at 89, 90, 179, 180, 600, 601
assert.deepEqual(evaluateLayover(89), { isValid: false, isTight: false });
assert.deepEqual(evaluateLayover(90), { isValid: true, isTight: true });
assert.deepEqual(evaluateLayover(179), { isValid: true, isTight: true });
assert.deepEqual(evaluateLayover(180), { isValid: true, isTight: false });
assert.deepEqual(evaluateLayover(600), { isValid: true, isTight: false });
assert.deepEqual(evaluateLayover(601), { isValid: false, isTight: false });

console.log('✔ C9 Layover evaluation at boundary points:');
console.log('   89 min -> invalid (rejected)');
console.log('   90 min -> valid & tight (Tight connection badge)');
console.log('  179 min -> valid & tight (Tight connection badge)');
console.log('  180 min -> valid & NOT tight');
console.log('  600 min -> valid & NOT tight');
console.log('  601 min -> invalid (rejected)');

console.log('\n--- TESTING C10: DETOUR RATIO DISCREPANCY AUDIT ---');
console.log('Configured p0v2.maxDetourRatio:', config.p0v2.maxDetourRatio);
// Check code in alternativesEngine.service.js line 616: Math.max(p0v2.maxDetourRatio || 1.15, 1.45)
const effectiveCodeMaxDetour = Math.max(config.p0v2.maxDetourRatio || 1.15, 1.45);
console.log('Effective code maxDetour (Math.max(1.15, 1.45)):', effectiveCodeMaxDetour);
console.log('At 1.14 detour -> Allowed in both (1.14 <= 1.15 and 1.14 <= 1.45)');
console.log('At 1.15 detour -> Allowed in both (1.15 <= 1.15 and 1.15 <= 1.45)');
console.log('At 1.16 detour -> Guide expects REJECTED, but Code ALLOWS because code uses 1.45!');

