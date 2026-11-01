import assert from 'node:assert/strict';

// Exact replica of _sameTrainReachSearch binary search from alternativesEngine.service.js
function runBinarySearch(hubs, availableUpToIdx) {
  let calls = 0;
  let lo = 0, hi = hubs.length - 1;
  let farthestAvailableIdx = -1;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    calls++;
    const isAvail = mid <= availableUpToIdx;
    if (isAvail) {
      farthestAvailableIdx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  // Step 3b: check Ha -> destination
  let secondLegChecked = false;
  if (farthestAvailableIdx >= 0) {
    calls++;
    secondLegChecked = true;
  }

  return { calls, farthestAvailableIdx, secondLegChecked };
}

console.log('--- TESTING BINARY SEARCH REACH ON 20 HUBS ---');
const hubs20 = Array.from({ length: 20 }, (_, i) => ({ code: `H${i}` }));

let maxSearchCalls = 0;
let maxTotalCalls = 0;
const results = [];

// Test all scenarios: boundary at none (-1), at index 0, index 5, index 9, index 14, index 19
for (let boundary = -1; boundary < 20; boundary++) {
  const res = runBinarySearch(hubs20, boundary);
  const searchCallsOnly = res.secondLegChecked ? res.calls - 1 : res.calls;
  if (searchCallsOnly > maxSearchCalls) maxSearchCalls = searchCallsOnly;
  if (res.calls > maxTotalCalls) maxTotalCalls = res.calls;
  results.push({ boundary, searchCalls: searchCallsOnly, totalCalls: res.calls, foundIdx: res.farthestAvailableIdx });
}

console.log('Results sample:');
console.table([
  results.find(r => r.boundary === -1), // none
  results.find(r => r.boundary === 0),  // start
  results.find(r => r.boundary === 9),  // middle
  results.find(r => r.boundary === 19), // end
]);

console.log(`Max search calls to find boundary: ${maxSearchCalls}`);
console.log(`Max total calls (search + 2nd leg check): ${maxTotalCalls}`);

// Also test on realistic corridor hub counts:
console.log('\n--- TESTING REALISTIC CORRIDORS (3 to 6 HUBS) ---');
for (const hubCount of [3, 4, 5, 6, 8, 10, 16]) {
  const hubs = Array.from({ length: hubCount }, (_, i) => ({ code: `H${i}` }));
  let maxSearch = 0;
  for (let b = -1; b < hubCount; b++) {
    const res = runBinarySearch(hubs, b);
    const searchOnly = res.secondLegChecked ? res.calls - 1 : res.calls;
    if (searchOnly > maxSearch) maxSearch = searchOnly;
  }
  console.log(`Hub count ${hubCount}: max search calls = ${maxSearch}`);
}

