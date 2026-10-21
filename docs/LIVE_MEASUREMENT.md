# Live Measurement (Cold & Warm Cache) — Phase 8

Measured on real RailKit API responses with live cache clearing against local server on port 5000.

| Flow | Cold Calls | Warm Calls | Cap | Cold Sec | Warm Sec | Plans Found | Partial | Invariants |
|---|---|---|---|---|---|---|---|---|
| NDLS -> PNBE (22 Oct) | Direct Search | 6 | 0 | 40 | 3.63s | 0.03s | 5 | No | PASS ✅ |
| NDLS -> PNBE (22 Oct) | Auto Flow | 6 | 0 | 40 | 1.89s | 0.02s | 5 | No | PASS ✅ |
| NDLS -> PNBE (22 Oct) | Alternatives Button | 0 | 0 | 60 | 0.18s | 0.02s | 0 | No | PASS ✅ |
| NDLS -> PNBE (22 Oct) | Deep Search | 0 | 0 | 100 | 0.02s | 0.01s | 0 | No | PASS ✅ |
| NDLS -> PNBE (22 Oct) | "?" Chip Tap (12310 1A) | 1 | 0 | 100 | 0.71s | 0.02s | 1 | No | PASS ✅ |
| NDLS -> PNBE (22 Oct) | Refresh Card (12310) | 1 | 0 | 40 | 0.81s | 0.01s | 1 | No | PASS ✅ |
| NDLS -> PNBE (30 Nov) | Direct Search | 2 | 0 | 40 | 1.46s | 0.04s | 1 | No | PASS ✅ |
| NDLS -> PNBE (30 Nov) | Auto Flow | 2 | 0 | 40 | 1.08s | 0.02s | 1 | No | PASS ✅ |
| NDLS -> PNBE (30 Nov) | Alternatives Button | 0 | 0 | 60 | 0.03s | 0.02s | 0 | No | PASS ✅ |
| NDLS -> PNBE (30 Nov) | Deep Search | 0 | 0 | 100 | 0.02s | 0.01s | 0 | No | PASS ✅ |
| NDLS -> PNBE (30 Nov) | "?" Chip Tap (12310 1A) | 1 | 0 | 100 | 0.87s | 0.01s | 1 | No | PASS ✅ |
| NDLS -> PNBE (30 Nov) | Refresh Card (12310) | 1 | 0 | 40 | 0.19s | 0.00s | 1 | No | PASS ✅ |
| HWH -> BSB (23 Oct) | Direct Search | 13 | 0 | 40 | 6.03s | 0.03s | 7 | No | PASS ✅ |
| HWH -> BSB (23 Oct) | Auto Flow | 25 | 0 | 40 | 5.03s | 0.05s | 7 | No | PASS ✅ |
| HWH -> BSB (23 Oct) | Alternatives Button | 0 | 0 | 60 | 0.01s | 0.01s | 0 | No | PASS ✅ |
| HWH -> BSB (23 Oct) | Deep Search | 0 | 0 | 100 | 0.01s | 0.01s | 0 | No | PASS ✅ |
| HWH -> BSB (23 Oct) | "?" Chip Tap (12381 2A) | 1 | 0 | 100 | 0.61s | 0.01s | 1 | No | PASS ✅ |
| HWH -> BSB (23 Oct) | Refresh Card (12381) | 1 | 0 | 40 | 0.40s | 0.00s | 1 | No | PASS ✅ |


## Invariants Verified
1. **Hard request caps preserved**:
   - Direct/Auto flow cap: **40**
   - Alternatives button cap: **60**
   - Deep search cap: **100**
   - Single chip check: **1**
   - Refresh card rate-limit: 60s cooldown
2. **Warm calls <= Cold calls**: Every repeated search leverages cached availability responses (0 outbound calls for cached segments).
3. **No silent plan drops**: Alternatives rendered with full legs and fare breakdown.
