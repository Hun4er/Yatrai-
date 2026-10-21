import railKitAdapter, { normalizeRailKitTrain } from '../../providers/rail/railKit.adapter.js';
import fareService from './fare.service.js';
import clusterService from './cluster.service.js';
import logger from '../../utils/logger.js';
import { calculateJourneyTiming, formatJourneyDate, formatInIST } from '../../utils/railwayTime.js';
import { isUnlikelyWaitlist } from '../../ranking/utils/bookingQuality.js';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Calculates estimated road duration in minutes given distance in km.
 * Formula: max(20, round(km / 20 * 60 + 20))
 *
 * @param {number} km
 * @returns {number} duration in minutes
 */
export function estimateRoadMinutes(km) {
  const d = Math.max(0, Number(km) || 0);
  return Math.max(20, Math.round((d / 20) * 60 + 20));
}

/**
 * Extracts normalized uppercase station code from a leg.
 *
 * @param {Object} leg
 * @param {'origin'|'destination'} role
 * @returns {string} Station code (e.g. 'NDLS')
 */
export function getLegStationCode(leg, role) {
  if (!leg) return '';
  if (role === 'origin') {
    return String(
      leg.originStation?.stationCode ||
      leg.originStation?.code ||
      leg.metadata?.fromStationCode ||
      leg.metadata?.fromStation ||
      (typeof leg.origin === 'object' ? leg.origin?.stationCode || leg.origin?.code : null) ||
      (typeof leg.origin === 'string' && /^[A-Z]{2,5}$/.test(leg.origin) ? leg.origin : '') ||
      ''
    ).toUpperCase().trim();
  }
  return String(
    leg.destinationStation?.stationCode ||
    leg.destinationStation?.code ||
    leg.metadata?.toStationCode ||
    leg.metadata?.toStation ||
    (typeof leg.destination === 'object' ? leg.destination?.stationCode || leg.destination?.code : null) ||
    (typeof leg.destination === 'string' && /^[A-Z]{2,5}$/.test(leg.destination) ? leg.destination : '') ||
    ''
  ).toUpperCase().trim();
}

function isUsableStatus(journey) {
  if (!journey) return false;
  const status = journey.availability?.normalizedStatus || journey.availabilityStatus || '';
  if (status === 'AVAILABLE' || status === 'AVAILABILITY_VERIFIED') return true;
  if (status === 'RAC' || status === 'RAC_AVAILABLE') return true;
  if (status === 'WAITLISTED' || status === 'WAITLIST' || status === 'WAITLIST_ONLY') {
    const raw = journey.availability?.rawStatus || journey.availability?.originalStatus || '';
    return !isUnlikelyWaitlist(raw);
  }
  return false;
}

/**
 * ClusterLegExpander
 *
 * Expands a single-leg direct train whose boarding or arrival station was shifted
 * within a metro cluster (e.g. PNBE -> NDLS shifted to DNR -> ANVT) into real connected legs:
 *   leg 1: requested origin -> shifted boarding station (feeder train or local road transfer)
 *   leg 2: main train (keeps verified availability + fare)
 *   leg 3: shifted arrival station -> requested destination (connecting train or local road transfer)
 */
export class ClusterLegExpander {
  constructor(dependencies = {}) {
    this.railKit = dependencies.railKit || railKitAdapter;
    this.fareService = dependencies.fareService || fareService;
    const opts = dependencies.options || dependencies;
    this.minBoardingBufferMinutes = opts.minBoardingBufferMinutes ?? 30;
    this.minConnectionBufferMinutes = opts.minConnectionBufferMinutes ?? 30;
    this.maxWaitMinutes = opts.maxWaitMinutes ?? 480;
    this.maxFeederDurationMinutes = opts.maxFeederDurationMinutes ?? 180;
    this.maxFeederDistanceKm = opts.maxFeederDistanceKm ?? 80;
    this.roadArrivalBufferMinutes = opts.roadArrivalBufferMinutes ?? 45;
    this.roadExitBufferMinutes = opts.roadExitBufferMinutes ?? 15;
    this.maxJourneysToExpand = opts.maxJourneysToExpand ?? 2;
  }

  /**
   * Builds a local transfer leg (mode: road) between two stations in a cluster.
   */
  _buildLocalTransferLeg({ fromCode, toCode, role, mainDepDate, mainArrDate }) {
    const km = clusterService.calculateStationDistanceKm(fromCode, toCode);
    const duration = estimateRoadMinutes(km);

    let depTime, arrTime;
    if (role === 'origin') {
      depTime = new Date(mainDepDate.getTime() - (duration + this.roadArrivalBufferMinutes) * 60 * 1000);
      arrTime = new Date(depTime.getTime() + duration * 60 * 1000);
    } else {
      depTime = new Date(mainArrDate.getTime() + this.roadExitBufferMinutes * 60 * 1000);
      arrTime = new Date(depTime.getTime() + duration * 60 * 1000);
    }

    const depIST = formatInIST(depTime);
    const arrIST = formatInIST(arrTime);
    const [dy, dm, dd] = depIST.localDate.split('-').map(Number);
    const [ay, am, ad] = arrIST.localDate.split('-').map(Number);
    const dayOffset = Math.max(0, Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(dy, dm - 1, dd)) / (24 * 60 * 60 * 1000)));

    const originStn = clusterService.getStationDetails(fromCode);
    const destStn = clusterService.getStationDetails(toCode);
    const targetStationName = destStn?.name || toCode;

    return {
      origin: fromCode,
      destination: toCode,
      originStation: {
        name: originStn?.name || fromCode,
        stationCode: fromCode,
        code: fromCode,
        city: originStn?.city || originStn?.name || fromCode,
      },
      destinationStation: {
        name: destStn?.name || toCode,
        stationCode: toCode,
        code: toCode,
        city: destStn?.city || destStn?.name || toCode,
      },
      mode: 'road',
      providerCode: 'LOCAL_TRANSFER',
      departureTime: depTime.toISOString(),
      arrivalTime: arrTime.toISOString(),
      departureTimeFormatted: depIST.localTime,
      arrivalTimeFormatted: arrIST.localTime,
      departureDateFormatted: depIST.localDate,
      arrivalDateFormatted: arrIST.localDate,
      dayOffset,
      duration,
      distance: km,
      price: 0,
      currency: 'INR',
      isEstimated: false,
      vehicle: {
        type: 'Local transfer',
        identifier: 'Transfer',
      },
      service: {
        name: `Local transfer (metro / cab) to ${targetStationName}`,
        operator: 'Metro / Cab / Auto',
        class: 'Standard',
      },
      booking: {
        // JourneyLeg.booking.status only accepts: ['available','rac','waitlist','sold_out','not_bookable','unknown']
        status: 'unknown',
        isBookable: false,
      },
      availability: {
        normalizedStatus: 'UNCHECKED',
        isUnchecked: true,
      },
      metadata: {
        isStationTransfer: true,
        transferRole: role,
        fareNote: 'Local transport fare not included',
        fromStationCode: fromCode,
        toStationCode: toCode,
      },
    };
  }

  /**
   * Builds a connecting/feeder railway train leg.
   */
  _buildFeederTrainLeg({ train, timing, distance, passengers, fromCode, toCode, role }) {
    const originStn = clusterService.getStationDetails(fromCode);
    const destStn = clusterService.getStationDetails(toCode);
    const pCount = Math.max(1, Number(passengers) || 1);
    const legFare = Math.round(this.fareService.calculateTelescopicTariff(distance, 'SL') * pCount);

    return {
      origin: fromCode,
      destination: toCode,
      originStation: {
        name: originStn?.name || fromCode,
        stationCode: fromCode,
        code: fromCode,
        city: originStn?.city || originStn?.name || fromCode,
      },
      destinationStation: {
        name: destStn?.name || toCode,
        stationCode: toCode,
        code: toCode,
        city: destStn?.city || destStn?.name || toCode,
      },
      mode: 'rail',
      providerCode: 'IRCTC',
      departureTime: timing.departureTime.toISOString(),
      arrivalTime: timing.arrivalTime.toISOString(),
      departureTimeFormatted: timing.departureLocalTime,
      arrivalTimeFormatted: timing.arrivalLocalTime,
      departureDateFormatted: timing.departureLocalDate,
      arrivalDateFormatted: timing.arrivalLocalDate,
      dayOffset: timing.dayOffset,
      duration: timing.durationMinutes,
      distance,
      price: legFare,
      currency: 'INR',
      isEstimated: true,
      vehicle: {
        type: 'Train',
        identifier: train.trainNumber,
      },
      service: {
        name: train.trainName,
        operator: 'Indian Railways',
        class: 'SL',
        number: train.trainNumber,
      },
      booking: {
        // JourneyLeg.booking.status only accepts: ['available','rac','waitlist','sold_out','not_bookable','unknown']
        status: 'unknown',
        isBookable: false,
      },
      availability: {
        normalizedStatus: 'UNCHECKED',
        originalStatus: 'UNCHECKED',
        status: 'unchecked',
        seatsAvailable: null,
        isAvailable: false,
        isUnchecked: true,
        reason: 'FEEDER_UNCHECKED',
      },
      metadata: {
        isFeeder: true,
        transferRole: role,
        fromStationCode: fromCode,
        toStationCode: toCode,
        trainNumber: train.trainNumber,
        trainName: train.trainName,
      },
    };
  }

  /**
   * Expands an individual single-leg journey into multi-leg connected journey if stations differ.
   *
   * @param {Object} journey
   * @param {Object} context
   * @returns {Promise<Object>}
   */
  async expandJourney(
    journey,
    { requestedOriginCode, requestedDestCode, budgetTracker, travelClass = '3A', passengers = 1 } = {}
  ) {
    if (!journey || !Array.isArray(journey.legs) || journey.legs.length !== 1) {
      return journey;
    }

    const mainLeg = journey.legs[0];
    const mainFrom = getLegStationCode(mainLeg, 'origin') || String(journey.metadata?.fromStationCode || '').toUpperCase().trim();
    const mainTo = getLegStationCode(mainLeg, 'destination') || String(journey.metadata?.toStationCode || '').toUpperCase().trim();

    const reqOrigin = String(requestedOriginCode || '').toUpperCase().trim();
    const reqDest = String(requestedDestCode || '').toUpperCase().trim();

    const originDiffers = Boolean(reqOrigin && mainFrom && reqOrigin !== mainFrom);
    const destDiffers = Boolean(reqDest && mainTo && reqDest !== mainTo);

    if (!originDiffers && !destDiffers) {
      return journey;
    }

    const mainDepDate = new Date(mainLeg.departureTime);
    const mainArrDate = new Date(mainLeg.arrivalTime);
    if (isNaN(mainDepDate.getTime()) || isNaN(mainArrDate.getTime())) {
      return journey;
    }

    let originLeg = null;
    let destLeg = null;

    // 1. Origin Side expansion
    if (originDiffers) {
      const refOriginTime = new Date(mainDepDate.getTime() - this.minBoardingBufferMinutes * 60 * 1000);
      const originSearchDate = formatJourneyDate(refOriginTime);
      const [oy, om, od] = originSearchDate.split('-').map(Number);
      const originWeekday = WEEKDAYS[new Date(Date.UTC(oy, om - 1, od)).getUTCDay()];

      let originFeederTrain = null;
      let smallestWait = Infinity;

      if (budgetTracker && !budgetTracker.canMakeStaticRequest('tier2')) {
        logger.debug(`[ClusterLegExpander] Static budget exhausted. Skipping feeder train search for ${reqOrigin}->${mainFrom}`);
      } else if (this.railKit && typeof this.railKit.searchTrainBetweenStations === 'function') {
        try {
          const rkRes = await this.railKit.searchTrainBetweenStations(reqOrigin, mainFrom, originSearchDate, {
            budgetTracker,
            tier: 'tier2',
            date: originSearchDate,
          });

          if (rkRes && rkRes.success && (Array.isArray(rkRes.data) || Array.isArray(rkRes.trains))) {
            const rawTrains = rkRes.data || rkRes.trains || [];
            for (const item of rawTrains) {
              try {
                const train = normalizeRailKitTrain(item, reqOrigin, mainFrom);
                if (!train) continue;

                const runDays = (train.runDays || train.train?.runDays || []).map((d) => String(d).toLowerCase());
                if (!runDays.includes(originWeekday)) continue;

                const depStr = train.from?.departure || train.departureTime;
                const arrStr = train.to?.arrival || train.arrivalTime;
                const timing = calculateJourneyTiming(depStr, arrStr, originSearchDate);

                if (timing.durationMinutes > this.maxFeederDurationMinutes) continue;

                const dist = Number(train.distance || train.distanceKm) || clusterService.calculateStationDistanceKm(reqOrigin, mainFrom);
                if (dist > this.maxFeederDistanceKm) continue;

                const waitMinutes = Math.round((mainDepDate.getTime() - timing.arrivalTime.getTime()) / 60000);
                if (waitMinutes >= this.minBoardingBufferMinutes && waitMinutes <= this.maxWaitMinutes) {
                  if (waitMinutes < smallestWait) {
                    smallestWait = waitMinutes;
                    originFeederTrain = { train, timing, distance: dist };
                  }
                }
              } catch (itemErr) {
                logger.debug(`[ClusterLegExpander] Error processing origin train candidate: ${itemErr.message}`);
                continue;
              }
            }
          }
        } catch (err) {
          logger.debug(`[ClusterLegExpander] Feeder train search failed for ${reqOrigin}->${mainFrom}: ${err.message}`);
        }
      }

      if (originFeederTrain) {
        originLeg = this._buildFeederTrainLeg({
          ...originFeederTrain,
          passengers,
          fromCode: reqOrigin,
          toCode: mainFrom,
          role: 'origin',
        });
      } else {
        originLeg = this._buildLocalTransferLeg({
          fromCode: reqOrigin,
          toCode: mainFrom,
          role: 'origin',
          mainDepDate,
          mainArrDate,
        });
      }
    }

    // 2. Destination Side expansion
    if (destDiffers) {
      const refDestTime = new Date(mainArrDate.getTime() + this.minConnectionBufferMinutes * 60 * 1000);
      const destSearchDate = formatJourneyDate(refDestTime);
      const [dy, dm, dd] = destSearchDate.split('-').map(Number);
      const destWeekday = WEEKDAYS[new Date(Date.UTC(dy, dm - 1, dd)).getUTCDay()];

      let destConnectingTrain = null;
      let earliestDep = Infinity;

      if (budgetTracker && !budgetTracker.canMakeStaticRequest('tier2')) {
        logger.debug(`[ClusterLegExpander] Static budget exhausted. Skipping connecting train search for ${mainTo}->${reqDest}`);
      } else if (this.railKit && typeof this.railKit.searchTrainBetweenStations === 'function') {
        try {
          const rkRes = await this.railKit.searchTrainBetweenStations(mainTo, reqDest, destSearchDate, {
            budgetTracker,
            tier: 'tier2',
            date: destSearchDate,
          });

          if (rkRes && rkRes.success && (Array.isArray(rkRes.data) || Array.isArray(rkRes.trains))) {
            const rawTrains = rkRes.data || rkRes.trains || [];
            for (const item of rawTrains) {
              try {
                const train = normalizeRailKitTrain(item, mainTo, reqDest);
                if (!train) continue;

                const runDays = (train.runDays || train.train?.runDays || []).map((d) => String(d).toLowerCase());
                if (!runDays.includes(destWeekday)) continue;

                const depStr = train.from?.departure || train.departureTime;
                const arrStr = train.to?.arrival || train.arrivalTime;
                const timing = calculateJourneyTiming(depStr, arrStr, destSearchDate);

                if (timing.durationMinutes > this.maxFeederDurationMinutes) continue;

                const dist = Number(train.distance || train.distanceKm) || clusterService.calculateStationDistanceKm(mainTo, reqDest);
                if (dist > this.maxFeederDistanceKm) continue;

                const depTimeMs = timing.departureTime.getTime();
                const minAllowedDep = refDestTime.getTime();
                const maxAllowedDep = refDestTime.getTime() + this.maxWaitMinutes * 60 * 1000;

                if (depTimeMs >= minAllowedDep && depTimeMs <= maxAllowedDep) {
                  if (depTimeMs < earliestDep) {
                    earliestDep = depTimeMs;
                    destConnectingTrain = { train, timing, distance: dist };
                  }
                }
              } catch (itemErr) {
                logger.debug(`[ClusterLegExpander] Error processing dest train candidate: ${itemErr.message}`);
                continue;
              }
            }
          }
        } catch (err) {
          logger.debug(`[ClusterLegExpander] Connecting train search failed for ${mainTo}->${reqDest}: ${err.message}`);
        }
      }

      if (destConnectingTrain) {
        destLeg = this._buildFeederTrainLeg({
          ...destConnectingTrain,
          passengers,
          fromCode: mainTo,
          toCode: reqDest,
          role: 'destination',
        });
      } else {
        destLeg = this._buildLocalTransferLeg({
          fromCode: mainTo,
          toCode: reqDest,
          role: 'destination',
          mainDepDate,
          mainArrDate,
        });
      }
    }

    // 3. Pin main leg's origin / destination to real stations
    mainLeg.origin = mainFrom;
    mainLeg.destination = mainTo;
    if (mainLeg.originStation) {
      mainLeg.originStation.code = mainFrom;
      mainLeg.originStation.stationCode = mainFrom;
    }
    if (mainLeg.destinationStation) {
      mainLeg.destinationStation.code = mainTo;
      mainLeg.destinationStation.stationCode = mainTo;
    }
    mainLeg.metadata = {
      ...(mainLeg.metadata || {}),
      isMainTrain: true,
      fromStationCode: mainFrom,
      toStationCode: mainTo,
    };

    // 4. Assemble candidate leg chain
    const newLegs = [];
    if (originLeg) newLegs.push(originLeg);
    newLegs.push(mainLeg);
    if (destLeg) newLegs.push(destLeg);

    // 5. Validate chain integrity
    for (let i = 0; i < newLegs.length - 1; i++) {
      const cur = newLegs[i];
      const nxt = newLegs[i + 1];
      const curDest = getLegStationCode(cur, 'destination');
      const nxtOrigin = getLegStationCode(nxt, 'origin');

      if (!curDest || !nxtOrigin || curDest !== nxtOrigin) {
        logger.warn(`[ClusterLegExpander] Chain integrity broken: Leg ${i} destination (${curDest}) !== Leg ${i + 1} origin (${nxtOrigin})`);
        return journey;
      }

      const curArr = new Date(cur.arrivalTime).getTime();
      const nxtDep = new Date(nxt.departureTime).getTime();
      if (curArr > nxtDep) {
        logger.warn(`[ClusterLegExpander] Chain timing broken: Leg ${i} arrival (${cur.arrivalTime}) > Leg ${i + 1} departure (${nxt.departureTime})`);
        return journey;
      }
    }

    // Renumber leg sequences
    newLegs.forEach((leg, idx) => {
      leg.sequence = idx + 1;
    });

    // 6. Re-derive journey-level fields
    const firstLeg = newLegs[0];
    const lastLeg = newLegs[newLegs.length - 1];

    journey.legs = newLegs;
    journey.departureTime = firstLeg.departureTime;
    journey.arrivalTime = lastLeg.arrivalTime;
    journey.departureTimeFormatted = firstLeg.departureTimeFormatted;
    journey.arrivalTimeFormatted = lastLeg.arrivalTimeFormatted;
    journey.departureDateFormatted = firstLeg.departureDateFormatted;
    journey.arrivalDateFormatted = lastLeg.arrivalDateFormatted;

    const depLocal = firstLeg.departureDateFormatted || formatInIST(new Date(firstLeg.departureTime)).localDate;
    const arrLocal = lastLeg.arrivalDateFormatted || formatInIST(new Date(lastLeg.arrivalTime)).localDate;
    const [dy, dm, dd] = depLocal.split('-').map(Number);
    const [ay, am, ad] = arrLocal.split('-').map(Number);
    journey.dayOffset = Math.max(0, Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(dy, dm - 1, dd)) / (24 * 60 * 60 * 1000)));

    journey.duration = Math.max(1, Math.round((new Date(lastLeg.arrivalTime).getTime() - new Date(firstLeg.departureTime).getTime()) / 60000));
    journey.totalDistance = newLegs.reduce((sum, l) => sum + (Number(l.distance) || 0), 0);
    journey.numberOfTransfers = newLegs.length - 1;

    const stationTransfers = newLegs.filter((l) => l.metadata?.isStationTransfer === true).length;
    const railLegs = newLegs.filter((l) => l.mode === 'rail');
    journey.stationTransfers = stationTransfers;
    journey.trainChanges = Math.max(0, railLegs.length - 1);

    const totalPrice = railLegs.reduce((sum, l) => sum + (Number(l.price) || 0), 0);
    journey.totalPrice = totalPrice;

    const mainTrainFare = Number(mainLeg.price) || 0;
    journey.pricing = {
      ...(journey.pricing || {}),
      totalFare: totalPrice,
      mainTrainFare,
      isEstimated: true,
      currency: journey.currency || 'INR',
    };

    journey.hasExpandedLegs = true;
    journey.isClusterShift = true;
    journey.transportModes = Array.from(new Set(newLegs.map((l) => l.mode)));

    const legSummary = newLegs
      .map((l) => {
        const o = getLegStationCode(l, 'origin');
        const d = getLegStationCode(l, 'destination');
        const name = l.service?.name || l.vehicle?.type || 'Transit';
        return `${name} (${o} -> ${d})`;
      })
      .join(' + ');

    const summaryLabel =
      journey.stationDifference?.summaryLabel ||
      journey.clusterNote ||
      journey.metadata?.clusterNote ||
      '';

    const stationDiff = {
      ...(journey.stationDifference || journey.metadata?.stationDifference || {}),
      hasDifference: true,
      expandedIntoLegs: true,
      summaryLabel,
    };

    journey.clusterNote = summaryLabel;
    journey.stationDifference = stationDiff;

    journey.metadata = {
      ...(journey.metadata || {}),
      hasExpandedLegs: true,
      legSummary,
      mainTrainNumber: mainLeg.vehicle?.identifier || mainLeg.service?.number || journey.metadata?.trainNumber,
      isEstimatedPrice: true,
      stationDifference: stationDiff,
    };

    const trainNumber = mainLeg.vehicle?.identifier || mainLeg.service?.number || journey.metadata?.trainNumber || '';
    const reqFrom = reqOrigin;
    const reqTo = reqDest;
    logger.info(
      `[ClusterLegExpander] Expanded train ${trainNumber} (${mainFrom}->${mainTo}) for ${reqFrom}->${reqTo} into ${newLegs.length} legs: ` +
        newLegs.map((l) => `${l.origin}>${l.destination}${l.metadata?.isStationTransfer ? '(transfer)' : ''}`).join(' | ')
    );

    return journey;
  }

  /**
   * Expands up to maxJourneysToExpand single-leg cluster-shifted journeys.
   *
   * @param {Array<Object>} journeys
   * @param {Object} ctx
   * @returns {Promise<Array<Object>>}
   */
  async expandJourneys(journeys, ctx = {}) {
    if (!Array.isArray(journeys) || journeys.length === 0) return journeys;

    const requestedOrigin = String(ctx.requestedOriginCode || '').toUpperCase().trim();
    const requestedDest = String(ctx.requestedDestCode || '').toUpperCase().trim();

    const eligible = [];
    for (const journey of journeys) {
      if (!journey || !Array.isArray(journey.legs) || journey.legs.length !== 1) {
        continue;
      }
      const leg = journey.legs[0];
      const from = getLegStationCode(leg, 'origin') || String(journey.metadata?.fromStationCode || '').toUpperCase().trim();
      const to = getLegStationCode(leg, 'destination') || String(journey.metadata?.toStationCode || '').toUpperCase().trim();

      const originShifted = Boolean(requestedOrigin && from && requestedOrigin !== from);
      const destShifted = Boolean(requestedDest && to && requestedDest !== to);

      if (originShifted || destShifted || journey.isClusterShift || journey.stationDifference?.hasDifference) {
        eligible.push(journey);
      }
    }

    const shifted = eligible;
    logger.info(`[ClusterLegExpander] ${shifted.length} cluster-shifted single-leg journey(s) found out of ${journeys.length}`);

    if (shifted.length === 0) return journeys;

    // Prioritize usable availability first, then shortest duration
    shifted.sort((a, b) => {
      const aUsable = isUsableStatus(a) ? 1 : 0;
      const bUsable = isUsableStatus(b) ? 1 : 0;
      if (bUsable !== aUsable) return bUsable - aUsable;
      const durA = Number(a.duration) || 0;
      const durB = Number(b.duration) || 0;
      return durA - durB;
    });

    const toExpand = eligible.slice(0, this.maxJourneysToExpand);

    for (const j of toExpand) {
      try {
        await this.expandJourney(j, ctx);
      } catch (err) {
        logger.warn(`[ClusterLegExpander] Failed to expand journey ${j.id || j._id}: ${err.message}`);
      }
    }

    return journeys;
  }
}

export const clusterLegExpander = new ClusterLegExpander();
export default clusterLegExpander;
