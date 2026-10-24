# Route Extension Architecture & Strategy Evaluation

## Executive Summary

Route extension is an advanced journey recovery strategy designed for Indian Railways (IRCTC / PRS) ticketing dynamics. In the PRS quota allocation model, long-distance express and Rajdhani trains frequently allocate separate seat quotas (General Quota vs Remote Location Quota / Pooled Quota). As a consequence, a train may be heavily waitlisted from origin $A$ to destination $B$, yet have immediately bookable confirmed berths from $A$ to a later stoppage $Y$ (or terminus) along the same train's scheduled route.

Under **Strategy A**, the passenger books the confirmed ticket from $A \to Y$ and safely deboards at their intended destination $B$.

---

## Strategy Comparison Matrix

| Strategy | Pattern | Implementation Status | Safety / Feasibility Assessment |
| :--- | :--- | :--- | :--- |
| **Strategy A** | **Destination Extension ($A \to Y$, deboard at $B$)** | **Implemented** (Gated via `EXTENSION_ENABLED`) | **Safe**: Indian Railways allows passengers to deboard early at any scheduled commercial stoppage. No boarding point amendment required. Minimal extra fare. |
| **Strategy B** | **Origin Pullback ($X \to B$, board at $A$)** | **NOT IMPLEMENTED** | **High Risk**: Passenger must formally update boarding station 4+ hours before charting, or TTE may forfeit berth for non-boarding. |
| **Strategy C** | **Multi-segment Extended Splits** | **NOT IMPLEMENTED** | **Excessive Risk**: Combines split tickets with extended endpoints, causing compounding delay risk, quota blowup, and budget exhaustion. |

---

## Strategy A: Route Extension (Implemented)

### Algorithm Specification
1. **Targeting**: Evaluated only when direct trains between $A$ and $B$ have no confirmed berths. Limited to the top 3 non-confirmed direct trains.
2. **Stoppage Invariant**: The train must have scheduled commercial stoppages at both $A$ and $B$, with $A$ occurring strictly before $B$.
3. **Candidate Selection**: Up to 3 commercial stoppages $Y_1, Y_2, Y_3$ immediately following $B$ are evaluated in order of distance (nearest to $B$ first).
4. **Early Termination**: Evaluates $A \to Y_i$. Stops immediately upon identifying the first `AVAILABLE` / `CONFIRMED` berth.
5. **Fare Calculation**: Calculates exact extra fare ($\Delta = \text{Fare}_{A \to Y} - \text{Fare}_{A \to B}$) when base fare is known.
6. **Telemetry**: Logs `extension_hit` event with train, station, and fare metrics.

### Safety & Operational Invariants
- **Fail-Open Isolation**: Executes within a dedicated 4-second timeout promise wrapper. Any provider failure, missing route data, rate limiting, or malformed payload results in zero extension plans, leaving baseline search results 100% intact.
- **Budget Carve-Out**: All availability and schedule calls are carved directly out of the existing cross-train verification budget. Hard caps (40 default / 60 button / 100 deep) are strictly maintained.
- **Cache Isolation**: All cache keys use the designated `ext:` namespace with short-lived error suppression (max 30 seconds).

---

## Strategy B: Origin Pullback (NOT IMPLEMENTED)

### Mechanism
In Origin Pullback, if $A \to B$ is waitlisted, the engine searches for an earlier station $X$ before $A$ where $X \to B$ has available seats under the originating quota. The ticket is booked from $X \to B$, with boarding intended at $A$.

### Critical Risk Notes
1. **Berth Forfeiture & No-Show Rule**: Under Indian Railway Conference Association (IRCA) Coaching Tariff rules, if a passenger fails to board at the ticketed origin station $X$ and has not formally updated the boarding station to $A$, the Ticket Collector / TTE is legally authorized to treat the passenger as a no-show after the train departs $X$ (or passes the next major junction), cancel the reservation, and allot the berth to waiting RAC passengers.
2. **Boarding Station Modification Constraints**: PRS allows boarding station changes only up to 4 hours before chart preparation (or chart finalization). If a user books last minute or fails to change boarding station in the IRCTC app, they face severe risk of arriving at $A$ only to find their seat given away.
3. **High Sunk Cost**: Booking from $X \to B$ incurs higher fare for journey kilometers the passenger never rides.
4. **Decision**: Strategy B is rejected as unsafe for the production demonstration.

---

## Strategy C: Multi-Segment Extended Split (NOT IMPLEMENTED)

### Mechanism
Strategy C combines endpoint extension with intermediate split-ticketing across two or more separate trains (e.g., Train 1 from $A \to H$, Train 2 from $H \to Y$, deboarding Train 2 at $B$).

### Critical Risk Notes
1. **Compounding Delay & Connection Risk**: Multi-train split tickets already carry the risk of unprotected missed connections. Combining this with an extended booking endpoint multiplies cognitive load and transfer friction.
2. **Quota & Outbound API Budget Explosion**: Generating and verifying combinations of 3 extension candidates across multiple transfer hubs would require $O(N \times M \times K)$ availability queries, immediately exhausting the per-action API caps (40/60/100) and triggering degraded mode.
3. **High Cancellation Penalties**: If one leg fails or an intermediate train is delayed, canceling tickets across multiple PNRs results in flat cancellation charges per ticket, negating any cost savings.
4. **Decision**: Strategy C is rejected due to quota constraints, connection risks, and combinatorial budget impact.
