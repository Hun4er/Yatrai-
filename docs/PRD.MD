# Yatrai — Product Requirements Document (PRD)

**Product:** Yatrai  
**Version:** V1.0  
**Status:** Product Definition  
**Document Type:** Product Requirements Document  
**Last Updated:** September 2026

---

## 1. Product Overview

Yatrai is an intelligent journey discovery platform designed to help travelers find practical ways to reach a destination when their preferred journey is unavailable, inconvenient, expensive, or disrupted.

Unlike traditional travel search platforms that primarily search for a direct route, Yatrai focuses on the **goal of reaching the destination**.

A traveler should be able to say:

> "I want to go from Delhi to Varanasi by train tomorrow."

If a direct Delhi → Varanasi train is unavailable, sold out, or unsuitable, Yatrai should not stop at showing "No trains available."

Instead, it should intelligently explore alternatives such as:

- Delhi → Prayagraj → Varanasi
- Delhi → Kanpur → Varanasi
- Delhi → Lucknow → Varanasi
- Delhi → nearby railway station → Varanasi
- Train + Bus
- Train + Flight
- Bus + Train
- Other feasible multimodal combinations

The platform's primary objective is:

> **One Goal. Every Route.**

---

# 2. Problem Statement

Travelers frequently know:

- where they are,
- where they want to go,
- approximately when they want to travel,

but do not know the best way to get there when the obvious route fails.

Existing travel platforms often behave as search engines:

> Origin → Destination → Search → Available Results

This creates problems when:

- direct tickets are unavailable,
- trains are sold out,
- flights are too expensive,
- buses are unavailable,
- a route requires a transfer,
- a nearby station has availability,
- the traveler is willing to change transportation modes,
- a journey is disrupted,
- the user does not know suitable intermediate destinations.

Yatrai should solve the broader problem:

> **"Given my travel goal and constraints, what are the realistic ways I can reach my destination?"**

---

# 3. Product Vision

Build a journey intelligence platform that transforms travel planning from:

> "Find me a ticket."

into:

> "Help me reach my destination."

Yatrai should become a system that understands journeys as a network of possible routes rather than a single origin-to-destination search.

---

# 4. Product Mission

Yatrai helps travelers discover, compare, and choose practical journeys across multiple transportation modes.

The system should:

1. Understand the user's travel intent.
2. Resolve locations accurately.
3. Search multiple transportation providers.
4. Detect unavailable or unsuitable direct routes.
5. Discover viable intermediate locations.
6. Construct multimodal journeys.
7. Normalize results from different providers.
8. Rank journeys according to user preferences.
9. Clearly explain why a journey is recommended.
10. Allow users to continue toward booking through supported providers.

---

# 5. Core Product Principle

## Destination First, Route Second

Yatrai should never treat the initially requested route as the only possible solution.

For example:

### User Request

> Delhi → Varanasi  
> Train  
> Tomorrow

### Direct Route

Delhi → Varanasi

If unavailable:

### Yatrai Exploration

Delhi
↓
Possible railway hubs
↓
Prayagraj / Kanpur / Lucknow / Other viable nodes
↓
Varanasi

Yatrai evaluates feasible combinations and presents the user with alternative journeys.

The system should **discover routes dynamically** rather than rely on hardcoded alternatives.

---

# 6. Target Users

## Primary Users

### 6.1 Frequent Travelers

People who regularly travel between cities and need flexible routing options.

### 6.2 Students

Students traveling between their hometown and college.

Common requirements:

- affordable journeys,
- trains,
- buses,
- nearby stations,
- flexible transfers.

### 6.3 Budget Travelers

Users willing to take longer or more complex journeys to reduce cost.

### 6.4 Time-Constrained Travelers

Users who prioritize arrival time over price.

### 6.5 Travelers During Disruptions

Users affected by:

- cancellations,
- sold-out tickets,
- delays,
- route disruptions,
- unavailable transportation.

---

# 7. Core User Journey

## Step 1 — Enter Journey Intent

The user enters a natural-language request.

Examples:

> "I need to go from Delhi to Varanasi tomorrow by train."

> "Find the cheapest way from Patna to Delhi."

> "I need to reach Jaipur before 8 PM on Friday."

> "I want to travel from Sonipat to Lucknow, preferably by train."

Yatrai converts this into structured journey requirements.

---

## Step 2 — Understand Intent

The system extracts:

- Origin
- Destination
- Travel date
- Departure time
- Arrival deadline
- Preferred transport
- Number of passengers
- Budget
- Preferences
- Flexibility
- Constraints

Example:

```json
{
  "origin": "Delhi",
  "destination": "Varanasi",
  "date": "2026-09-24",
  "preferredMode": "train",
  "passengers": 1,
  "arrivalDeadline": null,
  "budget": null
}


8. Location Resolution

Yatrai must resolve ambiguous locations before searching.

Examples:

Delhi

could refer to:

New Delhi
Delhi railway stations
Delhi airport
Delhi city

Similarly:

Varanasi

could resolve to:

Varanasi city
Varanasi Junction
Lal Bahadur Shastri International Airport
nearby bus terminals

The system should determine the appropriate transport-specific location.

9. Journey Search Architecture

Yatrai should use a provider-based architecture.

                    YATRAI
                       │
             Journey Orchestrator
                       │
        ┌──────────────┼──────────────┐
        │              │              │
     Road           Rail            Flight
    Provider       Provider         Provider
        │              │              │
      Bus/Taxi       Train          Flight
        │              │              │
        └──────────────┼──────────────┘
                       │
                Journey Normalizer
                       │
                 Route Generator
                       │
                 Ranking Engine
                       │
                Journey Results

The architecture must support adding new providers without rewriting the core journey engine.

10. Transportation Providers
10.1 Rail Provider

Responsibilities:

search trains,
schedules,
stations,
availability,
classes,
fares,
seat availability where supported,
train status where supported.
10.2 Bus Provider

Responsibilities:

bus search,
operators,
departure times,
arrival times,
fares,
seat availability where supported.
10.3 Flight Provider

Responsibilities:

flight search,
airports,
schedules,
fares,
availability,
airlines.
10.4 Road Provider

Responsibilities:

driving routes,
travel time,
distance,
road connections,
last-mile routing.

Potential use cases:

Station → Hotel
Home → Railway Station
Airport → Destination
City → Nearby Railway Station
11. Journey Normalization

Different providers return different formats.

Yatrai should convert provider-specific responses into a common internal journey model.

Example:

{
  "journeyId": "unique-id",
  "origin": {},
  "destination": {},
  "departure": {},
  "arrival": {},
  "duration": 0,
  "totalCost": 0,
  "currency": "INR",
  "segments": [],
  "transfers": [],
  "availability": {},
  "providers": [],
  "confidence": 0
}

This allows different journey types to be compared consistently.

12. Direct Journey Search

Yatrai should first search for direct journeys matching the user's preferences.

Example:

Delhi
   ↓
Varanasi

If suitable direct journeys exist, they should be displayed.

However, Yatrai must not stop searching simply because a direct route exists.

The system may still discover:

cheaper alternatives,
faster alternatives,
fewer-transfer alternatives,
more convenient alternatives.
13. Alternative Route Discovery

This is the core differentiating feature of Yatrai.

If a direct journey is:

unavailable,
sold out,
too expensive,
too slow,
outside the user's constraints,

Yatrai should search alternative journey paths.

Example:

Delhi
 ├──→ Varanasi
 │
 ├──→ Prayagraj → Varanasi
 │
 ├──→ Kanpur → Varanasi
 │
 └──→ Lucknow → Varanasi

The system should determine intermediate locations dynamically based on available transportation connections.

14. Intermediate Location Discovery

Yatrai should not depend on manually maintained lists such as:

Delhi → Kanpur → Varanasi
Delhi → Prayagraj → Varanasi

Instead, intermediate nodes should be discovered using transportation network data.

Candidate intermediate locations can be evaluated based on:

geographic relevance,
transportation connectivity,
schedule compatibility,
availability,
transfer time,
total duration,
total cost,
route feasibility.
15. Multimodal Journey Construction

Yatrai should support journeys containing multiple transportation modes.

Example:

Home
 ↓
Road
 ↓
Delhi Airport
 ↓
Flight
 ↓
Lucknow
 ↓
Road
 ↓
Railway Station
 ↓
Train
 ↓
Varanasi

Another example:

Delhi
 ↓ Train
Prayagraj
 ↓ Bus
Varanasi

The system should treat the complete journey as one journey rather than unrelated searches.

16. Journey Feasibility

Every generated journey must pass feasibility checks.

Minimum checks:

Temporal Feasibility

The next segment must depart after the previous segment arrives.

Arrival: 14:20
Next departure: 15:05

Transfer time = 45 minutes
Transfer Feasibility

Transfer time must meet configurable minimum requirements.

Location Feasibility

The arrival location of one segment must be reasonably connected to the departure location of the next.

Availability

Segments should be available according to provider data.

Date Feasibility

Overnight journeys and date changes must be handled correctly.

17. Journey Ranking

Yatrai should not simply sort results by one attribute.

The ranking engine should consider multiple factors.

Possible ranking dimensions:

Total price
Total travel time
Number of transfers
Waiting time
Departure time
Arrival time
Availability
Reliability
User preferences
Mode preference
Transfer complexity

The system should generate categories such as:

Best Overall

Balanced journey based on the user's constraints.

Fastest

Lowest total journey time.

Cheapest

Lowest total cost.

Fewest Transfers

Simplest journey structure.

Most Convenient

Balances transfer difficulty, timing, duration, and other convenience factors.

These categories are result types, not permanent hardcoded rankings.

18. Personal Preferences

Users should eventually be able to specify preferences such as:

Prefer train
Avoid flights
Avoid buses
Lowest price
Fastest route
Fewer transfers
Maximum budget
Maximum journey duration
Preferred departure window
Preferred arrival window

Example:

"I prefer trains, but I am okay with one bus connection if no direct train is available."

Yatrai should translate this into ranking constraints.

19. Natural Language Interface

Natural language should be a first-class interface.

Examples:

"Find me the cheapest way to reach Delhi from Patna tomorrow."

"I want to go to Varanasi by train, but if no ticket is available, find another train route."

"Get me to Jaipur before 7 PM without taking a flight."

"I don't mind changing trains once."

The parser should convert these requests into structured journey constraints.

20. Search Strategy

Yatrai should use a staged search strategy.

Stage 1 — Direct Search

Search direct journeys.

Stage 2 — Constraint Relaxation

If no acceptable result exists, evaluate which constraints can be relaxed.

Example:

Preferred:
Train
Direct
Under ₹1,500

Fallback:
Train + Train
Train + Bus
Nearby station
Different departure time
Stage 3 — Alternative Node Search

Discover viable intermediate locations.

Stage 4 — Multimodal Search

Combine available transportation modes.

Stage 5 — Rank and Filter

Remove infeasible journeys and rank remaining options.

21. Constraint Handling

Yatrai must distinguish between:

Hard Constraints

Must not be violated.

Examples:

Destination
Maximum budget
Arrival deadline
"No flights"
Soft Constraints

Can be relaxed when necessary.

Examples:

Preferred train
Preferred departure time
Direct journey
Few transfers

The system should never silently violate a hard constraint.

22. Explaining Alternatives

Yatrai should explain why an alternative is being shown.

Example:

Direct train unavailable

We found a train connection through Prayagraj that reaches Varanasi 35 minutes later than your preferred arrival time.

Or:

Alternative route

The direct train is unavailable, so Yatrai found a train + bus journey through Prayagraj.

The explanation should be based on actual search results.

23. Result Card

Each journey result should clearly display:

Origin
Destination
Departure
Arrival
Total duration
Total price
Number of transfers
Transport modes
Availability
Intermediate locations
Provider
Booking action

Example:

Delhi
08:10
   │
   │ Train
   ↓
Prayagraj
13:45
   │
   │ Bus
   ↓
Varanasi
17:20

₹1,240
9h 10m
1 transfer

Train + Bus

View Journey
24. Journey Detail View

Clicking a journey should display:

Complete itinerary
Each segment
Provider
Departure station
Arrival station
Platform information where available
Transfer duration
Price breakdown
Availability
Journey warnings
Booking links/actions
25. Booking

Yatrai's initial version should focus on journey discovery and comparison.

Where direct booking APIs are available, Yatrai may support booking.

Otherwise:

View / Continue to Provider

should redirect users to the appropriate provider.

Yatrai must clearly distinguish:

Yatrai-discovered information
Provider-confirmed availability
External booking information
26. Availability Handling

Availability is time-sensitive.

The system should display timestamps where appropriate.

Example:

Availability checked 30 seconds ago.

If provider data is unavailable:

Availability could not be verified.

The system must never fabricate availability.

27. Disruption Handling

Future versions should support:

train cancellation,
flight cancellation,
major delays,
route closure,
missed connection,
provider outage.

Yatrai should be able to regenerate a journey based on the new situation.

Example:

Your train was cancelled.

Yatrai found 3 alternative ways to reach Varanasi.
28. UI / UX Requirements

Yatrai should have a premium, modern travel-product aesthetic.

The interface should feel:

premium,
intelligent,
trustworthy,
calm,
modern,
fast,
minimal.

Avoid a generic travel-booking website appearance.

29. Design Language
Typography

Preferred fonts:

Inter
Geist
DM Sans
Manrope

Typography should have strong hierarchy and generous readability.

Visual Style

Use:

deep neutral backgrounds,
subtle gradients,
soft ambient lighting,
premium cards,
large rounded corners,
restrained accent colors,
subtle borders,
smooth animations.

Avoid:

excessive gradients,
excessive glassmorphism,
clutter,
unnecessary animations,
overly bright colors.
30. Core Screens
30.1 Landing Page

Purpose:

Explain Yatrai's value immediately.

Hero:

One Goal. Every Route.

Supporting message:

Tell us where you want to go. Yatrai finds the ways to get you there.

Primary CTA:

Plan a Journey

30.2 Journey Search

Main interface:

Where are you starting?
[ Delhi ]

Where do you want to go?
[ Varanasi ]

When?
[ Tomorrow ]

How do you prefer to travel?
[ Train ]

[ Find My Journey ]

Natural-language search should also be supported.

30.3 Search Progress

Instead of a generic loading spinner, show journey discovery stages.

Example:

Understanding your journey       ✓
Searching direct routes          ✓
Checking connections             ✓
Exploring alternatives           •
Ranking journeys                 •
30.4 Results Page

Primary controls:

Sort
Filter
Transport mode
Price
Duration
Transfers
Departure
Arrival

Result categories:

Best Overall
Fastest
Cheapest
Fewest Transfers
Most Convenient
30.5 Journey Detail

Interactive timeline showing every journey segment.

31. Responsive Design

The application must work seamlessly across:

Desktop
Tablet
Mobile

Mobile experience should not simply be a compressed desktop interface.

Journey cards should be redesigned for smaller screens.

32. Accessibility

The application should follow modern accessibility standards.

Requirements:

keyboard navigation,
sufficient contrast,
semantic HTML,
accessible forms,
screen-reader-friendly labels,
focus states,
reduced-motion support.
33. Technical Architecture

Recommended architecture:

Frontend
React / Next.js
        │
        ↓
API Gateway
        │
        ↓
Journey Orchestrator
        │
 ┌──────┼────────┐
 ↓      ↓        ↓
Rail   Bus     Flight
Provider Provider Provider
        │
        ↓
Journey Normalizer
        │
        ↓
Route Discovery Engine
        │
        ↓
Ranking Engine
        │
        ↓
Journey API
        │
        ↓
Frontend
34. Backend Services

Recommended services/modules:

/auth
/users
/journeys
/locations
/providers
/search
/routes
/ranking
/availability
/bookings
/notifications

The initial implementation may be a modular monolith.

The architecture should allow future extraction into independent services.

35. Core Backend Components
Journey Orchestrator

Coordinates the complete journey search.

Responsibilities:

parse request,
call providers,
generate alternatives,
construct journeys,
validate journeys,
rank journeys.
Location Resolver

Converts user-entered locations into canonical transport locations.

Provider Adapter Layer

Every provider should implement a common interface.

Example:

searchRoutes(origin, destination, constraints)

The core application should not depend directly on provider-specific response structures.

Journey Normalizer

Converts provider responses into Yatrai's internal journey model.

Route Discovery Engine

Generates alternative paths through transportation nodes.

Ranking Engine

Scores candidate journeys according to user constraints and preferences.

36. Data Model

Core entities:

User
User
├── id
├── name
├── email
├── preferences
└── createdAt
Journey Request
JourneyRequest
├── origin
├── destination
├── date
├── passengers
├── preferredModes
├── constraints
└── preferences
Journey
Journey
├── id
├── origin
├── destination
├── segments
├── duration
├── price
├── transfers
├── modes
├── availability
└── providers
Segment
Segment
├── mode
├── provider
├── origin
├── destination
├── departure
├── arrival
├── duration
├── price
└── availability
37. Search Performance

Target:

Initial search response: < 3 seconds where provider APIs permit.
Progressive results should be supported for slower providers.
Avoid blocking the entire result page because one provider is slow.

Provider failures should degrade gracefully.

Example:

Rail provider unavailable
        ↓
Bus + Flight results still displayed
        ↓
User sees provider status
38. Reliability Requirements

Yatrai must:

handle provider failures,
retry transient errors,
timeout slow providers,
prevent duplicate searches,
cache safe static data,
log provider failures,
maintain request tracing.
39. Security

Requirements:

secure authentication,
encrypted sensitive data,
API key protection,
rate limiting,
input validation,
provider credential isolation,
secure payment handling if booking is introduced.

No provider API keys should be exposed to the frontend.

40. Observability

Production monitoring should include:

search latency,
provider latency,
provider failure rate,
search success rate,
route generation count,
alternative route discovery rate,
API error rate,
booking redirect success,
user abandonment.
41. Analytics

Important product metrics:

Journey Search Metrics
Searches per user
Successful journey searches
Searches with direct results
Searches requiring alternatives
Alternative journeys discovered
Zero-result searches
Engagement
Journey result clicks
Journey detail views
Saved journeys
Share actions
Booking redirects
Quality
Search completion rate
Result relevance feedback
Failed journey rate
Provider accuracy
42. MVP Scope

The MVP should focus on the fundamental Yatrai value proposition.

MVP Must Have
Input
Origin
Destination
Date
Preferred transport
Basic natural-language search
Search
Rail
Bus
Flight
Road
Intelligence
Direct route search
Alternative route discovery
Intermediate location discovery
Multimodal journey construction
Journey normalization
Ranking
UI
Landing page
Search interface
Search progress
Results page
Journey detail page
Responsive design
43. MVP Should Not Include

The first production version should avoid unnecessary complexity such as:

loyalty programs,
social networking,
travel communities,
complex itinerary management,
hotel booking,
restaurant booking,
full payment infrastructure,
AI travel assistant unrelated to journey discovery.

These can be evaluated later.

44. V1 Success Criteria

Yatrai V1 should successfully handle requests such as:

Example 1

Delhi → Varanasi by train

If direct availability exists:

Show direct train journeys.

If unavailable:

Search alternative train connections.
Example 2

Patna → Delhi cheapest

Yatrai should compare available modes and journeys.

Example 3

Sonipat → Jaipur, no flight

Flights should be excluded as a hard constraint.

Example 4

Delhi → Varanasi tomorrow, preferably train

Train should receive preference, but suitable alternatives can be presented if direct train options are unavailable.

45. Important Product Rule

Yatrai should never behave like this:

No direct train available.

[No results]

Instead:

No direct train available.

We found alternative ways to reach Varanasi:

1. Train → Prayagraj → Train
2. Train → Kanpur → Bus
3. Train → Lucknow → Train
4. Bus → Varanasi

The exact alternatives must come from real transportation data.

No hardcoded routes.

46. Error Handling

If no feasible route exists:

We couldn't find a journey that matches all your requirements.

Try:
• A different departure time
• A higher budget
• Allowing one transfer
• Allowing another transport mode

If provider data is unavailable:

Some transportation providers could not be reached.
Results may be incomplete.
47. Future Product Capabilities

Potential future versions:

V2
Real-time disruption detection
Saved journeys
User accounts
Journey history
Notifications
Price tracking
Availability alerts
V3
Automatic re-routing
Live journey monitoring
Missed-connection recovery
Personalized route preferences
Predictive route recommendations
V4
Full booking
Payments
Corporate travel
API platform
B2B travel infrastructure
48. Competitive Differentiation

Yatrai should not position itself simply as another:

"Flight + Train + Bus Search"

The core positioning is:

Journey discovery and recovery.

Traditional travel search asks:

"Which ticket exists between these two locations?"

Yatrai asks:

"What are the feasible ways to get this traveler to their destination?"

This distinction should influence the product architecture, UX, ranking engine, and marketing.

49. Product Principles
1. Destination over Route

The destination is the goal. The route is a variable.

2. Discover, Don't Assume

Routes should be dynamically discovered from real transportation data.

3. Never Fabricate Availability

Only display availability supported by provider data.

4. Explain the Journey

Users should understand why an alternative exists.

5. Respect Constraints

Hard constraints must never be silently violated.

6. Optimize for Real Journeys

A mathematically short route is not necessarily a practical journey.

7. Progressive Discovery

Return useful results as providers respond.

8. Provider Agnostic

The core journey engine must not be tightly coupled to one provider.

9. Premium Simplicity

The interface should make a complex journey feel simple.

50. Definition of Done — V1

Yatrai V1 is considered production-ready when:

 Users can enter natural-language journey requests.
 Locations are resolved correctly.
 Multiple transportation providers can be queried.
 Direct journeys can be discovered.
 Alternative journeys can be generated.
 Intermediate locations are discovered dynamically.
 Multimodal journeys can be constructed.
 Journey feasibility is validated.
 Results are normalized into a common format.
 Journeys can be ranked according to constraints.
 Results clearly show price, duration, transfers, and modes.
 Provider availability is represented accurately.
 Provider failures do not crash the entire search.
 No critical route logic is hardcoded.
 Mobile and desktop experiences are production-ready.
 API credentials remain secure.
 Logging and monitoring are implemented.
 Search performance is acceptable.
 The system can support additional transportation providers without major architectural changes.
51. Product North Star

The ultimate measure of Yatrai is not:

How many tickets did we search?

It is:

How successfully can Yatrai help a traveler reach their intended destination when the obvious journey does not work?

52. Yatrai Product Statement

Yatrai is an intelligent journey discovery platform that understands where you want to go, what matters to you, and finds practical ways to get you there — even when the obvious route isn't available.

Tagline

One Goal. Every Route.