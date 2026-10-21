# End-to-End Alternatives Trace & Root Cause Analysis

## Executive Summary
In the live UI, clicking "Alternative journeys" displayed the pill `4 alternatives added`, but the Alternative Journeys container rendered:
> *"No viable split-ticket or connection combinations found within budget and layover rules."*

This document identifies the exact lines where plans were lost across backend extraction, controller orchestration, and frontend state management.

---

## 1. End-to-End Alternatives Data Path

```mermaid
flowchart TD
    subgraph Backend
        AE[alternativesEngine.service.js] --> C2[journeyV2.controller.js]
    end
    subgraph Client State
        C2 --> API[api.js / journeyService.js]
        API --> RP[ResultsPage.jsx: p0Alternatives vs optionalAlternatives]
    end
    subgraph UI Render
        RP -->|optionalAlternatives.length| Pill[Header Pill: '4 alternatives added']
        RP -->|p0Alternatives=[]| PRV[P0ResultsView.jsx]
        PRV --> EmptyState[Empty State Banner]
    end
```

---

## 2. Root Cause 1: Two Disconnected State Arrays & Event Handlers
**File:** [client/src/pages/ResultsPage.jsx:580-602](file:///c:/Yatrai/client/src/pages/ResultsPage.jsx#L580-L602) vs [client/src/pages/ResultsPage.jsx:847](file:///c:/Yatrai/client/src/pages/ResultsPage.jsx#L847)

### Line 584: The Legacy Handler
```jsx
{/* Explore Alternatives Button in legacy toolbar */}
{backendJourneys.length > 0 && !recoveryMeta?.recoveryTriggered && (
  <button
    type="button"
    onClick={handleExploreAlternatives}
    ...
  >
    <span>
      {isRecoveringAlternatives
        ? 'Exploring network...'
        : optionalAlternatives.length > 0
        ? `${optionalAlternatives.length} alternatives added`
        : 'Explore alternatives'}
    </span>
  </button>
)}
```

### Line 338: What `handleExploreAlternatives` Does
```javascript
const handleExploreAlternatives = async () => {
  setIsRecoveringAlternatives(true);
  try {
    const res = await api.journey.recover(...); // OLD legacy endpoint!
    if (res?.data?.journeys) {
      setOptionalAlternatives(res.data.journeys); // Populates optionalAlternatives
    }
  } ...
};
```
When clicked, `setOptionalAlternatives(res.data.journeys)` set `optionalAlternatives` to 4 items.
Therefore, the pill dynamically updated to show:
**`4 alternatives added`**.

### Line 847: What `P0ResultsView` Actually Renders
```jsx
<P0ResultsView
  direct={p0Direct}
  waitingTrains={p0Waiting}
  alternatives={p0Alternatives} // Reads p0Alternatives, NOT optionalAlternatives!
  ...
/>
```
`p0Alternatives` was NOT updated by `handleExploreAlternatives`!
`p0Alternatives` remained `[]`.

### Line 320 in `P0ResultsView.jsx`: The Empty State Trigger
```jsx
{!isLoadingAlternatives && alternatives.length === 0 && !hasConfirmedDirectSeat && (
  <div className="rounded-2xl border border-dashed border-[#303640] bg-[#12151A] p-5 text-center text-xs text-[#7E8794]">
    No viable split-ticket or connection combinations found within budget and layover rules.
  </div>
)}
```
Because `alternatives` (`p0Alternatives`) was `[]`, `P0ResultsView` showed the empty state, while the header pill directly above read `4 alternatives added`!

---

## 3. Root Cause 2: Hub Discovery Dropped All Stations (`stn.stnCode`)
**File:** [server/src/services/rail/alternativesEngine.service.js:264-270](file:///c:/Yatrai/server/src/services/rail/alternativesEngine.service.js#L264-L270)

```javascript
const stations = schedule.data?.route || schedule.data?.stations || schedule.stations || schedule.data || [];
if (Array.isArray(stations)) {
  for (const stn of stations) {
    const code = String(stn.station_code || stn.stationCode || stn.code || '').toUpperCase();
    if (!code || code === originCode || code === destCode) continue;
    const existing = stationScores.get(code) || 0;
    stationScores.set(code, existing + 1);
  }
}
```

### Evidence:
RailKit's real `/api/v1/trains/:trainNo/info` response represents route stops as:
```json
{
  "stnCode": "CNB",
  "stnName": "Kanpur Central",
  "arrival": "21:50",
  "departure": "21:55",
  "distance": "441"
}
```
The property key is **`stnCode`**.
`stn.station_code`, `stn.stationCode`, and `stn.code` were all `undefined`!
Therefore, `code` evaluated to `""` for every station in the route.
`stationScores` was always empty $\implies$ `hubs` was always `[]` $\implies$ logged `[AltEngine] No hubs found.`

---

## 4. Root Cause 3: Controller Reference Trains Decoupling
**File:** [server/src/controllers/journeyV2.controller.js:164-197](file:///c:/Yatrai/server/src/controllers/journeyV2.controller.js#L164-L197)

When `mode === 'alternatives'` (such as clicking the alternatives button):
```javascript
const isAutoOrDirect = normalizedMode === 'default' || normalizedMode === 'auto' || normalizedMode === 'direct';
if (isAutoOrDirect) {
  directResult = await directPassService.run(...);
}
...
if (shouldRunAlternatives) {
  alternativesResult = await alternativesEngineService.run({
    ...
    referenceTrains: directResult?.direct || [], // EMPTY ARRAY!
  });
}
```
Because `directResult` was skipped in `alternatives` mode, `referenceTrains` was passed as `[]`. With 0 reference trains and unseeded corridor cache, `_discoverHubs` had no reference trains from which to discover hubs.

---

## 5. Root Cause 4: Strict Availability Filter Drops All Waitlisted Plans
**File:** [server/src/services/rail/alternativesEngine.service.js:551-563](file:///c:/Yatrai/server/src/services/rail/alternativesEngine.service.js#L551-L563)

In Phase 1/P0, alternatives required:
```javascript
if (leg1Avail?.normalizedStatus !== AVAILABILITY_STATUS.AVAILABLE) continue;
if (leg2Avail?.normalizedStatus !== AVAILABILITY_STATUS.AVAILABLE) continue;
```
If both legs were not strictly `AVAILABLE` (confirmed), the plan was dropped. On routes where seats are waitlisted, 0 confirmed plans were returned. Phase 5 requires a second pass fallback for risky plans (predictionPercentage $\ge 60$) when strict search finds nothing.

---

## 6. Action Plan for Phase 3 & 4
1. **Unify state & selectors:** Eliminate `optionalAlternatives` and bind all counts (pill, header, and rendered cards) to a single canonical selector reading `results.alternatives`.
2. **Fix `stnCode` in `_discoverHubs`:** Use `stn.stnCode || stn.station_code || stn.stationCode || stn.code`.
3. **Pass reference trains in `journeyV2.controller.js`:** When running alternatives mode, resolve top trains between origin and destination so hubs can always be discovered.
4. **Implement Phase 5 fallback:** When strict confirmed search yields 0 plans, generate the second pass of best-chance waitlisted plans (predictionPercentage $\ge 60$).
