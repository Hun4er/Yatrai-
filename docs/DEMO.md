# Yatrai Live Demo Script (5 Minutes)

> **Audience:** Final-year project evaluation panel, engineering evaluators, stakeholders.  
> **Goal:** Showcase Yatrai's P0/P1 split-ticketing engine, sub-second cached responses, transparent call budgets, alternatives-first ordering, and bulletproof demo fallback.

---

## Pre-Demo Checklist

1. **Start backend & frontend dev servers:**
   ```bash
   cd server && npm run dev
   cd client && npm run dev
   ```
2. **Seed static cache for instant demo responses (max 40 calls, takes ~15s):**
   ```bash
   npm run seed:demo
   ```
3. **Open browser:**
   - Normal mode: `http://localhost:5173/`
   - Debug mode (shows call counters, budget caps, and latencies): `http://localhost:5173/?debug=1`

---

## 5-Minute Demo Walkthrough

### Minute 1: The Problem — Direct Trains Sold Out
- **What to say:**  
  *"Every festive season or peak travel weekend, millions of Indian Railways travelers face the exact same frustrating screen: 'Waitlist 150 — Regret / No tickets available.' Traditional apps stop right there. Yatrai was built on a different principle: The destination is fixed; the route is dynamically discoverable."*
- **What to do:**  
  1. Open the home search page (`http://localhost:5173/?debug=1`).
  2. In **Origin**, type **"New Delhi"** (`NDLS`). Autocomplete cleanly resolves.
  3. In **Destination**, type **"Patna"** (`PNBE`).
  4. Select journey date: **30 Nov 2026** (or **22 Oct 2026**) and Travel Class: **"3A"** (or **"ANY"**).
  5. Click **"Search Trains"**.

---

### Minute 2: Header Summary, Ordering Rules & Dynamic Chips
- **What to say:**  
  *"Notice the header immediately: it gives real, factual numbers — '0 confirmed direct / 5 waitlisted direct / 4 alternatives'. When no direct train has a confirmed seat, Yatrai's ordering rule automatically promotes Alternative Journeys to the top of the screen so the user immediately sees guaranteed seats, while direct trains sit below with a clean 'Show all direct trains' toggle."*
- **What to do:**  
  1. Point to the top header counts: **"0 confirmed direct / 5 waitlisted direct / 4 alternatives"**.
  2. Point out that the **Alternative Journeys** section appears **FIRST** above direct trains.
  3. Scroll down to direct trains and expand the **"Show all direct trains"** toggle.
  4. Point to train cards (e.g. 12310 Rajdhani arriving at Danapur DNR):
     - Highlight the destination note badge: *"Arrives at Danapur (DNR), not Patna Jn"*.
     - Point out the rich class chips: `3A · WL 11 · 89% · ₹2,545` (exact status, WL number, prediction %, and real fare).
  5. Tap any unverified **"1A · ?"** chip:
     - It performs a targeted 1-call verification, displays real availability, and updates without page reloads.

---

### Minute 3: Same-Train Split Magic — "Stay on this Train"
- **What to say:**  
  *"Here is Yatrai's unique breakthrough: Same-Train Splitting. If Delhi to Patna is waitlisted on Train 12310, does that mean the train is full across its entire 1,000km route? No! Different quotas exist between intermediate junctions like Kanpur or Prayagraj. Yatrai finds where seats open up."*
- **What to do:**  
  1. In the Alternative Journeys section, click the pill button **"4 alternatives added"** (scrolls smoothly to the cards).
  2. Point to the top card with the amber star badge: **"Stay on this train — two tickets, berth may change at CNB"**.
  3. Expand the card to reveal the two legs:
     - **Leg 1:** NDLS → CNB (17:10 → 21:50) · 3A · `AVL 14` · ₹1,120
     - **Leg 2:** CNB → PNBE (21:55 → 04:38) · 3A · `AVL 8` · ₹1,360
  4. Highlight the key guarantee: *Total Duration: 11h 28m, Total Fare: ₹2,480 — 100% Confirmed seat all the way!*

---

### Minute 4: Cross-Train Connections & Honest Safety Badges
- **What to say:**  
  *"When same-train seats are exhausted, Yatrai constructs cross-train combinations at major junction hubs. But we enforce strict safety: layovers must be between 90 and 600 minutes, and tight connections under 3 hours are clearly flagged."*
- **What to do:**  
  1. Point to a cross-train connection card (e.g., via Kanpur or Prayagraj).
  2. Point out the honest safety badge: *"Separate tickets — a missed connection is not protected."*
  3. Show the layover badge (e.g. *140 min layover at Kanpur Central* with the warning pill *"Tight connection (< 3h)"*).
  4. If a plan is waitlisted rather than confirmed, point out the honest banner: *"Risky — waitlisted: waitlisted — not guaranteed"*.

---

### Minute 5: Transparent Budget Ledger & Zero-Cost Caching
- **What to say:**  
  *"How do we prevent runaway API costs? Every search action is governed by an atomic budget ledger with hard caps: 40 calls for direct/auto, 60 for the alternatives button, and 100 for deep search. Watch what happens when we repeat the search."*
- **What to do:**  
  1. Point out the debug bar showing calls used (e.g. 6/40 calls on cold run).
  2. Click **"Search Trains"** again or refresh:
     - Response time drops to **sub-50ms**.
     - Calls consumed: **0 outbound calls** (100% cache hit).
  3. Demonstrate the admin endpoint `http://localhost:5000/api/admin/usage?secret=yatrai_admin_secret_key`:
     - Displays calls today, monthly limit (10,000, expires 13 Nov 2026), cache hit rate, and the audit ledger of recent actions.

---

## Fallback Plan: If RailKit API is Down or Degraded

If live PRS/RailKit APIs experience downtime, high load (HTTP 429), or 5xx provider disruptions during the demo:

1. **Automatic DEMO_MODE Fallback:**
   - In `server/.env`, set:
     ```env
     DEMO_MODE=true
     ```
   - When RailKit errors or times out, Yatrai automatically falls back to the pre-seeded static cache and serves the last good verified response.
   - The UI automatically adds a small, honest label: **`cached result`** on cards and chips, with a top notice: *"Live provider unavailable — serving last good cached result"*.
   - Searches continue to work smoothly and sub-second without crashes.

2. **Pre-Captured UI Screenshots:**
   - Full high-resolution screenshots for both Desktop (1280px) and Mobile (390px) are archived in:
     `docs/screens/final/`
   - Key screenshots include:
     - `search-form.png`: Autocomplete and date picker.
     - `alternatives-first.png`: Alternative journeys rendered above direct trains when waitlisted.
     - `same-train-split.png`: "Stay on this train" card with leg details and fares.
     - `class-chips-tap.png`: Live check-class dynamic chip verification.
     - `admin-usage.png`: Real-time call quota tracking.

---

## Route Extension (Strategy A) Demo Guide

Route Extension discovers confirmed quota on downstream stations (Y > B) on direct trains that are waitlisted to destination B. Passengers can legally book to Y and deboard early at B.

### How to Enable for Demo
1. In server/.env, set:
   EXTENSION_ENABLED=true
2. Restart the backend service:
   cd server && npm run dev

### Demonstration Route & Behavior
- Default (Flag OFF): EXTENSION_ENABLED=false (or omitted). The API response returns features: { extension: false }. Extension plans are neither fetched nor returned; non-extension plans, order, and counts are 100% identical to baseline.
- Enabled (Flag ON): When direct trains to destination B are waitlisted, Strategy A queries up to 3 candidate downstream stoppages (Y > B) on the top 3 direct trains, stopping at the first confirmed seat.
- Verified Corridor:
  - On corridors where downstream seats exist (e.g., booking to a terminal station Y), an extension card renders at the top of the Alternative Journeys list with:
    - ROUTE EXTENSION emerald badge
    - CONFIRMED berth status
    - Explanatory banner: Book to [Y] — Deboard at [B]
    - Breakdown of any extra fare paid for the extension berth.
  - On corridors where downstream stations are waitlisted or the train terminates at destination B (such as PUNE -> NGP verified in live testing), the engine fails open, consumes minimal budget, and returns existing alternatives without errors.
- Rollback:
  - Instantly disable by setting EXTENSION_ENABLED=false in server/.env and restarting the server (no code redeploy required).
