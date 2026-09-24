# Yatrai — Design System

**Product:** Yatrai  
**Version:** V1.0  
**Status:** Production Design Specification  
**Document Type:** Design System  
**Last Updated:** September 2026  
**Tagline:** One Goal. Every Route.

---

# 1. Design System Overview

Yatrai is an intelligent journey discovery platform.

The interface must communicate three things immediately:

1. **Intelligence** — Yatrai understands complex travel requirements.
2. **Trust** — journey information should feel reliable and transparent.
3. **Simplicity** — complex routes should feel easy to understand.

The visual language should feel:

- premium,
- modern,
- intelligent,
- minimal,
- trustworthy,
- calm,
- fast,
- sophisticated.

Yatrai should not look like a traditional travel booking website.

The product should feel closer to a premium technology product that happens to solve travel problems.

---

# 2. Design Philosophy

## 2.1 Complexity Behind Simplicity

The backend may evaluate hundreds of possible routes.

The user should not see that complexity.

Instead:

```text
Complex Journey Engine
        ↓
Simple Explanation
        ↓
Clear Journey Options

Example:

Instead of exposing:

Graph search
Node expansion
Provider response
Route scoring
Constraint relaxation

the interface should communicate:

"Your direct train isn't available. We found 3 practical alternatives."

2.2 Destination First

Yatrai's interface should reinforce the core product philosophy:

The destination is the goal. The route is flexible.

The interface should therefore visually emphasize:

FROM
Delhi

TO
Varanasi

while transportation modes remain secondary.

2.3 Calm Intelligence

Yatrai should feel intelligent without trying to look like an "AI product."

Avoid:

excessive AI terminology,
glowing AI interfaces everywhere,
robot imagery,
unnecessary chat bubbles,
excessive animated gradients.

Instead, communicate intelligence through:

excellent information hierarchy,
contextual explanations,
smart defaults,
dynamic route discovery,
clear recommendations.
3. Brand Personality

Yatrai should feel:

Intelligent

The product understands complex journeys.

Confident

The interface communicates information clearly without unnecessary hesitation.

Calm

Travel planning can already be stressful. The UI should reduce cognitive load.

Premium

Every interaction should feel deliberate and polished.

Human

The product should communicate like a helpful travel intelligence system rather than a machine.

Transparent

The interface should clearly distinguish:

confirmed information,
estimated information,
unavailable information,
provider information.
4. Design Principles
Principle 1 — Clarity Over Decoration

Every visual element must have a purpose.

Principle 2 — Information Hierarchy

Important information must visually dominate less important information.

Priority:

Destination
↓
Journey quality
↓
Departure / Arrival
↓
Duration
↓
Price
↓
Transfers
↓
Provider details
Principle 3 — Progressive Disclosure

Do not display every detail immediately.

Show:

Summary
↓
Journey Overview
↓
Detailed Segments
↓
Provider Details
Principle 4 — Consistency

Components should behave consistently throughout the application.

Principle 5 — Motion With Purpose

Animation should communicate:

loading,
transition,
state change,
route progression,
confirmation.

Never animate simply because animation is possible.

Principle 6 — Real Information Over Visual Noise

The interface should prioritize actual travel information over decorative UI.

5. Color System

Yatrai should use a dark-first premium interface.

The system should support both:

Dark Mode
Light Mode

Dark Mode should be the primary brand experience.

6. Core Dark Theme
Background
Background Primary
#070A0F

Background Secondary
#0B0F16

Background Tertiary
#111722

Use the darkest background for the application shell.

Surface
Surface Primary
#10151D

Surface Secondary
#151B24

Surface Elevated
#1A212C

Surfaces should have subtle separation rather than heavy shadows.

Borders
Border Subtle
rgba(255,255,255,0.06)

Border Default
rgba(255,255,255,0.10)

Border Strong
rgba(255,255,255,0.16)

Borders should remain subtle.

7. Brand Accent

Yatrai's primary accent should be a sophisticated electric-indigo / violet.

Brand Primary
#7C5CFF

Brand Primary Hover
#8B70FF

Brand Primary Active
#6847E8

Brand Soft
rgba(124,92,255,0.12)

The accent should be used for:

primary CTAs,
selected states,
active navigation,
route highlights,
focus states,
important interactive elements.

Do not use the accent on every element.

8. Semantic Colors
Success
Success
#32D583

Success Soft
rgba(50,213,131,0.12)

Use for:

confirmed availability,
successful actions,
completed journey segments.
Warning
Warning
#F5B942

Warning Soft
rgba(245,185,66,0.12)

Use for:

limited availability,
tight transfers,
important warnings.
Error
Error
#FF5C67

Error Soft
rgba(255,92,103,0.12)

Use for:

failed searches,
invalid inputs,
provider failures,
unavailable journeys.
Information
Info
#4EA1FF

Info Soft
rgba(78,161,255,0.12)

Use for:

informational messages,
provider updates,
route explanations.
9. Text Colors
Dark Theme
Text Primary
#F7F8FA

Text Secondary
#A7AFBD

Text Tertiary
#737C8C

Text Disabled
#4F5663

Text hierarchy:

Primary
↓
Secondary
↓
Tertiary
↓
Disabled

Avoid using pure white everywhere.

10. Light Theme

Light mode should preserve the same visual hierarchy.

Background Primary
#F7F8FA

Background Secondary
#FFFFFF

Surface
#FFFFFF

Surface Secondary
#F1F3F7

Border
#E4E7EC

Text Primary
#111318

Text Secondary
#596170

Text Tertiary
#8A93A3

Brand Primary
#6847E8

Light mode should feel premium rather than like a default browser interface.

11. Typography

Primary font:

Inter

Fallback:

Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif

Optional brand/display font:

Manrope

Use display typography sparingly.

12. Type Scale
Display XL
64px
Line Height: 1.05
Weight: 700

Use for major landing-page headlines.

Display Large
52px
Line Height: 1.08
Weight: 700
Display Medium
42px
Line Height: 1.1
Weight: 700
Heading 1
36px
Line Height: 1.15
Weight: 700
Heading 2
30px
Line Height: 1.2
Weight: 650
Heading 3
24px
Line Height: 1.25
Weight: 650
Heading 4
20px
Line Height: 1.3
Weight: 600
Body Large
18px
Line Height: 1.55
Weight: 400
Body
16px
Line Height: 1.5
Weight: 400
Body Small
14px
Line Height: 1.45
Weight: 400
Caption
12px
Line Height: 1.4
Weight: 500
13. Typography Rules

Use typography to create hierarchy rather than excessive colors.

Example:

VARANASI
36px / Bold

Delhi → Varanasi
18px / Medium

Tomorrow · 08:10
14px / Regular

Train · 8h 40m
14px / Secondary

Avoid:

excessive font weights,
uppercase everywhere,
overly tight line spacing,
too many font families.
14. Spacing System

Use a 4px base spacing system.

4px
8px
12px
16px
20px
24px
32px
40px
48px
64px
80px
96px
120px

Recommended usage:

4px   → micro spacing
8px   → icon/text spacing
12px  → compact components
16px  → standard component padding
24px  → cards
32px  → sections
48px  → large sections
64px+ → hero/layout spacing
15. Layout Grid

Desktop:

12-column grid
Max width: 1280px
Horizontal padding: 32px

Large screens:

Max content width: 1440px

Tablet:

8-column grid
Padding: 24px

Mobile:

4-column grid
Padding: 16px
16. Container System

Recommended max-widths:

Small
640px

Medium
768px

Large
1024px

XL
1280px

Full
1440px

Journey results should generally use:

max-width: 1280px
17. Border Radius

Yatrai should use rounded geometry.

XS
6px

Small
8px

Medium
12px

Large
16px

XL
20px

2XL
24px

Pill
999px

Primary cards:

20px

Large search containers:

24px

Buttons:

10px–14px
18. Shadows

Avoid heavy shadows.

Dark theme:

Shadow Small
0 2px 8px rgba(0,0,0,0.18)

Shadow Medium
0 8px 24px rgba(0,0,0,0.24)

Shadow Large
0 20px 50px rgba(0,0,0,0.30)

Use shadows primarily for:

elevated menus,
dialogs,
floating panels,
important cards.
19. Glass / Blur

Glassmorphism should be used sparingly.

Acceptable:

background: rgba(16,21,29,0.75)
backdrop-filter: blur(16px)
border: 1px solid rgba(255,255,255,0.08)

Do not make the entire application glassmorphic.

Glass should communicate elevation, not decoration.

20. Iconography

Use a consistent icon library.

Recommended:

Lucide Icons

Icons should generally be:

16px
20px
24px

Stroke:

1.5px–2px

Icons should never replace important text when meaning may be ambiguous.

21. Transportation Icons

Use consistent icons for:

Train
Bus
Flight
Car
Walking
Transfer
Station
Airport
Location
Clock
Calendar
Price
Route

Each transportation mode should have a consistent visual representation throughout the application.

22. Logo Usage

The Yatrai logo should remain visually simple.

The logo should have:

clear space,
minimum size,
consistent placement,
consistent contrast.

Do not:

distort the logo,
add arbitrary effects,
rotate it,
place it over low-contrast backgrounds.
23. Buttons

Buttons should have clear hierarchy.

Primary Button

Used for the main action.

Example:

[ Find My Journey ]

Style:

Background: Brand Primary
Text: White
Radius: 12px
Height: 48px
Padding: 0 20px
Secondary Button

Used for supporting actions.

Background: transparent
Border: subtle
Text: primary
Ghost Button

Used for low-emphasis actions.

Background: transparent
Border: none
Destructive Button

Used only for destructive actions.

Error color
24. Button States

Every button should support:

Default
Hover
Active
Focus
Disabled
Loading

Example:

Default
↓
Hover
↓
Active
↓
Loading
↓
Success

Loading buttons should not shift layout.

25. Inputs

Inputs should feel premium and spacious.

Recommended:

Height: 48–56px
Radius: 12–14px
Padding: 14–16px

Input states:

Default
Hover
Focus
Filled
Error
Disabled

Focus:

Border: Brand Primary
Subtle outer glow
26. Journey Search Component

The journey search component is the primary interaction of Yatrai.

It should include:

From
[ Delhi ]

To
[ Varanasi ]

Date
[ Tomorrow ]

Preferred mode
[ Train ]

[ Find My Journey ]

Natural-language search should also be supported.

Example:

[ I want to reach Varanasi tomorrow by train... ]

The UI should allow users to switch between:

structured search,
natural-language search.
27. Location Input

Location inputs should support:

autocomplete,
recent locations,
nearby locations,
stations,
airports,
cities.

Example:

Delhi
New Delhi Railway Station
Delhi Airport

The system should clearly distinguish location types.

28. Search Suggestions

Suggestions should appear as the user types.

Example:

Delhi

Recent
New Delhi

Railway Stations
New Delhi Railway Station
Delhi Junction

Airports
Indira Gandhi International Airport

The interface should avoid overwhelming the user.

29. Search Progress Design

Search progress should expose meaningful system activity.

Example:

✓ Understanding your journey

✓ Searching direct routes

✓ Checking availability

● Exploring alternative routes

○ Validating connections

○ Ranking journeys

Progress should update dynamically.

Avoid fake progress.

30. Journey Result Card Design

Journey cards are the core product component.

Each card should visually communicate:

Departure
    ↓
Segment
    ↓
Transfer
    ↓
Segment
    ↓
Arrival

Example:

08:10                    17:20
Delhi                    Varanasi
   │                        │
   └── Train ──→ Prayagraj
                    │
                    └── Bus ──→

Primary information:

departure,
arrival,
duration,
price,
transport modes.

Secondary information:

provider,
transfer duration,
availability,
route details.
31. Journey Card Hierarchy

Recommended structure:

┌─────────────────────────────────────┐
│ BEST OVERALL                        │
│                                     │
│ 08:10                    17:20      │
│ Delhi  ────────────────  Varanasi  │
│                                     │
│ Train → Bus                         │
│ 9h 10m · 1 transfer                │
│                                     │
│ ₹1,240                              │
│                                     │
│ [ View Journey ]                    │
└─────────────────────────────────────┘

The card should be scannable in under a few seconds.

32. Journey Timeline

Journey details should use a vertical timeline.

Example:

● 08:10
│ Delhi
│
│ Train
│
● 13:45
│ Prayagraj
│
│ 55 min transfer
│
● 14:40
│ Bus
│
● 17:20
  Varanasi

The timeline should visually distinguish:

transport,
transfer,
waiting,
destination.
33. Transfer Visualization

Transfers should be clearly visible.

Example:

TRAIN
Delhi → Prayagraj
08:10 → 13:45

        ↓

TRANSFER
55 min

        ↓

BUS
Prayagraj → Varanasi
14:40 → 17:20

Tight transfers should receive warning treatment.

34. Availability States

Use consistent states.

Available
Available
Limited
Limited availability
Unavailable
Unavailable
Unknown
Availability unavailable
Provider Failure
Provider temporarily unavailable

Never visually represent unknown availability as available.

35. Journey Labels

Labels can include:

Best Overall
Fastest
Cheapest
Fewest Transfers
Most Convenient
Direct
Alternative
Limited Availability
Recommended

Labels should explain the result rather than create unnecessary marketing language.

36. Filters

Filters should include only useful journey dimensions.

Possible filters:

Transport
Price
Departure
Arrival
Duration
Transfers
Provider
Availability

Example:

Transport
☑ Train
☐ Bus
☐ Flight
☐ Road

Mobile filters should use a bottom sheet or dedicated filter screen.

37. Sorting

Supported sorting:

Recommended
Price: Low → High
Duration: Short → Long
Departure: Earliest
Arrival: Earliest
Fewest Transfers

"Recommended" should be generated from the ranking engine.

38. Route Map

Maps should support journey understanding rather than become the primary interface.

The map can show:

Origin
   ●
   │
   │
   ● Intermediate
   │
   │
   ● Destination

Different transportation segments may use different visual treatments.

The map should remain secondary to itinerary information.

39. Empty States

Empty states should be helpful.

Example:

No journey matched your requirements.

We couldn't find a journey that satisfies all your current constraints.

Try:
• A different departure time
• A higher budget
• Allowing one transfer
• Allowing another transport mode

[ Adjust Search ]

Do not simply display:

No results.
40. Error States

Errors should explain:

What happened.
What is affected.
What the user can do next.

Example:

Some providers couldn't be reached.

Your results may be incomplete.

[ Try Again ]

Avoid technical errors such as:

HTTP 500
ECONNRESET
ProviderError

unless displayed in a developer/admin interface.

41. AI / Intelligence Messaging

Yatrai should not overuse the term "AI."

Prefer:

Finding alternative routes

over:

AI is thinking...

Prefer:

We found another way to reach Varanasi.

over:

Our AI discovered a route.

The intelligence should be demonstrated by the product itself.

42. Notifications

Notifications should be concise and useful.

Examples:

Your journey changed.

Your train is delayed by 40 minutes.
Alternative route found.

Yatrai found another way to reach your destination.
Availability changed.

Your selected journey is no longer available.
43. Toasts

Toasts should be used for lightweight feedback.

Examples:

Journey saved
Link copied
Search updated

Avoid using toasts for critical information.

Critical information should remain visible.

44. Modals

Modals should be used sparingly.

Appropriate use cases:

confirmation,
important warnings,
booking confirmation,
destructive actions,
detailed provider information.

Do not use modals for routine navigation.

45. Bottom Sheets

Bottom sheets should be used heavily on mobile for:

filters,
sorting,
journey details,
location selection,
transport selection.

They should support:

drag-to-close where appropriate,
clear close controls,
proper focus management.
46. Navigation

Desktop navigation:

Yatrai

Plan
Explore
Saved
Trips

                    Profile

Possible future navigation:

Plan
Explore
Trips
Alerts
Saved

The navigation should remain minimal.

47. Mobile Navigation

Mobile should use a compact bottom navigation.

Example:

┌──────────────────────────────────┐
│                                  │
│          Application             │
│                                  │
├──────────────────────────────────┤
│ Plan │ Explore │ Trips │ Saved   │
└──────────────────────────────────┘

The primary journey-planning action should remain easy to access.

48. Motion System

Animations should feel:

smooth,
subtle,
responsive,
premium.

Recommended duration:

Micro
100–150ms

Standard
180–250ms

Complex
300–450ms

Recommended easing:

ease-out
cubic-bezier(0.16, 1, 0.3, 1)

Use motion for:

card expansion,
page transitions,
search progress,
dropdowns,
bottom sheets,
route visualization.
49. Loading States

Use skeleton loaders where the layout is known.

Example:

┌──────────────────────────────┐
│ ███████████                  │
│ █████████████████            │
│                              │
│ ███████  ███████             │
│                              │
│ ████████████                 │
└──────────────────────────────┘

For journey search, prefer meaningful progress over generic skeletons.

50. Responsive Breakpoints

Recommended breakpoints:

Mobile
< 640px

Tablet
640px – 1023px

Desktop
1024px – 1279px

Large Desktop
1280px+

Components should adapt based on available space rather than only screen width.

51. Component Architecture

Recommended component structure:

components/
│
├── ui/
│   ├── Button
│   ├── Input
│   ├── Select
│   ├── Badge
│   ├── Card
│   ├── Modal
│   ├── Sheet
│   ├── Toast
│   └── Tooltip
│
├── search/
│   ├── JourneySearch
│   ├── LocationInput
│   ├── DateSelector
│   ├── ModeSelector
│   └── SearchProgress
│
├── journey/
│   ├── JourneyCard
│   ├── JourneyTimeline
│   ├── JourneySegment
│   ├── Transfer
│   ├── JourneyFilters
│   ├── JourneySort
│   └── JourneyDetails
│
├── map/
│   └── JourneyMap
│
└── layout/
    ├── Navbar
    ├── Sidebar
    ├── MobileNav
    └── Container

Components should be reusable and composable.

52. Design Tokens

All design values should be centralized.

Example:

const tokens = {
  colors: {
    background: {
      primary: "#070A0F",
      secondary: "#0B0F16",
      tertiary: "#111722"
    },

    surface: {
      primary: "#10151D",
      secondary: "#151B24",
      elevated: "#1A212C"
    },

    brand: {
      primary: "#7C5CFF",
      hover: "#8B70FF",
      active: "#6847E8"
    },

    text: {
      primary: "#F7F8FA",
      secondary: "#A7AFBD",
      tertiary: "#737C8C",
      disabled: "#4F5663"
    },

    semantic: {
      success: "#32D583",
      warning: "#F5B942",
      error: "#FF5C67",
      info: "#4EA1FF"
    }
  },

  radius: {
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "20px",
    "2xl": "24px",
    pill: "999px"
  },

  spacing: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    "2xl": "32px",
    "3xl": "48px",
    "4xl": "64px"
  }
};

The implementation should use tokens instead of scattering arbitrary values throughout the codebase.

53. Design States

Every interactive component must consider:

Default
Hover
Focus
Active
Selected
Disabled
Loading
Success
Error

Journey components should additionally support:

Available
Limited
Unavailable
Unknown
Delayed
Cancelled
Disrupted
54. Accessibility Design Tokens

Accessibility should be part of the design system.

Requirements:

minimum readable text sizes,
sufficient color contrast,
visible keyboard focus,
semantic labels,
accessible form controls,
accessible error states,
screen-reader descriptions,
reduced-motion support.

Never communicate important information through color alone.

Example:

Bad:

Red = unavailable

Better:

[Unavailable] + icon + text
55. Content Design

Yatrai's language should be:

concise,
human,
direct,
informative,
calm.

Avoid unnecessary jargon.

Prefer

"No direct train is available."

Avoid

"The requested transportation configuration could not be fulfilled."

56. Voice and Tone
Normal

"Here are the best ways to reach Varanasi."

Alternative Route

"The direct train isn't available, so we found another way."

Warning

"This connection has only 18 minutes to transfer."

Error

"We couldn't check this provider right now."

Success

"Journey saved."

The product should sound confident but never pretend to know something it does not know.

57. Design for Trust

Travel information directly affects user decisions.

The interface must clearly communicate:

source,
freshness,
availability,
estimated values,
provider information.

Example:

₹1,240
Checked 20 sec ago

or:

Price may change on provider

Transparency is a core part of the visual design.

58. Premium Visual Treatment

Yatrai should feel premium through restraint.

Use:

large whitespace,
precise typography,
subtle gradients,
soft shadows,
high-quality icons,
clean cards,
strong alignment,
restrained color usage.

Do not rely on:

excessive glow,
excessive gradients,
huge icons,
excessive glassmorphism,
unnecessary 3D graphics,
visual noise.
59. Hero Section

The landing page hero should be simple and high impact.

Recommended structure:

                    Yatrai

              One Goal.
             Every Route.

Tell us where you want to go.
We'll find the practical ways to get you there.

┌────────────────────────────────────────────┐
│ From                                       │
│ Delhi                                      │
│                                            │
│ To                                         │
│ Varanasi                                   │
│                                            │
│ When                                       │
│ Tomorrow                                   │
│                                            │
│             [ Find My Journey ]             │
└────────────────────────────────────────────┘

The search component should be the visual focus.

60. Search Results Visual Hierarchy

Results should prioritize:

1. Journey quality
2. Departure / Arrival
3. Duration
4. Price
5. Transfers
6. Provider
7. Secondary metadata

Users should be able to compare journeys without opening every card.

61. Journey Comparison

When comparing journeys, maintain consistent alignment.

Example:

                 Journey A       Journey B       Journey C

Departure        08:10           07:30           09:20
Arrival          17:20           16:50           18:10
Duration         9h 10m          9h 20m          8h 50m
Price            ₹1,240          ₹1,580          ₹1,350
Transfers        1               2               1
Modes            Train + Bus     Train + Train   Train + Bus

The user should be able to understand differences immediately.

62. Design for Route Complexity

A journey can contain many segments.

The UI must remain understandable whether a journey has:

1 segment

or:

5+ segments

Long journeys should use collapsible sections.

Example:

Delhi → Varanasi

2 segments
[ View details ]

Expanded:

Segment 1
Train

Transfer
45 min

Segment 2
Bus
63. Design for Uncertainty

When information is uncertain, visually communicate uncertainty.

Examples:

Estimated travel time
Availability not confirmed
Provider data unavailable

Do not use overly confident visual treatments for uncertain information.

64. Design for Disruptions

When a journey becomes disrupted:

┌────────────────────────────────────┐
│ ⚠ Journey disruption               │
│                                    │
│ Your train is delayed by 75 min.  │
│                                    │
│ Yatrai found 3 alternatives.       │
│                                    │
│ [ View Alternatives ]              │
└────────────────────────────────────┘

The disruption should be visually prominent without becoming alarming.

65. Empty Search State

When the user has not searched yet:

Where do you want to go?

Start with your destination.
Yatrai will figure out the route.

[ Plan a Journey ]

Avoid generic empty-state illustrations that add no value.

66. Onboarding

Onboarding should be optional and lightweight.

Potential preferences:

What matters most?

○ Cheapest
○ Fastest
○ Fewer transfers
○ Most convenient

Additional preferences:

Preferred transport

☑ Train
☐ Bus
☐ Flight
☐ Road

Users should be able to skip onboarding.

67. Saved Journeys

Saved journeys should use consistent cards.

Example:

Delhi → Varanasi

Tomorrow
Train + Bus
₹1,240

[ Open Journey ]

Users should be able to remove saved journeys easily.

68. Trip History

Trip history should show:

Delhi → Varanasi
Sep 24

Patna → Delhi
Sep 18

Sonipat → Jaipur
Sep 12

The user should be able to reopen a journey and search again.

69. Design System Implementation Rules

Developers must:

Use centralized design tokens.
Reuse existing components.
Avoid arbitrary colors.
Avoid arbitrary spacing.
Avoid creating duplicate components.
Maintain responsive behavior.
Maintain accessibility.
Support component states.
Keep animations consistent.
Follow typography rules.
Use the same icon system.
Avoid hardcoded UI values when tokens exist.
70. Component Naming Convention

Use descriptive names.

Good:

JourneyCard
JourneyTimeline
JourneySegment
LocationInput
SearchProgress
TransportBadge
AvailabilityBadge

Avoid:

Box1
Card2
Thing
CustomCardNew
FinalCard
71. File Structure

Recommended:

src/
│
├── components/
│   ├── ui/
│   ├── search/
│   ├── journey/
│   ├── navigation/
│   ├── map/
│   └── layout/
│
├── design-system/
│   ├── tokens/
│   ├── typography/
│   ├── colors/
│   ├── spacing/
│   └── motion/
│
├── pages/
│
├── hooks/
│
├── services/
│
└── utils/
72. Design QA

Before a feature is considered complete, verify:

Visual
 Correct typography
 Correct spacing
 Correct colors
 Correct border radius
 Correct iconography
 Correct hierarchy
Responsive
 Mobile
 Tablet
 Desktop
 Large desktop
Interaction
 Hover
 Focus
 Active
 Disabled
 Loading
 Error
 Success
Accessibility
 Keyboard navigation
 Screen reader labels
 Contrast
 Focus visibility
 Touch targets
73. Design Performance

The design system must not negatively affect performance.

Avoid:

excessive blur,
huge background images,
unnecessary animations,
expensive shadows,
excessive DOM complexity.

Animations should respect:

prefers-reduced-motion
74. Mobile-First Journey Design

On mobile, journey information should prioritize:

Origin
↓
Destination
↓
Departure
↓
Arrival
↓
Duration
↓
Price
↓
Transfers

Secondary information can be hidden behind expandable sections.

Primary action should remain easily accessible.

75. Desktop Journey Design

Desktop can take advantage of horizontal space.

Possible layout:

┌─────────────────────────────────────────────────────────┐
│ Search                                                  │
├──────────────────────┬──────────────────────────────────┤
│ Filters              │ Journey Results                  │
│                      │                                  │
│ Transport            │ Journey Card                    │
│ Price                │ Journey Card                    │
│ Duration             │ Journey Card                    │
│ Transfers            │ Journey Card                    │
│                      │                                  │
└──────────────────────┴──────────────────────────────────┘

Filters remain visible where appropriate.

76. Tablet Design

Tablet layouts should use:

collapsible filters,
larger cards,
two-column layouts where space allows,
touch-friendly controls.

Do not force desktop density onto tablet screens.

77. Design System Do / Don't
Do
Use whitespace.
Use clear hierarchy.
Use subtle borders.
Use consistent spacing.
Use meaningful animation.
Use real journey information.
Explain alternatives.
Maintain visual consistency.
Prioritize readability.
Design mobile intentionally.
Don't
Overuse gradients.
Overuse glassmorphism.
Use random colors.
Use random fonts.
Use inconsistent card styles.
Hide critical information.
Use animation everywhere.
Pretend unavailable data is confirmed.
Create duplicate UI components.
Hardcode route-specific UI logic.
78. Brand Experience

Every screen should reinforce:

One Goal. Every Route.

The user should feel that Yatrai is working toward one objective:

User Goal
    ↓
Understand
    ↓
Search
    ↓
Discover
    ↓
Validate
    ↓
Compare
    ↓
Reach

The product should never make the user feel responsible for manually solving the routing problem.

79. Design North Star

The ultimate design goal is:

Make complex journey discovery feel effortless.

A user should be able to look at Yatrai and immediately understand:

Where am I going?
How can I get there?
Which option fits me?
Why is this option shown?
What should I do next?

All without needing to understand the complexity behind the system.

80. Final Design Direction

Yatrai should visually position itself as a premium technology platform rather than a conventional travel booking website.

The final experience should combine:

Premium Technology
        +
Travel Intelligence
        +
Clear Information
        +
Human Simplicity

The design should be:

Minimal enough to feel effortless.
Intelligent enough to feel powerful.
Detailed enough to feel trustworthy.

81. Final Design Principles

The entire Yatrai interface should follow these principles:

Destination first.
Route second.
Clarity over decoration.
Complexity behind simplicity.
Trust through transparency.
Premium through restraint.
Motion with purpose.
Information before decoration.
Responsive by design.
Accessibility by default.
No fabricated information.
No unnecessary UI complexity.
Consistent components.
Dynamic journey visualization.
Every screen should help the user reach their destination.
82. Design System Success Criteria

The design system is successful when:

 Yatrai has a recognizable visual identity.
 All pages use consistent typography.
 All pages use centralized colors.
 Spacing is consistent.
 Components are reusable.
 Journey cards are visually consistent.
 Journey timelines are understandable.
 Alternative routes are clearly communicated.
 Availability states are unambiguous.
 Mobile UX is intentionally designed.
 Desktop UX feels premium.
 Accessibility requirements are respected.
 Animation is purposeful.
 The interface communicates trust.
 The application does not feel like a generic travel booking website.
 Complex journeys remain understandable.
 The design system can scale as Yatrai adds providers and features.
83. Yatrai Design Statement

Yatrai turns complex transportation networks into simple human decisions.

One Goal.
Every Route.