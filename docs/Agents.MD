

## 1. Project Identity

Yatrai is a production-grade journey discovery and recovery platform.

### Core Product Idea

> **One Goal. Every Route.**

Yatrai helps users reach a destination even when their preferred journey is unavailable, sold out, delayed, disconnected, or otherwise disrupted.

The system should not think only in terms of:

> "Find a train from A to B."

It should think in terms of:

> "The user wants to reach B from A. Find the best feasible way to accomplish that goal."

For example:

- User wants to travel from Delhi to Varanasi.
- Direct train is unavailable.
- Yatrai should search for viable alternatives such as:
  - Delhi → Prayagraj → Varanasi
  - Delhi → Lucknow → Varanasi
  - Delhi → Kanpur → Varanasi
  - Train + Bus
  - Train + Flight
  - Bus + Train
  - Other valid combinations

The system must discover alternatives dynamically rather than relying on hardcoded routes.

---

# 2. Agent Mission

Every coding agent working on Yatrai must prioritize:

1. Correctness
2. Reliability
3. Real-world usefulness
4. Maintainability
5. Extensibility
6. Performance
7. Security
8. Accessibility
9. Premium UX
10. Production readiness

Agents must behave as engineers working on a real travel infrastructure product, not as code generators producing isolated demos.

---

# 3. Non-Negotiable Product Principles

## 3.1 Destination Is the Goal

Never optimize exclusively for the requested transport mode.

If the user asks:

> "Take me to Varanasi by train."

The system should first attempt train-based journeys.

If the preferred train journey is unavailable, the system should intelligently search for alternatives while preserving the user's destination.

---

## 3.2 Never Hardcode Journey Solutions

Do not create logic such as:

```js
if (from === "Delhi" && to === "Varanasi") {
    return "Delhi → Prayagraj → Varanasi";
}

This is prohibited.

Journey alternatives must be generated from:

Provider data
Station/location data
Transport availability
Route connectivity
Timetables
Travel duration
Transfer constraints
User preferences
Real-time availability where supported
3.3 Provider-Agnostic Architecture

Yatrai must not depend directly on one transport provider.

The architecture must support:

Road Provider
Rail Provider
Bus Provider
Flight Provider

Additional providers should be addable without rewriting the journey engine.

4. Core Architecture

The conceptual architecture is:

                    USER
                      │
                      ▼
          Natural Language Input
                      │
                      ▼
             Intent / Query Parser
                      │
                      ▼
              Location Resolver
                      │
                      ▼
             Journey Orchestrator
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
       Rail        Road/Bus     Flight
      Provider     Providers    Provider
          │           │           │
          └───────────┼───────────┘
                      ▼
              Journey Normalizer
                      │
                      ▼
              Journey Graph/Pool
                      │
                      ▼
               Ranking Engine
                      │
                      ▼
          Recommendation Generator
                      │
                      ▼
                User Interface
5. Core System Components

Agents should preserve clear separation between these responsibilities.

5.1 Natural Language Parser

Responsible for extracting:

Origin
Destination
Date
Time
Transport preference
Passenger count
Budget
Maximum transfers
Accessibility requirements
User preferences
Flexible dates/times
Other journey constraints

Example:

"Find me a train from Delhi to Varanasi tomorrow evening"

Should become conceptually:

{
  "origin": "Delhi",
  "destination": "Varanasi",
  "date": "tomorrow",
  "timeWindow": "evening",
  "preferredMode": "rail"
}

Do not mix parsing logic with route generation.

6. Location Resolution

User-entered locations must be resolved into canonical geographic entities.

Examples:

Delhi
New Delhi
NDLS
New Delhi Railway Station

may refer to different entities depending on context.

The resolver should distinguish:

City
Airport
Railway station
Bus terminal
Exact coordinates
Transit stop
Neighborhood
Landmark

Never assume that a string is automatically a station or city.

7. Journey Orchestrator

The Journey Orchestrator is responsible for coordinating providers.

It should:

Understand the journey request.
Determine applicable providers.
Query providers.
Collect candidate journeys.
Handle failures.
Generate alternative combinations.
Normalize results.
Send candidates to ranking.
Return explainable recommendations.

The orchestrator should not contain provider-specific implementation details.

8. Provider Interface

All providers should implement a consistent interface.

Conceptually:

interface TransportProvider {
  search(request: JourneyRequest): Promise<ProviderResult>;
  getDetails(id: string): Promise<JourneyDetails>;
  getAvailability?(request: AvailabilityRequest): Promise<AvailabilityResult>;
}

The exact implementation may evolve, but the abstraction must remain stable.

9. Provider Rules

A provider must:

Validate input.
Handle API failures.
Handle timeouts.
Normalize provider-specific errors.
Respect rate limits.
Never expose provider credentials.
Return normalized data.
Log useful diagnostic information.
Avoid leaking sensitive data.

Provider-specific response formats must not leak into the rest of the application.

10. Journey Normalization

Different providers return different structures.

Yatrai must convert them into a canonical journey model.

Example:

interface Journey {
  id: string;

  origin: Location;
  destination: Location;

  departureTime: Date;
  arrivalTime: Date;

  durationMinutes: number;

  segments: JourneySegment[];

  transfers: Transfer[];

  totalPrice?: Money;

  currency?: string;

  modes: TransportMode[];

  availability?: Availability;

  providerReferences: ProviderReference[];
}

The normalized model is the internal contract of the journey engine.

11. Journey Segments

A journey may contain multiple segments.

Example:

Delhi
  ↓
Train
  ↓
Prayagraj
  ↓
Train
  ↓
Varanasi

Each segment should contain:

Origin
Destination
Departure
Arrival
Transport mode
Provider
Service identifier
Duration
Price
Availability
Transfer information
12. Multi-Modal Journeys

Yatrai must support combinations such as:

Train → Train
Train → Bus
Train → Flight
Bus → Train
Flight → Train
Bus → Flight
Flight → Bus
Road → Rail

Do not restrict the journey engine to single-mode journeys.

13. Alternative Route Discovery

When the requested journey is unavailable:

Preserve the destination.
Preserve the origin.
Preserve explicit user constraints.
Relax only constraints that are allowed to be relaxed.
Search nearby hubs.
Search connecting services.
Construct valid multi-segment journeys.
Validate transfer feasibility.
Rank candidates.
Explain why the alternative is being shown.

Example:

Requested:
Delhi → Varanasi
Mode:
Train

Unavailable:
Direct train

Alternative:
Delhi → Prayagraj
Train

Prayagraj → Varanasi
Train

The system should explicitly communicate that the direct journey was unavailable and that this is a connecting alternative.

14. Constraints

Journey generation must respect constraints.

Possible constraints include:

interface JourneyConstraints {
  preferredModes?: TransportMode[];

  excludedModes?: TransportMode[];

  maxTransfers?: number;

  maxJourneyDurationMinutes?: number;

  maxBudget?: number;

  preferredDepartureWindow?: TimeWindow;

  preferredArrivalWindow?: TimeWindow;

  accessibilityRequired?: boolean;

  flexibleDate?: boolean;

  flexibleTime?: boolean;
}

Never silently violate explicit user constraints.

15. Constraint Relaxation

Constraints may be relaxed only when the system is explicitly designed to do so.

Example:

Strict:
Train only

Relaxed:
Train + Bus

Relaxed:
Train + Flight

The UI must clearly communicate relaxed constraints.

Never silently change:

Destination
Origin
Travel date
Passenger count
Explicit accessibility requirements
Explicit mode exclusions
16. Ranking Engine

The ranking engine should score journeys using transparent factors.

Potential factors:

Total travel time
Price
Number of transfers
Reliability
Convenience
Waiting time
Walking distance
Mode preference
Availability
Departure suitability
Arrival suitability

Conceptually:

Journey Score =
    timeScore
  + priceScore
  + transferScore
  + convenienceScore
  + preferenceScore
  + availabilityScore

The exact mathematical model may evolve.

Do not hardcode a universal winner.

17. Recommendation Categories

Yatrai may expose categories such as:

Best Overall
Fastest
Cheapest
Fewest Transfers
Most Convenient

These categories must be generated from journey attributes.

Do not manually assign journeys to categories.

18. Explainability

Every recommendation should be explainable.

Example:

Fastest
Arrives 1h 42m earlier than the next available option.

Cheapest
₹640 less than the fastest option.

Fewest Transfers
Direct service with no change required.

Avoid vague AI-generated explanations that are not supported by journey data.

19. AI Usage

LLMs may be used for:

Natural-language understanding
Query interpretation
User-facing explanations
Preference extraction
Conversational journey refinement

LLMs must not be the authoritative source for:

Train availability
Flight availability
Bus schedules
Prices
Departure times
Arrival times
Provider inventory

Real transport data must come from trusted providers.

20. AI Safety Rule

Never allow an LLM to invent:

Routes
Stations
Timetables
Prices
Availability
Provider names
Booking references

If data is unavailable, the system should say that it could not verify it.

21. Search Strategy

The journey engine should use progressive search.

Stage 1

Search direct journeys.

Stage 2

Search same-mode connections.

Stage 3

Search nearby hubs.

Stage 4

Search multimodal combinations.

Stage 5

Expand the search only when required.

This prevents unnecessary provider calls and excessive computation.

22. Search Graph

Journey discovery can be modeled as a graph.

Node:
Location / Station / Airport / Transit Stop

Edge:
Transport service between nodes

Example:

Delhi
 ├── Prayagraj
 │      └── Varanasi
 │
 ├── Lucknow
 │      └── Varanasi
 │
 └── Kanpur
        └── Varanasi

The journey engine should discover paths dynamically.

23. Transfer Validation

A connection is valid only when the transfer is feasible.

The engine must account for:

Arrival time
Departure time
Minimum transfer time
Station changes
Airport changes
Walking time
Local transit time
Delays where data is available

Never recommend impossible connections.

24. Date and Time Handling

Always use timezone-aware date/time handling.

Never rely on:

new Date().toISOString()

as a universal representation for local journey times.

Store canonical timestamps and timezone information.

Travel between time zones must be handled correctly.

25. Currency

Money must be represented using explicit currency.

Example:

{
  amount: 1250,
  currency: "INR"
}

Never assume all prices are INR internally.

26. Availability

Availability must be treated as dynamic.

Possible states:

AVAILABLE
LIMITED
WAITLIST
SOLD_OUT
UNKNOWN

Do not convert UNKNOWN into AVAILABLE.

27. API Reliability

External providers can fail.

Every integration must handle:

Timeout
Rate limiting
Authentication failure
Provider outage
Invalid response
Partial response
Network error
Temporary unavailability

Use:

Timeouts
Retries where appropriate
Exponential backoff
Circuit breakers where justified
Graceful degradation
28. Partial Failure

One provider failing must not necessarily break the entire search.

Example:

Rail Provider:     FAILED
Bus Provider:      SUCCESS
Flight Provider:   SUCCESS
Road Provider:     SUCCESS

Yatrai should still return valid results from available providers.

The UI should communicate partial availability when relevant.

29. Caching

Cache data where appropriate.

Potential cache candidates:

Location resolution
Station metadata
Static provider metadata
Frequently requested routes
Short-lived search results where permitted

Do not cache dynamic availability longer than provider rules allow.

30. Security

Never expose:

API keys
Provider secrets
Database credentials
JWT secrets
Internal service credentials

Never commit secrets to Git.

Use environment variables or a proper secrets manager.

31. Environment Variables

Use environment variables for configuration.

Example:

DATABASE_URL=
REDIS_URL=
MAP_PROVIDER_KEY=
RAIL_PROVIDER_KEY=
BUS_PROVIDER_KEY=
FLIGHT_PROVIDER_KEY=
JWT_SECRET=

Never hardcode production credentials.

32. Frontend Rules

The frontend must:

Be responsive.
Be accessible.
Avoid unnecessary loading states.
Handle empty states.
Handle errors.
Handle partial results.
Preserve user context.
Avoid layout shifts.
Work on mobile and desktop.
33. Yatrai Design Direction

Yatrai should feel like a premium travel technology product.

Design principles:

Modern
Minimal
Sophisticated
Calm
Trustworthy
Fast
Spacious
Data-driven

Avoid:

Generic dashboard aesthetics
Excessive gradients
Excessive glassmorphism
Random animations
Cheap-looking cards
Excessive colors
Unnecessary decorative elements
34. Typography

Preferred typography should prioritize:

Inter
Geist
DM Sans
Manrope

Use a consistent type scale.

Typography should establish clear hierarchy:

Display
Heading
Subheading
Body
Caption
Metadata

Do not use many unrelated fonts.

35. Color System

Use a restrained premium palette.

The UI should have:

Primary brand color
Neutral background
Surface colors
Text hierarchy
Border colors
Success
Warning
Error
Information

Do not introduce arbitrary colors on individual components.

36. Component System

Build reusable components.

Examples:

SearchBar
LocationInput
DatePicker
JourneyCard
JourneyTimeline
SegmentCard
TransferBadge
PriceDisplay
AvailabilityBadge
ProviderLogo
FilterPanel
SortControl
RecommendationCard
MapView
EmptyState
ErrorState
LoadingState

Do not duplicate UI implementations.

37. Journey Card

Journey cards should clearly communicate:

Departure
Arrival
Duration
Transfers
Modes
Price
Availability
Provider
Recommendation reason

The user should understand the journey without opening a separate details page.

38. Loading States

Use meaningful skeleton states.

Avoid displaying:

Loading...

for long periods without context.

Better:

Searching trains...
Checking connecting routes...
Finding alternatives...
Comparing available journeys...

Only display states that correspond to actual system operations.

39. Error States

Errors should be actionable.

Bad:

Something went wrong.

Better:

We couldn't retrieve train availability right now.

You can retry the rail search or continue with bus and flight options.

Do not expose internal stack traces to users.

40. Empty States

An empty result is not necessarily an error.

Example:

No direct trains found.

We found 6 connecting journeys through nearby hubs.

If no valid journey exists:

No feasible journey was found for these constraints.

Try:
• A different departure time
• Flexible travel date
• More transfer options
• Another transport mode
41. Accessibility

Follow WCAG principles.

Ensure:

Keyboard navigation
Semantic HTML
Sufficient contrast
Focus states
Screen-reader labels
Accessible forms
Reduced-motion support
Accessible error messages

Do not rely on color alone.

42. Mobile UX

Mobile is a first-class experience.

Journey search should be easy with one hand.

Important controls should remain accessible.

Avoid extremely dense journey cards.

Filters should use a mobile-friendly interaction such as a bottom sheet where appropriate.

43. State Management

Keep state ownership close to where it is used.

Do not introduce global state for simple local UI state.

Use global state only when the state genuinely needs cross-application access.

Separate:

Server state
UI state
Session state
User preferences
Search state
44. API Design

APIs should be:

Versioned where appropriate
Predictable
Validated
Documented
Typed
Secure

Example:

POST /api/v1/journeys/search

Request:

{
  "origin": "...",
  "destination": "...",
  "departureDate": "...",
  "preferences": {}
}

Response:

{
  "requestId": "...",
  "journeys": [],
  "metadata": {}
}
45. Validation

Validate input at boundaries.

Validate:

Request body
Query parameters
Provider responses
Database writes
External API responses

Never trust external data.

Use schema validation where practical.

46. Logging

Logs should help diagnose production problems.

Useful fields:

requestId
userId
provider
searchId
duration
status
errorCode
timestamp

Never log:

Passwords
API keys
Authentication tokens
Payment information
Sensitive personal information
47. Observability

Production systems should expose meaningful metrics.

Track:

Search success rate
Provider success rate
Provider latency
Search latency
Journey generation count
Alternative route usage
No-result rate
Error rate
Cache hit rate

Monitoring should help identify bottlenecks before users report them.

48. Testing

Every significant feature should have tests.

Minimum levels:

Unit Tests
Integration Tests
API Tests
Provider Tests
Journey Engine Tests
Frontend Component Tests
End-to-End Tests

Critical logic must not depend only on manual testing.

49. Test Cases for Journey Discovery

At minimum test:

Direct Journey
A → B
No Direct Journey
A → C → B
Multi-Modal
A → C by Train
C → B by Bus
No Results
No valid route
Provider Failure
Rail provider unavailable
Bus provider available
Transfer Failure
Arrival: 18:00
Departure: 18:05
Minimum transfer: 20 min

Result:
Invalid connection
50. Coding Standards

Prefer:

TypeScript
Strong typing
Small functions
Clear names
Single responsibility
Explicit error handling
Reusable abstractions

Avoid:

Huge functions
Deep nesting
Duplicate logic
Magic numbers
Magic strings
Unused dependencies
Dead code
Temporary hacks in production paths
51. Hardcoded Data Policy

Hardcoded data is acceptable only for:

UI constants
Design tokens
Development fixtures
Test data
Static configuration that genuinely does not change

Hardcoded transport routes, prices, schedules, availability, and provider results are prohibited in production logic.

52. Database Rules

Database models should represent domain concepts clearly.

Potential entities:

User
Location
Station
Provider
JourneySearch
Journey
JourneySegment
ProviderReference
SavedJourney
UserPreference
SearchHistory

Avoid storing provider-specific structures directly as the primary domain model.

Provider raw responses may be stored separately when useful for debugging or auditing.

53. API Response Contract

Do not make frontend components depend on undocumented provider fields.

The backend should expose normalized domain data.

Bad:

journey.irctc.trainDetails.trainNumber

Better:

journey.segments[0].service.number

The frontend should not know which provider generated the normalized object unless it needs to display that information.

54. Feature Development Workflow

Before implementing a feature:

Step 1 — Understand

Read:

PRD
Architecture
Design System
Existing code
Relevant tests
Step 2 — Identify Impact

Determine:

Frontend changes
Backend changes
Database changes
API changes
Provider changes
Tests
Documentation
Step 3 — Design

Define:

Data flow
Interfaces
Error cases
Loading states
Empty states
Security implications
Step 4 — Implement

Make the smallest coherent change.

Step 5 — Test

Run relevant tests.

Step 6 — Review

Check for:

Regressions
Hardcoded logic
Duplicate code
Security issues
Accessibility issues
Performance problems
Step 7 — Document

Update documentation when architecture, behavior, or APIs change.

55. Existing Code Preservation

Do not rewrite working systems unnecessarily.

Before modifying code:

Understand the current implementation.
Identify why the change is required.
Preserve existing behavior unless intentionally changing it.
Avoid unrelated refactoring.

Do not replace an entire module just to implement a small feature.

56. Dependency Policy

Before adding a dependency, determine:

Why it is required.
Whether existing dependencies can solve the problem.
Maintenance status.
Bundle impact.
Security implications.
License compatibility.

Do not add libraries for trivial functionality.

57. Performance

Performance should be considered at every layer.

Frontend:

Lazy loading
Code splitting
Image optimization
Virtualization where necessary
Minimal re-renders

Backend:

Parallel provider requests where safe
Caching
Connection pooling
Timeouts
Efficient queries

Journey engine:

Search pruning
Transfer validation
Search limits
Candidate deduplication
Ranking only viable candidates
58. Deduplication

The same journey may appear from multiple providers or search paths.

Yatrai should deduplicate journeys using stable journey identity.

Do not display:

Delhi → Varanasi
Train A
Delhi → Varanasi
Train A
Delhi → Varanasi
Train A

as separate recommendations unless there is a meaningful difference.

59. Search Request Identity

Every search should have a unique identifier.

Example:

searchId
requestId

These IDs should help correlate:

Frontend request
Backend request
Provider calls
Journey generation
Errors
Analytics
60. Analytics

Analytics must focus on product behavior rather than unnecessary personal data.

Useful events:

search_started
search_completed
journey_viewed
journey_saved
journey_shared
alternative_viewed
filter_applied
provider_failure
no_results

Do not collect sensitive information without a legitimate product reason.

61. Privacy

Collect only the data required to provide the service.

Protect:

Location information
Travel history
User identity
Saved journeys
Payment information
Authentication information

Follow applicable privacy requirements.

62. Authentication

Authentication must be separated from journey discovery.

A user should be able to search journeys without unnecessary authentication barriers where product requirements allow it.

Authenticated functionality may include:

Saved journeys
Preferences
History
Alerts
Profile
63. Booking Boundary

Yatrai is primarily a journey discovery and orchestration platform.

If booking is introduced:

Search
  ↓
Journey selection
  ↓
Provider handoff / booking integration
  ↓
Booking confirmation

Do not claim a journey is booked unless the provider confirms the booking.

64. External Provider Truth

Provider data is authoritative for provider-specific facts.

If Yatrai's cached data conflicts with live provider data:

Live provider data
        >
Cached Yatrai data

when the provider's terms and integration permit real-time verification.

65. Documentation Files

The repository should maintain:

README.md
PRD.md
DESIGN_SYSTEM.md
ARCHITECTURE.md
AGENTS.md

When functionality changes substantially, update the relevant documentation.

66. Documentation Consistency

The following documents have different responsibilities:

README.md

What Yatrai is and how to run it.

PRD.md

What Yatrai must do.

DESIGN_SYSTEM.md

How Yatrai should look and behave visually.

ARCHITECTURE.md

How Yatrai is technically structured.

AGENTS.md

How engineers and AI agents should modify the project.

Do not duplicate entire documents into one another.

67. Git Rules

Use meaningful commits.

Examples:

feat: add journey normalization layer
feat: add rail provider adapter
fix: validate minimum transfer time
fix: handle provider timeout
refactor: separate ranking engine
test: add multimodal journey cases
docs: update architecture

Avoid:

update
changes
final
new
fix stuff
68. Pull Request Expectations

Every substantial change should describe:

What changed
Why it changed
How it works
Tests performed
Known limitations

For UI changes, include screenshots when appropriate.

69. Agent Change Discipline

An AI agent must not:

Invent APIs
Invent provider capabilities
Invent availability
Invent pricing
Delete working functionality without reason
Rewrite unrelated modules
Add unnecessary dependencies
Ignore existing architecture
Hide errors
Suppress tests just to make them pass

If the existing architecture is flawed, explain the flaw and propose the smallest safe architectural correction.

70. Handling Uncertainty

If the agent does not know:

Provider API behavior
Existing project structure
Database schema
Expected response format
Business rule

it must inspect the relevant code/documentation first.

Never guess when the information can be verified.

71. Breaking Changes

Before making a breaking change, identify:

Affected API
Affected frontend
Affected providers
Affected database
Affected tests
Affected documentation
Migration requirements

Prefer backwards-compatible changes where practical.

72. Error Handling Philosophy

Errors should be:

Detected
Classified
Logged
Recovered where possible
Communicated clearly

Never use:

catch (error) {
  console.log(error);
}

as the only error strategy for production-critical code.

73. Security Review Before Production

Before production deployment, verify:

Authentication
Authorization
Input validation
Rate limiting
Secret management
CORS
HTTPS
Dependency vulnerabilities
Database security
Provider credential security
Logging privacy
74. Deployment

Production deployment should be reproducible.

Avoid environment-specific manual fixes.

The deployment process should clearly define:

Build
Environment variables
Database
Migrations
Health checks
Monitoring
Rollback
75. Health Checks

Services should expose health information where appropriate.

Example:

GET /health

The health check should distinguish between:

Application alive
Database available
Critical dependencies available

Do not report the application as fully healthy when critical dependencies are unavailable.

76. Production Readiness Checklist

Before considering a feature production-ready:

[ ] Requirements implemented
[ ] Error states handled
[ ] Loading states handled
[ ] Empty states handled
[ ] Validation implemented
[ ] Tests written
[ ] Security reviewed
[ ] Performance reviewed
[ ] Accessibility reviewed
[ ] Logging added
[ ] Documentation updated
[ ] No hardcoded production data
[ ] No secrets committed
[ ] Mobile UI verified
[ ] Desktop UI verified
77. Product Quality Bar

Yatrai should not feel like:

A route-search demo

It should feel like:

A journey intelligence platform.

The product should help users answer:

"How can I actually get there?"

rather than merely:

"Is there a direct route?"

78. Core User Experience

The ideal experience is:

User expresses destination
        ↓
Yatrai understands intent
        ↓
Yatrai resolves locations
        ↓
Yatrai searches available transport
        ↓
Yatrai discovers direct journeys
        ↓
If unavailable:
Yatrai discovers alternatives
        ↓
Yatrai validates connections
        ↓
Yatrai compares journeys
        ↓
Yatrai explains trade-offs
        ↓
User chooses a journey
79. Example End-to-End Scenario

User:

"I need to reach Varanasi from Delhi tomorrow.
I prefer train and want to leave after 6 PM."

System:

1. Parse request
2. Resolve Delhi
3. Resolve Varanasi
4. Resolve date
5. Apply departure constraint
6. Search rail
7. Check direct services
8. If unavailable, discover connections
9. Validate transfer times
10. Search permitted alternatives
11. Normalize results
12. Deduplicate
13. Rank
14. Generate explanations
15. Display journeys

Possible output:

Direct
Delhi → Varanasi
Train
7:30 PM → 7:15 AM
11h 45m

Alternative
Delhi → Prayagraj
Train

Prayagraj → Varanasi
Train

12h 30m
1 transfer

The exact journey data must always come from real provider data.

80. Agent Decision Rule

When deciding between two implementations, prefer the one that:

Preserves the product architecture.
Is easier to test.
Avoids hardcoded transport logic.
Keeps providers replaceable.
Handles failure gracefully.
Makes the user experience clearer.
Is easier to extend.
Is production-safe.
81. Final Principle

Every contribution to Yatrai should move the product toward this standard:

One Goal. Every Route.

Yatrai should understand the user's destination as the primary objective and intelligently discover reliable ways to reach it.

The system must remain:

Dynamic
Provider-agnostic
Explainable
Resilient
Scalable
Secure
Accessible
Premium
Production-ready

Never sacrifice architectural correctness for a quick demo.

Never sacrifice user trust for a visually impressive result.

Never invent transportation data.

Never hardcode solutions that should be discovered dynamically.