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

