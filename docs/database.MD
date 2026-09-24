# Yatrai — Database Layer Specification (Phase 1)

**Product:** Yatrai  
**Version:** V1.0  
**Phase:** Phase 1 — Database Layer Only  
**Status:** Completed & Verified  
**Document Type:** Database Architecture Specification  
**Tagline:** One Goal. Every Route.

---

## 1. Database Architecture Overview

Yatrai uses **MongoDB** with **Mongoose** as its object data modeling (ODM) layer. The database layer is designed around domain separation, strict referential validation, temporal integrity, and horizontal scalability.

```text
Frontend Application (React + Vite)
             │
             ▼
        Backend API (Express)
             │
             ▼
     API Controllers (Phase 2+)
             │
             ▼
   Service Layer (Business Logic & Ref Checks)
             │
             ▼
   Mongoose Models (Validation & Indexes)
             │
             ▼
       MongoDB Database
```

---

## 2. Core Domain Models

Phase 1 establishes 9 domain models located in `server/src/models/`:

### 2.1 User (`User.js`)
- **Purpose:** Stores user profiles and travel preferences.
- **Fields:** `name`, `email` (unique, indexed, validated regex), `phone`, `avatar`, `preferences` (`preferredTransportModes`, `preferredCurrency`, `preferredLanguage`), `status` (`active`, `inactive`, `suspended`), timestamps.
- **Security Rule:** Does NOT store passwords or implement authentication (Phase 2).
- **Deletion Policy:** Soft-deactivate via `status: 'inactive'` or hard-delete via service.

### 2.2 Location (`Location.js`)
- **Purpose:** Canonical geographic entities (cities, railway stations, airports, bus terminals, transit stops).
- **GeoJSON Field:**
  ```javascript
  location: {
    type: 'Point',
    coordinates: [longitude, latitude] // Longitude: -180..180, Latitude: -90..90
  }
  ```
- **Indexes:** `2dsphere` on `location` for spatial radius and nearest-hub queries; compound `{ city: 1, type: 1 }`; sparse `{ placeId: 1 }`.
- **Timezone:** Preserves IANA timezone string (default `Asia/Kolkata`).

### 2.3 Journey (`Journey.js`)
- **Purpose:** Normalized end-to-end journey from origin to destination across single or multi-modal legs.
- **Fields:** `origin` (ref `Location`), `destination` (ref `Location`), `departureTime` (UTC Date), `arrivalTime` (UTC Date), `duration` (minutes), `totalDistance` (km), `totalPrice`, `currency`, `numberOfTransfers`, `transportModes`, `status`, `metadata`, `schemaVersion` (default 1).
- **Temporal Constraint:** Validates that `arrivalTime >= departureTime`.
- **Authoritative Leg Rule:** **There is NO duplicate `legs` array in `Journey`.** `JourneyLeg` is the single authoritative source of truth.

### 2.4 JourneyLeg (`JourneyLeg.js`)
- **Purpose:** Individual segment or leg of a journey.
- **Fields:** `journey` (ref `Journey`), `sequence` (integer >= 1), `origin` (ref `Location`), `destination` (ref `Location`), `mode` (`road`, `rail`, `bus`, `flight`, `walk`, `taxi`, `metro`), `provider` (ref `TransportProvider`, optional), `departureTime` (UTC), `arrivalTime` (UTC), `duration`, `distance`, `price`, `currency`, `vehicle`, `service`, `booking`, `metadata`, `schemaVersion`.
- **Compound Unique Index:** `{ journey: 1, sequence: 1 }` prevents duplicate sequence numbers.
- **Cascading Deletion:** When a parent `Journey` is deleted, all dependent `JourneyLeg` records are cascade-deleted to avoid orphans.

### 2.5 TransportProvider (`TransportProvider.js`)
- **Purpose:** External transport operators and data sources (e.g. IRCTC, IndiGo, UPSRTC, Ola).
- **Fields:** `name`, `code` (unique, uppercase, e.g. `IRCTC`), `type` (`airline`, `rail`, `bus`, `taxi`, `ride_hailing`, `rental`, `other`), `website`, `logo`, `supportedModes`, `status`, `capabilities`, `metadata`.
- **Index:** Unique on `code`; compound `{ type: 1, status: 1 }`.

### 2.6 SearchRequest (`SearchRequest.js`)
- **Purpose:** Records user travel inquiries, dates, passenger count, and constraints.
- **Fields:** `user` (ref `User`, optional), `origin` (ref `Location`), `destination` (ref `Location`), `departureDate`, `returnDate`, `passengers`, `preferences` (`priority`, `maxBudget`, `maxTransfers`), `requestedModes`, `filters`, `status`.
- **Indexes:** Compound `{ user: 1, createdAt: -1 }`, `{ origin: 1, destination: 1, departureDate: 1 }`.

### 2.7 SearchResult (`SearchResult.js`)
- **Purpose:** Links raw and normalized provider responses to a search request and journey.
- **Fields:** `searchRequest` (ref `SearchRequest`), `journey` (ref `Journey`), `provider` (ref `TransportProvider`), `source`, `externalId`, `status`, `rawData`, `normalizedData`, `expiresAt`, `schemaVersion`.
- **Credential Sanitizer:** Deeply redacts passwords, tokens, API keys, and bearer headers before persisting in `rawData`.
- **TTL Index:** Expired results automatically purged via TTL index on `expiresAt`.

### 2.8 SavedJourney (`SavedJourney.js`)
- **Purpose:** User bookmarked journeys with custom tags and notes.
- **Fields:** `user` (ref `User`), `journey` (ref `Journey`), `name`, `notes`.
- **Compound Unique Index:** `{ user: 1, journey: 1 }` prevents duplicate saves.

### 2.9 Notification (`Notification.js`)
- **Purpose:** In-app notification queue for disruptions, price drops, and journey reminders.
- **Fields:** `user` (ref `User`), `type` (`journey_update`, `price_change`, `departure_reminder`, `booking_update`, `system`), `title`, `message`, `data`, `read` (default `false`), `readAt`, `scheduledFor`, `expiresAt`.
- **Indexes:** `{ user: 1, read: 1 }`, `{ user: 1, createdAt: -1 }`.

---

## 3. Relationships & Referential Integrity

```text
User
 ├── SearchRequest (user → User)
 ├── SavedJourney (user → User, journey → Journey)
 └── Notification (user → User)

SearchRequest
 └── SearchResult (searchRequest → SearchRequest, journey → Journey, provider → TransportProvider)

Journey
 ├── origin → Location
 ├── destination → Location
 └── JourneyLeg (journey → Journey, origin → Location, destination → Location, provider → TransportProvider)
```

Because MongoDB does not enforce foreign keys automatically, the **Service Layer** (`server/src/services/`) strictly validates that referenced documents exist before persistence:
- `journeyService.create()` validates `origin` and `destination` exist in `Location`.
- `journeyLegService.create()` validates `journey`, `origin`, `destination`, and `provider`.
- `savedJourneyService.saveJourney()` validates `user` and `journey`.
- `notificationService.create()` validates `user`.

---

## 4. Time & Timezone Handling

1. **Storage:** All timestamps (`departureTime`, `arrivalTime`, `createdAt`, `updatedAt`, `expiresAt`) are stored strictly in **UTC (`Date`)**.
2. **Local Display:** `Location.timezone` stores the IANA timezone identifier (e.g. `Asia/Kolkata`) so the presentation layer can format departure and arrival times in the local station's timezone.

---

## 5. Deletion & Lifecycle Decisions

| Model | Deletion Strategy | Cascade Behavior |
|---|---|---|
| `User` | Soft Deactivate / Hard Delete | Dependent SavedJourneys & Notifications deleted on hard delete |
| `Location` | Hard Delete | Restricted if referenced in active Journeys |
| `TransportProvider` | Soft Deprecate (`status: 'deprecated'`) | Preserves historical JourneyLeg references |
| `Journey` | Hard Delete | **Cascades delete to all child `JourneyLeg` records** |
| `JourneyLeg` | Hard Delete | None |
| `SearchRequest` | Hard Delete | SearchResults can be pruned |
| `SearchResult` | TTL Expiration | Automatically purged after 24h via MongoDB TTL index |
| `SavedJourney` | Hard Delete | Isolated |
| `Notification` | Hard Delete | Purged after user dismissal or `expiresAt` |

---

## 6. Execution Commands

### Test Live Database Connection
```bash
npm run db:test
```
Pings MongoDB with the configured `MONGODB_URI` and outputs `Database connection: SUCCESS` or `Database connection: FAILED`.

### Seed Development Data
```bash
npm run seed
```
Idempotently inserts representative Indian locations, providers, multi-modal journeys, search requests, and notifications without duplication.

### Reset and Seed Fresh Development Data
```bash
npm run seed:reset
```
Clears and re-seeds development collections (strictly blocked in production).

### Automated Model & Service Test Suite
```bash
npm test
```
Executes 18 automated tests in an isolated in-memory test database verifying all CRUD operations, schema validators, compound unique indexes, referential integrity, and cascading deletions.
