/**
 * DirectPassService  (P0 v2)
 *
 * Implements the P0 v2 DIRECT PASS algorithm:
 *
 *  1. getCancelledTrains(date) [cached 1h], searchTrains per station pair (cap 4 pairs).
 *  2. Drop: cancelled, not running that day, already departed, no reservable class
 *     (unless classes_of_travel is empty).
 *  3. Rank rows: shortest travel time first, then earliest departure.
 *     Top 8 → round-1 candidates. Rest → waitingTrains ("Check more trains").
 *  4. Round 1: ONE class per candidate = requested class if given, else first class
 *     from CAPACITY_ORDER that the train offers. Empty-class trains get no round-1 check.
 *  5. If any train is CONFIRMED → stop direct pass here. Remaining classes stay "?" chips
 *     (1 call on tap), remaining trains stay in waitingTrains.
 *  6. All-WL: round 2 checks the next CAPACITY_ORDER class on the 5 trains with the
 *     highest predictionPercentage from round 1 (skip if cap would be exceeded).
 *  7. Return per-train classes[{class,state,tier,availabilityText,fare,predictionPercentage,
 *     dates,checkedAt}], waitingTrains, uncheckedClasses.
 */

import railKitAdapter from '../../providers/rail/railKit.adapter.js';
import availabilityService, { AVAILABILITY_STATUS } from './availability.service.js';
import cancelledTrainsService from './cancelledTrains.service.js';
import actionBudgetService from './actionBudget.service.js';
import { formatJourneyDate } from '../../utils/railwayTime.js';
import { calculateJourneyTiming } from '../../utils/railwayTime.js';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

const p0v2 = config.p0v2;
const CAPACITY_ORDER = p0v2.capacityOrder; // ['SL','3A','3E','CC','2S','2A','EC','1A']
const ROUND1_MAX = p0v2.directRound1Candidates;  // 8
const ROUND2_MAX = p0v2.directRound2Candidates;  // 5
export const MORE_TRAINS_BATCH = p0v2.moreTrainsBatch || 8;
const SEARCH_PAIRS_MAX = p0v2.searchPairsMax;    // 4

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeClasses(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') {
    return raw.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c) =>
    typeof c === 'string' && c.includes(',')
      ? c.split(',').map((x) => x.trim().toUpperCase())
      : String(c).trim().toUpperCase()
  ).filter(Boolean);
}

function pickRound1Class(offeredClasses, requestedClass) {
  if (!offeredClasses || offeredClasses.length === 0) return null; // no round-1 check
  const offered = normalizeClasses(offeredClasses);
  if (requestedClass) {
    const req = String(requestedClass).trim().toUpperCase();
    if (offered.includes(req)) return req;
  }
  // First from CAPACITY_ORDER that the train offers
  for (const cls of CAPACITY_ORDER) {
    if (offered.includes(cls)) return cls;
  }
  return null;
}

function pickRound2Class(offeredClasses, round1Class) {
  const offered = normalizeClasses(offeredClasses);
  let foundRound1 = false;
  for (const cls of CAPACITY_ORDER) {
    if (cls === round1Class) { foundRound1 = true; continue; }
    if (foundRound1 && offered.includes(cls)) return cls;
  }
  return null;
}

function getTrainNumber(t) {
  return String(t.train?.number || t.train_number || t.trainNumber || t.number || t.train_no || '');
}

function getTrainName(t) {
  return t.train?.name || t.train_name || t.trainName || t.name || '';
}

function isRunningOnDate(train, departureDateStr) {
  const runDays = train.runDays || train.run_days || train.runsOnDays || train.train?.runDays || train.train?.run_days || train.running_days || [];
  if (!runDays || runDays.length === 0) return true;
  const dateObj = new Date(departureDateStr + 'T00:00:00+05:30');
  const dayIndex = dateObj.getDay();
  if (typeof runDays === 'string') {
    if (runDays === '1111111') return true;
    if (/^[01]{7}$/.test(runDays)) {
      const monIdx = (dayIndex + 6) % 7;
      return runDays[dayIndex] === '1' || runDays[monIdx] === '1';
    }
    return true;
  }
  if (Array.isArray(runDays)) {
    const dayOfWeek = ['sun','mon','tue','wed','thu','fri','sat'][dayIndex];
    return runDays.some((d) => String(d).toLowerCase().slice(0, 3) === dayOfWeek);
  }
  return true;
}

function hasAlreadyDeparted(train, departureDateStr) {
  const now = Date.now();
  try {
    const depTime = train.departureTime || train.departure_time || train.from?.departure || train.from_time || train.departureTimeIso || '';
    if (!depTime) return false;
    if (typeof depTime === 'string' && depTime.includes('T')) {
      const d = new Date(depTime);
      return !isNaN(d.getTime()) && d.getTime() < now;
    }
    const match = /^(\d{1,2}):(\d{2})/.exec(String(depTime).trim());
    if (!match) return false;
    const hh = String(match[1]).padStart(2, '0');
    const mm = String(match[2]).padStart(2, '0');
    const trainDate = new Date(`${departureDateStr}T${hh}:${mm}:00+05:30`);
    return !isNaN(trainDate.getTime()) && trainDate.getTime() < now;
  } catch { return false; }
}

function travelMinutes(train) {
  const dur = train.duration || train.travel_time || train.travelTime;
  if (dur && typeof dur === 'number') return dur;
  if (typeof dur === 'string') {
    const match = /(\d{1,2}):(\d{2})/.exec(dur);
    if (match) {
      return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    }
  }
  return 9999;
}

function departureMinutes(train) {
  const dep = train.departureTime || train.departure_time || train.from?.departure || train.from_time || '00:00';
  const match = /^(\d{1,2}):(\d{2})/.exec(String(dep).trim());
  if (match) {
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }
  return 0;
}

/**
 * Builds the per-class chip state for a train.
 */
function buildClassChip(cls, state, availResult) {
  const chip = {
    class: cls,
    state, // 'CHECKED' | 'UNCHECKED' | 'UNVERIFIED'
    tier: null,
    availabilityText: null,
    fare: null,
    predictionPercentage: 0,
    dates: [],
    checkedAt: null,
  };
  if (availResult) {
    chip.tier = availResult.normalizedStatus;
    chip.availabilityText = availResult.statusText || availResult.originalStatus || null;
    chip.predictionPercentage = availResult.predictionPercentage || 0;
    // TODO[DATE_STRIP]: RailKit multi-date field name TBD. Using availResult.dates if present.
    chip.dates = availResult.dates || [];
    chip.checkedAt = new Date().toISOString();
  }
  return chip;
}

// ── Main service ───────────────────────────────────────────────────────────────

export class DirectPassService {
  constructor(dependencies = {}) {
    this.railKit = dependencies.railKit || railKitAdapter;
    this.availabilityService = dependencies.availabilityService || availabilityService;
    this.cancelledTrainsService = dependencies.cancelledTrainsService || cancelledTrainsService;
    this.actionBudgetService = dependencies.actionBudgetService || actionBudgetService;
  }

  /**
   * Executes the P0 v2 direct pass.
   *
   * @param {object} params
   * @param {string[]} params.origins - array of station codes (cluster pairs)
   * @param {string[]} params.destinations - array of station codes (cluster pairs)
   * @param {string} params.date - "YYYY-MM-DD"
   * @param {string} params.travelClass - requested class or "ANY"
   * @param {string} [params.quota] - "GN"
   * @param {string} params.actionId
   * @param {string} [params.actionType] - 'default' | 'alternatives_button' | 'deep'
   * @returns {Promise<object>}
   */
  async run({ origins, destinations, date, travelClass, quota = 'GN', actionId, actionType = 'default' }) {
    const dateStr = formatJourneyDate(date) || String(date).slice(0, 10);
    const requestedClass = travelClass && travelClass !== 'ANY' ? String(travelClass).toUpperCase() : null;
    const budget = this.actionBudgetService;

    logger.info(`[DirectPass] Starting for ${origins.join(',')} → ${destinations.join(',')}, date=${dateStr}, class=${requestedClass || 'ANY'}, actionId=${actionId}`);

    // ── Step 1: getCancelledTrains ─────────────────────────────────
    const isCancelledCached = typeof this.cancelledTrainsService.hasCached === 'function' &&
      this.cancelledTrainsService.hasCached(dateStr);
    const ok1 = await budget.recordCall({
      actionId,
      phase: 'direct',
      endpoint: 'cancelledTrains',
      cacheHit: isCancelledCached,
      cost: isCancelledCached ? 0 : 1,
    });
    let cancelledSet = new Set();
    if (ok1) {
      try {
        cancelledSet = await this.cancelledTrainsService.getCancelledTrains(dateStr, this.railKit);
      } catch (err) {
        logger.warn(`[DirectPass] getCancelledTrains failed: ${err.message}`);
      }
    }

    // ── Step 1b: searchTrains per station pair (cap SEARCH_PAIRS_MAX) ──
    const pairs = this._buildPairs(origins, destinations);
    const limitedPairs = pairs.slice(0, SEARCH_PAIRS_MAX);
    const allTrains = [];
    let searchCacheHits = 0;
    let hadProviderError = false;

    for (const [from, to] of limitedPairs) {
      const isSearchCached = typeof this.railKit.hasCachedSearch === 'function' &&
        this.railKit.hasCachedSearch(from, to, dateStr);
      const ok = await budget.recordCall({
        actionId,
        phase: 'direct',
        endpoint: 'searchTrains',
        cacheHit: isSearchCached,
        cost: isSearchCached ? 0 : 1,
      });
      if (!ok) {
        logger.info(`[DirectPass] Budget cap reached during search pairs.`);
        break;
      }
      try {
        const cacheKey = `search:${from}:${to}:${dateStr}`;
        const res = await budget.singleFlight(cacheKey, async () => {
          if (typeof this.railKit.searchTrainBetweenStations === 'function') {
            return this.railKit.searchTrainBetweenStations(from, to, {
              date: dateStr,
              // 7-day shared cache — railKit adapter handles caching internally
            });
          }
          return null;
        });

        if (res?.cacheHit || isSearchCached) {
          searchCacheHits++;
          if (res?.cacheHit && !isSearchCached) {
            await budget.recordCacheHit(actionId);
            const state = await budget.getOrCreate(actionId);
            state.used = Math.max(0, state.used - 1);
            state.usedDirect = Math.max(0, (state.usedDirect || 1) - 1);
          }
        }

        if (res?.success && Array.isArray(res.data)) {
          for (const t of res.data) {
            allTrains.push({ ...t, _from: from, _to: to });
          }
        }
      } catch (err) {
        logger.warn(`[DirectPass] searchTrains ${from}→${to} failed: ${err.message}`);
        if (err.status === 429 || (err.status >= 500 && err.status < 600) || /429|5\d\d/.test(err.message)) {
          hadProviderError = true;
        }
      }
    }

    logger.info(`[DirectPass] Search phase: ${allTrains.length} raw trains, ${searchCacheHits} cache hits`);

    // ── Step 2: Filter ────────────────────────────────────────────
    const filtered = allTrains.filter((t) => {
      const num = getTrainNumber(t);
      if (!num) return false;
      if (cancelledSet.has(num)) return false;
      if (!isRunningOnDate(t, dateStr)) return false;
      if (hasAlreadyDeparted(t, dateStr)) return false;
      // Drop trains with no reservable class UNLESS classes_of_travel is empty
      const classes = normalizeClasses(t.classes || t.train?.classes || t.classes_of_travel || []);
      const hasReservableClass = classes.some((c) => CAPACITY_ORDER.includes(c));
      if (classes.length > 0 && !hasReservableClass) return false;
      return true;
    });

    // Deduplicate by train number (keep shortest pair)
    const seenMap = new Map();
    for (const t of filtered) {
      const num = getTrainNumber(t);
      const existing = seenMap.get(num);
      if (!existing || travelMinutes(t) < travelMinutes(existing)) {
        seenMap.set(num, t);
      }
    }
    const dedupedTrains = Array.from(seenMap.values());

    // ── Step 3: Rank ───────────────────────────────────────────────
    dedupedTrains.sort((a, b) => {
      const durA = travelMinutes(a);
      const durB = travelMinutes(b);
      if (durA !== durB) return durA - durB;
      return departureMinutes(a) - departureMinutes(b);
    });

    const round1Candidates = dedupedTrains.slice(0, ROUND1_MAX);
    const waitingTrains = dedupedTrains.slice(ROUND1_MAX).map((t) => ({
      trainNumber: getTrainNumber(t),
      trainName: getTrainName(t),
      from: t._from || t.from_station_code || t.from_stn_code || t.from,
      to: t._to || t.to_station_code || t.to_stn_code || t.to,
      departureTime: t.departureTime || t.departure_time || t.from?.departure || t.from_time || null,
      arrivalTime: t.arrivalTime || t.arrival_time || t.to?.arrival || t.to_time || null,
      duration: travelMinutes(t),
      classes: normalizeClasses(t.classes || t.train?.classes || t.classes_of_travel || []),
      checkedClasses: [],
    }));

    logger.info(`[DirectPass] Round-1 candidates: ${round1Candidates.length}, waitingTrains: ${waitingTrains.length}`);

    // ── Step 4: Round 1 — ONE class per candidate ──────────────────
    const results = [];
    let confirmedFound = false;

    for (const train of round1Candidates) {
      const num = getTrainNumber(train);
      const offered = normalizeClasses(train.classes || train.train?.classes || train.classes_of_travel || []);
      const round1Class = pickRound1Class(offered, requestedClass);

      const fromStn = train._from || train.from_station_code || train.from_stn_code || train.from;
      const toStn = train._to || train.to_station_code || train.to_stn_code || train.to;

      const trainResult = {
        trainNumber: num,
        trainName: getTrainName(train),
        from: fromStn,
        to: toStn,
        departureTime: train.departureTime || train.departure_time || train.from?.departure || train.from_time || null,
        arrivalTime: train.arrivalTime || train.arrival_time || train.to?.arrival || train.to_time || null,
        duration: travelMinutes(train),
        offeredClasses: offered,
        classes: [],
        checkedAt: null,
      };

      if (!round1Class) {
        // No class to check — mark all as UNVERIFIED
        trainResult.classes = offered.map((c) => buildClassChip(c, 'UNVERIFIED', null));
        results.push(trainResult);
        continue;
      }

      // Check budget before this availability call
      const isAvailCached = typeof this.availabilityService.hasCached === 'function' &&
        this.availabilityService.hasCached(num, train._from, train._to, dateStr, round1Class, quota);
      const okAvail = await budget.recordCall({
        actionId,
        phase: 'direct',
        endpoint: 'seatAvailability',
        cacheHit: isAvailCached,
        cost: isAvailCached ? 0 : 1,
      });
      if (!okAvail) {
        trainResult.classes = offered.map((c) =>
          buildClassChip(c, 'UNCHECKED', null)
        );
        results.push(trainResult);
        continue;
      }

      // Availability call
      let availResult = null;
      try {
        availResult = await this.availabilityService.checkLegAvailability({
          trainNumber: num,
          fromCode: train._from,
          toCode: train._to,
          date: dateStr,
          travelClass: round1Class,
          quota,
          offeredClasses: offered,
        });
        trainResult.checkedAt = new Date().toISOString();
      } catch (err) {
        logger.warn(`[DirectPass] Availability check failed for ${num}: ${err.message}`);
        if (err.status === 429 || (err.status >= 500 && err.status < 600) || /429|5\d\d/.test(err.message)) {
          hadProviderError = true;
        }
      }

      // Build class chips
      const chips = offered.map((c) => {
        if (c === round1Class) {
          return buildClassChip(c, 'CHECKED', availResult);
        }
        return buildClassChip(c, 'UNCHECKED', null);
      });
      trainResult.classes = chips;
      results.push(trainResult);

      // Step 5: Early stop if CONFIRMED
      if (availResult?.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE) {
        confirmedFound = true;
        logger.info(`[DirectPass] Confirmed seat found on train ${num} in class ${round1Class}. Early stop.`);
        // Remaining candidates become waitingTrains
        const remaining = round1Candidates.slice(round1Candidates.indexOf(train) + 1);
        for (const rt of remaining) {
          waitingTrains.unshift({
            trainNumber: getTrainNumber(rt),
            trainName: getTrainName(rt),
            from: rt._from || rt.from_station_code || rt.from,
            to: rt._to || rt.to_station_code || rt.to,
            departureTime: rt.departureTime || rt.departure_time || rt.from?.departure || null,
            arrivalTime: rt.arrivalTime || rt.arrival_time || rt.to?.arrival || null,
            duration: travelMinutes(rt),
            classes: normalizeClasses(rt.classes || rt.train?.classes || []),
            checkedClasses: [],
          });
        }
        break;
      }
    }

    // ── Step 6: Round 2 (all WL) ───────────────────────────────────
    if (!confirmedFound) {
      // Sort checked results by predictionPercentage (highest first)
      const withPred = results.filter((r) => r.classes.some((c) => c.state === 'CHECKED'));
      withPred.sort((a, b) => {
        const pa = Math.max(...a.classes.map((c) => c.predictionPercentage || 0));
        const pb = Math.max(...b.classes.map((c) => c.predictionPercentage || 0));
        return pb - pa;
      });
      const top5 = withPred.slice(0, ROUND2_MAX);

      for (const trainResult of top5) {
        const r1Chip = trainResult.classes.find((c) => c.state === 'CHECKED');
        if (!r1Chip) continue;
        const r2Class = pickRound2Class(trainResult.offeredClasses, r1Chip.class);
        if (!r2Class) continue;

        const isR2Cached = typeof this.availabilityService.hasCached === 'function' &&
          this.availabilityService.hasCached(trainResult.trainNumber, trainResult.from, trainResult.to, dateStr, r2Class, quota);
        const okR2 = await budget.recordCall({
          actionId,
          phase: 'direct',
          endpoint: 'seatAvailability',
          cacheHit: isR2Cached,
          cost: isR2Cached ? 0 : 1,
        });
        if (!okR2) break;

        let r2Avail = null;
        try {
          r2Avail = await this.availabilityService.checkLegAvailability({
            trainNumber: trainResult.trainNumber,
            fromCode: trainResult.from,
            toCode: trainResult.to,
            date: dateStr,
            travelClass: r2Class,
            quota,
          });
        } catch (err) {
          logger.warn(`[DirectPass] Round-2 availability check failed for ${trainResult.trainNumber}: ${err.message}`);
          if (err.status === 429 || (err.status >= 500 && err.status < 600) || /429|5\d\d/.test(err.message)) {
            hadProviderError = true;
          }
        }

        // Add or update the chip for r2Class
        const existingIdx = trainResult.classes.findIndex((c) => c.class === r2Class);
        const newChip = buildClassChip(r2Class, 'CHECKED', r2Avail);
        if (existingIdx >= 0) {
          trainResult.classes[existingIdx] = newChip;
        } else {
          trainResult.classes.push(newChip);
        }
        trainResult.checkedAt = new Date().toISOString();
      }
    }

    const allCancelled = allTrains.length > 0 && filtered.length === 0 && allTrains.every((t) => cancelledSet.has(getTrainNumber(t)));
    const noTrainsFound = allTrains.length === 0 && !hadProviderError;

    const budgetSummary = await budget.getBudgetSummary(actionId);
    const partial = budget.isAtCap(actionId) || hadProviderError;

    logger.info(`[DirectPass] Done. Results: ${results.length}, waitingTrains: ${waitingTrains.length}, confirmed: ${confirmedFound}, partial: ${partial}, budget: ${budgetSummary.used}/${budgetSummary.cap}`);

    return {
      direct: results,
      waitingTrains,
      uncheckedClasses: results.flatMap((r) =>
        r.classes.filter((c) => c.state === 'UNCHECKED').map((c) => ({ trainNumber: r.trainNumber, class: c.class }))
      ),
      confirmedFound,
      partial,
      hadProviderError,
      providerNotice: hadProviderError
        ? 'Live rail provider is currently experiencing high traffic or temporary delay. Some direct options or availability may be partial.'
        : null,
      allCancelled,
      noTrainsFound,
      message: allCancelled
        ? 'All direct trains on this route are cancelled for the selected date.'
        : (noTrainsFound ? 'No direct trains found between selected stations.' : null),
      budget: budgetSummary,
      cancelledFilter: cancelledSet.size > 0 ? { count: cancelledSet.size } : null,
    };
  }

  /**
   * Checks a single class for a specific train (tap on "?" chip).
   */
  async checkClass({ trainNo, from, to, travelClass, date, quota = 'GN', actionId }) {
    const isCached = typeof this.availabilityService.hasCached === 'function' &&
      this.availabilityService.hasCached(trainNo, from, to, date, travelClass, quota);
    const ok = await this.actionBudgetService.recordCall({
      actionId,
      phase: 'direct',
      endpoint: 'seatAvailability',
      cacheHit: isCached,
      cost: isCached ? 0 : 1,
    });
    if (!ok) {
      return {
        success: false,
        reason: 'BUDGET_EXHAUSTED',
        budget: await this.actionBudgetService.getBudgetSummary(actionId),
      };
    }

    const result = await this.availabilityService.checkLegAvailability({
      trainNumber: trainNo,
      fromCode: from,
      toCode: to,
      date,
      travelClass,
      quota,
    });

    return {
      success: true,
      availability: result,
      chip: buildClassChip(travelClass, 'CHECKED', result),
      budget: await this.actionBudgetService.getBudgetSummary(actionId),
    };
  }

  /**
   * Checks the next batch of up to 8 waiting trains (round-1 rule).
   */
  async moreTrains({ actionId, trainNos, allWaitingTrains, date, travelClass, quota = 'GN' }) {
    const dateStr = formatJourneyDate(date) || String(date).slice(0, 10);
    const requestedClass = travelClass && travelClass !== 'ANY' ? String(travelClass).toUpperCase() : null;
    const budget = this.actionBudgetService;

    // Select next batch of 8
    let candidates = allWaitingTrains || [];
    if (trainNos && trainNos.length > 0) {
      candidates = candidates.filter((t) => trainNos.includes(t.trainNumber));
    }
    candidates = candidates.slice(0, MORE_TRAINS_BATCH);

    const results = [];
    for (const train of candidates) {
      const offered = normalizeClasses(train.classes || []);
      const round1Class = pickRound1Class(offered, requestedClass);
      if (!round1Class) {
        results.push({ ...train, classes: offered.map((c) => buildClassChip(c, 'UNVERIFIED', null)) });
        continue;
      }

      const isCached = typeof this.availabilityService.hasCached === 'function' &&
        this.availabilityService.hasCached(train.trainNumber, train.from, train.to, dateStr, round1Class, quota);
      const ok = await budget.recordCall({
        actionId,
        phase: 'direct',
        endpoint: 'seatAvailability',
        cacheHit: isCached,
        cost: isCached ? 0 : 1,
      });
      if (!ok) break;

      let availResult = null;
      try {
        availResult = await this.availabilityService.checkLegAvailability({
          trainNumber: train.trainNumber,
          fromCode: train.from,
          toCode: train.to,
          date: dateStr,
          travelClass: round1Class,
          quota,
        });
      } catch (err) {
        logger.warn(`[DirectPass.moreTrains] Avail failed for ${train.trainNumber}: ${err.message}`);
      }

      const chips = offered.map((c) => {
        if (c === round1Class) return buildClassChip(c, 'CHECKED', availResult);
        return buildClassChip(c, 'UNCHECKED', null);
      });
      results.push({ ...train, classes: chips, checkedAt: new Date().toISOString() });
    }

    return {
      checkedTrains: results,
      partial: budget.isAtCap(actionId),
      budget: await budget.getBudgetSummary(actionId),
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  _buildPairs(origins, destinations) {
    const pairs = [];
    if (origins.length > 0 && destinations.length > 0) {
      pairs.push([origins[0], destinations[0]]);
    }
    for (const o of origins) {
      for (const d of destinations) {
        if (o === origins[0] && d === destinations[0]) continue;
        if (o !== d) pairs.push([o, d]);
      }
    }
    return pairs.slice(0, SEARCH_PAIRS_MAX);
  }
}

export const directPassService = new DirectPassService();
export default directPassService;
