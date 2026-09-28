# Yatrai — Admin Dashboard Specification (Phase 15)

**Product:** Yatrai  
**Version:** V1.0  
**Phase:** Phase 15 — Yatrai Admin Dashboard  
**Status:** Completed & Verified  
**Document Type:** Administrative Operations & Observability Specification  
**Tagline:** One Goal. Every Route.

---

## 1. Architectural Overview & Boundary

The Admin Dashboard provides privileged internal operational observability and administration on top of the canonical Yatrai travel journey discovery platform.

### Core Principles
1. **Observability, Not Duplication:** The Admin Dashboard strictly observes existing Yatrai systems (`User`, `SearchRequest`, `Journey`, `TransportProvider`, `Notification`). It never duplicates business logic, ranking, or route orchestration.
2. **Backend Security First:** The frontend admin guard is an ergonomic UX layer only. Every administrative endpoint is protected on the server by strict Bearer token authentication and live database role verification (`requireAdmin`).
3. **Sensitive Data Protection:** Administrative endpoints and serializers explicitly mask credentials, password hashes, session tokens, and provider API secrets.
4. **Authentic Analytics:** All analytics and operational metrics are computed via real-time MongoDB aggregation pipelines without synthetic or mocked metrics.

```text
Admin Dashboard (React + Vite)
         │
         │ Authorization: Bearer <access-token>
         ▼
Authentication Middleware (`authenticate`)
         │ (Verifies JWT signature and claims)
         ▼
Authorization Middleware (`requireAdmin`)
         │ (Queries MongoDB: role === 'admin' && status === 'active')
         ▼
Admin Controller (`admin.controller.js`)
         │ (Parses query parameters, pagination, filters)
         ▼
Admin Service (`admin.service.js`)
         │ (Executes aggregation pipelines, applies safe serializers)
         ▼
MongoDB Collections (`User`, `SearchRequest`, `Journey`, `TransportProvider`, `ErrorLog`)
```

---

## 2. Admin Role & Authorization Model

### 2.1 Role Schema Definition (`User.js`)
- **Field:** `role` (String, enum: `['user', 'admin']`, default: `'user'`, indexed with `createdAt: -1`).
- **Compound Index:** `{ role: 1, createdAt: -1 }`.
- **Inherited Guarantees:** Strips password hashes in `toJSON` transform and prevents direct modification via normal profile update endpoints.

### 2.2 Middleware Security (`auth.middleware.js: requireAdmin`)
1. Rejects unauthenticated requests with `401 UNAUTHORIZED`.
2. Inspects database record directly to prevent forged claims or replay from revoked accounts.
3. Rejects deactivated or suspended accounts with `403 ACCOUNT_DISABLED`.
4. Rejects accounts where `role !== 'admin'` with `403 FORBIDDEN`.
5. Attaches verified `req.adminUser` and proceeds to next handler.

---

## 3. Admin API Architecture

All admin routes are mounted under `/api/admin` and require administrative credentials:

| Method | Endpoint | Description | Query Parameters |
|---|---|---|---|
| `GET` | `/api/admin/overview` | Operational overview summary statistics | None |
| `GET` | `/api/admin/users` | Paginated user accounts directory | `page`, `limit`, `search`, `role`, `status`, `sort` |
| `GET` | `/api/admin/searches` | Paginated search requests history | `page`, `limit`, `status`, `search`, `startDate`, `endDate`, `sort` |
| `GET` | `/api/admin/journeys` | Paginated canonical persisted journeys | `page`, `limit`, `mode`, `status`, `sort` |
| `GET` | `/api/admin/providers` | Database providers & runtime engine adapters | None |
| `GET` | `/api/admin/errors` | Paginated operational error logs | `page`, `limit`, `severity`, `statusCode`, `provider`, `search`, `sort` |
| `GET` | `/api/admin/errors/:id` | Single error record with diagnostic stack | None (path parameter `id`) |
| `GET` | `/api/admin/analytics` | MongoDB aggregation analytics breakdown | None |
| `GET` | `/api/admin/system-health`| Operational liveness & readiness breakdown | None |

### Standard Response Envelope
All paginated list endpoints return standardized metadata:
```json
{
  "success": true,
  "message": "Users retrieved successfully",
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

---

## 4. Operational Domains

### 4.1 Users
- **Source:** `User` collection.
- **Safe Fields:** `id`, `name`, `email`, `role`, `status`, `phone`, `avatar`, `preferences`, `createdAt`, `updatedAt`.
- **Security:** Password hashes, salt rounds, and session tokens are strictly excluded.
- **Filters:** Full-text keyword regex on name and email, role filter (`admin`, `user`), status filter (`active`, `inactive`, `suspended`).

### 4.2 Searches
- **Source:** `SearchRequest` collection.
- **Fields:** `id`, `user` (safe summary or Guest), `origin`, `destination`, `departureDate`, `passengers`, `requestedModes`, `priority`, `status`, `createdAt`.
- **Filters:** Status filter (`completed`, `processing`, `pending`, `failed`), keyword filter on origin/destination.

### 4.3 Journeys
- **Source:** Canonical `Journey` collection.
- **Fields:** `id`, `origin`, `destination`, `departureTime`, `arrivalTime`, `duration`, `totalDistance`, `totalPrice`, `currency`, `numberOfTransfers`, `transportModes`, `status`.
- **Filters:** Transport mode filter (`rail`, `bus`, `flight`, `road`), journey status.

### 4.4 Providers
- **Source:** `TransportProvider` collection and `TransportProviderRegistry`.
- **Fields:** Configured database operators, active runtime adapters, capabilities, timeout limits, fault-isolation indicators.
- **Security:** API keys, client secrets, and bearer credentials are never persisted in runtime adapter manifests and are sanitized in output.

### 4.5 Errors
- **Source:** `ErrorLog` collection.
- **Fields:** `timestamp`, `severity` (`info`, `warn`, `error`, `fatal`), `service`, `module`, `endpoint`, `method`, `statusCode`, `errorCode`, `message`, `provider`.
- **Privileged Diagnostics:** Internal stack traces are strictly omitted from list queries and only accessible on explicit single-record inspection by authorized admins.

### 4.6 Analytics
Calculated purely via server-side MongoDB aggregation pipelines:
- **Search Success Rate:** `(completed / totalSearches) * 100`.
- **Searches by Transport Mode:** Unwound aggregation grouping by `requestedModes`.
- **Searches Over Time:** Daily grouped aggregations for the past 14 days.
- **User Distribution:** Grouped by `role` and `status`.
- **Journey Performance:** Minimum, maximum, and average price and duration across persisted journeys.
- **Error Distribution:** Client (4xx) vs Server (5xx) categories.

### 4.7 System Health
- **Liveness:** Process uptime, Node.js runtime version, environment identifier.
- **Readiness:**
  - Database connectivity: Mongoose readyState (`connected`, `connecting`, `disconnected`).
  - Provider Subsystem: Verification of registered core adapters (`road`, `rail`, `bus`, `flight`).
  - Memory: Resident set size (RSS), heap total, and heap used.
- **Status Classification:**
  - `HEALTHY`: Database connected and all core provider adapters active.
  - `DEGRADED`: Database connected but non-critical adapters unready.
  - `UNAVAILABLE`: Database disconnected.

---

## 5. Security & IDOR Protections

1. **Strict Cryptographic Session Verification:** No reliance on localStorage, browser state, or unverified JWT claims. Database role validation on every administrative request ensures immediate revocation upon account suspension.
2. **Anti-IDOR Controls:** Administrative queries operate purely within verified tenant boundaries; normal users cannot tamper with query strings (`?role=admin`) or headers (`X-Admin: true`) to gain access.
3. **Deep Credential Redaction:** `sanitizeSensitiveData` recursively filters authorization tokens, cookies, passwords, and secrets prior to logging.
