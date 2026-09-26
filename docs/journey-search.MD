# Yatrai — Journey Search Engine Specification (Phase 4)

**Product:** Yatrai  
**Version:** V1.0  
**Phase:** Phase 4 — Journey Search Engine  
**Status:** Completed & Verified  
**Document Type:** Search Engine Architecture Specification  
**Tagline:** One Goal. Every Route.

---

## 1. Executive Summary & Objective

Phase 4 establishes the **core internal journey-search pipeline** for Yatrai. As the foundation for all discovery and route-recovery capabilities, its responsibility is orchestrating user search requests, resolving physical locations via Phase 3 Location Resolution, querying provider-agnostic candidate sources, enforcing strict leg continuity and domain constraints, persisting search requests and results, and returning normalized journey representations.

### Core Guarantees & Phase Boundaries
- **Strict Phase Boundary:** Real transport provider APIs (IRCTC, RedBus, Amadeus, Flight APIs), ranking/scoring engines (Phase 7), and dynamic multi-modal journey synthesis (Phase 8) are strictly out of scope and intentionally excluded.
- **Provider-Independent Architecture:** The core search engine contains zero transport-specific branches (e.g. `if (provider === "rail")` or `if (provider === "bus")`). All external transport adapters plug into candidate source interfaces established for Phase 5.
- **Strict Domain & Continuity Validation:** Invalid candidates, non-chronological sequences, broken transfer links, or negative fares are rejected before persistence.
- **Referential Integrity & Safe Persistence:** Every valid discovered journey creates canonical `Journey`, sequential `JourneyLeg`, and linked `SearchResult` records.
- **Zero Hallucination / Mock Isolation:** Development test candidates are strictly isolated inside `DevelopmentJourneyProvider`, explicitly marked `{ source: "development", isMock: true }`, and never claim live seat availability or live fares.

---

## 2. Architecture & Pipeline

```text
Frontend / API Client
        │
        ▼
POST /api/journeys/search
        │
        ▼
Optional Authentication (`optionalAuthenticate`)
        │
        ▼
Request Payload Validation (`validateJourneySearch`)
        │
        ▼
Journey Search Controller (`journey.controller.js`)
        │
        ▼
Journey Search Service (`journeySearchService.js`)
        │
        ├─► Phase 3 Location Resolution (`locationService.js`)
        │   ├── Resolve Origin      ──► Canonical Origin Location
        │   └── Resolve Destination ──► Canonical Destination Location
        │
        ├─► Validate Origin != Destination
        │
        ├─► Create SearchRequest (`SearchRequest.js`) ──► Status: 'pending'
        │
        ├─► Advance Status ──► 'processing'
        │
        ▼
Journey Search Engine (`journeySearchEngine.js`)
        │
        ├─► Query Active Candidate Sources (`journey.provider.js`)
        │   └── Development Candidate Source (`development.provider.js`)
        │
        ├─► Candidate Normalizer (`journeyNormalizer.js`)
        │   └── Maps raw structures to canonical schema
        │
        ├─► Candidate Validator (`journeyValidator.js`)
        │   ├── Origin & Destination Presence
        │   ├── Timestamps (`departureTime <= arrivalTime`)
        │   ├── Non-negative Fares, Durations, Distances
        │   ├── Monotonic Sequence Ordering (1, 2, ..., N)
        │   └── Spatial & Temporal Leg Continuity
        │       ├── Leg 1 origin == Journey origin
        │       ├── Leg[i].destination == Leg[i+1].origin
        │       ├── Leg[i+1].departureTime >= Leg[i].arrivalTime
        │       └── Last Leg destination == Journey destination
        │
        ├─► Persist Discovered Records
        │   ├── Save `Journey` (`journeyService.js`)
        │   ├── Save Sequential `JourneyLeg`s (`journeyLegService.js`)
        │   └── Save `SearchResult` link (`searchResultService.js`)
        │
        ├─► Advance Status ──► 'completed' (or 'failed' on unhandled error)
        │
        ▼
Format Canonical API Response
```

---

## 3. SearchRequest Lifecycle

`SearchRequest` tracks the lifecycle of every search session:

```text
Request Received
       │
       ▼
    pending       (SearchRequest created in MongoDB with user/guest claims)
       │
       ▼
   processing     (Internal search pipeline actively executing)
       │
       ├─────────────────────────────────┐
       ▼                                 ▼
   completed                          failed
(Candidate processing finished;     (Pipeline threw unhandled error;
 0 or more journeys persisted)       safe error response returned)
```

Statuses adhere to `SEARCH_STATUSES = ['pending', 'processing', 'completed', 'failed']`.

---

## 4. API Specification

### Endpoint: Search Journeys
`POST /api/journeys/search`

#### Headers
| Header | Value | Requirement |
|---|---|---|
| `Content-Type` | `application/json` | Required |
| `Authorization` | `Bearer <token>` | Optional (binds authenticated user to `SearchRequest.user`) |

#### Request Body
```json
{
  "origin": "Sonipat",
  "destination": "Patna",
  "departureDate": "2026-10-01",
  "passengers": 1,
  "requestedModes": ["rail"],
  "preferences": {
    "priority": "balanced"
  }
}
```

#### Field Specifications
| Field | Type | Description |
|---|---|---|
| `origin` | String \| Object | Place name, query string, or canonical Location reference. Required. |
| `destination` | String \| Object | Place name, query string, or canonical Location reference. Required. |
| `departureDate` | String | Travel date in strict `YYYY-MM-DD` ISO format. Required. |
| `passengers` | Number | Integer >= 1. Defaults to `1`. Optional. |
| `requestedModes`| Array<String> | Supported transport modes (`rail`, `bus`, `flight`, `road`, `walk`, `taxi`, `metro`). Optional. |
| `preferences` | Object | Priority (`fastest`, `cheapest`, `fewestTransfers`, `mostConvenient`, `balanced`), `maxBudget`, `maxTransfers`. Optional. |

#### Response: Candidates Found (HTTP 200 OK)
```json
{
  "success": true,
  "message": "Journeys retrieved successfully",
  "data": {
    "searchRequestId": "66f45a1b8c2d9e0012345678",
    "status": "completed",
    "count": 1,
    "journeys": [
      {
        "id": "66f45a1b8c2d9e0012345679",
        "origin": {
          "id": "66f45a1b8c2d9e0012345671",
          "name": "Sonipat Junction Railway Station",
          "city": "Sonipat",
          "state": "Haryana",
          "type": "railway_station",
          "coordinates": [77.0151, 28.9931]
        },
        "destination": {
          "id": "66f45a1b8c2d9e0012345672",
          "name": "Patna Junction Railway Station",
          "city": "Patna",
          "state": "Bihar",
          "type": "railway_station",
          "coordinates": [85.1376, 25.6022]
        },
        "departureTime": "2026-10-01T06:30:00.000Z",
        "arrivalTime": "2026-10-01T20:15:00.000Z",
        "duration": 825,
        "totalDistance": 1045,
        "totalPrice": 1250,
        "currency": "INR",
        "numberOfTransfers": 0,
        "transportModes": ["rail"],
        "status": "scheduled",
        "legs": [
          {
            "id": "66f45a1b8c2d9e0012345680",
            "sequence": 1,
            "origin": { ... },
            "destination": { ... },
            "mode": "rail",
            "departureTime": "2026-10-01T06:30:00.000Z",
            "arrivalTime": "2026-10-01T20:15:00.000Z",
            "duration": 825,
            "distance": 1045,
            "price": 1250,
            "currency": "INR",
            "vehicle": { "type": "Train", "identifier": "EXP-14218" },
            "service": { "name": "Ganga Express (Development Test)", "class": "3A" },
            "booking": { "status": "available", "reference": "MOCK-SNP-PAT-01" }
          }
        ],
        "metadata": {
          "source": "development",
          "isMock": true
        }
      }
    ]
  },
  "journeys": [ ... ]
}
```

#### Response: Empty Results (HTTP 200 OK)
When no candidates are found, HTTP 200 is returned with empty journeys list:
```json
{
  "success": true,
  "message": "Journeys retrieved successfully",
  "data": {
    "searchRequestId": "66f45a1b8c2d9e0012345681",
    "status": "completed",
    "count": 0,
    "journeys": []
  },
  "journeys": []
}
```

---

## 5. Development Candidate Source & Isolation

The internal development candidate source (`server/src/providers/journey/development.provider.js`) is an isolated candidate generator used solely to prove the engine pipeline:
- No external network calls are made.
- Results are deterministically derived from travel request parameters.
- Candidates are marked with `{ source: 'development', isMock: true }`.
- When Phase 5 integrates real transport providers (IRCTC, RedBus, Amadeus), they attach via `journeyProviderRegistry.register('rail', railAdapter)` without modifying the core search engine.

---

## 6. Verification & Automated Testing

| Suite | Tests | Description |
|---|---|---|
| **Input Validation** | 6 | Rejects missing/empty origin, destination, departureDate, invalid calendar dates (e.g. Feb 31), same origin/dest, invalid passengers |
| **Location Resolution** | 2 | Resolves place queries, ObjectIds, and rejects unresolvable locations |
| **Candidate Normalization & Validation** | 6 | Validates correct candidates; rejects inverted timings, broken spatial continuity, broken transfer timing |
| **Mock Provider & Registry** | 3 | Independent search execution, isolated corridor matching, custom corridors |
| **Search Pipeline & Persistence** | 3 | Full pipeline execution, status progression, referential integrity across 4 collections, empty results handling, failure handling |
| **End-to-End API** | 4 | `POST /api/journeys/search` unauthenticated, authenticated with Bearer JWT, empty results, `/api` discovery document |
| **Total Phase 4 Tests** | **23** | **100% Pass Rate** |
| **Total Test Suite (Phase 4)** | **82** | **Zero Regressions across Phases 1–4** |

---

## 7. Phase 5 — Transport Providers Integration

Phase 5 introduces the external transport provider layer behind a strictly decoupled, provider-agnostic interface:

```text
External Provider API
        ↓
Provider Adapter (Road / Rail / Bus / Flight)
        ↓
Provider-Specific Raw Response (Validated)
        ↓
Provider Boundary (Credentials Redacted)
        ↓
Common Provider Result Envelope
        ↓
Phase 6 — Journey Normalization
        ↓
Canonical Yatrai Journey & JourneyLeg
```

### 7.1 Common Provider Interface
Every transport provider adapter extends `BaseTransportProvider` (`server/src/providers/transport/interface.js`) and implements:
```javascript
async search(request, options = {})
```
Where `request` is a provider-independent contract containing:
- `origin`: Canonical Location document or `{ id, name, city, latitude, longitude }`
- `destination`: Canonical Location document or `{ id, name, city, latitude, longitude }`
- `departureDate`: Travel date
- `passengers`: Passenger count (default 1)
- `requestedModes`: Array of modes (`['road', 'rail', 'bus', 'flight']`)
- `preferences`: Optional user preferences

### 7.2 Transport Provider Registry
`TransportProviderRegistry` (`server/src/providers/transport/registry.js`) manages active adapters:
- `register(mode, provider)`
- `getProvider(mode)`
- `getProviders({ requestedModes })`: Dynamic filtering by requested mode
- `searchAll(request, options)`: Queries matched providers in parallel with full fault-isolation via `Promise.allSettled`

### 7.3 Implemented Transport Adapters
| Mode | Adapter Class | External Service / Format | Responsibilities |
|---|---|---|---|
| **Road** | `RoadTransportProvider` | OSRM Driving Routing Gateway | Coordinate extraction, waypoint routing, driving duration & distance parsing, vehicle leg construction |
| **Rail** | `RailTransportProvider` | Indian Railways / IRCTC Format | Station code translation, train schedule & class parsing, fare computation, schedule timestamp validation |
| **Bus** | `BusTransportProvider` | Intercity Bus Search Format | City query translation, bus operator & seat parsing, schedule/fare validation |
| **Flight** | `FlightTransportProvider` | Aviation GDS / Airline Format | Airport translation, flight number, airline, cabin class, stops parsing, fare extraction |

### 7.4 Provider Result Envelope
All provider results are returned inside a common envelope (`server/src/providers/transport/envelope.js`):
```json
{
  "provider": "rail",
  "providerCode": "IRCTC",
  "status": "success",
  "requestedAt": "2026-09-26T10:15:00.000Z",
  "source": "rail",
  "candidates": [ ... ],
  "rawData": { ... },
  "metadata": { "durationMs": 142 },
  "error": null
}
```
Possible statuses: `'success'`, `'empty'`, `'failed'`, `'unavailable'`.

### 7.5 Error Normalization & Fault Isolation
- Provider errors are normalized into `ProviderError` with standard codes:
  - `PROVIDER_TIMEOUT`: Network timeout exceeded
  - `PROVIDER_RATE_LIMITED`: HTTP 429 rate limit received (non-retryable)
  - `PROVIDER_MALFORMED_RESPONSE`: Missing identifiers or corrupted schema
  - `PROVIDER_AUTH_ERROR`: Authentication or API key rejected
  - `PROVIDER_UNAVAILABLE`: Disabled or missing configuration
- **Fault-Isolation:** Individual provider failures never crash the search pipeline. Results from other successful providers are retained and returned to the caller.

### 7.6 Security & Credential Redaction Invariants
- Deep recursive redaction via `sanitizeCredentials()` strips all keys matching `/api[-_]?key|secret|token|auth|password|bearer|cookie/i` to `'[REDACTED]'`.
- Provider credentials are NEVER exposed to the frontend, NEVER logged in application logs, and NEVER saved unredacted into `SearchResult.rawData`.

### 7.7 Phase 6 Boundary
Provider adapters package candidates into structured legs, but do NOT execute final journey deduplication, scoring, or multi-modal synthesis. That responsibility remains strictly reserved for **Phase 6 — Journey Normalization** and **Phase 7 — Journey Ranking**.

---

## 8. Phase 6 — Journey Normalization Architecture

Phase 6 implements the **Journey Normalization Engine**, transforming disparate provider-specific payload schemas into a unified, canonical Yatrai domain representation (`Journey` and sequential `JourneyLeg`s).

```text
Provider-Specific API Response
              ↓
  Provider Result Envelope
              ↓
     JOURNEY NORMALIZER
              ↓
   Normalization Strategy
   ├── Rail Normalizer Strategy
   ├── Flight Normalizer Strategy
   ├── Bus Normalizer Strategy
   └── Road Normalizer Strategy
              ↓
   Canonical Journey Candidate
   + Sequential Canonical JourneyLegs
              ↓
 Strict Domain & Continuity Validator
              ↓
 Referential Persistence Layer
 (Journey + JourneyLeg + SearchResult)
              ↓
     Phase 7 Ranking Engine
```

### 8.1 Provider-to-Canonical Field Mapping
Each transport provider uses different naming conventions and payload shapes. The normalization strategy layer isolates these variations:

| Concern | Rail Provider (IRCTC) | Flight Provider (GDS) | Bus Provider (RedBus) | Road Provider (OSRM) | Canonical Domain Model |
|---|---|---|---|---|---|
| **Departure** | `departure_time` / `departureTime` | `departure` / `departureTime` | `departureTime` / `departure_time` | `departureTime` (from route) | `departureTime` (UTC ISO Date) |
| **Arrival** | `arrival_time` / `arrivalTime` | `arrival` / `arrivalTime` | `arrivalTime` / `arrival_time` | `arrivalTime` (from route) | `arrivalTime` (UTC ISO Date) |
| **Identifier** | `train_number` / `trainNumber` | `flight_number` / `number` | `busNumber` / `operator` | `'Road Transit'` | `service.number` & `vehicle.identifier` |
| **Service Name**| `train_name` (e.g. Rajdhani) | `airline` + flight number | `operator` (e.g. Zingbus) | `'Highway Driving Route'` | `service.name` |
| **Operator** | `operator` (Indian Railways) | `airline` (Air India, IndiGo) | `operator` (RedBus, HRTC) | `'Road Transit Service'` | `service.operator` |
| **Class** | `class` (`3A`, `2A`, `SL`) | `cabinClass` (`Economy`) | `busType` (`AC Sleeper`) | `'Standard'` | `service.class` |
| **Fare** | `price` / `fare` / `totalFare` | `price` / `fare` | `price` / `fare` | estimated / raw price | `price` / `totalPrice` (clean non-negative Number) |
| **Currency** | `currency` (`INR`, `₹`) | `currency` | `currency` | `currency` | `currency` (`'INR'` uppercase 3-letter) |
| **Mode** | `train`, `railway`, `rail` | `air`, `airline`, `flight` | `bus`, `coach` | `driving`, `car`, `road` | `mode` (`'rail'`, `'flight'`, `'bus'`, `'road'`) |

### 8.2 Critical Domain Distinction: Journey vs. JourneyLeg
Yatrai maintains a strict architectural separation between a trip and its segments:
- **`Journey`**: Represents the complete trip from starting origin to final destination (e.g., Sonipat → Patna). Contains aggregated metrics (`totalPrice`, `duration`, `totalDistance`, `numberOfTransfers`, `transportModes`, `status`).
- **`JourneyLeg`**: Represents one atomic physical transport segment (e.g., Leg 1: Sonipat → Delhi via Road, Leg 2: Delhi → Patna via Rail).
- **Authoritative Relationship**: `JourneyLeg.journey` foreign reference is the single source of truth. Leg details are not duplicated into the parent `Journey` document.

### 8.3 Time & Timezone Normalization
- All timestamps are converted to UTC `Date` objects.
- Time strings without declared offsets (e.g., `"2026-10-01 06:00"`) or time-of-day strings (`"06:00"`) are interpreted within the context of Indian Standard Time (`+05:30` IST), preserving schedule accuracy without relying on the host server's local timezone.
- Explicit ISO offsets (`+05:30`, `Z`) are strictly respected.

### 8.4 Price & Currency Normalization
- Formatted price strings (`"₹ 1,250.00"`, `"INR 850"`, `"850"`) are parsed into clean floating-point numbers.
- Negative prices are rejected.
- Road travel does not invent arbitrary pricing if external routing engines do not provide cost data.
- Currencies are standardized to uppercase ISO codes (defaulting to `'INR'`).

### 8.5 Stops vs. Transfers
- Intermediate station stops (e.g., a train stopping at 8 intermediate stations) are preserved in metadata and do NOT count as transfers.
- `numberOfTransfers` strictly represents transport interchanges: `Math.max(0, legs.length - 1)`.

### 8.6 Spatial & Temporal Continuity Rules
Every normalized multi-leg journey candidate must pass strict validation before persistence:
1. **First Leg Origin**: `legs[0].origin == journey.origin`
2. **Last Leg Destination**: `legs[last].destination == journey.destination`
3. **Sequential Connection**: For all `i`, `legs[i].destination == legs[i + 1].origin`
4. **Temporal Ordering**: `legs[i].departureTime <= legs[i].arrivalTime`
5. **Transfer Feasibility**: `legs[i + 1].departureTime >= legs[i].arrivalTime` (no negative layovers)

### 8.7 Fault Tolerance & Malformed Candidates
- Provider envelopes with multiple candidates are processed independently.
- If candidate A is valid, candidate B is corrupted (e.g., arrival before departure), and candidate C is valid:
  - Candidate B is rejected and logged safely.
  - Candidates A and C survive and are successfully persisted.
- One corrupted record never crashes the search pipeline.

### 8.8 Downstream Ranking Boundary (Phase 7)
Post-Phase 6, downstream systems (such as the Phase 7 Ranking Engine) interact exclusively with canonical `Journey` and `JourneyLeg` models. They never parse or branch on provider-specific fields (`train_number`, `flight_number`, or provider API schemas).

---

## 9. Journey Ranking Engine Architecture (Phase 7)

Phase 7 introduces the **Pluggable Ranking Engine**, taking canonical, normalized journeys produced by Phase 6 and sorting them into separate recommendation categories using isolated, replaceable strategy modules.

### 9.1 Ranking Pipeline

```text
POST /api/journeys/search
         │
         ▼
Location Resolution (Phase 3)
         │
         ▼
Transport Provider Search (Phase 5)
         │
         ▼
Journey Normalization & Validation (Phase 6)
         │
         ▼
Canonical Journeys
         │
         ▼
Ranking Engine (`rankingEngine.js`)
         │
   Strategy Lookup via Registry (`rankingRegistry.js`)
         │
   ┌─────┼─────────────┬──────────────────┬─────────────────┐
   ▼     ▼             ▼                  ▼                 ▼
Overall Fastest       Cheapest           Fewest            Most
Strategy Strategy     Strategy           Transfers         Convenient
(0.35/   (Duration)   (Cost + Currency)  Strategy          Strategy
 0.30/                                   (Transfers count) (Schedule +
 0.20/                                                     Transfers)
 0.15)
   └─────┼─────────────┴──────────────────┴─────────────────┘
         ▼
Ranked Canonical Journeys (with ephemeral ranking metadata)
         │
         ▼
API Response Envelope (`meta.ranking` & `journey.ranking`)
```

### 9.2 Strategy Interface & Invariants

All ranking strategies inherit from `BaseRankingStrategy` and implement the standard conceptual contract:

```javascript
strategy.rank(journeys, context)
```

**Key Architectural Invariants:**
1. **Canonical Input Only:** Consumes only canonical `Journey` and `JourneyLeg` properties (`duration`, `totalPrice`, `currency`, `numberOfTransfers`, `departureTime`, `transportModes`). Zero provider-specific fields are inspected.
2. **Immutability:** Input journeys are never mutated. Ranking metadata is decorated on a shallow-cloned working set.
3. **No Persistent Contamination:** Ranks and scores are derived and contextual; they are never saved into MongoDB models.
4. **Deterministic Tie-Breaking:** Every strategy applies a secondary and tertiary hierarchy before falling back to `_originalIndex` to ensure rock-solid stability.
5. **Score Normalization:** Continuous metrics are scaled to `[0.0, 1.0]` using safe deterministic formulas protecting against division by zero and equal values.

### 9.3 Supported Recommendation Strategies

| Strategy ID | Display Label | Primary Metric | Secondary Tie-Breakers | Description |
|:---|:---|:---|:---|:---|
| `overall` | Best Overall | Multi-attribute composite score | Transfers → Duration → Price → Index | Balanced compromise across travel time, fare, interchanges, and convenience. |
| `fastest` | Fastest | `duration` (minutes, ascending) | Transfers → Price → Index | Minimizes total travel duration (departure to final arrival). |
| `cheapest` | Cheapest | `totalPrice` (ascending) | Duration → Transfers → Index | Minimizes monetary fare; partitions multi-currency results to protect cross-currency sanity. |
| `fewest_transfers` | Fewest Transfers | `numberOfTransfers` (ascending) | Duration → Price → Index | Minimizes boarding changes and connection friction. |
| `most_convenient` | Most Convenient | Multi-factor convenience score | Duration → Transfers → Index | Balances departure schedule window, transfers, duration, and mode simplicity. |

### 9.4 Scoring Formulas & Configurations

All weights and thresholds are centralized in `server/src/ranking/rankingConfig.js`:

#### 1. Best Overall Composite Scoring
$$\text{Overall Score} = (w_d \times S_{\text{duration}}) + (w_p \times S_{\text{price}}) + (w_t \times S_{\text{transfers}}) + (w_c \times S_{\text{convenience}})$$
* **Duration Weight ($w_d$):** `0.35`
* **Price Weight ($w_p$):** `0.30`
* **Transfers Weight ($w_t$):** `0.20`
* **Convenience Weight ($w_c$):** `0.15`
*(Weights sum strictly to `1.0`)*

#### 2. Most Convenient Scoring
$$\text{Convenience Score} = (w_t \times S_{\text{transfers}}) + (w_d \times S_{\text{duration}}) + (w_s \times S_{\text{schedule}}) + (w_m \times S_{\text{mode}})$$
* **Transfers Weight ($w_t$):** `0.40`
* **Duration Weight ($w_d$):** `0.30`
* **Schedule Window Weight ($w_s$):** `0.20` (Morning/Daytime: `1.0`, Evening: `0.85`, Early Morning: `0.70`, Red-eye/Midnight: `0.40`)
* **Mode Simplicity Weight ($w_m$):** `0.10` (Single mode: `1.0`, Multiple transitions: scaled down)

#### 3. Score Normalization (Lower is Better)
For metrics where lower values represent better outcomes (duration, price, transfers):
$$S(v) = \begin{cases} 1.0 & \text{if } \min = \max \\ 1.0 - \frac{v - \min}{\max - \min} & \text{otherwise} \end{cases}$$
Clamped strictly to $[0.0, 1.0]$. Zero division, null values, and single candidate sets are handled safely without generating `NaN` or `Infinity`.

### 9.5 Currency Safety Rule
- The ranking engine never compares raw numeric values across different currencies (e.g. `$20` vs `₹850`).
- If multiple currencies exist in a candidate set without a conversion layer, the engine establishes a base currency from the predominant group and safely partitions non-conforming currencies to the end of the ranking with a logged warning.

### 9.6 Missing Value Policy
- Missing price (`null`/`undefined`) is strictly distinguished from free transit (`price === 0`). Journeys with unknown prices are placed after known prices in the Cheapest strategy, never promoted to rank 1.
- Missing duration or transfers receive zero normalized contribution in composite strategies rather than crashing the algorithm.

### 9.7 API Request & Response Contracts

#### Request Payload
The search endpoint accepts optional `ranking` or `sortBy` parameters:
```json
POST /api/journeys/search
{
  "origin": "Sonipat",
  "destination": "Patna",
  "departureDate": "2026-10-01",
  "ranking": "fastest"
}
```
*Aliases supported:* `sortBy` (maps to `ranking`), `balanced` (maps to `overall`), `fewestTransfers` (maps to `fewest_transfers`), `mostConvenient` (maps to `most_convenient`).
*Validation:* Any unrecognized strategy (e.g. `"random"`, `"best_train"`) is rejected immediately with HTTP `400 VALIDATION_ERROR`.

#### Response Payload
```json
{
  "success": true,
  "message": "Journeys retrieved successfully",
  "data": {
    "searchRequestId": "6ab7a52731a1c20001473af4",
    "origin": { "id": "...", "name": "Sonipat Junction Railway Station" },
    "destination": { "id": "...", "name": "Patna Junction Railway Station" },
    "totalResults": 3,
    "ranking": {
      "strategy": "fastest",
      "label": "Fastest"
    },
    "journeys": [
      {
        "id": "...",
        "totalPrice": 850,
        "duration": 600,
        "numberOfTransfers": 0,
        "ranking": {
          "rank": 1,
          "score": 1.0,
          "strategy": "fastest",
          "label": "Fastest"
        },
        "legs": [...]
      }
    ]
  }
}
```

### 9.8 Downstream Multi-Modal Boundary (Phase 8)
Phase 7 only ranks journeys that have already been discovered and normalized. Synthesizing new multi-modal journeys across independent provider legs (e.g. stitching a Rail leg to an unconnected Bus leg) belongs exclusively to **Phase 8 — Multi-Modal Journey Orchestration**.

