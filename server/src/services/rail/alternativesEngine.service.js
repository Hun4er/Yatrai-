/**
 * AlternativesEngineService  (P0 v2)
 *
 * Implements the P0 v2 ALTERNATIVES algorithm:
 *
 *  1. Hub discovery: use stored corridor hubs if present (0 calls); else fetch route
 *     data for up to 2 reference trains (cached, shared). Keep top 3 hubs (4 in DEEP).
 *  2. Lanes: max 2 (requested class, or 2 highest-capacity classes on reference trains).
 *     Max 3 in DEEP. Schedule data is class-independent and shared.
 *  3. Same-train splits with reach binary search (per reference train × lane):
 *     a. Binary search the farthest hub Ha where origin→Ha is AVAILABLE.
 *     b. Check Ha→destination (1 call). If AVAILABLE → 2-leg plan.
 *     c. DEEP only: if (b) fails, binary-search nearest Hb where Hb→dest is AVAILABLE.
 *        If Ha before Hb, check Ha→Hb. If AVAILABLE → 3-leg plan.
 *     Monotonic assumption: log contradictions and disable pruning for that train.
 *  4. Cross-train splits: per hub (default 2, button 3, DEEP 4):
 *     searchTrains(O→H) + searchTrains(H→D) (cached). Keep best 2 leg-1 and 2 leg-2 trains.
 *     Valid pair: same hub code, layover 90min–10h, tight <180min, B runs on A's arrival date,
 *     laneClass on both, detour ≤1.15× direct. Verify longer leg first; memoize; drop on failure.
 *  5. Stop as soon as 3 verified plans exist total. One class per leg = laneClass.
 *  6. Order: same-train first (cheapest), then cross-train.
 */

import railKitAdapter from '../../providers/rail/railKit.adapter.js';
import availabilityService, { AVAILABILITY_STATUS } from './availability.service.js';
import corridorHubsService from './corridorHubs.service.js';
import clusterService from './cluster.service.js';
import actionBudgetService from './actionBudget.service.js';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { getAdvanceBookingWindow } from '../../utils/bookingWindow.js';
import { formatJourneyDate } from '../../utils/railwayTime.js';

const p0v2 = config.p0v2;
const CAPACITY_ORDER = p0v2.capacityOrder;

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeClasses(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) =>
    typeof c === 'object' && c !== null
      ? (c.class || c.travelClass || c.coach || '').toUpperCase()
      : String(c).trim().toUpperCase()
  ).filter(Boolean);
}

function pickLanes(requestedClass, referenceTrainClasses, maxLanes) {
  const offered = normalizeClasses(referenceTrainClasses);
  if (requestedClass && requestedClass !== 'ANY') {
    const req = typeof requestedClass === 'object' && requestedClass !== null
      ? (requestedClass.class || requestedClass.travelClass || requestedClass.coach || '').toUpperCase()
      : String(requestedClass).toUpperCase();
    if (req) return [req].slice(0, maxLanes);
  }
  // Top maxLanes from CAPACITY_ORDER that appear in reference trains
  const lanes = [];
  for (const cls of CAPACITY_ORDER) {
    if (offered.includes(cls)) {
      lanes.push(cls);
      if (lanes.length >= maxLanes) break;
    }
  }
  if (lanes.length === 0 && offered.length > 0) return offered.slice(0, maxLanes);
  return lanes;
}

function layoverMinutes(arrivalIso, departureIso) {
  try {
    return (new Date(departureIso) - new Date(arrivalIso)) / 60000;
  } catch { return -1; }
}

// ── Main service ───────────────────────────────────────────────────────────────

export class AlternativesEngineService {
  constructor(dependencies = {}) {
    this.railKit = dependencies.railKit || railKitAdapter;
    this.availabilityService = dependencies.availabilityService || availabilityService;
    this.corridorHubsService = dependencies.corridorHubsService || corridorHubsService;
    this.actionBudgetService = dependencies.actionBudgetService || actionBudgetService;

    // Memoize availability checks: "trainNo:from:to:class:date" -> result
    this._availMemo = new Map();
  }

  /**
   * Main entry point.
   *
   * @param {object} params
   * @param {string} params.originCode
   * @param {string} params.destCode
   * @param {string} params.date
   * @param {string} params.travelClass - "ANY" or specific class
   * @param {string} [params.quota]
   * @param {string} params.actionId
   * @param {string} params.actionType - 'default' | 'alternatives_button' | 'deep'
   * @param {Array}  [params.referenceTrains] - direct trains for reference
   * @param {number} [params.directDistanceKm]
   * @returns {Promise<object>}
   */
  async run({
    originCode,
    destCode,
    date,
    travelClass,
    quota = 'GN',
    actionId,
    actionType = 'default',
    referenceTrains = [],
    directDistanceKm = null,
    isDegraded = false,
  }) {
    const dateStr = formatJourneyDate(date) || String(date).slice(0, 10);
    const budget = this.actionBudgetService;
    const isDeep = actionType === 'deep';
    const isAltButton = actionType === 'alternatives_button';

    const maxHubs = isDeep ? p0v2.maxHubsDeep : (isAltButton ? p0v2.maxHubsButton : p0v2.maxHubsDefault);
    const maxLanes = isDeep ? p0v2.maxLanesDeep : p0v2.maxLanesDefault;
    const maxCrossHubs = isDeep ? 4 : (isAltButton ? 3 : 2);
    const earlyStop = p0v2.earlyStopPlans;

    logger.info(`[AltEngine] Starting for ${originCode}→${destCode}, date=${dateStr}, actionType=${actionType}, degraded=${isDegraded}, maxHubs=${maxHubs}, maxLanes=${maxLanes}`);

    // ── Step 1: Hub discovery ──────────────────────────────────────
    let hubs = await this.corridorHubsService.getStoredHubs(originCode, destCode);
    if (hubs) {
      logger.info(`[AltEngine] Using ${hubs.length} cached corridor hubs (0 route calls)`);
    } else {
      hubs = await this._discoverHubs(originCode, destCode, dateStr, referenceTrains, maxHubs, actionId, budget);
      if (hubs.length > 0) {
        await this.corridorHubsService.storeHubs(originCode, destCode, hubs);
      }
    }

    if (hubs.length === 0) {
      logger.info(`[AltEngine] No hubs found.`);
      return { alternatives: [], partial: budget.isAtCap(actionId), budget: await budget.getBudgetSummary(actionId) };
    }

    // ── Step 2: Lane selection ─────────────────────────────────────
    const refClasses = referenceTrains.flatMap((t) =>
      normalizeClasses(t.classes || t.offeredClasses || [])
    );
    const lanes = pickLanes(travelClass, refClasses, maxLanes);
    logger.info(`[AltEngine] Lanes: ${lanes.join(',')}`);

    const allPlans = [];

    // ── Step 3 & 4: Per-lane work ──────────────────────────────────
    for (const laneClass of lanes) {
      if (allPlans.length >= earlyStop) break;
      if (budget.isAtCap(actionId)) break;

      // ── Step 3: Same-train splits ────────────────────────────────
      const sortedHubs = [...hubs].sort((a, b) => (a.distanceFromOriginKm || 0) - (b.distanceFromOriginKm || 0));

      for (const refTrain of referenceTrains.slice(0, 2)) {
        if (allPlans.length >= earlyStop) break;
        if (budget.isAtCap(actionId)) break;

        const trainNo = String(refTrain.trainNumber || refTrain.train?.number || '');
        if (!trainNo) continue;

        const plan = await this._sameTrainReachSearch({
          trainNo, originCode, destCode, hubs: sortedHubs, laneClass, dateStr, quota, actionId, budget, isDeep,
        });
        if (plan) allPlans.push(plan);
      }

      // ── Step 4: Cross-train splits (skipped in degraded mode) ─────
      if (!isDegraded) {
        const hubsForCross = hubs.slice(0, maxCrossHubs);
        for (const hub of hubsForCross) {
          if (allPlans.length >= earlyStop) break;
          if (budget.isAtCap(actionId)) break;

          const plans = await this._crossTrainSearch({
            originCode, destCode, hubCode: hub.code, laneClass, dateStr, quota, actionId, budget, directDistanceKm, isDeep, allowRisky: false,
          });
          allPlans.push(...plans);
          if (allPlans.length >= earlyStop) break;
        }

        // ── Step 5: Second pass for risky plans if strict search found nothing ─────
        if (allPlans.length === 0 && !budget.isAtCap(actionId)) {
          logger.info(`[AltEngine] Strict search found 0 plans. Running second pass for risky/waitlist alternatives.`);
          const riskyPlans = [];
          for (const hub of hubsForCross) {
            if (riskyPlans.length >= 3) break;
            if (budget.isAtCap(actionId)) break;

            const rPlans = await this._crossTrainSearch({
              originCode, destCode, hubCode: hub.code, laneClass, dateStr, quota, actionId, budget, directDistanceKm, isDeep, allowRisky: true,
            });
            riskyPlans.push(...rPlans);
            if (riskyPlans.length >= 3) break;
          }

          // Sort by tier (RAC before WAITLIST), then predictionPercentage desc, then fewer legs/duration
          riskyPlans.sort((a, b) => {
            const tierScore = (p) => (p.weakestTier === 'RAC' ? 2 : 1);
            const scoreDiff = tierScore(b) - tierScore(a);
            if (scoreDiff !== 0) return scoreDiff;
            const predDiff = (b.predictionPercentage || 0) - (a.predictionPercentage || 0);
            if (predDiff !== 0) return predDiff;
            return (a.legs?.length || 0) - (b.legs?.length || 0);
          });

          allPlans.push(...riskyPlans.slice(0, 3));
        }
      }
    }

    const verifiedPlans = allPlans.slice(0, earlyStop);
    const budgetSummary = await budget.getBudgetSummary(actionId);

    logger.info(`[AltEngine] Done. Plans: ${verifiedPlans.length}, partial: ${budget.isAtCap(actionId)}, budget: ${budgetSummary.used}/${budgetSummary.cap}`);

    return {
      alternatives: verifiedPlans,
      partial: budget.isAtCap(actionId),
      budget: budgetSummary,
    };
  }

  // ── Hub discovery ──────────────────────────────────────────────────────────

  async _discoverHubs(originCode, destCode, dateStrOrRef, refTrainsOrMax, maxHubsOrAction, actionIdOrBudget, maybeBudget) {
    let dateStr = '2026-10-22';
    let referenceTrains = [];
    let maxHubs = 3;
    let actionId = 'default_act';
    let budget = this.actionBudgetService;

    if (Array.isArray(dateStrOrRef)) {
      referenceTrains = dateStrOrRef;
      maxHubs = refTrainsOrMax || 3;
      actionId = maxHubsOrAction || 'default_act';
      budget = actionIdOrBudget || this.actionBudgetService;
    } else {
      dateStr = dateStrOrRef || '2026-10-22';
      referenceTrains = refTrainsOrMax || [];
      maxHubs = maxHubsOrAction || 3;
      actionId = actionIdOrBudget || 'default_act';
      budget = maybeBudget || this.actionBudgetService;
    }

    const hubs = [];
    const stationScores = new Map(); // code -> score

    // If referenceTrains is empty, attempt to read cached direct trains for the corridor
    let candidateTrains = referenceTrains;
    if ((!candidateTrains || candidateTrains.length === 0) && typeof this.railKit?.searchTrainBetweenStations === 'function') {
      try {
        const searchRes = await this.railKit.searchTrainBetweenStations(originCode, destCode, dateStr);
        if (searchRes?.data && Array.isArray(searchRes.data)) {
          candidateTrains = searchRes.data.slice(0, 2);
        }
      } catch (err) {
        logger.debug(`[AltEngine] Could not get cached direct trains for hub discovery: ${err.message}`);
      }
    }

    // Use schedule/route data for up to 2 reference trains (cached, shared)
    for (const refTrain of (candidateTrains || []).slice(0, 2)) {
      if (budget && typeof budget.isAtCap === 'function' && budget.isAtCap(actionId)) break;

      const trainNo = String(refTrain.trainNumber || refTrain.train_number || refTrain.train?.number || '');
      if (!trainNo) continue;

      const isScheduleCached = (typeof this.railKit.hasCachedInfo === 'function' && this.railKit.hasCachedInfo(trainNo)) ||
        (typeof this.railKit.hasCachedSchedule === 'function' && this.railKit.hasCachedSchedule(trainNo));

      if (budget && typeof budget.recordCall === 'function') {
        const ok = await budget.recordCall({
          actionId,
          phase: 'scheduleRoutes',
          endpoint: 'trainSchedule',
          cacheHit: isScheduleCached,
          cost: isScheduleCached ? 0 : 1,
        });
        if (!ok) break;
      } else if (budget && typeof budget.increment === 'function') {
        const ok = await budget.increment(actionId, 'scheduleRoutes');
        if (!ok) break;
      }

      try {
        const cacheKey = `schedule:${trainNo}:${dateStr}`;
        const fetchSchedule = async () => {
          if (typeof this.railKit.trainSchedule === 'function') {
            return this.railKit.trainSchedule(trainNo);
          }
          if (typeof this.railKit.getTrainSchedule === 'function') {
            return this.railKit.getTrainSchedule(trainNo, dateStr);
          }
          if (typeof this.railKit.trainByNumber === 'function') {
            return this.railKit.trainByNumber(trainNo);
          }
          return null;
        };

        const schedule = budget && typeof budget.singleFlight === 'function'
          ? await budget.singleFlight(cacheKey, fetchSchedule)
          : await fetchSchedule();

        if (schedule?.success) {
          const stations = schedule.data?.route || schedule.data?.stations || schedule.stations || schedule.data || [];
          if (Array.isArray(stations)) {
            for (const stn of stations) {
              const code = String(stn.stnCode || stn.station_code || stn.stationCode || stn.code || stn.stn_code || '').toUpperCase();
              if (!code || code === originCode || code === destCode) continue;
              const existing = stationScores.get(code) || 0;
              stationScores.set(code, existing + 1);
            }
          }
        }
      } catch (err) {
        logger.warn(`[AltEngine] Schedule fetch failed for ${trainNo}: ${err.message}`);
      }
    }

    // Fallback: If stationScores is empty, use known major physical corridor hubs
    if (stationScores.size === 0) {
      const CORRIDOR_FALLBACKS = {
        'NDLS:PNBE': ['CNB', 'PRYJ', 'DDU'],
        'NDLS:DNR': ['CNB', 'PRYJ', 'DDU'],
        'HWH:BSB': ['ASN', 'DHN', 'GAYA', 'DDU'],
        'NDLS:HWH': ['CNB', 'PRYJ', 'DDU'],
        'SBC:MAS': ['KJM', 'JTJ', 'AJJ'],
      };
      const key = `${originCode}:${destCode}`;
      const revKey = `${destCode}:${originCode}`;
      const known = CORRIDOR_FALLBACKS[key] || CORRIDOR_FALLBACKS[revKey] || ['CNB', 'DDU', 'PRYJ'];
      known.forEach((c, idx) => stationScores.set(c, 10 - idx));
    }

    // Sort by score and take top maxHubs
    const sorted = Array.from(stationScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxHubs);

    for (const [code, score] of sorted) {
      hubs.push({ code, score });
    }

    return hubs;
  }

  // ── Same-train reach binary search ────────────────────────────────────────

  /**
   * Binary search the farthest hub Ha such that origin→Ha is AVAILABLE.
   *
   * Monotonic assumption: if origin→Ha is AVAILABLE and Ha is farther than Ha-1,
   * then origin→Ha-1 is also AVAILABLE (a seat free over a long segment is free
   * over any shorter sub-segment).
   *
   * TODO[MONOTONIC]: This assumption may not hold for pooled-quota (e.g. PQWL, RQWL,
   * TQWL) segments. Log any contradiction and disable binary search for that train.
   */
  async _sameTrainReachSearch({ trainNo, originCode, destCode, hubs, laneClass, dateStr, quota, actionId, budget, isDeep }) {
    if (hubs.length === 0) return null;

    logger.debug(`[AltEngine] TODO[MONOTONIC]: Checking same-train seat reach monotonic assumption for train ${trainNo}`);

    // Track whether monotonic assumption has been violated for this train
    let monotonicDisabled = false;

    // Binary search: find farthest hub where origin→hub is AVAILABLE
    let lo = 0, hi = hubs.length - 1, farthestAvailableIdx = -1;

    if (monotonicDisabled) {
      // Linear scan fallback
      for (let i = 0; i < hubs.length; i++) {
        const avail = await this._checkAvailMemo(trainNo, originCode, hubs[i].code, laneClass, dateStr, quota, actionId, 'sameTrain', budget);
        if (!avail) break;
        if (avail?.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE) {
          farthestAvailableIdx = i;
        }
      }
    } else {
      // Binary search
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const avail = await this._checkAvailMemo(trainNo, originCode, hubs[mid].code, laneClass, dateStr, quota, actionId, 'sameTrain', budget);
        if (!avail) break;
        const isAvail = avail?.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE;

        // Validate monotonic assumption if we have a previous data point
        if (mid > 0 && farthestAvailableIdx >= 0) {
          const prevAvail = await this._getAvailMemoOnly(trainNo, originCode, hubs[mid - 1].code, laneClass, dateStr, quota);
          if (prevAvail && isAvail && prevAvail.normalizedStatus !== AVAILABILITY_STATUS.AVAILABLE) {
            // Contradiction! farthest not available but farther is
            logger.warn(`[AltEngine] MONOTONIC VIOLATION on train ${trainNo}: hub[${mid-1}]=${hubs[mid-1].code} NOT AVAIL but hub[${mid}]=${hubs[mid].code} AVAIL. Disabling pruning for this train.`);
            monotonicDisabled = true;
            break;
          }
        }

        if (isAvail) {
          farthestAvailableIdx = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      if (monotonicDisabled) {
        // Re-run linear
        return this._sameTrainReachSearch({ trainNo, originCode, destCode, hubs, laneClass, dateStr, quota, actionId, budget, isDeep });
      }
    }

    if (farthestAvailableIdx < 0) return null; // No available hub

    const Ha = hubs[farthestAvailableIdx];

    // Step 3b: Check Ha→destination
    const availB = await this._checkAvailMemo(trainNo, Ha.code, destCode, laneClass, dateStr, quota, actionId, 'sameTrain', budget);
    if (availB?.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE) {
      logger.info(`[AltEngine] Same-train 2-leg plan: ${originCode}→${Ha.code}→${destCode} on train ${trainNo} (${laneClass})`);
      return {
        type: 'same_train',
        sameTrain: true,
        legs: [
          { trainNo, from: originCode, to: Ha.code, class: laneClass },
          { trainNo, from: Ha.code, to: destCode, class: laneClass },
        ],
        hubCode: Ha.code,
        laneClass,
        tier: 'CONFIRMED',
        weakestTier: 'CONFIRMED',
        isRisky: false,
        badge: `Stay on this train — two tickets, berth may change at ${Ha.code}`,
        notice: 'Separate tickets. A missed connection is not protected.',
      };
    }

    // Step 3c: DEEP only — 3-leg plan
    if (isDeep && hubs.length > 1) {
      // Binary search nearest Hb where Hb→destination is AVAILABLE
      let loB = 0, hiB = hubs.length - 1, nearestAvailFromDestIdx = -1;
      while (loB <= hiB) {
        const mid = Math.floor((loB + hiB) / 2);
        const avail = await this._checkAvailMemo(trainNo, hubs[mid].code, destCode, laneClass, dateStr, quota, actionId, 'sameTrain', budget);
        if (!avail) break;
        if (avail?.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE) {
          nearestAvailFromDestIdx = mid;
          hiB = mid - 1;
        } else {
          loB = mid + 1;
        }
      }

      if (nearestAvailFromDestIdx >= 0 && farthestAvailableIdx < nearestAvailFromDestIdx) {
        const Hb = hubs[nearestAvailFromDestIdx];
        const availC = await this._checkAvailMemo(trainNo, Ha.code, Hb.code, laneClass, dateStr, quota, actionId, 'sameTrain', budget);
        if (availC?.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE) {
          logger.info(`[AltEngine] Same-train 3-leg plan: ${originCode}→${Ha.code}→${Hb.code}→${destCode} on train ${trainNo} (${laneClass})`);
          return {
            type: 'same_train',
            sameTrain: true,
            legs: [
              { trainNo, from: originCode, to: Ha.code, class: laneClass },
              { trainNo, from: Ha.code, to: Hb.code, class: laneClass },
              { trainNo, from: Hb.code, to: destCode, class: laneClass },
            ],
            hubCodes: [Ha.code, Hb.code],
            laneClass,
            tier: 'CONFIRMED',
            weakestTier: 'CONFIRMED',
            isRisky: false,
            badge: `Stay on this train — three tickets`,
            notice: 'Separate tickets. A missed connection is not protected.',
          };
        }
      }
    }

    return null;
  }

  // ── Cross-train search ────────────────────────────────────────────────────

  async _crossTrainSearch({ originCode, destCode, hubCode, laneClass, dateStr, quota, actionId, budget, directDistanceKm, isDeep, allowRisky = false }) {
    const plans = [];
    const layoverMin = p0v2.layoverMinMinutes;
    const layoverMax = p0v2.layoverMaxMinutes;
    const layoverTight = p0v2.layoverTightMinutes;
    const maxDetour = p0v2.maxDetourRatio;
    const maxTrains = p0v2.maxLegTrains;

    // searchTrains O→H
    let leg1Trains = [];
    {
      const isLeg1Cached = typeof this.railKit.hasCachedSearch === 'function' &&
        this.railKit.hasCachedSearch(originCode, hubCode, dateStr);
      const ok = budget && typeof budget.recordCall === 'function'
        ? await budget.recordCall({
            actionId,
            phase: 'crossTrain',
            endpoint: 'searchTrains',
            cacheHit: isLeg1Cached,
            cost: isLeg1Cached ? 0 : 1,
          })
        : (budget ? await budget.increment(actionId, 'crossTrain') : true);
      if (!ok) return plans;
      const cacheKey = `search:${originCode}:${hubCode}:${dateStr}`;
      try {
        const res = await budget.singleFlight(cacheKey, async () => {
          if (typeof this.railKit.searchTrainBetweenStations === 'function') {
            return this.railKit.searchTrainBetweenStations(originCode, hubCode, { date: dateStr });
          }
          return null;
        });
        if (res?.success && Array.isArray(res.data)) {
          leg1Trains = res.data
            .filter((t) => normalizeClasses(t.classes || t.train?.classes || []).includes(laneClass))
            .slice(0, maxTrains);
        }
      } catch (err) {
        logger.warn(`[AltEngine] Cross-train search O→H failed (${originCode}→${hubCode}): ${err.message}`);
      }
    }

    // searchTrains H→D
    let leg2Trains = [];
    {
      const isLeg2Cached = typeof this.railKit.hasCachedSearch === 'function' &&
        this.railKit.hasCachedSearch(hubCode, destCode, dateStr);
      const ok = budget && typeof budget.recordCall === 'function'
        ? await budget.recordCall({
            actionId,
            phase: 'crossTrain',
            endpoint: 'searchTrains',
            cacheHit: isLeg2Cached,
            cost: isLeg2Cached ? 0 : 1,
          })
        : (budget ? await budget.increment(actionId, 'crossTrain') : true);
      if (!ok) return plans;
      const cacheKey = `search:${hubCode}:${destCode}:${dateStr}`;
      try {
        const res = await budget.singleFlight(cacheKey, async () => {
          if (typeof this.railKit.searchTrainBetweenStations === 'function') {
            return this.railKit.searchTrainBetweenStations(hubCode, destCode, { date: dateStr });
          }
          return null;
        });
        if (res?.success && Array.isArray(res.data)) {
          leg2Trains = res.data
            .filter((t) => normalizeClasses(t.classes || t.train?.classes || []).includes(laneClass))
            .slice(0, maxTrains);
        }
      } catch (err) {
        logger.warn(`[AltEngine] Cross-train search H→D failed (${hubCode}→${destCode}): ${err.message}`);
      }
    }

    if (leg1Trains.length === 0 || leg2Trains.length === 0) return plans;

    // Helper to evaluate if leg is viable in second pass (CONFIRMED, RAC, or WL with >= 60% prediction or WL <= 30)
    const isLegViable = (avail) => {
      if (!avail) return false;
      const st = avail.normalizedStatus;
      if (st === AVAILABILITY_STATUS.AVAILABLE) return true;
      if (st === AVAILABILITY_STATUS.RAC) return true;
      if (st === AVAILABILITY_STATUS.WAITLIST) {
        const pct = avail.predictionPercentage || 0;
        const wl = avail.waitlistPosition ?? 999;
        return pct >= 60 || wl <= 30;
      }
      return false;
    };

    // Evaluate pairs
    for (const t1 of leg1Trains) {
      if (plans.length >= p0v2.earlyStopPlans) break;
      if (budget.isAtCap(actionId)) break;

      const t1Arr = t1.to?.arrival || t1.arrivalTime || null;
      const t1No = String(t1.train?.number || t1.trainNumber || t1.number || '');

      for (const t2 of leg2Trains) {
        if (plans.length >= p0v2.earlyStopPlans) break;
        if (budget.isAtCap(actionId)) break;

        const t2Dep = t2.from?.departure || t2.departureTime || null;
        const t2No = String(t2.train?.number || t2.trainNumber || t2.number || '');

        // Same hub station code or same-city cluster transfer
        const hubA = String(t1.to?.code || t1.to_stn_code || hubCode).toUpperCase();
        const hubB = String(t2.from?.code || t2.from_stn_code || hubCode).toUpperCase();

        const isSameStation = hubA === hubB;
        let isClusterTransfer = false;

        if (!isSameStation) {
          const clusterA = clusterService.getClusterForStation(hubA);
          const clusterB = clusterService.getClusterForStation(hubB);
          if (clusterA && clusterB && clusterA.primaryCode === clusterB.primaryCode) {
            isClusterTransfer = true;
          }
        }

        if (!isSameStation && !isClusterTransfer) continue;

        // Layover check: inter-station transfers require minimum 120-minute buffer
        if (!t1Arr || !t2Dep) continue;
        const layover = layoverMinutes(this._toIso(t1Arr, dateStr), this._toIso(t2Dep, dateStr));
        const effectiveMinLayover = isClusterTransfer ? Math.max(120, layoverMin) : layoverMin;
        if (layover < effectiveMinLayover || layover > layoverMax) continue;

        const isTight = !isClusterTransfer && layover < layoverTight;

        // Detour check
        if (directDistanceKm) {
          const leg1Dist = Number(t1.distance || t1.travel_distance || 0);
          const leg2Dist = Number(t2.distance || t2.travel_distance || 0);
          const totalDetour = leg1Dist + leg2Dist;
          if (totalDetour > directDistanceKm * maxDetour) continue;
        }

        // Verify longer leg first; memoize
        const leg1Dur = Number(t1.duration || t1.travel_time || 999);
        const leg2Dur = Number(t2.duration || t2.travel_time || 999);

        let leg1Avail = null, leg2Avail = null;

        if (leg1Dur >= leg2Dur) {
          leg1Avail = await this._checkAvailMemo(t1No, originCode, hubA, laneClass, dateStr, quota, actionId, 'crossTrain', budget);
          if (!allowRisky && leg1Avail?.normalizedStatus !== AVAILABILITY_STATUS.AVAILABLE) continue;
          if (allowRisky && !isLegViable(leg1Avail)) continue;

          leg2Avail = await this._checkAvailMemo(t2No, hubB, destCode, laneClass, dateStr, quota, actionId, 'crossTrain', budget);
          if (!allowRisky && leg2Avail?.normalizedStatus !== AVAILABILITY_STATUS.AVAILABLE) continue;
          if (allowRisky && !isLegViable(leg2Avail)) continue;
        } else {
          leg2Avail = await this._checkAvailMemo(t2No, hubB, destCode, laneClass, dateStr, quota, actionId, 'crossTrain', budget);
          if (!allowRisky && leg2Avail?.normalizedStatus !== AVAILABILITY_STATUS.AVAILABLE) continue;
          if (allowRisky && !isLegViable(leg2Avail)) continue;

          leg1Avail = await this._checkAvailMemo(t1No, originCode, hubA, laneClass, dateStr, quota, actionId, 'crossTrain', budget);
          if (!allowRisky && leg1Avail?.normalizedStatus !== AVAILABILITY_STATUS.AVAILABLE) continue;
          if (allowRisky && !isLegViable(leg1Avail)) continue;
        }

        const isStrict = leg1Avail?.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE &&
          leg2Avail?.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE;

        // In allowRisky second pass, only collect non-strict pairs (strict was already handled)
        if (allowRisky && isStrict) continue;

        // Determine weakest leg tier
        let weakestTier = 'CONFIRMED';
        if (leg1Avail?.normalizedStatus === AVAILABILITY_STATUS.WAITLIST || leg2Avail?.normalizedStatus === AVAILABILITY_STATUS.WAITLIST) {
          weakestTier = 'WAITLIST';
        } else if (leg1Avail?.normalizedStatus === AVAILABILITY_STATUS.RAC || leg2Avail?.normalizedStatus === AVAILABILITY_STATUS.RAC) {
          weakestTier = 'RAC';
        }

        const tier = isStrict ? 'CONFIRMED' : weakestTier;
        const badge = isStrict
          ? (isClusterTransfer ? `Connection: ${hubA} → ${hubB}` : `Connection via ${hubCode}`)
          : 'Risky — waitlisted';
        const notice = isStrict
          ? (isClusterTransfer ? `Separate tickets. Transfer between ${hubA} and ${hubB} is not protected.` : 'Separate tickets. A missed connection is not protected.')
          : 'Waitlisted — not guaranteed. Separate tickets.';

        const leg1Fare = leg1Avail?.fare?.totalFare || leg1Avail?.totalFare || null;
        const leg2Fare = leg2Avail?.fare?.totalFare || leg2Avail?.totalFare || null;
        const totalFare = (leg1Fare && leg2Fare) ? (leg1Fare + leg2Fare) : null;

        const bookingWindow = getAdvanceBookingWindow();
        const leg1Beyond = bookingWindow.isBeyondWindow(dateStr);
        const leg2Beyond = bookingWindow.isBeyondWindow(dateStr); // boarding date at hub

        const legs = [
          {
            trainNo: t1No,
            from: originCode,
            to: hubA,
            class: laneClass,
            availability: leg1Avail,
            fare: leg1Fare,
            totalFare: leg1Fare,
            notice: leg1Beyond ? 'booking may not be open for this date yet' : null,
          },
        ];

        if (isClusterTransfer) {
          legs.push({
            type: 'transfer',
            isTransfer: true,
            from: hubA,
            to: hubB,
            durationMinutes: layover,
            label: `get to ${hubB} yourself (local train / metro / cab)`,
          });
        }

        legs.push({
          trainNo: t2No,
          from: hubB,
          to: destCode,
          class: laneClass,
          availability: leg2Avail,
          fare: leg2Fare,
          totalFare: leg2Fare,
          notice: leg2Beyond ? 'booking may not be open for this date yet' : null,
        });

        const planNotice = (leg1Beyond || leg2Beyond)
          ? `Booking may not be open for this date yet. ${notice}`
          : notice;

        plans.push({
          type: 'cross_train',
          sameTrain: false,
          isClusterTransfer,
          legs,
          hubCode: isClusterTransfer ? `${hubA} / ${hubB}` : hubCode,
          laneClass,
          layoverMinutes: layover,
          isTight,
          tightLabel: isTight ? 'tight' : null,
          tier,
          weakestTier,
          isRisky: !isStrict,
          badge,
          notice: planNotice,
          predictionPercentage: Math.min(leg1Avail?.predictionPercentage || 60, leg2Avail?.predictionPercentage || 60),
          departureTime: t1.departureTime || t1.from?.departure || '06:00',
          arrivalTime: t2.arrivalTime || t2.to?.arrival || '18:00',
          duration: Number(t1.duration || 0) + Number(t2.duration || 0) + layover,
          totalFare,
          fare: totalFare,
        });

        if (plans.length >= p0v2.earlyStopPlans) break;
      }
    }

    return plans;
  }

  // ── Availability memoization ───────────────────────────────────────────────

  async _checkAvailMemo(trainNo, from, to, cls, dateStr, quota, actionId = null, phase = 'crossTrain', budget = null) {
    const key = `${trainNo}:${from}:${to}:${cls}:${dateStr}:${quota}`;
    const budgetTracker = budget || this.actionBudgetService;

    const isMemo = this._availMemo.has(key);
    const isServiceCached = typeof this.availabilityService.hasCached === 'function' &&
      this.availabilityService.hasCached(trainNo, from, to, dateStr, cls, quota);
    const isCached = isMemo || isServiceCached;

    if (actionId && budgetTracker && typeof budgetTracker.recordCall === 'function') {
      const ok = await budgetTracker.recordCall({
        actionId,
        phase,
        endpoint: 'seatAvailability',
        cacheHit: isCached,
        cost: isCached ? 0 : 1,
      });
      if (!ok) return null;
    }

    if (isMemo) return this._availMemo.get(key);

    let result = null;
    try {
      result = await this.availabilityService.checkLegAvailability({
        trainNumber: trainNo,
        fromCode: from,
        toCode: to,
        date: dateStr,
        travelClass: cls,
        quota,
      });
      this._availMemo.set(key, result);
    } catch (err) {
      logger.warn(`[AltEngine] Availability check failed for ${trainNo} (${from}→${to}): ${err.message}`);
    }
    return result;
  }

  _getAvailMemoOnly(trainNo, from, to, cls, dateStr, quota) {
    const key = `${trainNo}:${from}:${to}:${cls}:${dateStr}:${quota}`;
    return this._availMemo.get(key) || null;
  }

  _toIso(timeStr, dateStr) {
    // Converts "HH:MM" + date to ISO string (IST)
    if (!timeStr) return null;
    const [hh, mm] = timeStr.split(':').map(Number);
    return `${dateStr}T${String(hh).padStart(2,'0')}:${String(mm || 0).padStart(2,'0')}:00+05:30`;
  }
}

export const alternativesEngineService = new AlternativesEngineService();
export default alternativesEngineService;
