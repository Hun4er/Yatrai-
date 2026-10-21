# End-to-End Availability Trace & Root Cause Analysis

## Executive Summary
In the live UI for searches such as NDLS -> Patna Jn (PNBE / DNR), train cards showed class chips with `2A UNKNOWN`, `3A UNKNOWN`, and `1A ?` with "checked just now", while price filters displayed "Fare unavailable".

This document traces the exact data path from outbound RailKit HTTP call to DOM rendering, identifying the root causes with empirical code references.

---

## 1. End-to-End Data Path Trace

```mermaid
flowchart TD
    RK[RailKit API: GET /api/v1/seats/:train/:from/:to/:date/:coach/:quota] --> RKA[RailKitAdapter._cachedFetch / getAvailability]
    RKA --> AS[AvailabilityService.checkLegAvailability]
    AS --> DP[DirectPassService.run]
    DP --> C2[JourneyV2Controller.search]
    C2 --> JS[journeyService.searchJourneys (Client)]
    JS --> RP[ResultsPage.jsx]
    RP --> PRV[P0ResultsView.jsx]
    PRV --> TC[P0DirectTrainCard.jsx]
    TC --> PCC[P0ClassChips.jsx]
```

### Stage 1: RailKit Raw Response
When queried directly, RailKit returns a valid response with status, availabilityText, rawStatus, predictionPercentage, and complete fare structure:
```json
{
  "success": true,
  "data": {
    "train": { "trainNo": "12310", "travelClass": "3A", "quota": "GN" },
    "fare": { "baseFare": 1482, "reservationCharge": 40, "superfastCharge": 45, "serviceTax": 108, "totalFare": 2545 },
    "availability": [
      {
        "date": "25-10-2026",
        "status": "WAITLIST",
        "availabilityText": "WL 165",
        "rawStatus": "GNWL299/WL165",
        "prediction": "Low Chance",
        "predictionPercentage": 27,
        "canBook": true
      }
    ]
  }
}
```

### Stage 2: Gatekeeper Rejection in `RailKitAdapter` (Root Cause 1)
**File:** [server/src/providers/rail/railKit.adapter.js:408-417](file:///c:/Yatrai/server/src/providers/rail/railKit.adapter.js#L408-L417)
```javascript
const tracker = options?.budgetTracker || getCurrentBudgetTracker();
if (!tracker) {
  logger.warn(`[RailKitAdapter] Refusing availability call without BudgetTracker: ${num} ${fromCode}->${toCode}`);
  return {
    ...this._unknownAvailability(num, fromCode, toCode, internalDate, coach, quota, 'NO_BUDGET_TRACKER'),
    isBudgetExhausted: true,
    isUnchecked: true,
    normalizedStatus: 'UNCHECKED',
  };
}
```
**Mechanism:**
- In P0 v2 and P1, request caps are enforced centrally by `ActionBudgetService` (`actionBudgetService.recordCall(...)`).
- When `DirectPassService` called `availabilityService.checkLegAvailability(...)`, it did not pass a legacy `BudgetTracker` instance.
- `RailKitAdapter.getAvailability` refused the outbound call because `tracker` was null, calling `this._unknownAvailability(...)`.
- `_unknownAvailability` explicitly assigns:
  ```javascript
  normalizedStatus: AVAILABILITY_STATUS.UNKNOWN,
  rawStatus: 'UNKNOWN',
  statusText: 'UNKNOWN',
  fare: null,
  ```
- Because of this gatekeeper, the live HTTP request was never made during normal search flows.

### Stage 3: Missing Fare Assignment in `DirectPassService` (Root Cause 2)
**File:** [server/src/services/rail/directPass.service.js:146-166](file:///c:/Yatrai/server/src/services/rail/directPass.service.js#L146-L166)
```javascript
function buildClassChip(cls, state, availResult) {
  const chip = {
    class: cls,
    state, // 'CHECKED' | 'UNCHECKED' | 'UNVERIFIED'
    tier: null,
    availabilityText: null,
    fare: null,
    predictionPercentage: 0,
    dates: [],
    checkedAt: null,
  };
  if (availResult) {
    chip.tier = availResult.normalizedStatus;
    chip.availabilityText = availResult.statusText || availResult.originalStatus || null;
    chip.predictionPercentage = availResult.predictionPercentage || 0;
    // Missing: chip.fare = availResult.fare?.totalFare || availResult.fare;
  }
  return chip;
}
```
Even when `availResult` contained `fare: { totalFare: 2545 }`:
1. `buildClassChip` NEVER mapped `chip.fare` from `availResult.fare`.
2. `trainResult` in `directPass.service.js` never assigned a top-level `fare` field.
3. As a result, the train cards and price filters showed "Fare unavailable".

### Stage 4: Missing Date Strip in Adapter
**File:** [server/src/providers/rail/railKit.adapter.js:534-561](file:///c:/Yatrai/server/src/providers/rail/railKit.adapter.js#L534-L561)
RailKit returns `json.data.availability` (an array of 4 consecutive dates), but `getAvailability` only returned the current entry and did not pass `dates: availList` to the caller.

### Stage 5: Normalizer Vocab Fallback
**File:** [server/src/services/rail/availabilityNorm.js:128-135](file:///c:/Yatrai/server/src/services/rail/availabilityNorm.js#L128-L135)
When `rawStatus` was `'UNKNOWN'` or empty, `normalizeSeatAvailability` returned `{ normalizedStatus: 'UNKNOWN' }`.

### Stage 6: Client Display
**File:** [client/src/components/journey/P0ClassChips.jsx](file:///c:/Yatrai/client/src/components/journey/P0ClassChips.jsx)
The chip rendered:
```jsx
{cls} · {chip.tier || 'UNKNOWN'}
```
Because `tier` was `'UNKNOWN'`, the chip rendered `2A UNKNOWN`, `3A UNKNOWN`.
Unchecked classes rendered `1A ?`.

---

## 2. Summary of Exact Points of Failure
1. **Outbound suppression:** `railKit.adapter.js:408` refused calls when legacy `budgetTracker` was absent, setting `tier = 'UNKNOWN'`.
2. **Missing fare assignment:** `directPass.service.js:152` left `chip.fare = null` and train card `fare = null`.
3. **Missing multi-date return:** `railKit.adapter.js:534` omitted the 4-date strip from `json.data.availability`.
4. **Normalizer vocabulary:** `UNKNOWN` was returned as a normal status instead of `ERROR` or parsed waitlist position.
