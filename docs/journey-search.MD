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
| **Total Test Suite** | **82** | **Zero Regressions across Phases 1–4** |
