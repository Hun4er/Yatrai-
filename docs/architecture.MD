# Yatrai Architecture Specification (P1 Hardening)

**Document:** System Architecture & Reconciliation  
**Target Date:** 25 Oct 2026  
**Status:** Canonical & Active

---

## 1. Request Flow: Search Click to RailKit

```
[User Clicks "Search"]
        │
        ▼
[Client: useP0JourneySearch / journeyService]
  • Generates/reuses UUID actionId
  • Checks client cache (sessionStorage: p0SearchCache)
        │
        ▼ POST /api/v2/journeys/search
[Server: journeyV2Controller]
  • Validates payload (actionId, origins, destinations, date, class, mode)
  • Normalizes mode aliases ("auto", "direct", "default", "alternatives", "deep")
  • Resolves station codes via locationService / station dictionary
        │
        ▼
[ActionBudgetService Ledger]
  • Creates or retrieves active action ledger (TTL 2 min)
  • Enforces hard caps: default (40), alternatives_button (60), deep (100)
  • Checks monthly quota (10,000 plan) & degraded mode (<10% quota remaining)
        │
        ├── [DirectPassService] (Phase: direct, auto, default)
        │     • Round 1: Search trains (max 4 pairs), check cancelled, check top 8 candidate trains
        │     • Early stops if CONFIRMED seat found
        │     • Round 2 (if all WL): Checks next 5 trains
        │
        └── [AlternativesEngineService] (Phase: alternatives, deep, or auto fallback)
              • Discovers corridor hubs (cached or computed)
              • Same-train reach search (binary/reach search <= 4 calls per candidate)
              • Cross-train 2-leg transfer matching (layover 90–600 min)
        │
        ▼
[RailKitAdapter & Cache Layers]
  • Deduplicates in-flight calls
  • Queries RailKit API (https://api.railkit.in) with key from env
  • Parses & normalizes availability (AVAILABLE, RAC, WAITLIST) and fares
        │
        ▼
[Client: P0ResultsView]
  • Renders Direct Trains, Class Chips with "?" taps, Waiting Trains, Alternatives
```

---

## 2. Ledger & Action Budget Caps

Every user click creates a single `actionId`. Automatic alternatives follow-ups reuse the **same `actionId`** so total calls never exceed the mode hard cap.

| Mode (Canonical) | Accepted Aliases | Hard Cap | Sub-Caps (Direct / Sched / SameTrain / CrossTrain / Reserve) |
| :--- | :--- | :--- | :--- |
| **`default`** | `direct`, `auto` | **40** | 14 / 6 / 10 / 8 / 2 |
| **`alternatives_button`** | `alternatives` | **60** | - / 6 / 22 / 28 / 4 |
| **`deep`** | `deep` | **100** | - / 8 / 40 / 48 / 4 |
| **`check_class`** | `checkClass` | **100** | Dedicated single-class cap |

- **Refresh-card rate limit:** 1 call per minute per card.
- **Monthly plan:** 10,000 calls (expires 13 Nov 2026). Under 10% remaining (< 1,000), degraded mode activates (direct & same-train only).

---

## 3. Cache Layers

1. **Client L1 (p0SearchCache):** SessionStorage + memory cache (key: `origin:dest:date:class:quota:mode`, TTL 5 min).
2. **Server L1 (In-Process Memory):**
   - Available seats: TTL 90 s.
   - Waitlist seats: TTL 10 min.
   - Cancelled trains: TTL 1 h (unref'd timers).
   - Corridor hubs: TTL 7 days.
3. **Server L2 (MongoDB PersistentCache / CorridorHub / CancelledTrain):** Survives restarts with background index expiry.

---

## 4. File Ownership & Status Matrix

| File / Component | Role & Responsibility | Status |
| :--- | :--- | :--- |
| `client/src/components/journey/P0ResultsView.jsx` | Main results view (direct cards, class chips, alternatives) | **Used** (Canonical) |
| `client/src/components/journey/P0DirectTrainCard.jsx` | Direct train card with seat chips and refresh button | **Used** (Canonical) |
| `client/src/components/journey/P0AlternativeCard.jsx` | 2-leg alternative journey card (same-train & cross-train) | **Used** (Canonical) |
| `client/src/components/journey/P0ClassChips.jsx` | Availability chips with tap-to-check "?" status | **Used** (Canonical) |
| `client/src/components/journey/P0DateStrip.jsx` | Date selector strip across 7 days | **Used** (Canonical) |
| `client/src/services/p0SearchCache.js` | Client-side cache and actionId generation | **Used** (Canonical) |
| `client/src/components/journey/JourneyResultCard.jsx` | Old multi-modal result card | **Deprecated** |
| `client/src/components/journey/CompleteJourneyTimeline.jsx` | Old modal timeline | **Deprecated** |
| `client/src/components/journey/JourneyDetailModal.jsx` | Old modal inspector | **Deprecated** |
| `client/src/components/journey/JourneyComparisonModal.jsx` | Old multi-journey comparison | **Deprecated** |
| `server/src/routes/journeyV2.routes.js` | `/api/v2/journeys/*` endpoints | **Used** (Canonical) |
| `server/src/routes/journey.routes.js` | `/api/journeys/*` routes (wraps v2 for search) | **Used** (Compatibility) |
| `server/src/controllers/journeyV2.controller.js` | Budget-aware journey orchestration controller | **Used** (Canonical) |
| `server/src/controllers/journey.controller.js` | Old multi-modal controller | **Deprecated** |
| `server/src/services/rail/actionBudget.service.js` | Multi-tier action budget ledger and caps | **Used** (Canonical) |
| `server/src/services/rail/directPass.service.js` | Tiered direct rail search algorithm | **Used** (Canonical) |
| `server/src/services/rail/alternativesEngine.service.js` | Same-train and cross-train alternative search | **Used** (Canonical) |
| `server/src/services/rail/cancelledTrains.service.js` | Daily cancelled trains cache and provider | **Used** (Canonical) |
| `server/src/services/rail/corridorHubs.service.js` | Corridor transfer hub discovery and cache | **Used** (Canonical) |
| `server/src/services/rail/availabilityNorm.js` | Strict availability status parser and normalizer | **Used** (Canonical) |
| `server/src/providers/rail/railKit.adapter.js` | HTTP client for official RailKit API | **Used** (Canonical) |
| `server/src/orchestration/journeyOrchestrator.js` | Old monolithic multi-modal pipeline | **Deprecated** |
| `server/src/services/rail/directJourney.service.js` | Old direct train service | **Deprecated** |
| `server/src/services/rail/journeyRecovery.service.js` | Old station expansion recovery service | **Deprecated** |
| `server/src/services/rail/requestBudget.js` | Old 14-request budget tracker | **Deprecated** |
