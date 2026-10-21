# Yatrai Live Demo Script (5 Minutes)

> **Audience:** Product leadership, engineering evaluators, stakeholders.  
> **Goal:** Showcase Yatrai's P1 split ticketing engine, fast response times, budget ledger, and resilient fallbacks when direct seats are sold out.

---

## Pre-Demo Checklist

1. **Start backend & frontend dev servers:**
   ```bash
   cd server && npm run dev
   cd client && npm run dev
   ```
2. **Seed static cache for instant demo responses (max 40 calls):**
   ```bash
   node scripts/seed-demo-cache.js
   ```
3. **Open browser:**
   Navigate to `http://localhost:5173/?debug=1` (the `?debug=1` parameter displays call counts and budget metrics).

---

## 5-Minute Demo Walkthrough

### Minute 1: The Problem — Direct Trains Sold Out
- **What to say:**  
  *"Every festive season or peak travel weekend, millions of Indian Railways travelers face the exact same frustrating screen: 'Waitlist 150 — Regret / No tickets available.' Traditional apps stop right there. Yatrai was built on a different principle: The destination is fixed; the route is discoverable."*
- **What to do:**  
  1. Open the home page.
  2. In Origin, type **"New Delhi"** (`NDLS`). Autocomplete resolves cleanly.
  3. In Destination, type **"Patna"** (`PNBE`).
  4. Select tomorrow's date and Class **"3A"** (or **"ANY"**).
  5. Click **"Search Journeys"**.

---

### Minute 2: Direct Pass & Smart Availability Chips
- **What to say:**  
  *"Yatrai doesn't spam PRS servers with dozens of wasteful queries. Our direct pass checks the top 8 candidates and evaluates one class. Watch how cleanly the results appear with color-coded chips."*
- **What to do:**  
  1. Point to the top train results (e.g. 12310 Rajdhani, 12394 Sampoorna Kranti).
  2. Notice the green **"AVAILABLE"** or orange **"WL"** status chips with prediction percentages.
  3. Click on any unverified **"?"** class chip.
  4. Notice the instant feedback: Yatrai performs a targeted single-call verification on tap, staying strictly inside the budget ledger.

---

### Minute 3: Same-Train Split Magic — "Stay on this Train"
- **What to say:**  
  *"Now here is Yatrai's unique breakthrough: Same-Train Splitting. If Delhi to Patna is completely sold out on Train 12394, does that mean the entire train is full? Often, seats are allocated under intermediate quotas. Yatrai runs a logarithmic binary search across corridor junctions."*
- **What to do:**  
  1. Scroll down to the **"Stay on this train"** split ticket card.
  2. Show Leg 1: **New Delhi → Kanpur Central** (Confirmed Seat).
  3. Show Leg 2: **Kanpur Central → Patna Junction** (Confirmed Seat on the exact same train).
  4. Point out the reassurance badge: *"Stay on this train — two tickets, berth may change at Kanpur."*

---

### Minute 4: Cross-Train Alternatives & Layover Protection
- **What to say:**  
  *"When same-train seats are impossible, Yatrai evaluates cross-train connections at major junctions like Kanpur, Prayagraj, or Pt. DD Upadhyaya. But we never leave travelers stranded with impossible 5-minute connections."*
- **What to do:**  
  1. Click **"Find Alternative Routes"** (or view automatic alternatives).
  2. Show a 2-train itinerary with a validated layover (e.g., 140 minutes).
  3. Highlight the clear safety warnings: *"Separate tickets. A missed connection is not protected."*
  4. Point out the tight connection tag if layover is under 180 minutes.

---

### Minute 5: Transparent Ledger & Budget Safety
- **What to say:**  
  *"How do we keep costs low and avoid blowing RailKit quotas? Look at the header debug bar."*
- **What to do:**  
  1. Point to the `X-RailKit-Calls` counter and budget summary.
  2. Show that warm cache hits cost **0 outbound calls**.
  3. Demonstrate that the entire direct + alternative search used well under the 40-call hard cap.
  4. Show the protected endpoint `/api/admin/usage` demonstrating daily tracking, monthly counter (10,000 plan, expires 13 Nov 2026), and recent action history.

---

## Known Limitations & Production Caveats

1. **Separate Tickets Required:**  
   Indian Railways does not currently support unified multi-leg PRS booking in a single PNR. Travelers must book Leg 1 and Leg 2 separately on IRCTC. Missed connections due to upstream train delays are not automatically compensated.

2. **No Live Running / Delay Data on Future Dates:**  
   RailKit's `Track Train` API only provides live GPS delay information for trains running today. For future journey dates, itineraries rely on scheduled timetables.

3. **Current Unverified Assumptions (Marked in Code):**
   - `TODO[MONOTONIC]`: The assumption that seat availability is monotonic across intermediate stations holds for General Quota (GN), but pooled quotas (PQWL, RLWL) may occasionally violate this.
   - `TODO[DATE_STRIP]`: Multi-date 4-day availability strip is populated directly when supported, with fallback to empty array.
   - `TODO[REDIS]`: In-memory and MongoDB TTL collections serve as the ledger; atomic Redis INCR should be added if running across distributed clusters.
