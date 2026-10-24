/**
 * RouteExtensionService (Strategy A)
 *
 * Implements Strategy A Route Extension:
 * When direct journey from A to B is not CONFIRMED (e.g. WL / RAC):
 *  1. Select top 3 candidate trains from referenceTrains.
 *  2. Station B must be a stoppage after Station A on the train's route.
 *  3. Examine up to 3 candidate stations Y after B (nearest to B first).
 *  4. Check availability for A -> Y; stop at first CONFIRMED candidate.
 *  5. Calculate extraFare = fare(A->Y) - fare(A->B) when A->B fare is known.
 *  6. Log "extension_hit" when a confirmed plan is found.
 *  7. Fail-open with 4s timeout; carve calls from cross-train budget; cache prefix "ext:".
 */

import railKitAdapter from '../../providers/rail/railKit.adapter.js';
import availabilityService, { AVAILABILITY_STATUS } from './availability.service.js';
import actionBudgetService from './actionBudget.service.js';
import persistentCacheService from './persistentCache.service.js';
import logger from '../../utils/logger.js';
import { formatJourneyDate } from '../../utils/railwayTime.js';

// Short-term error cache: key -> timestamp (max 30s TTL)
const _errorCache = new Map();

function cleanExpiredErrors() {
  const now = Date.now();
  for (const [k, v] of _errorCache.entries()) {
    if (now - v > 30000) _errorCache.delete(k);
  }
}

function getTrainNumber(t) {
  return String(t.train?.number || t.train_number || t.trainNumber || t.number || t.train_no || '');
}

function getTrainName(t) {
  return t.train?.name || t.train_name || t.trainName || t.name || '';
}

function normalizeStationCode(s) {
  if (!s) return '';
  if (typeof s === 'string') return s.trim().toUpperCase();
  return String(s.stnCode || s.station_code || s.code || s.stationCode || '').trim().toUpperCase();
}

export class RouteExtensionService {
  constructor(dependencies = {}) {
    this.railKit = dependencies.railKit || railKitAdapter;
    this.availabilityService = dependencies.availabilityService || availabilityService;
    this.actionBudgetService = dependencies.actionBudgetService || actionBudgetService;
    this.persistentCacheService = dependencies.persistentCacheService || persistentCacheService;
  }

  /**
   * Main entry point for Strategy A route extension.
   *
   * @param {object} params
   * @param {string} params.originCode - Station A
   * @param {string} params.destCode - Station B
   * @param {string} params.date - Journey date
   * @param {string} [params.travelClass='ANY']
   * @param {string} [params.quota='GN']
   * @param {string} params.actionId
   * @param {string} [params.actionType='default']
   * @param {Array}  [params.referenceTrains=[]]
   * @returns {Promise<{ plans: Array, metadata: object }>}
   */
  async run({
    originCode,
    destCode,
    date,
    travelClass = 'ANY',
    quota = 'GN',
    actionId,
    actionType = 'default',
    referenceTrains = [],
  }) {
    // 4-second timeout guarantee (fail-open)
    const timeoutMs = 4000;
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('Extension timeout after 4s'));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([
        this._executeExtension({
          originCode,
          destCode,
          date,
          travelClass,
          quota,
          actionId,
          actionType,
          referenceTrains,
        }),
        timeoutPromise,
      ]);
      return result;
    } catch (err) {
      logger.warn(`[RouteExtension] Fail-open: ${err.message}`);
      return {
        plans: [],
        metadata: {
          status: 'skipped',
          reason: err.message || 'unknown_error',
        },
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async _executeExtension({
    originCode,
    destCode,
    date,
    travelClass,
    quota,
    actionId,
    _actionType,
    referenceTrains,
  }) {
    cleanExpiredErrors();

    if (!originCode || !destCode || !date) {
      return { plans: [], metadata: { status: 'skipped', reason: 'missing_parameters' } };
    }

    const A = String(originCode).trim().toUpperCase();
    const B = String(destCode).trim().toUpperCase();
    const dateStr = formatJourneyDate(date) || String(date).slice(0, 10);
    const budget = this.actionBudgetService;

    if (budget && budget.isAtCap(actionId)) {
      logger.info(`[RouteExtension] Skipped: Action budget already at cap for action ${actionId}`);
      return { plans: [], metadata: { status: 'skipped', reason: 'cap_exhausted' } };
    }

    // Filter reference trains: top 3 non-confirmed direct trains
    const nonConfirmedTrains = (referenceTrains || []).filter((t) => {
      const trainNo = getTrainNumber(t);
      if (!trainNo) return false;

      // Check if train has a confirmed class
      if (Array.isArray(t.classes)) {
        const target = travelClass && travelClass !== 'ANY'
          ? t.classes.find((c) => c.class === travelClass)
          : t.classes.find((c) => c.tier === 'CONFIRMED' || c.state === 'CONFIRMED');
        if (target && (target.tier === 'CONFIRMED' || target.state === 'CONFIRMED')) {
          return false; // Skip confirmed train
        }
      }
      return true;
    });

    const topTrains = nonConfirmedTrains.slice(0, 3);
    if (topTrains.length === 0) {
      return { plans: [], metadata: { status: 'skipped', reason: 'no_candidate_trains' } };
    }

    const extensionPlans = [];

    for (const train of topTrains) {
      if (budget && budget.isAtCap(actionId)) {
        logger.info(`[RouteExtension] Mid-phase cap exhaustion for action ${actionId}`);
        break;
      }

      const trainNo = getTrainNumber(train);
      if (!trainNo) continue;

      // Pick lane/travel class
      let targetClass = travelClass && travelClass !== 'ANY' ? String(travelClass).toUpperCase() : null;
      if (!targetClass && Array.isArray(train.classes)) {
        const checked = train.classes.find((c) => c.state === 'CHECKED' || c.tier);
        if (checked?.class) targetClass = String(checked.class).toUpperCase();
      }
      if (!targetClass) targetClass = '3A'; // fallback

      // 1. Fetch train schedule/route
      let schedule = null;
      const isScheduleCached = typeof this.railKit?.hasCachedInfo === 'function' &&
        this.railKit.hasCachedInfo(trainNo);

      const okSchedule = budget && typeof budget.recordCall === 'function'
        ? await budget.recordCall({
            actionId,
            phase: 'crossTrain',
            endpoint: 'trainSchedule',
            cacheHit: isScheduleCached,
            cost: isScheduleCached ? 0 : 1,
          })
        : true;

      if (!okSchedule) break;

      try {
        if (typeof this.railKit?.trainSchedule === 'function') {
          const res = await this.railKit.trainSchedule(trainNo);
          schedule = res?.data || res;
        }
      } catch (err) {
        logger.warn(`[RouteExtension] Could not fetch schedule for train ${trainNo}: ${err.message}`);
        continue;
      }

      const rawRoute = schedule?.route || schedule?.stations || [];
      if (!Array.isArray(rawRoute) || rawRoute.length === 0) {
        logger.warn(`[RouteExtension] Missing or malformed route data for train ${trainNo}`);
        continue;
      }

      // 2. Validate stoppages: A and B must be in route, and A must be before B
      const idxA = rawRoute.findIndex((s) => normalizeStationCode(s) === A);
      const idxB = rawRoute.findIndex((s) => normalizeStationCode(s) === B);

      if (idxA === -1 || idxB === -1 || idxA >= idxB) {
        logger.info(`[RouteExtension] Train ${trainNo}: station B (${B}) is not a stoppage after station A (${A})`);
        continue;
      }

      // 3. Candidate stations Y after B (up to 3 nearest first)
      const stationsAfterB = rawRoute.slice(idxB + 1);
      if (stationsAfterB.length === 0) {
        // Terminus is B -> no stoppage after B
        continue;
      }

      const candidatesY = stationsAfterB.slice(0, 3);

      // 4. Check availability for A -> Y; stop at first CONFIRMED
      for (const stnY of candidatesY) {
        if (budget && budget.isAtCap(actionId)) break;

        const Y = normalizeStationCode(stnY);
        if (!Y) continue;

        const errKey = `ext:err:${trainNo}:${A}:${Y}:${targetClass}:${dateStr}`;
        if (_errorCache.has(errKey)) {
          // Skip if errored in the last 30s
          continue;
        }

        const cacheKey = `ext:avail:${trainNo}:${A}:${Y}:${targetClass}:${dateStr}:${quota}`;
        let cachedAvail = null;
        try {
          if (typeof this.persistentCacheService?.get === 'function') {
            cachedAvail = await this.persistentCacheService.get(cacheKey);
          }
        } catch { /* ignore */ }

        const isAvailCached = Boolean(cachedAvail);
        const okAvail = budget && typeof budget.recordCall === 'function'
          ? await budget.recordCall({
              actionId,
              phase: 'crossTrain',
              endpoint: 'seatAvailability',
              cacheHit: isAvailCached,
              cost: isAvailCached ? 0 : 1,
            })
          : true;

        if (!okAvail) break;

        let avail = cachedAvail;
        if (!avail) {
          try {
            if (typeof this.availabilityService?.checkLegAvailability === 'function') {
              avail = await this.availabilityService.checkLegAvailability({
                trainNumber: trainNo,
                fromCode: A,
                toCode: Y,
                date: dateStr,
                travelClass: targetClass,
                quota,
              });
            } else if (typeof this.railKit?.getAvailability === 'function') {
              avail = await this.railKit.getAvailability(trainNo, A, Y, dateStr, targetClass, quota);
            }

            if (avail && typeof this.persistentCacheService?.set === 'function') {
              await this.persistentCacheService.set(cacheKey, avail, 'availability', 90000).catch(() => {});
            }
          } catch (availErr) {
            logger.warn(`[RouteExtension] Availability error for ${trainNo} ${A}->${Y}: ${availErr.message}`);
            _errorCache.set(errKey, Date.now());
            continue;
          }
        }

        if (!avail) continue;

        // Check if confirmed
        const normStatus = avail.normalizedStatus || avail.status;
        const statusText = String(avail.statusText || avail.availabilityText || '').toUpperCase();
        const isConfirmed =
          normStatus === AVAILABILITY_STATUS.AVAILABLE ||
          normStatus === 'AVAILABLE' ||
          normStatus === 'CONFIRMED' ||
          statusText.includes('AVAILABLE') ||
          statusText.includes('CNF');

        if (isConfirmed) {
          // Calculate fares
          const abClass = Array.isArray(train.classes)
            ? train.classes.find((c) => String(c.class).toUpperCase() === targetClass)
            : null;
          const fareAB = typeof abClass?.fare === 'number'
            ? abClass.fare
            : (typeof abClass?.totalFare === 'number' ? abClass.totalFare : null);

          const fareAY = typeof avail.fare === 'number'
            ? avail.fare
            : (typeof avail.totalFare === 'number' ? avail.totalFare : null);

          let extraFare = null;
          if (fareAB !== null && fareAY !== null) {
            extraFare = Math.max(0, fareAY - fareAB);
          }

          logger.info(`[RouteExtension] extension_hit: train=${trainNo} A=${A} B=${B} Y=${Y} class=${targetClass} extraFare=${extraFare}`);

          const stationYName = stnY.stationName || stnY.stnName || stnY.station_name || Y;
          const stationBName = rawRoute[idxB]?.stationName || rawRoute[idxB]?.stnName || B;
          const depTime = train.departureTime || rawRoute[idxA]?.departure || rawRoute[idxA]?.departure_time || '00:00';
          const arrTimeB = rawRoute[idxB]?.arrival || rawRoute[idxB]?.arrival_time || train.arrivalTime || '00:00';
          const arrTimeY = stnY.arrival || stnY.arrival_time || '00:00';

          const plan = {
            type: 'EXTENSION',
            trainNumber: trainNo,
            trainName: getTrainName(train),
            from: A,
            to: B,
            bookedTo: Y,
            extendedTo: Y,
            extendedStationName: stationYName,
            destinationStationName: stationBName,
            laneClass: targetClass,
            travelClass: targetClass,
            class: targetClass,
            tier: 'CONFIRMED',
            weakestTier: 'CONFIRMED',
            status: avail.statusText || 'AVAILABLE',
            fare: fareAY,
            totalFare: fareAY,
            originalFare: fareAB,
            extraFare,
            departureTime: depTime,
            arrivalTime: arrTimeB,
            destinationArrivalTime: arrTimeB,
            extendedArrivalTime: arrTimeY,
            duration: train.duration || null,
            badge: `Book to ${Y} — deboard at ${B}`,
            notice: extraFare !== null
              ? `Book ticket to ${Y} and get down at ${B}. Extra fare: ₹${extraFare}.`
              : `Book ticket to ${Y} and get down at ${B}.`,
            isExtension: true,
            legs: [
              {
                trainNumber: trainNo,
                trainNo,
                trainName: getTrainName(train),
                from: A,
                to: Y,
                bookedTo: Y,
                intendedTo: B,
                class: targetClass,
                status: avail.statusText || 'AVAILABLE',
                tier: 'CONFIRMED',
                fare: fareAY,
                totalFare: fareAY,
                departureTime: depTime,
                arrivalTime: arrTimeB,
                extendedArrivalTime: arrTimeY,
              },
            ],
          };

          extensionPlans.push(plan);
          // Early stop: stop checking further candidates Y for this train
          break;
        }
      }
    }

    const count = extensionPlans.length;
    return {
      plans: extensionPlans,
      metadata: {
        status: count > 0 ? 'success' : 'skipped',
        reason: count > 0 ? null : 'no_extension_found',
        count,
      },
    };
  }
}

export const routeExtensionService = new RouteExtensionService();
export default routeExtensionService;
