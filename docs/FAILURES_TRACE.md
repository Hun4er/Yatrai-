# Yatrai P5 Failure Diagnosis & Trace Report

**Date & Time**: 2026-10-25 03:50 IST  
**Environment**: Production/Demo Live Provider (`https://api.railkit.in`)  
**Scope**: Diagnosis of failed availability checks on Patna (PNBE) ↔ New Delhi (NDLS) corridors.

---

## 1. Executive Summary & Observed Symptoms

During live search on the `PNBE ↔ NDLS` corridor, users encountered:
1. High failure rates: e.g. *"Checked 12–15 segments on 8 trains. 6 could not be checked."*
2. Red failure chips on trains: `2A · couldn't check — tap to retry`, `3A · couldn't check — tap to retry`.
3. Erroneous destination banner: `Arrives at NDLS (NDLS), not NEW DELHI` for trains legitimately arriving at New Delhi.
4. Hard-coded Station Expansion banner mentioning downstream stations (Rajendra Nagar / Patna Saheb) even on reverse routes (Patna → Delhi) or when no extension was found.

---

## 2. Quantitative Failure Trace by Root Cause

From empirical reproduction across 4 test matrices:
- `PNBE -> NDLS` (Today: 2026-10-25)
- `PNBE -> NDLS` (7 days ahead: 2026-11-01)
- `NDLS -> PNBE` (Today: 2026-10-25)
- `NDLS -> PNBE` (7 days ahead: 2026-11-01)

| HTTP / Error Category | Raw Provider Error Message | Count | Classification | Root Cause |
| :--- | :--- | :--- | :--- | :--- |
| **HTTP 400 (Bad Param / Stn Mismatch)** | `"not an intermediate station of train"` | 2 | `PARAM` | **Code Bug**: `directPass.service.js` forced cluster params `PNBE->NDLS` on trains that actually terminate at `ANVT` (e.g. 12367 Vikramshila) or depart from `PPTA` (e.g. 12487 Seemanchal). |
| **HTTP 400 (Bad Param / Stn Mismatch)** | `"Unable to process your request"` | 4 | `PARAM` | **Code Bug**: Train 12423 departs `PPTA`, but `directPass` queried `PNBE`. Train 20507 runs only on Saturdays from PNBE, but `isRunningOnDate` evaluated true on Sunday. |
| **HTTP 400 (Class Not Offered)** | `"Class does not exist in this train for this Train route"` | 1 | `NOT_BOOKABLE` | Train 02251 (Vande Bharat) only has `CC`/`EC`. Sleeper `3A` was queried when `classes_of_travel` was empty. |
| **HTTP 200 (Train Departed)** | `"TRAIN DEPARTED"` | 1 | `NOT_BOOKABLE` | Train 15483 departs at 03:00 AM; query at 03:45 AM returned `TRAIN DEPARTED`. Correctly non-bookable, not an API error. |
| **Timeout (AbortError)** | `"This operation was aborted"` (> 8000 ms) | 1 | `TRANSIENT` | Outbound RailKit `/trains/cancelled` endpoint exceeded 8000 ms timeout. |
| **HTTP 429 (Rate Limit)** | `"Rate limit exceeded"` | 0 | `TRANSIENT` | Did not trigger during low-concurrency test, but concurrency bursts cause transient 429s. |
| **HTTP 401 / 403 (Auth/Quota)** | `"Invalid API Key"` / quota block | 0 | `AUTH_QUOTA` | API key is valid; monthly quota has 80% remaining (1,978 / 10,000 used). |
| **HTTP 5xx (Provider Server)** | `500/502/503 Service Unavailable` | 0 | `TRANSIENT` | No 5xx in sample window. |
| **JSON Parse Error** | SyntaxError on non-JSON response | 0 | `TRANSIENT` | Provider returned valid JSON on all completed calls. |

---

## 3. Detailed Root Cause Analysis

### Cause 1: Cluster Code Override Bug (Primary Cause of 400s)
In `server/src/services/rail/directPass.service.js`:
```javascript
// BUGGY CODE:
for (const [from, to] of limitedPairs) {
  const res = await this.railKit.searchTrainBetweenStations(from, to, ...);
  if (res?.success && Array.isArray(res.data)) {
    for (const t of res.data) {
      allTrains.push({ ...t, _from: from, _to: to }); // Overwrote train's actual stations!
    }
  }
}
```
RailKit's `trains/between/PNBE/NDLS` returns trains for the entire Patna/Delhi railway hub (including Patliputra `PPTA`, Danapur `DNR`, Anand Vihar `ANVT`, Old Delhi `DLI`).
By forcing `_from = from` (`PNBE`) and `_to = to` (`NDLS`), the subsequent availability call requested:
- `12367 PNBE -> NDLS` (Train terminates at `ANVT`, not `NDLS`) $\to$ **HTTP 400: not an intermediate station**
- `12423 PNBE -> NDLS` (Train departs from `PPTA`, not `PNBE`) $\to$ **HTTP 400: Unable to process**
- `12487 PNBE -> NDLS` (Train runs `PPTA -> ANVT`) $\to$ **HTTP 400: not an intermediate station**

**Fix**:
Always prioritize the train's actual stoppage stations:
```javascript
const actualFrom = t.from_stn_code || t.from_station_code || t.fromCode || from;
const actualTo = t.to_stn_code || t.to_station_code || t.toCode || to;
allTrains.push({ ...t, _from: actualFrom, _to: actualTo });
```

### Cause 2: Day-of-Week Off-by-One in `isRunningOnDate`
In `directPass.service.js`:
```javascript
// BUGGY CODE:
const monIdx = (dayIndex + 6) % 7;
return runDays[dayIndex] === '1' || runDays[monIdx] === '1'; // Checked BOTH Monday and Sunday!
```
RailKit `running_days` uses Monday as index 0 (`0=Mon, 1=Tue, ..., 6=Sun`).
By using `||` with JavaScript's `dayIndex` (`0=Sun, 1=Mon`), trains running only on Mondays were marked as running on Sundays, causing RailKit to reject the query with HTTP 400.

**Fix**:
Strictly use Monday-based index:
```javascript
const monIdx = (dayIndex + 6) % 7;
return runDays[monIdx] === '1';
```

### Cause 3: Station Name vs Code Comparison in UI
In `client/src/components/journey/P0DirectTrainCard.jsx`:
```javascript
// BUGGY CODE:
Arrives at {train.toName || to} ({to}), not {destinationName || destinationCode}
```
When user typed `"New Delhi"`, `destinationName` was `"New Delhi"` and `to` was `"NDLS"`. Since `'NDLS' !== 'New Delhi'`, it rendered:
`Arrives at NDLS (NDLS), not NEW DELHI`.

**Fix**:
Compare resolved cluster IDs or resolved station codes, never compare a 4-letter station code against a full city name.
