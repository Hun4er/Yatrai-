# Yatrai — System Architecture

**Product:** Yatrai  
**Version:** V1.0  
**Status:** Production Architecture Specification  
**Document Type:** System Architecture  
**Last Updated:** September 2026  
**Tagline:** One Goal. Every Route.

---

# 1. Architecture Overview

Yatrai is an intelligent journey discovery platform that determines practical ways for a traveler to reach a destination across multiple transportation modes.

The architecture is designed around one fundamental principle:

> **The destination is fixed. The route is dynamically discoverable.**

Yatrai must not be implemented as a collection of hardcoded routes.

Instead, it should operate as a journey intelligence system that:

1. Understands user intent.
2. Resolves locations.
3. Converts preferences into constraints.
4. Queries transportation providers.
5. Normalizes provider data.
6. Builds a transportation graph.
7. Discovers possible routes.
8. Constructs multimodal journeys.
9. Validates journey feasibility.
10. Scores and ranks journeys.
11. Presents results to the user.
12. Redirects or hands off to booking providers where supported.

---

# 2. Core Architecture

```text
                         ┌───────────────────────┐
                         │       YATRAI          │
                         │   Journey Platform    │
                         └───────────┬───────────┘
                                     │
                              Web / Mobile UI
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │      API Gateway      │
                         └───────────┬───────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │ Journey Orchestrator  │
                         └───────────┬───────────┘
                                     │
               ┌─────────────────────┼─────────────────────┐
               │                     │                     │
               ▼                     ▼                     ▼
       ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
       │    Intent    │      │   Location   │      │   Constraint │
       │   Parser     │      │   Resolver   │      │    Engine    │
       └──────────────┘      └──────────────┘      └──────────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │  Provider Gateway     │
                         └───────────┬───────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
          ▼                          ▼                          ▼
 ┌────────────────┐        ┌────────────────┐        ┌────────────────┐
 │ Rail Providers │        │ Bus Providers  │        │Flight Providers│
 └────────────────┘        └────────────────┘        └────────────────┘
          │                          │                          │
          └──────────────────────────┼──────────────────────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │ Journey Normalizer    │
                         └───────────┬───────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │ Transportation Graph  │
                         └───────────┬───────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │ Route Discovery Engine│
                         └───────────┬───────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │ Feasibility Engine    │
                         └───────────┬───────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │ Ranking Engine        │
                         └───────────┬───────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │ Journey Response API  │
                         └───────────┬───────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │       Frontend        │
                         └───────────────────────┘





3. Architecture Principles

Yatrai architecture must follow these principles.

3.1 Destination First

The destination is the user's objective.

The architecture must allow route discovery to happen dynamically.

3.2 Provider Agnostic

The core system must not depend directly on a single transportation provider.

Providers should be interchangeable.

3.3 No Hardcoded Routes

Avoid code such as:

if (origin === "Delhi" && destination === "Varanasi") {
    return ["Prayagraj"];
}

This is explicitly prohibited in the journey discovery engine.

Instead:

Origin
 ↓
Available transportation connections
 ↓
Candidate nodes
 ↓
Feasibility
 ↓
Route discovery
3.4 Modular Architecture

Each major responsibility should be isolated.

Examples:

Intent Parsing
Location Resolution
Provider Search
Normalization
Graph Construction
Route Discovery
Feasibility
Ranking
3.5 Fail Gracefully

One provider failing must not bring down the entire journey search.

3.6 Explainability

The system should be able to explain why a journey was generated.

3.7 Data Freshness

Time-sensitive information such as:

availability,
fares,
schedules,
delays

must be treated differently from relatively static data such as:

locations,
station metadata,
geographic coordinates.
3.8 Progressive Results

Slow providers should not block all results.

The system should return useful results as they become available when the product implementation supports streaming/progressive delivery.

4. High-Level System Layers

Yatrai should be organized into the following logical layers:

1. Presentation Layer
2. API Layer
3. Application Layer
4. Intelligence Layer
5. Provider Integration Layer
6. Data Layer
7. Infrastructure Layer
8. Observability Layer
5. Presentation Layer

The presentation layer contains the user-facing application.

Recommended technology:

React
Next.js
TypeScript
Tailwind CSS

Potential responsibilities:

Search interface
Natural-language input
Journey results
Filters
Sorting
Journey details
Maps
Saved journeys
User account
Booking redirects
Notifications

The frontend must not contain journey-discovery business logic.

6. Frontend Architecture

Recommended structure:

frontend/
│
├── app/
│
├── components/
│   ├── ui/
│   ├── search/
│   ├── journey/
│   ├── map/
│   ├── navigation/
│   └── layout/
│
├── features/
│   ├── search/
│   ├── journeys/
│   ├── saved/
│   └── profile/
│
├── services/
│   └── api/
│
├── hooks/
│
├── state/
│
├── types/
│
├── utils/
│
└── styles/
7. Frontend State Management

Separate state into:

UI State

Examples:

modal open
selected filter
active tab
expanded journey
Search State

Examples:

search request
loading state
provider progress
results
errors
User State

Examples:

authentication
profile
preferences
saved journeys

Do not place the entire application state into one global store.

8. API Layer

The API layer acts as the boundary between the frontend and backend.

Recommended responsibilities:

authentication,
request validation,
rate limiting,
request routing,
response formatting,
API versioning.

Example:

/api/v1/journeys/search
/api/v1/journeys/:id
/api/v1/locations/search
/api/v1/providers/status
/api/v1/users/preferences
/api/v1/saved-journeys
9. API Versioning

All production APIs should be versioned.

Example:

/api/v1/...

Future breaking changes:

/api/v2/...

The frontend should not depend on undocumented backend response structures.

10. Journey Orchestrator

The Journey Orchestrator (`server/src/orchestration/journeyOrchestrator.js`) is the central integration coordinator for journey discovery.

It coordinates the complete journey search across Phase 3 through Phase 7 subsystems without becoming a monolithic business-logic class.

Responsibilities:
1. Receive and validate search request payload.
2. Resolve origin and destination via Phase 3 Location Resolution.
3. Build immutable canonical SearchContext.
4. Manage SearchRequest lifecycle (pending -> processing -> completed / failed).
5. Determine applicable providers via TransportProviderRegistry.
6. Execute provider searches concurrently using Promise.allSettled with bounded timeout budgets.
7. Isolate individual provider failures while preserving successful candidate sets.
8. Normalize candidates via Phase 6 JourneyNormalizer.
9. Validate canonical candidates and legs against strict domain constraints.
10. Deduplicate canonical journeys via dedicated JourneyDeduplicator using layered equivalence and deterministic retention.
11. Atomically persist unique Journey, JourneyLeg, and SearchResult records.
12. Rank unique journeys using Phase 7 RankingEngine strategies (overall, fastest, cheapest, fewest_transfers, most_convenient).
13. Assemble safe canonical API response via ResultAssembler with safe provider metadata.

Architecture:

```text
User Request
     ↓
Location Resolver (Phase 3)
     ↓
Journey Orchestrator (Phase 8)
     ↓
Provider Registry (Phase 5)
     ↓
┌────────┬────────┬────────┬────────┐
│  Rail  │  Bus   │ Flight │  Road  │
└────────┴────────┴────────┴────────┘
     ↓
Provider Results Envelope
     ↓
Journey Normalizer (Phase 6)
     ↓
Canonical Journeys
     ↓
Journey Deduplicator (Phase 8)
     ↓
Ranking Engine (Phase 7)
     ↓
Final Journey Response (Phase 8)
```

10.1 Journey Deduplication Architecture:
The Journey Deduplicator (`server/src/deduplication/journeyDeduplicator.js`) executes layered semantic deduplication:
- Multi-dimensional fingerprinting: transport mode sequence, origin, destination, minute-level departure/arrival schedule, service/train/flight identifier.
- Preserves distinct departures, arrivals, operators, and modes.
- Deterministic retention policy: retains candidate with richer data completeness, enriches missing fields (e.g. booking URLs), and tracks duplicates in audit reports.
- Pre-persistence execution: eliminates redundant records before database insertion, preserving referential integrity.

11. Intent Parser

The Intent Parser converts natural-language requests into structured input.

Example:

"I want to reach Varanasi tomorrow by train.
I'm okay with one transfer."

becomes:

{
  "origin": "unknown",
  "destination": "Varanasi",
  "date": "2026-09-24",
  "preferredModes": ["rail"],
  "maxTransfers": 1
}

The parser must distinguish:

hard constraints,
soft preferences,
informational context.
12. Intent Parsing Architecture
Natural Language
       ↓
Text Parser
       ↓
Entity Extraction
       ↓
Date/Time Extraction
       ↓
Transport Extraction
       ↓
Constraint Extraction
       ↓
Preference Extraction
       ↓
Structured Journey Request
13. Location Resolver

The Location Resolver converts user-entered locations into canonical locations.

Example:

"Delhi"

may resolve to:

{
  "city": "Delhi",
  "country": "India",
  "transportNodes": [
    "New Delhi Railway Station",
    "Old Delhi Railway Station",
    "Delhi Airport"
  ]
}

Resolution should consider journey context.

14. Canonical Location Model

Example:

{
  "locationId": "loc_123",
  "name": "New Delhi Railway Station",
  "type": "rail_station",
  "city": "New Delhi",
  "country": "India",
  "latitude": 28.643,
  "longitude": 77.219,
  "providerIds": {}
}

Location types may include:

city
town
rail_station
bus_station
airport
terminal
landmark
15. Constraint Engine

The Constraint Engine converts user requirements into machine-readable rules.

Example:

{
  "hard": {
    "destination": "Varanasi",
    "maxBudget": 2000,
    "avoidModes": ["flight"]
  },
  "soft": {
    "preferredModes": ["rail"],
    "maxTransfers": 1
  }
}

The engine must enforce hard constraints before ranking.

16. Provider Gateway

The Provider Gateway abstracts external transportation APIs.

                 Provider Gateway
                       │
       ┌───────────────┼───────────────┐
       │               │               │
      Rail            Bus            Flight
       │               │               │
   Provider A      Provider A      Provider A
   Provider B      Provider B      Provider B

The rest of Yatrai should not need to know provider-specific implementation details.

17. Provider Adapter Pattern

Each external provider should have its own adapter.

Example:

providers/
│
├── rail/
│   ├── provider-a/
│   ├── provider-b/
│   └── rail.interface.ts
│
├── bus/
│   ├── provider-a/
│   └── bus.interface.ts
│
└── flight/
    ├── provider-a/
    └── flight.interface.ts

Each adapter implements a standard interface.

Example:

interface TransportProvider {
    searchRoutes(request: SearchRequest): Promise<ProviderResponse>;
}
18. Provider Isolation

Provider-specific logic must remain isolated.

Bad:

JourneyService
 ├── Provider A logic
 ├── Provider B logic
 ├── Provider C logic
 └── Provider D logic

Good:

JourneyService
      ↓
Provider Gateway
      ↓
Provider Adapter

This prevents provider changes from affecting the entire system.

19. Provider Failure Handling

Providers can fail because of:

timeout,
API outage,
authentication error,
rate limit,
malformed response,
temporary unavailability.

Yatrai should handle each failure independently.

Example:

Rail Provider
   ↓
TIMEOUT

Bus Provider
   ↓
SUCCESS

Flight Provider
   ↓
SUCCESS

Yatrai
   ↓
Return Bus + Flight Results

The user should not receive an empty result simply because one provider failed.

20. Journey Normalizer

The Journey Normalizer converts provider-specific data and Provider Result Envelopes into the unified Yatrai canonical domain model (`Journey` and `JourneyLeg`).

```text
Provider-Specific API Response
              ↓
  Provider Result Envelope
              ↓
     JOURNEY NORMALIZER
              ↓
    Normalization Strategy
    ├── Rail Normalizer
    ├── Flight Normalizer
    ├── Bus Normalizer
    └── Road Normalizer
              ↓
  Canonical Journey Candidate
  + Sequential Canonical JourneyLegs
              ↓
 Strict Domain & Continuity Validator
              ↓
        Ranking Engine
```

Architecture Principles:
- **Strategy Pattern Isolation**: Provider-specific response parsing remains isolated inside specialized normalization strategies (`RailNormalizerStrategy`, `FlightNormalizerStrategy`, `BusNormalizerStrategy`, `RoadNormalizerStrategy`).
- **Domain Independence**: Downstream components (Transportation Graph, Route Discovery, Ranking) operate strictly on canonical domain properties and remain agnostic to external provider schemas.
- **Trip vs Segment**: `Journey` represents the holistic multi-modal trip from origin to destination. `JourneyLeg` represents an individual physical transit segment. `JourneyLeg.journey` foreign reference is the single source of truth.
- **Temporal & Spatial Continuity**: Every normalized journey candidate undergoes strict verification ensuring sequence order, origin/destination connection, monotonic positive layovers, and non-negative fares.
- **Fault-Tolerant Resilience**: Envelopes containing malformed candidates discard only invalid elements without terminating valid journey options.
21. Internal Journey Model

Example:

interface Journey {
    id: string;

    origin: Location;
    destination: Location;

    departure: DateTime;
    arrival: DateTime;

    durationMinutes: number;

    totalCost: Money;

    segments: JourneySegment[];

    transfers: Transfer[];

    modes: TransportMode[];

    availability: Availability;

    providers: ProviderReference[];

    metadata: JourneyMetadata;
}
22. Journey Segment Model
interface JourneySegment {
    id: string;

    mode: TransportMode;

    provider: ProviderReference;

    origin: Location;

    destination: Location;

    departure: DateTime;

    arrival: DateTime;

    durationMinutes: number;

    price: Money;

    availability: Availability;

    metadata: SegmentMetadata;
}
23. Transportation Graph

Yatrai should model transportation as a graph.

              Delhi
             /     \
            /       \
       Kanpur      Jaipur
          |           |
       Prayagraj    Mumbai
            \         /
             \       /
              Varanasi

Nodes represent transportation locations.

Edges represent available transportation connections.

An edge may contain:

origin
destination
mode
provider
departure
arrival
price
availability
24. Graph Representation

Example:

{
  "from": "DEL",
  "to": "PRY",
  "mode": "rail",
  "departure": "08:10",
  "arrival": "13:45",
  "price": 850,
  "availability": "available"
}

Another edge:

{
  "from": "PRY",
  "to": "VNS",
  "mode": "bus",
  "departure": "14:40",
  "arrival": "17:20",
  "price": 390,
  "availability": "available"
}

These can form:

Delhi
  ↓ Train
Prayagraj
  ↓ Bus
Varanasi
25. Route Discovery Engine

The Route Discovery Engine is responsible for finding feasible paths through the transportation graph.

It should not use manually predefined routes.

Conceptually:

Origin
  ↓
Explore candidate nodes
  ↓
Evaluate connections
  ↓
Expand valid nodes
  ↓
Reach destination
  ↓
Generate candidate journeys

Possible algorithms can include:

Dijkstra-style shortest path,
A*,
multi-criteria shortest path,
constrained graph search,
k-shortest paths,
time-dependent routing.

The final algorithm should be selected based on performance and transportation-data characteristics.

26. Time-Dependent Routing

Transportation routes are not static.

The same edge can have different schedules:

Delhi → Varanasi

08:10 → 17:20
14:30 → 23:45
22:00 → 07:10

Therefore the graph should support time-dependent edges.

The route engine must consider:

departure time,
arrival time,
transfer time,
date,
availability.
27. Multi-Criteria Route Discovery

The system should not optimize only one metric.

Potential optimization dimensions:

Cost
Duration
Transfers
Waiting Time
Departure Time
Arrival Time
Mode Preference
Availability

The route engine should generate multiple meaningful candidate journeys rather than only one mathematically optimal path.

28. Route Search Boundaries

Unrestricted graph traversal could create an enormous number of possible routes.

The system should therefore support configurable boundaries:

Maximum transfers
Maximum journey duration
Maximum cost
Maximum search depth
Geographic relevance
Allowed modes

These boundaries must be dynamic where possible.

29. Feasibility Engine

The Feasibility Engine validates candidate journeys.

Checks include:

Temporal feasibility
Transfer feasibility
Location feasibility
Availability
Budget
Maximum duration
Maximum transfers
Mode restrictions
Arrival deadline

Only feasible journeys should reach the ranking stage.

30. Transfer Engine

The Transfer Engine calculates whether one segment can connect to another.

Example:

Train arrival
13:45

Next bus
14:40

Transfer window
55 minutes

The engine should consider:

minimum transfer time,
location distance,
terminal changes,
transportation mode,
user preferences,
safety margins.
31. Nearby Transport Node Discovery

Yatrai should support nearby alternatives.

Example:

User wants:

Delhi → Varanasi

If the relevant Delhi station has no suitable journey, the system may consider nearby stations if practical.

Architecture:

User Location
      ↓
Nearby Transport Nodes
      ↓
Availability Search
      ↓
Feasibility
      ↓
Candidate Journeys

Nearby-node expansion should be distance- and context-aware.

32. Multimodal Journey Engine

The system should allow combinations such as:

Road → Train
Train → Train
Train → Bus
Bus → Train
Flight → Road
Road → Flight → Road

Each segment remains independently validated.

The complete journey is validated as one object.

33. Hard Constraint Enforcement

Hard constraints must be applied before final ranking.

Example:

Maximum Budget = ₹2,000

Any journey:

₹2,450

must be removed.

It should not merely receive a lower score.

34. Soft Preference Ranking

Soft preferences influence ranking rather than necessarily eliminating journeys.

Example:

Preferred Mode = Train

A train journey may receive a ranking advantage.

A bus journey can still be returned if no suitable train journey exists.

35. Ranking Engine (Phase 7 Architecture)

The Ranking Engine receives canonical, normalized journeys from Phase 6 and applies pluggable ranking strategies to produce deterministic recommendation categories:

```text
Canonical Journeys (Phase 6)
             ↓
       Ranking Engine
             ↓
     Strategy Selection
             ↓
┌─────────────────────────┐
│ Best Overall Strategy   │
│ Fastest Strategy        │
│ Cheapest Strategy       │
│ Transfers Strategy      │
│ Convenience Strategy    │
└─────────────────────────┘
             ↓
Ranked Canonical Journeys (with ephemeral ranking metadata)
```

Core Architecture Principles:
- **Strategy Pattern Isolation**: Every ranking algorithm implements `strategy.rank(journeys, context)` inheriting from `BaseRankingStrategy`. The core engine has zero scattered provider- or category-specific conditionals.
- **Dynamic Strategy Registry**: Strategies register with stable identifiers (`overall`, `fastest`, `cheapest`, `fewest_transfers`, `most_convenient`) and optional aliases (`balanced`, `fewestTransfers`, `mostConvenient`). Adding future strategies requires zero modifications to the core engine.
- **Strict Canonical Ingestion**: Consumes exclusively normalized domain fields (`duration`, `totalPrice`, `currency`, `numberOfTransfers`, `departureTime`, `transportModes`). Zero inspection of raw provider structures.
- **Immutability & Stateless Decoration**: Canonical journeys are never mutated. Ranking metadata (`{ rank, score, strategy, label }`) is decorated on a shallow-cloned working set. Ranking is ephemeral and never persisted to MongoDB models.
- **Deterministic Tie-Breaking**: All strategies enforce a deterministic secondary/tertiary criteria chain (`tieBreaker.js`) ending in original sequence preservation (`_originalIndex`).
- **Currency Safety**: Raw numeric price comparison across differing currencies is prohibited. Differing currencies are safely partitioned with a logged warning.
- **Score Normalization**: Continuous dimensions are normalized to $[0.0, 1.0]$ with edge-case protection against division by zero, out-of-bounds metrics, and single-journey collections.

36. Ranking Categories & Scoring Formulas

The system independently produces 5 distinct recommendation categories from a single search candidate set (`rankAll`):

1. **Best Overall (`overall`)**:
   - Composite weighted score:
     $$\text{Score} = (0.35 \times S_{\text{duration}}) + (0.30 \times S_{\text{price}}) + (0.20 \times S_{\text{transfers}}) + (0.15 \times S_{\text{convenience}})$$
   - Balanced trade-off across travel time, financial cost, physical transfer count, and departure schedule comfort.
2. **Fastest (`fastest`)**:
   - Primary metric: `duration` in minutes (ascending).
   - Evaluates total elapsed journey time from origin departure to final destination arrival (not departure time of day).
3. **Cheapest (`cheapest`)**:
   - Primary metric: `totalPrice` (ascending) with currency homogeneity verification.
   - Missing price (`null`/`undefined`) is strictly distinguished from free transit (`price === 0`) and placed at the end.
4. **Fewest Transfers (`fewest_transfers`)**:
   - Primary metric: `numberOfTransfers` (ascending).
   - Evaluates physical mode/vehicle connection friction ($legs - 1$), distinct from intermediate rail/bus station stops.
5. **Most Convenient (`most_convenient`)**:
   - Multi-factor convenience score:
     $$\text{Score} = (0.40 \times S_{\text{transfers}}) + (0.30 \times S_{\text{duration}}) + (0.20 \times S_{\text{schedule}}) + (0.10 \times S_{\text{mode}})$$
   - Schedule scoring rewards daytime travel ($09:00 - 18:00$) with a $1.0$ multiplier, while penalizing midnight red-eye departures ($00:00 - 05:00$) with $0.40$.

Phase 8 Boundary:
Ranking evaluates only pre-existing canonical journeys. Stitching disconnected provider results into novel multimodal journeys is strictly deferred to Phase 8 (Multi-Modal Journey Orchestration).

37. Explainability Engine

Yatrai should generate factual explanations for results.

Example:

Direct train unavailable.

This route uses one train and one bus connection through Prayagraj.

Another:

Cheapest option.

This journey costs ₹640 less than the next available option.

The explanation should be derived from structured journey data.

38. Search Pipeline

The complete search pipeline:

User Input
    ↓
Request Validation
    ↓
Intent Parsing
    ↓
Location Resolution
    ↓
Constraint Extraction
    ↓
Provider Selection
    ↓
Provider Search
    ↓
Normalization
    ↓
Graph Construction
    ↓
Direct Route Search
    ↓
Alternative Route Discovery
    ↓
Multimodal Construction
    ↓
Feasibility Validation
    ↓
Hard Constraint Filtering
    ↓
Ranking
    ↓
Explanation Generation
    ↓
Response
39. Search Modes

The system should support:

Direct Search
Origin → Destination
Alternative Search
Origin → Intermediate → Destination
Multimodal Search
Origin → Rail → Bus → Destination
Recovery Search
Original Journey
       ↓
Disruption
       ↓
Alternative Journey
40. Caching Architecture

Caching should be used carefully.

Suitable for caching
location metadata,
station metadata,
airport metadata,
provider configuration,
static route information,
geographic information.
Short-lived caching

Potentially:

search responses,
fares,
schedules,
availability.

Time-sensitive data must have appropriate TTLs.

Never present stale availability as real-time availability.

41. Data Storage

Recommended storage architecture:

                 Database Layer
                      │
       ┌──────────────┼──────────────┐
       │              │              │
   PostgreSQL       Redis        Object Storage
       │              │              │
 Persistent Data    Cache       Files / Logs

Possible responsibilities:

PostgreSQL
users,
preferences,
saved journeys,
journey history,
provider metadata,
normalized persistent entities.
Redis
caching,
temporary search state,
rate limiting,
session data,
distributed locks.
Object Storage
logs,
exports,
large artifacts,
future datasets.
42. Database Principles

The database should not become the source of truth for live provider availability unless explicitly designed for that purpose.

Provider APIs remain the source of truth for live transportation availability.

Persistent Yatrai data should primarily include:

user data,
saved journeys,
normalized metadata,
analytics,
configuration.
43. Search Request Lifecycle

Example:

POST /api/v1/journeys/search

Request:

{
  "origin": "Delhi",
  "destination": "Varanasi",
  "date": "2026-09-24",
  "preferredModes": ["rail"]
}

Processing:

API
 ↓
Validation
 ↓
Orchestrator
 ↓
Location Resolver
 ↓
Constraint Engine
 ↓
Provider Gateway
 ↓
Normalization
 ↓
Route Discovery
 ↓
Feasibility
 ↓
Ranking

Response:

{
  "searchId": "search_123",
  "status": "completed",
  "journeys": []
}
44. API Response Design

The API should return normalized objects.

Example:

{
  "id": "journey_001",
  "category": "best_overall",
  "origin": {
    "name": "Delhi"
  },
  "destination": {
    "name": "Varanasi"
  },
  "departure": "2026-09-24T08:10:00+05:30",
  "arrival": "2026-09-24T17:20:00+05:30",
  "durationMinutes": 550,
  "totalCost": 1240,
  "currency": "INR",
  "transfers": 1,
  "modes": [
    "rail",
    "bus"
  ],
  "segments": [],
  "availability": {
    "status": "available",
    "checkedAt": "2026-09-23T17:00:00+05:30"
  }
}
45. API Error Model

All APIs should use a consistent error structure.

Example:

{
  "error": {
    "code": "PROVIDER_TIMEOUT",
    "message": "A transportation provider could not be reached.",
    "requestId": "req_123"
  }
}

Do not expose internal stack traces to users.

46. Authentication Architecture

If authentication is implemented:

Frontend
   ↓
Auth API
   ↓
Identity Layer
   ↓
User Database

Authentication should support:

secure sessions,
token rotation where applicable,
password security,
email verification,
OAuth where required.

Authentication architecture should remain separate from journey logic.

47. Authorization

Roles may include:

User
Admin
Operator
Internal Service

Users should only access their own:

saved journeys,
profile,
preferences,
journey history.

Admin access should be isolated.

48. Rate Limiting

Rate limiting should be applied at multiple levels.

Example:

User
 ↓
API Rate Limit
 ↓
Search Rate Limit
 ↓
Provider Rate Limit

Provider-specific quotas should not be exposed to the frontend.

49. Security Boundaries
                Internet
                   │
                   ▼
              API Gateway
                   │
           Authentication
                   │
             Application
                   │
        ┌──────────┴──────────┐
        │                     │
    Database              Providers

Sensitive credentials must remain inside the backend environment.

50. Observability Architecture

Yatrai should use centralized observability.

Monitor:

Frontend
Backend
Providers
Database
Cache
Infrastructure

Important metrics:

Search latency
Provider latency
Search success rate
Zero-result rate
Provider failure rate
Route generation count
Alternative route rate
API error rate
Booking redirect rate
51. Logging

Logs should contain structured information.

Example:

{
  "timestamp": "2026-09-23T17:00:00Z",
  "requestId": "req_123",
  "service": "journey-orchestrator",
  "event": "provider_timeout",
  "provider": "rail-provider",
  "durationMs": 3200
}

Never log:

passwords,
API secrets,
payment credentials,
sensitive personal information.
52. Distributed Tracing

Each search should receive a request ID.

Example:

Request
  │
  ├── Intent Service
  │
  ├── Location Service
  │
  ├── Rail Provider
  │
  ├── Bus Provider
  │
  ├── Route Engine
  │
  └── Ranking Engine

All services should be traceable using the same request/search ID.

53. Infrastructure

Initial production architecture may use:

Frontend
   ↓
CDN / Edge
   ↓
API
   ↓
Backend
   ↓
Database
   ↓
Redis
   ↓
External Providers

The exact cloud provider should remain replaceable.

Potential platforms can include:

AWS
Azure
Google Cloud
managed hosting platforms for early stages.
54. Deployment Architecture

Recommended environments:

Development
     ↓
Staging
     ↓
Production

Each environment should have:

separate environment variables,
separate API credentials,
separate databases where appropriate,
independent configuration.
55. CI/CD

Recommended pipeline:

Git Push
   ↓
Lint
   ↓
Type Check
   ↓
Unit Tests
   ↓
Integration Tests
   ↓
Build
   ↓
Security Checks
   ↓
Deploy Staging
   ↓
Smoke Tests
   ↓
Production Deployment

Production deployments should be reproducible.

56. Testing Architecture

Testing should exist at multiple levels.

Unit Tests

Test:

parsers,
normalizers,
ranking,
constraints,
feasibility,
utility functions.
Integration Tests

Test:

provider adapters,
API,
database,
journey orchestration.
End-to-End Tests

Test:

User Search
    ↓
Journey Results
    ↓
Journey Details
    ↓
Booking Redirect
57. Route Engine Testing

The route engine requires specialized tests.

Examples:

Direct route
A → B
One transfer
A → B → C
Multimodal
A → Rail → B → Bus → C
Impossible transfer
Arrival: 10:00
Departure: 09:30

Must be rejected.
Budget violation
Budget: ₹1,000
Journey: ₹1,400

Must be rejected.
Maximum transfer
Max transfers: 1
Journey transfers: 2

Must be rejected.
58. Provider Contract Testing

Every provider adapter should satisfy the same contract.

Example:

searchRoutes()
normalizeResponse()
getAvailability()

Adding a new provider should require:

New Adapter
+
Provider Configuration
+
Provider Tests

and should not require changes to the core route engine.

59. Data Freshness Architecture

Different data should have different freshness requirements.

Location metadata
→ Long TTL

Station metadata
→ Long TTL

Schedules
→ Medium/short TTL

Prices
→ Short TTL

Availability
→ Very short TTL / real-time

Delays
→ Real-time where supported

The UI should communicate freshness where relevant.

60. Progressive Search Architecture

Where supported, the backend should be able to return results progressively.

Example:

Search Started

Rail results
    ↓
Available

Bus results
    ↓
Available

Flight results
    ↓
Available

Alternative routes
    ↓
Generated

Final ranking
    ↓
Completed

The user should not necessarily wait for every provider if useful results already exist.

61. Search Cancellation

Users may start a new search before the previous search completes.

The backend should support cancellation where practical.

Example:

Search A
   ↓
User starts Search B
   ↓
Cancel unnecessary work from Search A

This prevents wasted provider requests and resources.

62. Idempotency

Operations that may be retried should support idempotency where appropriate.

Particularly:

booking actions,
payment operations,
saved journey creation,
notifications.

Search requests should also avoid accidental duplicate execution where possible.

63. Booking Architecture

Booking should remain separated from journey discovery.

Journey Discovery
       ↓
Selected Journey
       ↓
Booking Service
       ↓
Provider

The journey engine should not become tightly coupled to payment or booking logic.

64. External Provider Booking

For external booking:

Yatrai
  ↓
Provider Booking URL
  ↓
Provider

Yatrai should track:

redirect,
provider,
journey ID,
timestamp.

Do not claim booking success unless confirmation is received.

65. Future Integrated Booking

Future architecture:

User
 ↓
Yatrai
 ↓
Booking Service
 ↓
Payment Service
 ↓
Provider
 ↓
Confirmation

Payment data must be isolated from the journey engine.

66. Notification Architecture

Future notifications may include:

Journey reminder
Price change
Availability change
Delay
Cancellation
Alternative route
Booking confirmation

Architecture:

Event
 ↓
Notification Service
 ↓
Email / Push / SMS
67. Event-Driven Architecture

As Yatrai grows, important system events can be published.

Examples:

JourneySearchStarted
JourneySearchCompleted
ProviderFailed
JourneySaved
JourneyBooked
JourneyDisrupted
AlternativeRouteFound

An event bus can later decouple:

analytics,
notifications,
monitoring,
recommendation systems.
68. Recommendation Architecture

Future personalized recommendations can use:

User Preferences
+
Travel History
+
Current Request
+
Journey Availability

The recommendation layer must remain separate from the core feasibility engine.

The recommendation system must never override hard constraints.

69. Scalability Strategy

Initial system:

Modular Monolith

As scale increases:

API Gateway
     │
     ├── Journey Service
     ├── Provider Service
     ├── Route Engine
     ├── Ranking Service
     ├── Location Service
     ├── Booking Service
     └── Notification Service

Do not introduce microservices prematurely.

The architecture should first prioritize clean module boundaries.

70. Horizontal Scaling

Stateless application services should be horizontally scalable.

Example:

              Load Balancer
                    │
        ┌───────────┼───────────┐
        ↓           ↓           ↓
    Backend 1   Backend 2   Backend 3

Shared state should live in:

database,
cache,
object storage,
event systems.
71. Database Scaling

As traffic grows:

Primary Database
       ↓
Read Replicas

Potential future strategies:

partitioning,
indexing,
read replicas,
dedicated search databases,
data warehousing.

Do not optimize prematurely.

72. Search Engine Scaling

The route engine can become computationally expensive.

Potential optimization strategies:

graph pruning,
bounded search,
caching,
parallel provider queries,
precomputed geographic relationships,
heuristic routing,
provider-specific optimization,
asynchronous search workers.
73. Background Workers

Long-running operations should be moved to workers where appropriate.

Examples:

Provider synchronization
Analytics processing
Notifications
Cache refresh
Disruption monitoring
Data enrichment

Architecture:

Application
    ↓
Queue
    ↓
Worker
    ↓
Result / Event
74. Geographic Data

Yatrai requires geographic information for:

cities,
stations,
airports,
bus terminals,
roads,
distances,
nearby locations.

Geospatial queries should support:

Find nearby transport nodes
Calculate distance
Validate transfers
Determine geographic relevance
75. Map Architecture

The map layer should remain independent from the journey engine.

Journey Engine
     ↓
Normalized Coordinates
     ↓
Map Service
     ↓
Frontend Map

Maps should visualize journey data rather than become the source of transportation truth.

76. Provider Data Source of Truth

For dynamic transportation data:

Provider
   ↓
Source of Truth

Yatrai should not invent or permanently assume:

availability,
prices,
delays,
cancellations.

Yatrai may cache provider information but must respect freshness.

77. Data Consistency

The system should tolerate temporary inconsistencies between providers.

Example:

Provider A:
Available

Provider B:
Unavailable

The journey should include provider source and timestamp.

The system should not silently merge contradictory information into a false certainty.

78. Security Architecture

Security layers:

Internet
   ↓
CDN / WAF
   ↓
API Gateway
   ↓
Authentication
   ↓
Authorization
   ↓
Application
   ↓
Database

Additional protections:

rate limiting,
input validation,
secret management,
encryption,
audit logging,
dependency scanning.
79. Privacy Architecture

Yatrai should collect only information necessary for the requested functionality.

Potential personal data:

Name
Email
Saved journeys
Preferences
Travel history

The system should provide appropriate controls for:

data access,
account deletion,
data retention,
privacy preferences.

Location data should be handled carefully and only used when required.

80. Configuration Management

Configuration should be externalized.

Examples:

MAX_SEARCH_DEPTH
MAX_TRANSFERS
MAX_JOURNEY_DURATION
PROVIDER_TIMEOUT
CACHE_TTL
MIN_TRANSFER_TIME

Avoid hardcoding production behavior directly into source code.

81. Feature Flags

Feature flags can control gradual releases.

Examples:

alternative_route_engine
multimodal_search
progressive_results
disruption_recovery
integrated_booking

This allows new functionality to be tested safely.

82. Environment Variables

Sensitive configuration should use environment variables or secure secret managers.

Example:

DATABASE_URL
REDIS_URL
PROVIDER_API_KEY
AUTH_SECRET
MAP_API_KEY

Never commit secrets to Git.

83. Repository Structure

Recommended monorepo structure:

yatrai/
│
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── types/
│   ├── ui/
│   ├── config/
│   ├── journey-core/
│   └── provider-sdk/
│
├── services/
│   ├── route-engine/
│   ├── ranking-engine/
│   └── workers/
│
├── docs/
│   ├── PRD.md
│   ├── DESIGN_SYSTEM.md
│   └── ARCHITECTURE.md
│
├── tests/
│
├── scripts/
│
└── README.md

For an early MVP, this can be simplified into a modular frontend/backend repository.

84. Core Domain Modules

The domain layer should contain business logic independent of external infrastructure.

Recommended:

domain/
│
├── journey/
├── location/
├── route/
├── segment/
├── transfer/
├── constraint/
├── ranking/
└── provider/

Business logic should not directly depend on HTTP clients or database implementations.

85. Dependency Direction

Dependencies should generally flow inward.

Presentation
     ↓
Application
     ↓
Domain
     ↑
Infrastructure

The domain should not depend directly on:

UI,
HTTP framework,
database driver,
specific provider SDK.
86. Domain Interfaces

Example:

interface RailProvider {
    search(request: RailSearchRequest): Promise<RailSearchResult>;
}

The domain uses the interface.

The infrastructure layer implements it.

This allows providers to be replaced without changing business logic.

87. API Contract

Frontend and backend communication should use explicit types.

Example:

Frontend
   ↓
JourneySearchRequest
   ↓
API
   ↓
JourneySearchResponse

Shared types can be stored in:

packages/types

This reduces frontend/backend contract errors.

88. Validation Architecture

Validation should occur at multiple boundaries.

Frontend
   ↓
API Validation
   ↓
Domain Validation
   ↓
Provider Validation

Frontend validation improves UX.

Backend validation protects the system.

Domain validation protects business correctness.

89. Resilience Patterns

Use:

timeouts,
retries,
exponential backoff,
circuit breakers where appropriate,
fallback providers,
graceful degradation.

Do not retry indefinitely.

Example:

Provider Request
      ↓
Timeout
      ↓
Retry
      ↓
Timeout
      ↓
Circuit / Failure
      ↓
Continue Other Providers
90. Circuit Breaker

If a provider repeatedly fails:

Healthy
   ↓
Failures
   ↓
Open Circuit
   ↓
Stop unnecessary requests
   ↓
Recovery Test
   ↓
Healthy

This protects Yatrai from wasting resources against a failing provider.

91. Search Timeout Strategy

Each provider should have a configurable timeout.

Example:

Rail: 2500ms
Bus: 2500ms
Flight: 3000ms
Road: 2000ms

These are architecture examples, not fixed production values.

The final values should be determined through provider testing.

92. Graceful Degradation

If some providers fail:

Provider A ❌
Provider B ✅
Provider C ✅

Yatrai should return:

Results from available providers
+
Clear indication that some results may be incomplete
93. Zero-Result Strategy

When no journey is found:

No feasible route
        ↓
Check soft constraints
        ↓
Relax soft constraints
        ↓
Search again
        ↓
Return alternatives

If no route exists even after appropriate relaxation:

No feasible journey found.

The system should explain which constraints prevented a result where possible.

94. Security of Provider Credentials

Provider credentials must be stored securely.

Architecture:

Secret Manager
      ↓
Backend Runtime
      ↓
Provider Adapter
      ↓
External Provider

Never:

Frontend
   ↓
Provider API Key
95. Monitoring and Alerting

Alerts should exist for:

API error spikes,
provider failures,
database failures,
high search latency,
elevated zero-result rate,
abnormal route-generation behavior,
authentication failures,
infrastructure resource exhaustion.
96. Product Analytics Pipeline

Architecture:

Frontend Events
       ↓
Analytics API
       ↓
Event Queue
       ↓
Analytics Storage
       ↓
Dashboards

Important events:

search_started
search_completed
journey_viewed
journey_saved
filter_used
alternative_viewed
booking_clicked
search_abandoned
97. Journey Quality Feedback

Future versions should allow users to provide feedback.

Example:

Was this journey useful?

👍 Yes
👎 No

Potential reasons:

Price inaccurate
Availability inaccurate
Transfer impractical
Journey too long
Wrong location
Other

Feedback can improve:

ranking,
provider quality monitoring,
route validation.
98. Future AI Layer

AI can enhance Yatrai but must not replace deterministic journey validation.

AI can be used for:

natural-language understanding,
intent extraction,
explanations,
conversational planning,
preference understanding.

Deterministic systems should handle:

availability,
schedules,
time calculations,
budget validation,
transfer validation,
route feasibility.

Architecture:

AI
 ↓
Understand User Intent
 ↓
Structured Request
 ↓
Deterministic Journey Engine
 ↓
Verified Results
 ↓
AI
 ↓
Natural Explanation

The AI should not invent transportation results.

99. Production Architecture Evolution
Phase 1 — MVP
Frontend
    ↓
Modular Backend
    ↓
Provider Adapters
    ↓
Database
    ↓
Cache
Phase 2 — Scale
Frontend
    ↓
API Gateway
    ↓
Journey Service
    ↓
Provider Service
    ↓
Route Engine
    ↓
Ranking Engine
Phase 3 — Advanced Platform
                    API Gateway
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
 Journey Service   Location Service   User Service
       │                 │                 │
 Provider Service   Geo Service      Preferences
       │
 Route Engine
       │
 Ranking Engine
       │
 Booking Service
       │
 Notification Service
       │
 Analytics Platform

Services should only be separated when scale or ownership justifies the complexity.

100. Architecture Decision: Modular Monolith First

Yatrai should initially be implemented as a modular monolith rather than immediately adopting microservices.

Reason:

faster development,
simpler deployment,
easier debugging,
lower infrastructure cost,
easier transactions,
simpler local development.

However, strict module boundaries must be maintained so components can later be extracted.

101. Architecture Decision: Provider Abstraction

All transportation providers must be accessed through adapters.

Benefits:

provider replacement,
provider expansion,
easier testing,
reduced coupling,
consistent internal data.
102. Architecture Decision: Dynamic Route Discovery

Routes must be generated dynamically.

Avoid:

Hardcoded route lists
Hardcoded intermediate cities
Hardcoded fallback paths

Use:

Provider data
+
Transportation graph
+
Constraints
+
Feasibility
+
Route algorithms
103. Architecture Decision: Deterministic Core

The critical journey engine should be deterministic and testable.

The system should not depend on an LLM to decide whether:

08:10 arrival

can connect to:

07:50 departure

The feasibility engine must handle this deterministically.

104. Architecture Decision: AI as an Interface Layer

AI should primarily help users communicate with Yatrai.

Example:

User:
"I need to reach Varanasi tomorrow.
I prefer trains but I don't mind a bus if necessary."

AI
 ↓
Structured Constraints
 ↓
Journey Engine
 ↓
Verified Results
 ↓
AI Explanation

This provides both flexibility and correctness.

105. Architecture Decision: Source Transparency

Every time-sensitive journey attribute should have a source.

Example:

{
  "price": {
    "value": 1240,
    "currency": "INR",
    "source": "provider",
    "checkedAt": "2026-09-23T17:00:00Z"
  }
}

This improves trust and debugging.

106. Architecture Decision: Progressive Search

Provider searches should be parallelized where possible.

                    Search
                      │
       ┌──────────────┼──────────────┐
       ↓              ↓              ↓
     Rail            Bus           Flight
       │              │              │
       └──────────────┼──────────────┘
                      ↓
                 Normalization
                      ↓
               Route Discovery

This reduces total latency.

107. Architecture Decision: Observability From Day One

Every search should be traceable.

At minimum:

requestId
searchId
provider
duration
resultCount
error
timestamp

This is essential because Yatrai depends on multiple external providers.

108. Architecture Decision: No Provider Lock-In

Provider-specific code should never leak into the domain layer.

Bad:

if (provider === "X") {
    // business logic
}

Good:

provider.search(request)

Provider-specific behavior belongs inside the adapter.

109. Architecture Decision: Search Result Contract

Every journey returned to the frontend should conform to the same normalized contract.

The frontend should not need to know whether a journey originated from:

Rail Provider A
Rail Provider B
Bus Provider A
Flight Provider A

It should receive:

Normalized Journey
110. Architecture Decision: Provider Data Freshness

Yatrai should classify data as:

Static
Semi-static
Dynamic
Real-time

Examples:

Station metadata → Static
Schedule → Semi-static
Price → Dynamic
Availability → Real-time/Dynamic
Delay → Real-time

Caching policy should be based on this classification.

111. Architecture Decision: Security by Default

Security should not be added after the system is built.

From the beginning:

secrets are externalized,
APIs are authenticated where required,
inputs are validated,
requests are rate limited,
logs are sanitized,
dependencies are scanned,
sensitive data is encrypted.
112. Architecture Decision: API-First

The core journey engine should be accessible through a well-defined API.

This allows future clients:

Web
Mobile
Partner Applications
Travel APIs
Internal Tools

to use the same journey intelligence platform.

113. Future Platform Architecture

Long-term Yatrai could evolve from an application into a journey intelligence platform.

                 YATRAI PLATFORM
                       │
        ┌──────────────┼──────────────┐
        │              │              │
      Web            Mobile          API
        │              │              │
        └──────────────┼──────────────┘
                       │
                Journey Intelligence
                       │
        ┌──────────────┼──────────────┐
        │              │              │
     Search          Routing       Ranking
        │              │              │
        └──────────────┼──────────────┘
                       │
              Provider Ecosystem

Potential future customers:

travelers,
travel companies,
universities,
corporate travel systems,
mobility platforms,
travel agencies.
114. End-to-End Architecture Example

User enters:

"I need to reach Varanasi from Delhi tomorrow.
I prefer train, but I can take a bus if there isn't a direct train."

System:

1. Frontend receives input
        ↓
2. API receives request
        ↓
3. Intent Parser extracts requirements
        ↓
4. Location Resolver resolves Delhi + Varanasi
        ↓
5. Constraint Engine creates:
       Preferred = Train
       Fallback = Bus
       Destination = Varanasi
        ↓
6. Journey Orchestrator starts provider searches
        ↓
7. Rail Provider returns direct results
        ↓
8. Bus Provider returns results
        ↓
9. Journey Normalizer converts responses
        ↓
10. Graph Builder creates transportation graph
        ↓
11. Route Engine discovers direct routes
        ↓
12. Route Engine discovers alternative routes
        ↓
13. Feasibility Engine validates transfers
        ↓
14. Hard constraints are enforced
        ↓
15. Ranking Engine ranks valid journeys
        ↓
16. Explanation Engine generates factual explanations
        ↓
17. API returns normalized journeys
        ↓
18. Frontend displays journey cards
        ↓
19. User selects journey
        ↓
20. Journey detail page opens
        ↓
21. User continues to provider booking
115. Example Alternative Route Architecture

Suppose:

Delhi → Varanasi

has no suitable direct train.

The route engine may discover:

Delhi
  ↓
Kanpur
  ↓
Varanasi

and:

Delhi
  ↓
Prayagraj
  ↓
Varanasi

and:

Delhi
  ↓
Prayagraj
  ↓
Bus
  ↓
Varanasi

The system evaluates each route:

Route
 ↓
Time
 ↓
Cost
 ↓
Transfers
 ↓
Availability
 ↓
Constraints
 ↓
Practicality

Only feasible routes reach ranking.

116. What Must Never Be Hardcoded

The following must not be hardcoded into the core journey engine:

Specific fallback cities
Specific alternative routes
Specific train combinations
Specific bus combinations
Specific provider results
Specific availability
Specific prices
Specific schedules

Allowed configuration:

Maximum search depth
Maximum transfer count
Provider timeout
Minimum transfer time
Cache TTL
Feature flags
Ranking weights

These should be configurable rather than buried inside business logic.

117. Non-Functional Requirements

Yatrai should target:

Reliability

The application should remain usable when individual providers fail.

Performance

Journey searches should return useful results quickly.

Scalability

The architecture should support increasing users and providers.

Security

User and provider data must be protected.

Maintainability

Business logic should remain modular and testable.

Extensibility

New transportation modes should be addable without rewriting the system.

Observability

Search failures should be diagnosable.

Accessibility

The UI should remain usable by a broad range of users.

118. Architecture Success Criteria

The architecture is considered successful when:

 New providers can be added through adapters.
 Provider failures do not crash the search system.
 No route-specific hardcoding exists in the route engine.
 Locations are dynamically resolved.
 Transportation data is normalized.
 Routes are dynamically discovered.
 Multimodal journeys can be constructed.
 Hard constraints are enforced.
 Soft preferences influence ranking.
 Transfers are validated.
 Time-dependent schedules are supported.
 Journey results are explainable.
 Search requests are observable.
 API contracts are versioned.
 Sensitive credentials remain server-side.
 The system can scale horizontally.
 The initial implementation can operate as a modular monolith.
 Future services can be extracted without rewriting the domain.
 AI cannot fabricate journey availability.
 Live provider information is treated as time-sensitive.
 The frontend remains independent of provider-specific formats.
119. Architecture North Star

Yatrai should not be built as:

Travel Search Website
+
Some AI
+
Hardcoded Alternatives

It should be built as:

                  USER GOAL
                      │
                      ▼
              INTENT UNDERSTANDING
                      │
                      ▼
              LOCATION RESOLUTION
                      │
                      ▼
                CONSTRAINTS
                      │
                      ▼
             TRANSPORTATION DATA
                      │
                      ▼
              JOURNEY GRAPH
                      │
                      ▼
             ROUTE DISCOVERY
                      │
                      ▼
              FEASIBILITY
                      │
                      ▼
                 RANKING
                      │
                      ▼
              HUMAN EXPLANATION
                      │
                      ▼
              PRACTICAL JOURNEY
120. Final Architecture Statement

Yatrai is a provider-agnostic, constraint-aware, multimodal journey intelligence platform that dynamically discovers practical paths through a time-dependent transportation network.

The architecture must preserve the core Yatrai philosophy:

The user defines the destination. Yatrai figures out the route.

And the system must always prioritize:

Real Data
    +
Dynamic Discovery
    +
Deterministic Feasibility
    +
Intelligent Ranking
    +
Clear Human Experience
One Goal.
Every Route.

---

# 121. Phase 9 — Frontend Foundation Architecture

## 121.1 Overview & Responsibilities
Phase 9 establishes the first usable consumer interface for Yatrai. The frontend serves strictly as a **consumer of the backend journey orchestrator pipeline**, never a second journey engine.

```text
┌────────────────────────────────────────────────────────┐
│                        FRONTEND                        │
│                                                        │
│  HomePage (/)         ──► SearchForm                   │
│  ResultsPage (/results)──► JourneyResultCard           │
│                            JourneyLeg                  │
│                            RankingSelector             │
│  States: Idle | Loading | Success | Empty | Error      │
└───────────────────────────┬────────────────────────────┘
                            │
                    POST /api/journeys/search
                    { origin, destination, departureDate, ranking }
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        BACKEND                         │
│  Location Resolver  ──► Provider Gateway               │
│  Normalizer         ──► Deduplication                  │
│  Ranking Engine     ──► Canonical Journey Envelope     │
└────────────────────────────────────────────────────────┘
```

## 121.2 Route Architecture & URL State
- `/`: Home discovery page hosting primary `SearchForm` (From, To, Date, Find Routes).
- `/results?from=Sonipat&to=Patna&date=2026-10-01&ranking=overall`: Dedicated Results page.
- URL Query Parameters synchronize with browser History API (`pushState` and `popstate`), ensuring:
  - Deep-linkable search queries
  - Page refresh persistence
  - Browser Back/Forward navigation preserving input state
- No external routing dependency is required.

## 121.3 Explicit State Machine
The client encapsulates five distinct states via `useJourneySearch`:
1. `idle`: Fresh application or empty search inputs.
2. `loading`: Active API search; buttons disabled with spinner, calm skeleton cards displayed.
3. `success`: One or more canonical journeys returned.
4. `empty`: Search succeeded (HTTP 200) with 0 journeys; helpful suggestions displayed.
5. `error`: Network failure or validation error; safe user-facing message with [ Try Again ] and [ Modify Search ].

## 121.4 Backend Ranking Authority
The frontend NEVER sorts journeys in React. Selecting ranking strategies (`overall`, `fastest`, `cheapest`, `fewest_transfers`, `most_convenient`) delegates directly to `POST /api/journeys/search` with the requested strategy, preserving the backend ranking engine as the single source of truth.

## 121.5 Strict Phase 10 Boundary
Phase 9 excludes user profiles, notifications, booking flows, payments, maps, and natural language AI search. Those belong to future phases.

---

# 122. Phase 10 — Journey Results + Filtering Architecture

## 122.1 Overview & Architecture Boundary
Phase 10 elevates the results experience into a production-grade comparison interface. It introduces pure client-side filtering over canonical journeys returned by the Phase 8 orchestrator, without querying providers or recalculating ranking scores.

```text
Backend Discovery (Phase 8)
       │
       ▼
Canonical Journey Envelope
       │
       ▼
Frontend Results (Phase 9)
       │
       ▼
Pure Client Filtering (`filterJourneys`)
       │
       ├── Price Range (min/max numeric)
       ├── Max Duration (minutes)
       ├── Transfers (Any, Direct, 1, 2+)
       ├── Transport Modes (Train, Bus, Flight, Road)
       └── Departure Time (Early Morning, Morning, Afternoon, Evening)
       │
       ▼
Filtered Journey Cards (`JourneyResultCard`)
       │
       ├── Compact Leg Breakdown (e.g. 🚗 Sonipat → Delhi · 🚆 Delhi → Patna)
       └── [ View Journey ] Modal (`JourneyDetailModal`)
```

## 122.2 Pure Filter Utility Contract
- **Function:** `filterJourneys(journeys, filters)` located in `client/src/utils/journeyFilters.js`.
- **Invariants:**
  - Deterministic and pure; never mutates input arrays.
  - Zero external API dependencies.
  - Separate state from backend results: clearing filters restores original candidate set instantly without network roundtrips.
  - Dynamic dataset-derived bounds: min/max prices and durations are derived directly from the search result set via `deriveFilterBounds(journeys)`.

## 122.3 Distinct Empty States
- **Backend-Empty State:** Occurs when the journey search discovers 0 routes on the given corridor/date (handled by `EmptyState`).
- **Filter-Empty State:** Occurs when backend returned valid journeys, but the user's active filter criteria eliminated all of them (handled by `FilterEmptyState` with an immediate `[ Clear Filters ]` recovery action).

## 122.4 Journey Inspection ("View Journey")
- Triggered by `[ View Journey ]` button on each card.
- Renders `JourneyDetailModal` with full canonical itinerary, departure/arrival schedules, transfer connections, and transport operators.
- Zero credential exposure, raw database IDs, or payment/booking forms.

## 122.5 Strict Phase 11 Boundary
Phase 10 is strictly restricted to Journey Results and Filtering. Booking flows, payments, user accounts, and notifications remain strictly in future phases.

---

# 123. Phase 11 — Natural Language Search + Deterministic Search Execution

## 123.1 Fundamental Architectural Invariant
```text
                    USER
                      │
                      ▼
             Natural Language
                      │
                      ▼
               Parser / LLM
                      │
                      ▼
          Structured SearchRequest
                      │
                      ▼
            Deterministic Validation
                      │
                      ▼
            Location Resolution
                      │
                      ▼
          Journey Orchestrator
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
        Rail         Bus       Flight/Road
          │           │           │
          └───────────┼───────────┘
                      ▼
                 Normalizer
                      │
                      ▼
                Deduplication
                      │
                      ▼
                   Ranking
                      │
                      ▼
                Journey Results
                      │
                      ▼
              Phase 10 UI/Filters
```

> **CRITICAL RULE:**
> **THE LLM MUST NEVER DIRECTLY SEARCH TRANSPORT PROVIDERS.**
> The LLM interprets the user's travel intent into a structured `SearchRequest`.
> The deterministic Yatrai backend executes the resulting structured request.
> The LLM never crosses the boundary into provider APIs, databases, journey ranking, journey generation, booking, or payments.

## 123.2 Components and Responsibilities

### 1. `NaturalLanguageParser` (`server/src/services/naturalLanguage/naturalLanguageParser.js`)
- Sanitizes incoming query strings against length and content constraints.
- Injects deterministic contextual reference dates (`YYYY-MM-DD`) and timezone (`Asia/Kolkata`).
- Calls the model provider adapter (`ModelAdapter`).
- Validates model output using the two-stage parser schema.
- Flags missing fields (`origin`, `destination`, `departureDate`) for clarification without executing searches prematurely.

### 2. `ModelAdapter` (`server/src/services/naturalLanguage/modelAdapter.js`)
- Abstract adapter supporting LLM providers (Google Gemini / Anthropic / OpenAI) via environment configuration.
- Includes a deterministic, offline-capable intent parser for testing and environments where LLMs are unreachable.
- Applies strict non-location stopword pruning to avoid misidentifying pronouns/verbs as stations.

### 3. `DateResolver` (`server/src/services/naturalLanguage/dateResolver.js`)
- Resolves relative temporal terms (`today`, `tomorrow`, `day after tomorrow`, `next monday`, etc.) against explicit reference date and timezone context.
- Returns canonical `YYYY-MM-DD` strings.

### 4. `TimeWindowResolver` (`server/src/services/naturalLanguage/timeWindowResolver.js`)
- Maps natural time expressions to canonical windows:
  - `early_morning`: 00:00 → 06:00
  - `morning`: 06:00 → 12:00
  - `afternoon`: 12:00 → 17:00
  - `evening`: 17:00 → 21:00
  - `night`: 21:00 → 24:00

### 5. `ParserSchema` (`server/src/services/naturalLanguage/parserSchema.js`)
- **Stage 1 (Schema Validation):** Validates field types, formats, string lengths, and ranges.
- **Stage 2 (Business Validation):** Ensures origin != destination, dates are non-past, budget is positive, and identifies missing requirements.

### 6. Deterministic Constraint Enforcement (`server/src/orchestration/journeyOrchestrator.js`)
- `maxBudget` constraint: Filters journeys whose total cost exceeds the maximum budget.
- `departureWindow` constraint: Filters journeys whose initial leg departure falls outside the window.
- Applied deterministically before ranking; the LLM never inspects or filters actual journeys.

### 7. Dual Frontend Search Modes (`client/src/pages/HomePage.jsx`)
- Mode Switcher: Users can toggle between **Natural Language** discovery (`NaturalSearchForm`) and **Structured Search** (`SearchForm`).
- Clarification UX: Prompts the traveler directly when critical journey fields are omitted, resuming search once clarified.

---

# 124. Phase 12 — Maps + Journey Route Visualization

## 124.1 Fundamental Architecture
```text
User
 ↓
Natural Language / Structured Search
 ↓
SearchRequest
 ↓
Location Resolver
 ↓
Journey Orchestrator
 ↓
Providers
 ↓
Normalizer
 ↓
Deduplication
 ↓
Ranking
 ↓
Canonical Journey
 ↓
Frontend
 ↓
Map Visualization
```

> **CRITICAL RULE:**
> Mapbox sits **AFTER** the canonical journey has been produced.
> Mapbox is strictly a **VISUALIZATION** layer.
> It must NEVER search transport providers, determine journey alternatives, calculate ranking, replace the journey engine or location resolver, invent coordinates/stops, or determine availability.

## 124.2 Component Architecture (`client/src/components/map/`)
1. **`journeyGeoJson.js`**: Pure, deterministic adapter converting canonical `Journey` and `JourneyLeg` records into GeoJSON `FeatureCollection`s for routes and stops.
   - **Level 1 (Exact Geometry):** If verified route coordinates exist on the leg, renders the actual LineString.
   - **Level 2 (Verified Stop Connection):** Connects verified canonical origin/destination endpoints with a clear connection visualizer without falsely claiming it is physical road geometry.
   - **Level 3 (Missing Coordinates):** Gracefully returns empty geometry and triggers topological fallback without crashing.
2. **`mapUtils.js`**: Pure utilities for coordinate validation (longitude: -180 to 180, latitude: -90 to 90), dynamic bounding-box calculation (`calculateBounds`), and transport-mode color/dash tokens following the Yatrai Design System.
3. **`JourneyMap.jsx`**: Mapbox GL JS component with lifecycle cleanup, auto-fitting bounds, mode-styled vector line layers, interactive stop popups, and click-to-highlight leg synchronization.
4. **`SchematicRouteFallback.jsx`**: High-fidelity topological fallback visualizer that renders if Mapbox GL JS is unsupported, WebGL is disabled, or a Mapbox access token is unconfigured.
5. **`JourneyDetailModal.jsx`**: Top-half journey route visualization paired with interactive step-by-step itinerary leg selection.

## 124.3 Fault Isolation & Resilience Invariant
```text
Journey Data
     │
     ├──────────────► Journey Details
     │
     └──────────────► Map Visualization
                            │
                            └── can fail independently
```
Map failure never breaks journey discovery, results viewing, or leg inspection.

---

# 125. Phase 13 — User Features (Profile, Saved Journeys, Recent Searches, Favorite Routes, Journey History)

## 125.1 Fundamental Architecture
```text
User
 ↓
Authentication (Phase 2 JWT / HTTP-only Refresh Token)
 ↓
Authenticated Request (authenticate middleware -> req.user.id)
 ↓
User-owned Feature
 ├── Profile           -> GET /api/users/me (strips passwordHash)
 ├── Saved Journeys    -> POST/GET/DELETE /api/saved-journeys (references canonical Journey)
 ├── Recent Searches   -> POST/GET/DELETE /api/searches/recent (persists SearchRequest snapshot)
 ├── Favorite Routes   -> POST/GET/DELETE /api/favorite-routes (Origin -> Destination pairs)
 └── Journey History   -> POST/GET/DELETE /api/journey-history (viewed journeys log)
 ↓
Database (MongoDB scoped strictly by user: req.user.id)
 ↓
Frontend (Client-side user hub with 1-click Search Again & Mapbox details)
```

> **CRITICAL SECURITY INVARIANT:**
> All user-owned data is scoped to the authenticated user via verified tokens (`req.user.id`).
> The frontend never supplies user IDs for authorization.
> Database unique constraints protect `(user, journey)` and `(user, origin, destination)` invariants.
> IDOR protection ensures User B can never read, modify, or delete User A's resources.

## 125.2 Models & Database Schema
1. **`SavedJourney` (`server/src/models/SavedJourney.js`)**
   - References canonical `User` and `Journey` by ObjectId.
   - Unique compound index on `{ user: 1, journey: 1 }`.
   - Never duplicates entire journey documents.
2. **`RecentSearch` (`server/src/models/RecentSearch.js`)**
   - Preserves canonical `SearchRequest` snapshots (`origin`, `destination`, `departureDate`, `ranking`, `maxBudget`, etc.).
   - Indexes on `{ user: 1, searchedAt: -1 }` and compound index on `{ user: 1, origin: 1, destination: 1, departureDate: 1 }`.
   - Automatically collapses duplicate queries and trims excess past 20 records.
3. **`FavoriteRoute` (`server/src/models/FavoriteRoute.js`)**
   - Represents an origin → destination corridor pair.
   - Unique compound index on `{ user: 1, origin: 1, destination: 1 }`.
4. **`JourneyHistory` (`server/src/models/JourneyHistory.js`)**
   - Represents viewed travel itineraries.
   - Compound index on `{ user: 1, journey: 1 }` (unique) and `{ user: 1, viewedAt: -1 }`.
   - Repeatedly inspecting a journey updates `viewedAt` and moves the record to the top.

## 125.3 Service & API Layer
- **`userService` (`server/src/services/userService.js`)**: Safe profile retrieval stripping passwords and internal security fields.
- **`savedJourneyService` (`server/src/services/savedJourneyService.js`)**: Save, check, list, and delete saved journeys with populated canonical journeys and sequential legs.
- **`recentSearchService` (`server/src/services/recentSearchService.js`)**: Record, list, remove, and clear search requests with duplicate collapsing and 20-item retention.
- **`favoriteRouteService` (`server/src/services/favoriteRouteService.js`)**: Add, list, remove, and check favorite routes.
- **`journeyHistoryService` (`server/src/services/journeyHistoryService.js`)**: Record inspection, list, and clear viewed journey history.

## 125.4 Frontend Integration
- **`ProfilePage.jsx`**: Traveler summary, verified status, member tenure, and quick navigation.
- **`SavedJourneysPage.jsx`**: Displays bookmarked trips using canonical `JourneyResultCard` and detail modal with Mapbox.
- **`RecentSearchesPage.jsx`**: Displays recent searches with 1-click `[ Search Again ]` button restoring search state.
- **`FavoriteRoutesPage.jsx`**: Displays favorite corridors with 1-click `[ Search Route ]` button and corridor creator.
- **`JourneyHistoryPage.jsx`**: Displays previously viewed journeys with timestamps and modal review.
- **`MainLayout.jsx`**: Top header navigation with active tabs, authenticated user avatar pill, sign in/out, and mobile drawer.



