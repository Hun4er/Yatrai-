# YATRAI RESILIENCE & FAILURE RECOVERY SPECIFICATION

**Phase 16 Architecture Guide — Error Classification, Resilience Invariants & Edge Case Handling**

---

## 1. Core Principle

> **"One Goal. Every Route."**

The journey orchestration layer strictly guarantees fault isolation: **one provider failing must NEVER destroy successful results from other providers.**

```
                    Search Request
                         │
                         ▼
                   Orchestrator
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
          Rail ❌      Bus ✅      Flight ✅
             │           │           │
             └──── failure isolated ┘
                         │
                         ▼
                    Normalization
                         │
                         ▼
                     Ranking
                         │
                         ▼
                 Available journeys
```

---

## 2. Canonical Failure Taxonomy

The platform standardizes on an unambiguous, non-leaking taxonomy:

| Code | HTTP Status | Definition & Behavior |
|------|-------------|-----------------------|
| `VALIDATION_ERROR` | 400 | Request payload schema or calendar violation (e.g. past departure date, invalid calendar day 2026-02-31, missing origin/destination, malformed preferences). |
| `SAME_ORIGIN_DESTINATION` | 400 | Origin and destination locations resolve or normalize to identical entities. Prevents zero-length loops and wasted provider invocations. |
| `LOCATION_NOT_FOUND` | 404 | Origin or destination text string cannot be resolved to any canonical location in the knowledge base or geocoder. |
| `TOKEN_EXPIRED` | 401 | User authentication JWT has expired. Client redirects to login or initiates token refresh. |
| `UNAUTHORIZED` | 401 | Missing, malformed, or invalid authentication credentials. |
| `FORBIDDEN` | 403 | Authenticated user lacks permission (e.g. normal user attempting an admin route). |
| `ALL_PROVIDERS_FAILED` | 502 | Every queried external transport provider timed out, errored, or suffered a network outage. **Explicitly distinguished from "No routes found."** |
| `PROVIDER_UNAVAILABLE` | 503 | Transport provider is disabled in configuration or has unconfigured credentials. |
| `PROVIDER_RATE_LIMITED` | 429 | Upstream transport API returned HTTP 429. System halts retries to prevent retry storms, isolates provider, and allows remaining providers to complete. |
| `PROVIDER_AUTH_ERROR` | 401/403 | Upstream transport provider credentials invalid or expired. Isolated safely; secrets are redacted and never logged or leaked. |
| `PROVIDER_TIMEOUT` | 504 | Upstream transport provider exceeded bounded deadline. AbortController terminates request, isolates provider, and returns remaining results. |
| `PROVIDER_MALFORMED_RESPONSE` | 502 | Upstream payload rejected by provider adapter schema (e.g. non-array, missing identifier, invalid timestamps). |
| `NETWORK_ERROR` | 503 | DNS failure, socket reset, or `ECONNREFUSED` connecting to upstream transport host. Classified, logged, and isolated. |
| `NORMALIZATION_ERROR` | 422 | Specific raw candidate failed canonical domain mapping or referential integrity. Isolated per candidate so 1 corrupt item does not discard valid siblings. |

---

## 3. Resilience Matrix & Edge Case Handling

### 3.1 Origin = Destination
- Checked before provider invocation (both at Express middleware and orchestrator level).
- Case-insensitive comparison across names, cities, and MongoDB ObjectIds.
- Rejects immediately with HTTP 400 (`SAME_ORIGIN_DESTINATION` / `VALIDATION_ERROR`) without contacting providers.

### 3.2 Invalid & Past Dates
- Strict calendar validation enforces Gregorian calendar constraints (rejects `2026-02-31`, `2026-99-99`, etc.).
- Date comparison evaluates against current day in `Asia/Kolkata` travel context (+05:30).
- Dates strictly in the past are rejected with 400 (`Departure date cannot be in the past`). Same-day travel is explicitly supported.
- Return date must be valid and must not precede departure date.

### 3.3 Partial vs Complete Provider Failure
- **Partial Failure (e.g., Rail ❌, Bus ✅, Flight ❌, Road ✅):**
  - Bus and Road candidates are normalized, deduplicated, ranked, and returned with HTTP 200.
  - The UI displays available journeys with a non-blocking warning banner: *"Some transport providers were temporarily unavailable. Discovered results may be incomplete."*
- **Complete Failure (Rail ❌, Bus ❌, Flight ❌, Road ❌):**
  - Throws HTTP 502 `ALL_PROVIDERS_FAILED`.
  - UI displays `ErrorState` with "Try Again" and "Modify Search" actions.
- **Empty Routes (Rail ✅ → 0, Bus ✅ → 0, Flight ✅ → 0, Road ✅ → 0):**
  - Completed successfully with HTTP 200 `{ journeys: [] }`.
  - UI displays `EmptyState` ("No routes found") with travel alternative suggestions.

### 3.4 Candidate-Level Normalization Fault Isolation
- Provider envelopes are processed candidate-by-candidate.
- If candidate $i$ has invalid prices, negative durations, broken timestamps, or non-connecting legs, `validateJourneyCandidate` rejects candidate $i$.
- Candidate $i+1$ continues normalization normally. One malformed item never drops valid routes.

### 3.5 Deduplication Precision
- The `JourneyDeduplicator` computes deterministic multi-dimensional fingerprints:
  `modes::origin->destination::departureMinute::arrivalMinute::serviceIdentifiers`
- Exact duplicates are collapsed, deterministically retaining the candidate with the highest data completeness score.
- Journeys with different departure times (e.g. 06:00 vs 08:00), different arrival times, different modes, or different train/flight service numbers are strictly preserved.

### 3.6 Security & Credential Redaction
- Recursive `sanitizeCredentials` scans payloads, query strings, and error envelopes.
- Patterns matching `api[-_]?key`, `secret`, `token`, `auth`, `password`, `bearer`, `cookie` are replaced with `[REDACTED]`.
- API error responses never expose stack traces, database strings, internal file paths, or credentials.
