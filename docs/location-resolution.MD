# Yatrai — Location Resolution Specification (Phase 3)

**Product:** Yatrai  
**Version:** V1.0  
**Phase:** Phase 3 — Location Resolution  
**Status:** Completed & Verified  
**Document Type:** Location Architecture Specification  
**Tagline:** One Goal. Every Route.

---

## 1. Executive Summary & Objective

Phase 3 implements the **Location Resolution** subsystem for Yatrai. As the entry point for journey planning, its sole responsibility is converting human-entered location text or simple travel intent strings into canonical, structured location records with verified geographic coordinates and administrative metadata.

### Core Guarantees
- **Strict Phase Boundary:** No journey planning, routing, transport provider calls, or maps rendering are implemented in this phase.
- **Provider Agnostic:** Provider-specific payloads are isolated behind an adapter boundary (`nominatim.adapter.js`); the core resolver and API consumers work exclusively with Yatrai canonical representations.
- **Validated Geometries:** Coordinates are validated (`-90 <= lat <= 90`, `-180 <= lng <= 180`) and formatted strictly in GeoJSON `[longitude, latitude]` order.
- **Deterministic Natural-Language Extraction:** Simple origin/destination intent phrases (e.g., `"I need to go from Sonipat to Patna"`) are parsed without hallucinating coordinates or guessing unmentioned locations.
- **Zero Hardcoded Coordinates:** All coordinates and metadata originate from live geocoding providers or validated seed records, never from static coordinate dictionaries.

---

## 2. Architecture & Pipeline

```text
User Input / Natural-Language Query
                │
                ▼
   Location Controller (`location.controller.js`)
                │
                ▼
   Location Service (`locationService.js`)
                │
         ┌──────┴──────────────────────────────────────┐
         ▼                                             ▼
[Natural Language Pattern?]                    [Database Cache Check]
         │                                             │
         ├─ Yes ──► Extract Origin/Dest                ├─ Hit ──► Return Canonical DB Records
         │          (Resolve each recursively)         │
         │                                             ▼
         └─ No ──► Proceed to Provider ────────► [Provider Adapter]
                                                       │
                                                       ▼
                                            External Geocoding API
                                            (OpenStreetMap / Nominatim)
                                                       │
                                                       ▼
                                            Adapter Response Validation
                                            & Canonical Normalization
                                                       │
                                                       ▼
                                            MongoDB Upsert / Deduplication
                                            (`Location.js`)
                                                       │
                                                       ▼
                                            Canonical Structured Response
```

---

## 3. Location Provider & Adapter Boundary

### 3.1 Provider Selection: OpenStreetMap / Nominatim
- **Rationale:** OpenStreetMap's Nominatim service provides worldwide address, POI, university, railway station, and city coverage with structured administrative hierarchies (`address.city`, `state`, `country_code`).
- **Policy Compliance:** Standard HTTP User-Agent identification (`User-Agent: Yatrai/1.0 (travel-planner)`) and configurable request timeouts (`5000ms`).
- **Extensibility:** The adapter interface allows switching to Mapbox, Google Places, or HERE Geocoding without changing controller or service layers.

### 3.2 Provider Adapter Pattern
Located at `server/src/providers/location/`:
- `location.provider.js`: Dispatches queries to the configured active adapter.
- `nominatim.adapter.js`: Handles API requests, query parameters (`format=jsonv2`, `addressdetails=1`, `limit=5`), response validation, coordinate bounds checking, and canonical mapping.

### 3.3 Location Type Mapping
Provider categories are mapped to Yatrai canonical `LOCATION_TYPES`:

| Nominatim Type / Category | Yatrai Canonical Type |
| ------------------------- | --------------------- |
| `aeroway`, `airport`      | `airport`             |
| `railway`, `station`      | `railway_station`     |
| `bus_station`, `amenity:bus_station` | `bus_station` |
| `subway`, `metro`         | `metro_station`       |
| `university`, `college`   | `university`          |
| `city`, `municipality`    | `city`                |
| `town`                    | `town`                |
| `village`, `hamlet`       | `village`             |
| `state`, `province`       | `state`               |
| `country`                 | `country`             |
| `monument`, `attraction`  | `landmark`            |
| *Default / Unmapped*      | `poi` or `address`    |

---

## 4. Canonical Location Representation

Every resolved location conforms strictly to the Phase 1 `Location` schema:

```json
{
  "id": "673f1a2b...",
  "name": "Sonipat",
  "displayName": "Sonipat, Haryana, India",
  "type": "city",
  "city": "Sonipat",
  "state": "Haryana",
  "country": "India",
  "countryCode": "IN",
  "location": {
    "type": "Point",
    "coordinates": [77.0151, 28.9931]
  },
  "latitude": 28.9931,
  "longitude": 77.0151,
  "placeId": "osm-relation-123456",
  "timezone": "Asia/Kolkata",
  "aliases": ["Sonepat"],
  "metadata": {
    "provider": "nominatim",
    "osmType": "relation",
    "category": "boundary"
  }
}
```

> [!IMPORTANT]
> **GeoJSON Coordinate Ordering:** MongoDB requires `[longitude, latitude]`. The adapter normalizes Nominatim's `lat`/`lon` string outputs into floats and stores them strictly as `[lng, lat]`. The API response additionally provides explicit top-level `latitude` and `longitude` fields for consumer convenience.

---

## 5. Query Relaxation & Regional Acronyms

Certain Indian institutional queries contain regional qualifiers (e.g., `"NCR"` in `"SRM University Delhi NCR"`) that cause strict geocoding engines to return zero results. 

The `locationService` implements an automatic **Query Relaxation Strategy**:
1. Search with full normalized query (e.g., `"SRM University Delhi NCR"`).
2. If 0 results are returned and regional tokens (`NCR`, `North`, `South`, etc.) are detected, re-query with stripped tokens (e.g., `"SRM University Delhi"`).
3. If matches are found, preserve the user's intended display context while adopting the validated coordinates.

---

## 6. Natural-Language Travel Intent Extraction

The utility `server/src/utils/locationParser.js` parses human queries deterministically:

### Supported Syntax Patterns
- `"I need to go from <Origin> to <Destination>"`
- `"Travel from <Origin> to <Destination>"`
- `"Book trip from <Origin> to <Destination>"`
- `"From <Origin> to <Destination>"`
- `"<Origin> to <Destination>"`

### Safeguards Against Hallucination
- If the phrase is ambiguous (e.g., `"I want to travel"`, `"Take me somewhere"`), the parser returns `{ isNaturalLanguage: false }`.
- The resolver then treats the query as a standard single-point search rather than guessing or fabricating origin/destination points.

---

## 7. Caching, Deduplication & Persistence

1. **Pre-Query DB Lookup:** Before dispatching an HTTP request to the external geocoder, the service searches existing MongoDB records for matching `name`, `displayName`, `aliases`, or `placeId`.
2. **Post-Provider Deduplication:** When new results arrive from the provider:
   - Matches existing documents by `placeId`.
   - If `placeId` is absent, matches by composite key: `{ name, city, state, countryCode }`.
   - Existing documents are updated and reused; duplicates are prevented.

---

## 8. API Endpoints Specification

### 8.1 Search Locations (`GET /api/locations/search`)
- **Query Parameter:** `q` (string, required, min 2 chars).
- **Public:** Usable by both authenticated and unauthenticated visitors.
- **Response Format:**
```json
{
  "success": true,
  "query": "Delhi",
  "count": 5,
  "locations": [
    {
      "id": "673f1a2b...",
      "name": "Delhi",
      "displayName": "Delhi, India",
      "type": "city",
      "city": "Delhi",
      "state": "Delhi",
      "country": "India",
      "countryCode": "IN",
      "latitude": 28.6139,
      "longitude": 77.2090
    }
  ]
}
```

### 8.2 Resolve Single Query or Natural Language (`POST /api/locations/resolve`)
- **Request Body:** `{ "query": "I need to go from Sonipat to Patna" }`
- **Response Format (Natural Language Detected):**
```json
{
  "success": true,
  "query": "I need to go from Sonipat to Patna",
  "isNaturalLanguage": true,
  "journeyIntent": {
    "rawOrigin": "Sonipat",
    "rawDestination": "Patna",
    "origin": { "name": "Sonipat", "latitude": 28.9931, "longitude": 77.0151, ... },
    "destination": { "name": "Patna", "latitude": 25.5941, "longitude": 85.1376, ... }
  },
  "locations": [...]
}
```

### 8.3 Get Location by ID (`GET /api/locations/:id`)
- Returns the canonical MongoDB document by its ObjectId.

---

## 9. Error Handling & Provider Resilience

The adapter wraps external calls with comprehensive error handling:
- **HTTP 429 (Rate Limit):** Translates to `503 Service Unavailable` with message `"Location provider rate limit reached. Please try again shortly."`
- **HTTP 502/504 / Network Timeout:** Translates to `504 Gateway Timeout` with message `"Location provider timed out."`
- **Empty / Malformed Responses:** Safely handled; invalid coordinate items are filtered out before persistence.
- **Security:** External API keys and provider internal error stacks are never leaked to clients.

---

## 10. Environment Variables

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `GEOCODING_PROVIDER` | Selected provider name | `nominatim` |
| `GEOCODING_BASE_URL` | Base URL for geocoding service | `https://nominatim.openstreetmap.org` |
| `GEOCODING_API_KEY` | Optional API key (for paid OSM or commercial proxies) | `""` |
| `GEOCODING_USER_AGENT` | Required identification string for OSM usage policy | `Yatrai/1.0 (travel-planner)` |
| `GEOCODING_TIMEOUT_MS` | Network timeout in milliseconds | `5000` |

---

## 11. Known Provider Limitations

1. **Nominatim Usage Policy:** Standard Nominatim public API limits requests to 1 request per second and prohibits heavy automated batch geocoding without prior agreement or self-hosted instances.
2. **Production Recommendation:** For production scaling, switch `GEOCODING_BASE_URL` to a dedicated self-hosted Nominatim container or plug in a commercial geocoding provider (Mapbox / Google Places) via the adapter layer.
