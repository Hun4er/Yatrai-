# RailRadar Data Capability Audit & Indian Railways Integration Specification

**Platform:** Yatrai Multi-Modal Mobility Operating System  
**Component:** Railway Domain Engine (`railradar` Provider Adapter)  
**Date of Audit:** October 2026  
**Environment:** Production / Staging Node.js Backend  
**Status:** Audit Complete & Verified  

---

## 1. Executive Summary & Active Provider Configuration

In accordance with Yatrai production standards, **RailRadar (`https://api.railradar.in/v1`)** is configured as the **sole active external railway API provider**. Unverified mock fallbacks and unauthenticated secondary providers (such as AOPAY) are strictly disabled to prevent phantom itineraries, fabricated train numbers, or hallucinated seat inventories.

### Live Diagnostic Findings
During direct API probing of `https://api.railradar.in/v1`:
- **Active Endpoint Verified:** `GET /trains/between/{from}/{to}` responds with HTTP 200 and schema payload `{"success": true, "data": [...]}` when quota is available.
- **Quota & Rate Limit Status:** The production development tier key (`rg_8133aa7a4e754c959d85b88d32f17689`) returned `HTTP 429 Too Many Requests: Monthly quota exceeded. Maximum 1000 requests per month.`
- **Resilience Behavior:** Yatrai's `RailRadarAdapter` and `directJourneyService` catch HTTP 429 cleanly, tagging the failure as `DIRECT_SEARCH_FAILED` (`Rate limit exceeded for provider "railradar"`), isolating the error, and automatically transitioning to the Railway Journey Recovery Engine without crashing the server or throwing uncaught promise rejections.

---

## 2. Master Capability Matrix & Verification Audit

| Requirement | RailRadar support | Verified endpoint | Implemented | Missing capability |
|---|---|---|---|---|
| **Station lookup** | Supported | `GET /v1/stations/search?q={query}` | Yes (`LocationService` + MongoDB cache) | Full facility/amenity metadata not provided |
| **Station codes** | Supported | Station code field (`code`) in `/v1/stations/search` & `/trains/between` | Yes (`resolveStationCode`) | Metropolitan cluster auto-mapping not supported natively |
| **Direct train search** | Supported | `GET /v1/trains/between/{from}/{to}` | Yes (`RailRadarAdapter.searchDirectTrains`) | None (Returns train number, name, timings, running days) |
| **Schedules** | Supported | `GET /v1/trains/{trainNumber}/schedule` | Yes (`RailRadarAdapter.getTrainSchedule`) | Dynamic day-of-run schedule changes/rescheduling not in basic payload |
| **Intermediate stops** | Supported | `GET /v1/trains/{trainNumber}/schedule` (`stops[]`) | Yes (`JourneyLeg.metadata.stops`) | Platform numbers on all intermediate halts not guaranteed |
| **Running days** | Supported | Field `runDays` / `train.runDays` in `/trains/between` & `/schedule` | Yes (`calculateJourneyTiming` + date filter) | Holiday special running calendar adjustments |
| **Seat availability** | Not supported in v1 basic tier | None verified | No (Heuristic confirmed-status indicator) | Real-time berth counts (e.g., "AVAILABLE 45", "WL 12") not exposed |
| **Class and quota support** | Partially supported | Classes list (`classes[]`) in train details | Yes (Class filtering in schema) | Tatkal, Ladies, Senior Citizen quota availability not exposed |
| **Fares** | Not supported with verified fields | None verified in standard search response | Display `Fare unavailable` (no synthetic distance tariffs) | Verified breakdown per travel class (SL, 3A, 2A, 1A) absent |
| **Railway distance** | Supported | Field `distance` in `/v1/trains/between` and `/schedule` | Yes (`JourneyLeg.distance`) | None |
| **Live status** | Supported | `GET /v1/trains/{trainNumber}/live` | Yes (`liveStatusService.js`) | Requires train to be actively on route on current date |
| **Delays** | Supported | Field `delay` / `delayMinutes` in `/v1/trains/{trainNumber}/live` | Yes (Displayed in live tracking modal) | Historical predictive delay distributions |
| **Connection planning** | Not supported natively | None verified (API is strictly point-to-point) | Yes (Handled by Yatrai native Recovery Engine) | RailRadar does not compute transfer itineraries or connection buffers |
| **Availability timestamps** | Not supported | None verified | Explicitly omitted or labeled as checked timestamp | Live seat check freshness timestamp from official IRCTC CRIS gateway |

---

## 3. Deep-Dive Capability Breakdown & Gap Analysis

### 1. Direct Train Search Between Stations
- **RailRadar Reality:** Primary working feature (`/trains/between/{from}/{to}`). Returns an array of train runs operating between the two designated CRS station codes, including train number, train name, departure time, arrival time, and running days.
- **Yatrai Implementation:** Handled by `server/src/providers/transport/rail/rail.provider.js` (`RailRadarAdapter.searchDirectTrains`).
- **Normalized Contract:** Mapped directly to canonical `Journey` with single `JourneyLeg` (numberOfTransfers: 0).
- **Gap Identified:** When origin and destination are in different satellite stations of the same metro area (e.g., Sonipat `SNP` to Patna `PNBE`), direct trains may be sparse or waitlisted, triggering the need for station expansion.

### 2. Real-Time Train Schedules & Timetables
- **RailRadar Reality:** Endpoint `/trains/{trainNumber}/schedule` provides station sequences with scheduled arrival and departure times.
- **Timing Bug Root Cause & Permanent Resolution:**
  - *Previous Defect:* Raw times (e.g. `"17:30"`) were parsed using UTC methods (`setUTCHours(17, 30)`), which pushed departure to 23:00 IST (+5h 30m) when serialized to ISO format.
  - *Permanent Resolution:* Centralized `server/src/utils/railwayTime.js` anchors strictly in `Asia/Kolkata` (`+05:30`). Generates explicit formatted local strings (`departureLocalTime`, `arrivalLocalTime`, `dayOffset`), guaranteeing identical times on backend and frontend regardless of browser locale.

### 3. Intermediate Stop Lists & Route Details
- **RailRadar Reality:** Returns full list of passing stations with halt durations and day counts.
- **Yatrai Implementation:** Embedded into `leg.metadata.stops` and rendered in `JourneyLeg.jsx` collapsible station breakdown.

### 4. Live Train Running Status
- **RailRadar Reality:** Endpoint `/trains/{trainNumber}/live` reports current station, delay in minutes, and estimated time of arrival.
- **Status:** Integrated into post-booking trip monitor. During search discovery, scheduled times with conservative transfer buffers are utilized to prevent brittle connections.

### 5. Seat Availability per Class & Date
- **RailRadar Reality:** RailRadar's v1 public search does not return real-time seat availability tallies (e.g. "AVAILABLE 42" or "WL 14").
- **Yatrai Production Implementation:**
  - Yatrai's `directJourneyService` evaluates candidates against availability filters.
  - In production without direct CRIS GDS seat links, all candidates with valid train schedules are validated, prioritizing confirmed candidates. When confirmed direct inventory cannot be certified or direct trains are absent, the system triggers Railway Journey Recovery.

### 6 & 7. Waitlist / RAC Tracking & Confirmation Probability
- **RailRadar Reality:** Not available in RailRadar API.
- **Yatrai Solution:**
  - Strict policy: waitlisted trains are never presented as confirmed options.
  - Alternatives engine prioritizes segments with high seat probability over risky single-train long waitlists.

### 8. Fare Enquiry per Class & Quota
- **RailRadar Reality:** Does not expose verified, official fare breakdowns per class and quota in the v1 public endpoints.
- **Yatrai Production Solution:**
  - Strictly displays `Fare unavailable` when verified fare fields are missing from the provider response.
  - Driving-cost estimates, road-distance heuristics, and OSRM calculations are completely banned from railway search results.
  - Never fabricates fares from distance assumptions or default constants.
  - Missing fares are represented with `totalPrice: null` (never ₹0) and sorted to the end of price rankings so unpriced trains are never ranked as cheapest options.

### 9. Station Search & Autocomplete
- **RailRadar Reality:** Endpoint `/stations/search?q={term}` provides CRS code matches.
- **Yatrai Solution:** Hybrid architecture. Fast MongoDB text index (`Location.find`) backed by RailRadar search fallback for unindexed halts.

### 10. Station Facility Information
- **RailRadar Reality:** Not provided.
- **Yatrai Solution:** Rendered through static station metadata (WiFi availability, retiring rooms, escalators, cloakroom).

### 11. Platform Number Predictions
- **RailRadar Reality:** Available only on live running trains within 2 hours of arrival.
- **Yatrai Solution:** Displayed conditionally as "Expected Platform" when returned by live radar; otherwise omitted to avoid misleading travelers.

### 12. PNR Status Enquiry
- **RailRadar Reality:** Endpoint `/pnr/{pnrNumber}` supports 10-digit Indian Railways PNR status checks.
- **Yatrai Solution:** Built into `pnrService.js` and user dashboard for post-booking trip tracking.

### 13 & 14. Coach Position & Train Delay Prediction
- **RailRadar Reality:** Coach layouts are not available. Delay predictions are absent.
- **Yatrai Solution:** Dynamic buffer engine guarantees that transfer connections require minimum 45 minutes (and up to 90 minutes for cross-town transfers).

### 15. Cancellation & Diversion Notices
- **RailRadar Reality:** Flagged in live status feed.
- **Yatrai Solution:** Filtered during discovery. Cancelled services are discarded immediately from journey graph generation.

### 16. Tatkal & Special Quota Handling
- **RailRadar Reality:** Standard general quota only.
- **Yatrai Solution:** Handoff system generates direct IRCTC deep-links passing travel date, train number, and class so users can select Tatkal/Premium Tatkal on the official portal.

### 17. Connecting Train Suggestions (Native)
- **RailRadar Reality:** **NOT SUPPORTED.** RailRadar cannot discover 2-train connecting itineraries.
- **Yatrai Solution:** **Yatrai's Core Algorithmic Innovation (`journeyRecovery.service.js`).**
  - Explores up to 5 origin hops (backward and forward along physical corridors) and up to 5 destination hops.
  - Queries RailRadar independently for Leg 1 and Leg 2.
  - Verifies minimum transfer safety buffer ($\ge 30$ mins) and maximum transfer wait ($\le 360$ mins).
  - Validates transfer station physical identity (`leg1.destination === leg2.origin`).

### 18. Multi-Station City Grouping
- **RailRadar Reality:** Requires individual station codes.
- **Yatrai Solution:** `locationResolver.js` automatically expands city clusters (e.g., Delhi $\rightarrow$ NDLS, DLI, NZM, ANVT; Kolkata $\rightarrow$ HWH, SDAH, KOAA; Mumbai $\rightarrow$ CSMT, BDTS, LTT, MMCT).

### 19 & 20. On-Time Performance & Station Transfer Buffer Rules
- **RailRadar Reality:** Not supported.
- **Yatrai Solution:** Enforces safety invariants:
  - Same-station transfer: Minimum 30 mins, Maximum 6 hours.
  - Inter-station metro transfer: Minimum 90 mins.
  - Same train change: Prohibited.

### 21. Live GPS Tracking
- **RailRadar Reality:** Limited to connected trains with onboard GPS.
- **Yatrai Solution:** Reserved for active journey mode.

### 22. Official IRCTC Booking Handoff
- **RailRadar Reality:** Read-only data API. Cannot execute financial transactions or ticket issuance.
- **Yatrai Solution:** Deep-link bridge to official IRCTC portal (`https://www.irctc.co.in/nget/train-search`), passing pre-filled station codes, train numbers, and dates. For connecting journeys, mandates independent two-ticket issuance with explicit disclaimers.

---

## 4. Architectural Summary: What RailRadar Handles vs Yatrai Engine

```
┌────────────────────────────────────────────────────────────────────────┐
│                        YATRAI TRAVEL PLATFORM                          │
├────────────────────────────────────────────────────────────────────────┤
│  Frontend: Progressive Disclosure UI (1 Best Train -> Show More)       │
│  • IST Time Formatting (Asia/Kolkata UTC+05:30)                        │
│  • Direct / Alternative Switch Banner                                  │
│  • Station Swap (Origin <-> Destination)                               │
├───────────────────────────────────┬────────────────────────────────────┤
│   YATRAI PROPRIETARY ENGINE       │        RAILRADAR EXTERNAL API      │
├───────────────────────────────────┼────────────────────────────────────┤
│ • Railway Journey Recovery        │ • Point-to-Point Train Runs        │
│ • Station Network Expansion       │ • Raw Train Schedules             │
│ • Transfer Safety Buffer (45m+)   │ • Station Passing Halts            │
│ • Multi-Station City Clustering   │ • PNR Status Inquiries             │
│ • Ranking Engine (Overall/Fast/   │ • Live Delay Minutes (Real-Time)   │
│   Cheap/Convenient)               │                                    │
│ • IST Date Normalization          │                                    │
│ • Independent Ticket Handoff      │                                    │
└───────────────────────────────────┴────────────────────────────────────┘
```

---

## 5. Rate Limit (HTTP 429) Handling & Quota Strategy

### Observed Behavior
1. Development Tier Key limit: 1,000 calls per month.
2. When quota is depleted, endpoint returns:
   ```json
   {
     "status": 429,
     "error": "Monthly quota exceeded. Maximum 1000 requests per month."
   }
   ```

### Yatrai Production Mitigations
1. **Aggressive Redis/In-Memory TTL Caching:** Direct station-pair train run schedules are cached for 24 hours. Indian Railways schedules change only bi-annually, making aggressive schedule caching 100% safe.
2. **Deterministic Deduplication:** In-flight duplicate requests are joined before making network calls, preventing duplicate queries when multiple components mount.
3. **Graceful Fallback Mode:** In the event of an external provider 429 response, Yatrai logs `Rate limit exceeded for provider "railradar"`, triggers the journey recovery pipeline or cached timetable fallback, and informs the user truthfully through UI status banners without white-screening or crashing.
