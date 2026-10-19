import railKitAdapter, { normalizeRailKitTrain } from '../../providers/rail/railKit.adapter.js';
import { resolveStationCode } from '../../providers/transport/rail/rail.provider.js';
import clusterService from './cluster.service.js';
import availabilityService, { AVAILABILITY_STATUS, JOURNEY_AVAILABILITY, normalizeSeatAvailability } from './availability.service.js';
import fareService from './fare.service.js';
import logger from '../../utils/logger.js';
import { calculateJourneyTiming } from '../../utils/railwayTime.js';
import { findVerifiedDirectTrains } from './verifiedTrainData.js';
import config from '../../config/index.js';
import { isUnlikelyWaitlist } from '../../ranking/utils/bookingQuality.js';

/**
 * Checks whether a candidate journey has a usable result:
 * - Confirmed AVAILABLE
 * - RAC
 * - Waitlist within feasible threshold
 */
export function isUsableJourney(journey) {
  if (!journey || !journey.availability) return false;
  const status = journey.availability.normalizedStatus;
  if (status === AVAILABILITY_STATUS.AVAILABLE || status === 'AVAILABLE') return true;
  if (status === AVAILABILITY_STATUS.RAC || status === 'RAC') return true;
  if (status === AVAILABILITY_STATUS.WAITLISTED || status === 'WAITLISTED') {
    const raw = journey.availability.rawStatus || journey.availability.originalStatus || '';
    return !isUnlikelyWaitlist(raw);
  }
  return false;
}

/**
 * Direct Search Status Codes (Section 3)
 */
export const DIRECT_SEARCH_STATUS = {
  DIRECT_AVAILABLE: 'DIRECT_AVAILABLE',
  DIRECT_UNAVAILABLE: 'DIRECT_UNAVAILABLE',
  DIRECT_RAC_ONLY: 'DIRECT_RAC_ONLY',
  DIRECT_WAITLIST_ONLY: 'DIRECT_WAITLIST_ONLY',
  DIRECT_NOT_RUNNING: 'DIRECT_NOT_RUNNING',
  DIRECT_NOT_FOUND: 'DIRECT_NOT_FOUND',
  DIRECT_UNSUITABLE: 'DIRECT_UNSUITABLE',
  DIRECT_SEARCH_FAILED: 'DIRECT_SEARCH_FAILED',
  DIRECT_AVAILABILITY_UNKNOWN: 'DIRECT_AVAILABILITY_UNKNOWN',
};

/**
 * DirectJourneyService
 *
 * Implements Section 3 & 5:
 * - Direct train search via RailKit/RailRadar
 * - Cluster/metro station group resolution across all pairs
 * - Date-independent timetable data with local running-day filtering
 * - Timetable-score ranking before availability validation
 * - Confirmed-seat availability validation bounded to maxDirectRequests
 * - Station difference labeling (code, name, distance)
 */
export class DirectJourneyService {
  constructor(dependencies = {}) {
    this.railKit = dependencies.railKit || dependencies.railRadar || railKitAdapter;
    this.availabilityService = dependencies.availabilityService || availabilityService;
    this.fareService = dependencies.fareService || fareService;
  }

  /**
   * Queries train timetable across pairs in a given tier.
   * Stops early if static tier allowance is exhausted.
   */
  async _queryPairs(pairs, tier, originCode, destCode, searchOpts, seenTrainNumbers) {
    let anyProviderSucceeded = false;
    let isRateLimited = false;
    let isMonthlyQuota = false;
    let lastError = null;
    const tracker = searchOpts?.budgetTracker;

    for (const pair of pairs) {
      const { from: f, to: t } = pair;
      if (tracker && !tracker.canMakeStaticRequest(tier)) {
        logger.info(`[DirectJourneyService] Static limit reached for ${tier}. Stopping further pair queries in ${tier}.`);
        break;
      }

      let pairTrains = [];
      if (this.railKit) {
        try {
          if (typeof this.railKit.searchTrainBetweenStations === 'function') {
            const rkRes = await this.railKit.searchTrainBetweenStations(f, t, { ...searchOpts, tier });
            if (rkRes && rkRes.success) {
              anyProviderSucceeded = true;
              if (Array.isArray(rkRes.data) && rkRes.data.length > 0) {
                pairTrains = rkRes.data.map((item) => normalizeRailKitTrain(item, f, t));
              } else if (Array.isArray(rkRes.trains)) {
                pairTrains = rkRes.trains;
              }
            } else if (rkRes?.reason === 'STATIC_BUDGET_EXHAUSTED') {
              logger.info(`[DirectJourneyService] Static budget exhausted for ${f}->${t} in ${tier}`);
              break;
            }
          } else if (typeof this.railKit.searchDirectTrains === 'function') {
            const res = await this.railKit.searchDirectTrains(f, t, { ...searchOpts, tier, isRecovery: false });
            if (res && res.success) {
              anyProviderSucceeded = true;
              if (Array.isArray(res.trains) && res.trains.length > 0) {
                pairTrains = res.trains;
              }
            } else if (res && !res.success) {
              const isRateLimit =
                res.isRateLimited ||
                res.statusCode === 429 ||
                /rate limit|quota exceeded|429/i.test(String(res.error));
              if (isRateLimit) isRateLimited = true;
              if (res.isMonthlyQuota || /monthly quota/i.test(String(res.error))) isMonthlyQuota = true;
              if (res.error) lastError = res.error;
            }
          }
        } catch (err) {
          logger.debug(`[DirectJourneyService] RailKit search failed for ${f}->${t}: ${err.message}`);
          lastError = err.message;
        }
      }

      // If still 0, check static verified fallback
      if (pairTrains.length === 0 && searchOpts.allowTimetableFallback === true) {
        const verified = findVerifiedDirectTrains(f, t, searchOpts.departureDate);
        if (verified.length > 0) {
          anyProviderSucceeded = true;
          pairTrains = verified;
        }
      }

      for (const train of pairTrains) {
        const trainNum = String(train.train?.number || train.trainNumber || train.number || '');
        if (!trainNum) continue;

        // Use the train's actual station stops if available, falling back to queried pair f, t
        const actualFrom = train.from?.code || train.from_stn_code || f;
        const actualTo = train.to?.code || train.to_stn_code || t;

        const currentOriginDist = clusterService.calculateStationDistanceKm(originCode, actualFrom);
        const currentDestDist = clusterService.calculateStationDistanceKm(destCode, actualTo);
        const currentTotalDist = currentOriginDist + currentDestDist;

        // A candidate is genuine tier1 only if actualFrom === originCode && actualTo === destCode
        const effectiveTier = (actualFrom === originCode && actualTo === destCode) ? 'tier1' : 'tier2';

        if (!seenTrainNumbers.has(trainNum)) {
          seenTrainNumbers.set(trainNum, { train, pair, totalDist: currentTotalDist, fromCode: actualFrom, toCode: actualTo, tier: effectiveTier });
        } else {
          const existing = seenTrainNumbers.get(trainNum);
          if (currentTotalDist < existing.totalDist) {
            seenTrainNumbers.set(trainNum, { train, pair, totalDist: currentTotalDist, fromCode: actualFrom, toCode: actualTo, tier: effectiveTier });
          }
        }
      }
    }

    return { anyProviderSucceeded, isRateLimited, isMonthlyQuota, lastError };
  }

  /**
   * Formats candidate trains from seenTrainNumbers and checks running day.
   */
  _formatCandidates(trainMap, departureDate, originCode, destCode, origin, destination) {
    const formattedCandidates = [];
    const dateObj = departureDate instanceof Date ? departureDate : new Date(departureDate);
    const istEpoch = dateObj.getTime() + 5.5 * 60 * 60 * 1000;
    const istDate = new Date(istEpoch);
    const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][istDate.getUTCDay()];

    for (const { train: item, fromCode: actualFrom, toCode: actualTo, tier } of trainMap.values()) {
      const trainNum = String(item.train?.number || item.trainNumber || item.number || '');
      const trainName = item.train?.name || item.trainName || item.name || 'Express';
      const runDays = item.train?.runDays || item.runDays || [];

      let boardingOffset = 0;
      if (item.from?.day && item.from.day > 1) {
        boardingOffset = item.from.day - 1;
      }
      const sourceDayIndex = (istDate.getUTCDay() - boardingOffset + 7) % 7;
      const sourceDayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][sourceDayIndex];

      const isRunningOnDate =
        runDays.length === 0 ||
        runDays.map((d) => d.toLowerCase().slice(0, 3)).includes(sourceDayOfWeek) ||
        runDays.map((d) => d.toLowerCase().slice(0, 3)).includes(dayOfWeek);

      const depStr = item.from?.departure || item.departureTime || '06:00';
      const arrStr = item.to?.arrival || item.arrivalTime || '18:00';

      let explicitDayOffset = null;
      if (item.to?.day && item.from?.day && item.to.day > item.from.day) {
        explicitDayOffset = item.to.day - item.from.day;
      }

      const timing = calculateJourneyTiming(
        depStr,
        arrStr,
        departureDate,
        explicitDayOffset,
        item.duration
      );

      const distanceKm = Math.round(Number(item.distance) || 750);

      const originDiff = clusterService.getStationDifference(originCode, actualFrom, 'origin');
      const destDiff = clusterService.getStationDifference(destCode, actualTo, 'destination');
      const originPenalty = (originDiff?.distanceKm || 0) * 1.5;
      const destPenalty = (destDiff?.distanceKm || 0) * 1.5;
      const effectiveDuration = (timing.durationMinutes || 600) + originPenalty + destPenalty;
      const timetableScore = Math.round(100000 / (effectiveDuration + 60));

      const fromStnDetails = clusterService.getStationDetails(actualFrom);
      const toStnDetails = clusterService.getStationDetails(actualTo);

      formattedCandidates.push({
        trainNumber: trainNum,
        trainName,
        fromCode: actualFrom,
        toCode: actualTo,
        fromStationName: item.from?.name || fromStnDetails?.name || origin.name || actualFrom,
        toStationName: item.to?.name || toStnDetails?.name || destination.name || actualTo,
        fromStationDetails: fromStnDetails,
        toStationDetails: toStnDetails,
        departureTime: timing.departureTime,
        arrivalTime: timing.arrivalTime,
        departureTimeFormatted: timing.departureLocalTime,
        arrivalTimeFormatted: timing.arrivalLocalTime,
        departureDateFormatted: timing.departureLocalDate,
        arrivalDateFormatted: timing.arrivalLocalDate,
        dayOffset: timing.dayOffset,
        duration: timing.durationMinutes,
        distance: distanceKm,
        isRunningOnDate,
        timetableScore,
        originDiff,
        destDiff,
        tier,
        classes: item.classes || item.train?.classes || [],
        raw: item,
      });
    }

    const runningCandidates = formattedCandidates.filter((c) => c.isRunningOnDate);
    return { formattedCandidates, runningCandidates };
  }

  /**
   * Enriches candidate trains with availability and fares.
   */
  async _enrichCandidateList(candidatesToValidate, unvalidatedCandidates, searchContext, searchOpts, originCode, destCode, origin, destination) {
    const preferences = searchContext.preferences || {};
    const travelClass = preferences.class || preferences.travelClass || '3A';
    const quota = preferences.quota || 'GN';
    const passengers = Math.max(1, Number(searchContext.passengers) || 1);

    const enrichedJourneys = [];
    for (const cand of candidatesToValidate) {
      let avail;
      const offered = cand.classes || cand.raw?.classes || cand.raw?.train?.classes || [];
      const normClass = String(travelClass || '').trim().toUpperCase();
      const offeredList = Array.isArray(offered) ? offered.map((c) => String(c).trim().toUpperCase()) : [];

      if (offeredList.length > 0 && !offeredList.includes(normClass)) {
        avail = {
          success: false,
          provider: 'RailKit',
          trainNumber: cand.trainNumber,
          travelClass: normClass,
          quota,
          normalizedStatus: 'CLASS_NOT_OFFERED',
          originalStatus: 'CLASS_NOT_OFFERED',
          statusText: `Class ${normClass} not offered on train ${cand.trainNumber}`,
          message: `Class ${normClass} not offered on train ${cand.trainNumber}`,
          seatsAvailable: null,
          isAvailable: false,
          lastUpdated: new Date().toISOString(),
          isLive: false,
          isUnchecked: true,
          reason: 'CLASS_NOT_OFFERED',
        };
      } else if (searchOpts.budgetTracker && !searchOpts.budgetTracker.canMakeDirectRequest()) {
        logger.info(`[DirectJourneyService] Direct budget limit reached. Marking train ${cand.trainNumber} as UNCHECKED.`);
        avail = {
          success: false,
          provider: 'RailKit',
          trainNumber: cand.trainNumber,
          travelClass,
          quota,
          normalizedStatus: 'UNCHECKED',
          originalStatus: 'UNCHECKED',
          seatsAvailable: null,
          isAvailable: false,
          lastUpdated: new Date().toISOString(),
          isLive: false,
          isBudgetExhausted: true,
          isUnchecked: true,
          reason: 'BUDGET_EXHAUSTED',
        };
      } else {
        avail = await this.availabilityService.checkLegAvailability({
          trainNumber: cand.trainNumber,
          fromCode: cand.fromCode,
          toCode: cand.toCode,
          date: cand.departureTime,
          travelClass,
          quota,
          budgetTracker: searchOpts.budgetTracker,
          isRecovery: false,
          offeredClasses: offered,
        });
      }

      const fare = await this.fareService.getLegFare({
        trainNumber: cand.trainNumber,
        fromCode: cand.fromCode,
        toCode: cand.toCode,
        date: cand.departureTime,
        travelClass,
        quota,
        distanceKm: cand.distance,
        passengers,
        budgetTracker: searchOpts.budgetTracker,
        isRecovery: false,
        availability: avail,
        isSearchEnrichment: true,
      });

      const isShift = Boolean(cand.originDiff || cand.destDiff);
      const shiftLabels = [cand.originDiff?.label, cand.destDiff?.label].filter(Boolean);
      const shiftSummary = shiftLabels.join('. ');
      const stationDifference = {
        hasDifference: isShift,
        originShift: cand.originDiff,
        destinationShift: cand.destDiff,
        summaryLabel: shiftSummary,
      };

      enrichedJourneys.push({
        origin: origin._id || origin.id || origin,
        destination: destination._id || destination.id || destination,
        departureTime: cand.departureTime,
        arrivalTime: cand.arrivalTime,
        departureTimeFormatted: cand.departureTimeFormatted,
        arrivalTimeFormatted: cand.arrivalTimeFormatted,
        departureDateFormatted: cand.departureDateFormatted,
        arrivalDateFormatted: cand.arrivalDateFormatted,
        dayOffset: cand.dayOffset,
        duration: cand.duration,
        totalDistance: cand.distance,
        totalPrice: fare.totalFare,
        currency: fare.currency || 'INR',
        numberOfTransfers: 0,
        transportModes: ['rail'],
        status: 'scheduled',
        source: 'rail',
        isDirectTrain: true,
        tier: cand.tier || 'tier1',
        isClusterShift: isShift,
        clusterNote: shiftSummary,
        stationDifference,
        availability: avail,
        availabilityStatus:
          avail.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE
            ? 'AVAILABILITY_VERIFIED'
            : (avail.normalizedStatus === AVAILABILITY_STATUS.RAC ? 'RAC_AVAILABLE' : (avail.isUnchecked ? 'UNCHECKED' : 'WAITLIST_ONLY')),
        isBookable: avail.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE || avail.normalizedStatus === AVAILABILITY_STATUS.RAC,
        pricing: fare,
        metadata: {
          isDirect: true,
          tier: cand.tier || 'tier1',
          provider: 'Indian Railways (RailKit)',
          trainNumber: cand.trainNumber,
          trainName: cand.trainName,
          fromStation: cand.fromStationName,
          toStation: cand.toStationName,
          fromStationCode: cand.fromCode,
          toStationCode: cand.toCode,
          isEstimatedPrice: fare.isEstimated,
          isFareAvailable: Boolean(fare.totalFare !== null && fare.totalFare > 0),
          fareUnavailable: Boolean(!fare.totalFare || fare.fareUnavailable),
          availabilityStatus: avail.normalizedStatus,
          isClusterShift: isShift,
          clusterNote: shiftSummary,
          stationDifference,
        },
        legs: [
          {
            sequence: 1,
            origin: origin?._id || origin?.id || cand.fromCode,
            destination: destination?._id || destination?.id || cand.toCode,
            originStation: {
              name: cand.fromStationName || cand.fromCode,
              stationCode: cand.fromCode,
              code: cand.fromCode,
              city: cand.fromStationName || cand.fromCode,
            },
            destinationStation: {
              name: cand.toStationName || cand.toCode,
              stationCode: cand.toCode,
              code: cand.toCode,
              city: cand.toStationName || cand.toCode,
            },
            mode: 'rail',
            providerCode: 'IRCTC',
            departureTime: cand.departureTime,
            arrivalTime: cand.arrivalTime,
            departureTimeFormatted: cand.departureTimeFormatted,
            arrivalTimeFormatted: cand.arrivalTimeFormatted,
            departureDateFormatted: cand.departureDateFormatted,
            arrivalDateFormatted: cand.arrivalDateFormatted,
            dayOffset: cand.dayOffset,
            duration: cand.duration,
            distance: cand.distance,
            price: fare.totalFare,
            currency: fare.currency || 'INR',
            isEstimated: fare.isEstimated,
            vehicle: {
              type: 'Train',
              identifier: cand.trainNumber,
            },
            service: {
              name: cand.trainName,
              operator: 'Indian Railways',
              class: travelClass,
              number: cand.trainNumber,
            },
            booking: {
              status:
                avail.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE
                  ? 'available'
                  : (avail.normalizedStatus === AVAILABILITY_STATUS.RAC ? 'rac' : 'waitlist'),
              availability: avail,
            },
            metadata: {
              fromStation: cand.fromStationName,
              toStation: cand.toStationName,
            },
          },
        ],
      });
    }

    // Retain remaining direct candidates as UNCHECKED timetable journeys (saved API budget)
    for (const uCand of unvalidatedCandidates) {
      const isShift = Boolean(uCand.originDiff || uCand.destDiff);
      const shiftLabels = [uCand.originDiff?.label, uCand.destDiff?.label].filter(Boolean);
      const shiftSummary = shiftLabels.join('. ');
      const stationDifference = {
        hasDifference: isShift,
        originShift: uCand.originDiff,
        destinationShift: uCand.destDiff,
        summaryLabel: shiftSummary,
      };
      const unavail = {
        success: false,
        provider: 'RailKit',
        trainNumber: uCand.trainNumber,
        travelClass,
        quota,
        normalizedStatus: 'UNCHECKED',
        originalStatus: 'UNCHECKED',
        seatsAvailable: null,
        isAvailable: false,
        lastUpdated: new Date().toISOString(),
        isLive: false,
        isBudgetExhausted: true,
        isUnchecked: true,
        reason: 'TIMETABLE_ONLY',
      };
      const estPrice = Math.round((uCand.distance || 750) * 1.6);
      enrichedJourneys.push({
        origin: origin._id || origin.id || origin,
        destination: destination._id || destination.id || destination,
        departureTime: uCand.departureTime,
        arrivalTime: uCand.arrivalTime,
        departureTimeFormatted: uCand.departureTimeFormatted,
        arrivalTimeFormatted: uCand.arrivalTimeFormatted,
        departureDateFormatted: uCand.departureDateFormatted,
        arrivalDateFormatted: uCand.arrivalDateFormatted,
        dayOffset: uCand.dayOffset,
        duration: uCand.duration,
        totalDistance: uCand.distance,
        totalPrice: estPrice,
        currency: 'INR',
        numberOfTransfers: 0,
        transportModes: ['rail'],
        status: 'scheduled',
        source: 'rail',
        isDirectTrain: true,
        tier: uCand.tier || 'tier1',
        isClusterShift: isShift,
        clusterNote: shiftSummary,
        stationDifference,
        availability: unavail,
        availabilityStatus: 'UNCHECKED',
        isBookable: false,
        pricing: { totalFare: estPrice, currency: 'INR', isEstimated: true },
        metadata: {
          isDirect: true,
          tier: uCand.tier || 'tier1',
          provider: 'Indian Railways (RailKit)',
          trainNumber: uCand.trainNumber,
          trainName: uCand.trainName,
          fromStation: uCand.fromStationName,
          toStation: uCand.toStationName,
          fromStationCode: uCand.fromCode,
          toStationCode: uCand.toCode,
          isEstimatedPrice: true,
          isFareAvailable: false,
          fareUnavailable: false,
          availabilityStatus: 'UNCHECKED',
          isClusterShift: isShift,
          clusterNote: shiftSummary,
          stationDifference,
        },
        legs: [
          {
            sequence: 1,
            origin: origin?._id || origin?.id || uCand.fromCode,
            destination: destination?._id || destination?.id || uCand.toCode,
            originStation: {
              name: uCand.fromStationName || uCand.fromCode,
              stationCode: uCand.fromCode,
              code: uCand.fromCode,
              city: uCand.fromStationName || uCand.fromCode,
            },
            destinationStation: {
              name: uCand.toStationName || uCand.toCode,
              stationCode: uCand.toCode,
              code: uCand.toCode,
              city: uCand.toStationName || uCand.toCode,
            },
            mode: 'rail',
            providerCode: 'IRCTC',
            departureTime: uCand.departureTime,
            arrivalTime: uCand.arrivalTime,
            departureTimeFormatted: uCand.departureTimeFormatted,
            arrivalTimeFormatted: uCand.arrivalTimeFormatted,
            departureDateFormatted: uCand.departureDateFormatted,
            arrivalDateFormatted: uCand.arrivalDateFormatted,
            dayOffset: uCand.dayOffset,
            duration: uCand.duration,
            distance: uCand.distance,
            price: estPrice,
            currency: 'INR',
            isEstimated: true,
            vehicle: { type: 'Train', identifier: uCand.trainNumber },
            service: {
              name: uCand.trainName,
              operator: 'Indian Railways',
              class: travelClass,
              number: uCand.trainNumber,
            },
            booking: { status: 'unknown', isBookable: false },
            availability: unavail,
          },
        ],
      });
    }

    return enrichedJourneys;
  }

  /**
   * Searches for direct trains matching the user request across cluster pairs and evaluates availability.
   *
   * @param {Object} searchContext
   * @param {Object} options
   * @returns {Promise<Object>} { status, directJourneys, failureReason, shouldTriggerRecovery }
   */
  async searchDirectTrains(searchContext, options = {}) {
    const origin = searchContext.originLocation || searchContext.origin;
    const destination = searchContext.destLocation || searchContext.destination;
    const departureDate = searchContext.departureDate;
    const passengers = Math.max(1, Number(searchContext.passengers) || 1);
    const preferences = searchContext.preferences || {};
    const travelClass = preferences.class || preferences.travelClass || '3A';
    const quota = preferences.quota || 'GN';

    const originCode = resolveStationCode(origin);
    const destCode = resolveStationCode(destination);

    const tiered = clusterService.getTieredClusterPairs(originCode, destCode, options);
    const exploreAlternatives = Boolean(options.exploreAlternatives || searchContext.exploreAlternatives);
    const maxDirectCandidates = Number(config.railRecovery?.maxDirectRequests || 4);

    const searchOpts = { ...options, departureDate, date: departureDate, isRecovery: false };
    const seenTrainNumbers = new Map();
    let anyProviderSucceeded = false;
    let isRateLimited = false;
    let isMonthlyQuota = false;
    let lastError = null;

    logger.info(
      `[DirectJourneyService] Tiered search for ${originCode}->${destCode} on ${departureDate}: Tier1 (${tiered.tier1.length} pairs), Tier2 (${tiered.tier2.length} pairs), Tier3 (${tiered.tier3.length} pairs, exploreAlternatives=${exploreAlternatives})`
    );

    // 1. Execute Tier 1 (primary requested station pair only)
    const t1Status = await this._queryPairs(tiered.tier1, 'tier1', originCode, destCode, searchOpts, seenTrainNumbers);
    if (t1Status.anyProviderSucceeded) anyProviderSucceeded = true;
    if (t1Status.isRateLimited) isRateLimited = true;
    if (t1Status.isMonthlyQuota) isMonthlyQuota = true;
    if (t1Status.lastError) lastError = t1Status.lastError;

    const { runningCandidates: t1Running } = this._formatCandidates(
      seenTrainNumbers,
      departureDate,
      originCode,
      destCode,
      origin,
      destination
    );

    const t1DirectRunning = t1Running.filter((c) => c.tier === 'tier1');
    t1DirectRunning.sort((a, b) => b.timetableScore - a.timetableScore);
    const maxDirectBudget = searchOpts.budgetTracker?.maxDirectRequests || maxDirectCandidates;
    const tier1Cap = Math.max(1, Math.floor(maxDirectBudget * 0.5));
    const t1ToValidate = t1DirectRunning.slice(0, tier1Cap);

    logger.info(
      `[DirectJourneyService] Tier 1: ${seenTrainNumbers.size} trains found, ${t1DirectRunning.length} running, validating top ${t1ToValidate.length} (50% direct cap: ${tier1Cap})`
    );

    const validatedTrainNumbers = new Set(t1ToValidate.map((c) => c.trainNumber));
    let enrichedJourneys = await this._enrichCandidateList(
      t1ToValidate,
      [],
      searchContext,
      searchOpts,
      originCode,
      destCode,
      origin,
      destination
    );

    let hasUsableTier1 = enrichedJourneys.some(isUsableJourney);

    // 2. Execute Tier 2 only if Tier 1 yields NO usable result (confirmed, RAC, or manageable WL) OR exploreAlternatives is true
    if (hasUsableTier1 && !exploreAlternatives) {
      const remainingT1Slots = maxDirectBudget - validatedTrainNumbers.size;
      const additionalT1 = t1Running.filter((c) => !validatedTrainNumbers.has(c.trainNumber)).slice(0, remainingT1Slots);
      if (additionalT1.length > 0) {
        for (const c of additionalT1) validatedTrainNumbers.add(c.trainNumber);
        const additionalEnriched = await this._enrichCandidateList(
          additionalT1,
          [],
          searchContext,
          searchOpts,
          originCode,
          destCode,
          origin,
          destination
        );
        enrichedJourneys.push(...additionalEnriched);
      }
      logger.info(
        `[DirectJourneyService] Tier 1 yielded usable result. Total validated in Tier 1: ${validatedTrainNumbers.size}. Skipping Tier 2 cluster search.`
      );
    } else {
      logger.info(
        `[DirectJourneyService] Executing Tier 2 cluster search (hasUsableTier1=${hasUsableTier1}, exploreAlternatives=${exploreAlternatives}).`
      );
      const t2Status = await this._queryPairs(tiered.tier2, 'tier2', originCode, destCode, searchOpts, seenTrainNumbers);
      if (t2Status.anyProviderSucceeded) anyProviderSucceeded = true;
      if (t2Status.isRateLimited) isRateLimited = true;
      if (t2Status.isMonthlyQuota) isMonthlyQuota = true;
      if (t2Status.lastError) lastError = t2Status.lastError;

      const { runningCandidates: allRunningSoFar } = this._formatCandidates(
        seenTrainNumbers,
        departureDate,
        originCode,
        destCode,
        origin,
        destination
      );

      // Prioritize genuine Tier 2 cluster candidates over unvalidated Tier 1 overflow
      const t2ClusterCands = allRunningSoFar.filter((c) => !validatedTrainNumbers.has(c.trainNumber) && c.tier === 'tier2');
      const t1RemainingCands = allRunningSoFar.filter((c) => !validatedTrainNumbers.has(c.trainNumber) && c.tier !== 'tier2');
      t2ClusterCands.sort((a, b) => b.timetableScore - a.timetableScore);
      t1RemainingCands.sort((a, b) => b.timetableScore - a.timetableScore);
      const t2New = [...t2ClusterCands, ...t1RemainingCands];

      const remainingSlots = Math.max(0, maxDirectBudget - validatedTrainNumbers.size);
      const t2ToValidate = t2New.slice(0, remainingSlots);

      logger.info(
        `[DirectJourneyService] Tier 2: validating up to ${t2ToValidate.length} candidates (remaining direct cap: ${remainingSlots})`
      );

      let goodResultsCount = enrichedJourneys.filter(isUsableJourney).length;
      const t2Validated = [];
      const t2Unchecked = [];

      for (const cand of t2ToValidate) {
        if (goodResultsCount >= 3) {
          logger.info(`[DirectJourneyService] Early stop reached (${goodResultsCount} good results found). Skipping availability check for ${cand.trainNumber}.`);
          t2Unchecked.push(cand);
          continue;
        }

        validatedTrainNumbers.add(cand.trainNumber);
        const [enriched] = await this._enrichCandidateList(
          [cand],
          [],
          searchContext,
          searchOpts,
          originCode,
          destCode,
          origin,
          destination
        );

        if (enriched) {
          t2Validated.push(enriched);
          if (isUsableJourney(enriched)) {
            goodResultsCount++;
          }
        }
      }

      enrichedJourneys.push(...t2Validated);
      if (t2Unchecked.length > 0) {
        const uncheckedJourneys = await this._enrichCandidateList(
          [],
          t2Unchecked,
          searchContext,
          searchOpts,
          originCode,
          destCode,
          origin,
          destination
        );
        enrichedJourneys.push(...uncheckedJourneys);
      }
    }

    // 3. Execute Tier 3 only when exploreAlternatives is explicitly enabled
    if (exploreAlternatives) {
      logger.info(
        '[DirectJourneyService] exploreAlternatives=true. Executing Tier 3 cluster search.'
      );
      const t3Status = await this._queryPairs(tiered.tier3, 'tier3', originCode, destCode, searchOpts, seenTrainNumbers);
      if (t3Status.anyProviderSucceeded) anyProviderSucceeded = true;
      if (t3Status.isRateLimited) isRateLimited = true;
      if (t3Status.isMonthlyQuota) isMonthlyQuota = true;
      if (t3Status.lastError) lastError = t3Status.lastError;

      const { runningCandidates: allRunningSoFar } = this._formatCandidates(
        seenTrainNumbers,
        departureDate,
        originCode,
        destCode,
        origin,
        destination
      );

      const t3New = allRunningSoFar.filter((c) => !validatedTrainNumbers.has(c.trainNumber));
      t3New.sort((a, b) => b.timetableScore - a.timetableScore);

      const remainingSlots = Math.max(0, maxDirectCandidates - validatedTrainNumbers.size);
      const t3ToValidate = t3New.slice(0, remainingSlots);
      for (const c of t3ToValidate) {
        validatedTrainNumbers.add(c.trainNumber);
      }

      const t3Enriched = await this._enrichCandidateList(
        t3ToValidate,
        [],
        searchContext,
        searchOpts,
        originCode,
        destCode,
        origin,
        destination
      );
      enrichedJourneys.push(...t3Enriched);
    }

    // Append remaining unvalidated candidates as timetable-only journeys
    const { runningCandidates: finalAllRunning } = this._formatCandidates(
      seenTrainNumbers,
      departureDate,
      originCode,
      destCode,
      origin,
      destination
    );
    const remainingUnvalidated = finalAllRunning.filter((c) => !validatedTrainNumbers.has(c.trainNumber));
    if (remainingUnvalidated.length > 0) {
      const unvalidatedJourneys = await this._enrichCandidateList(
        [],
        remainingUnvalidated,
        searchContext,
        searchOpts,
        originCode,
        destCode,
        origin,
        destination
      );
      enrichedJourneys.push(...unvalidatedJourneys);
    }

    if (!anyProviderSucceeded && seenTrainNumbers.size === 0) {
      if (isRateLimited || isMonthlyQuota) {
        return {
          status: isRateLimited ? 'RATE_LIMITED' : DIRECT_SEARCH_STATUS.DIRECT_SEARCH_FAILED,
          isRateLimited,
          isMonthlyQuota,
          statusCode: isRateLimited ? 429 : 500,
          directJourneys: [],
          failureReason: isMonthlyQuota
            ? 'Railway API monthly quota exceeded (100 requests limit). Real-time search is currently paused.'
            : 'Railway search is temporarily rate-limited. Please try again shortly.',
          shouldTriggerRecovery: false,
        };
      }
      return {
        status: DIRECT_SEARCH_STATUS.DIRECT_SEARCH_FAILED,
        isRateLimited: false,
        isMonthlyQuota: false,
        statusCode: 500,
        directJourneys: [],
        failureReason: lastError || 'Direct train search provider failed to respond.',
        shouldTriggerRecovery: false,
      };
    }

    if (seenTrainNumbers.size === 0) {
      return {
        status: DIRECT_SEARCH_STATUS.DIRECT_NOT_FOUND,
        directJourneys: [],
        failureReason: `No direct railway services connect ${origin.name || originCode} and ${destination.name || destCode}.`,
        shouldTriggerRecovery: true,
      };
    }

    if (finalAllRunning.length === 0) {
      return {
        status: DIRECT_SEARCH_STATUS.DIRECT_NOT_RUNNING,
        directJourneys: [],
        failureReason: 'Direct trains exist along this corridor but do not operate on the selected travel date.',
        shouldTriggerRecovery: true,
      };
    }

    const validEnrichedJourneys = enrichedJourneys.filter(Boolean);

    logger.info(`[DIAGNOSTIC - STAGE 4 & 5 (ENRICHMENT END)] Enriched journeys count=${validEnrichedJourneys.length}`);
    for (const j of validEnrichedJourneys) {
      logger.info(`  [ENRICHED] Train ${j.metadata?.trainNumber} (${j.metadata?.trainName}): avail=${j.availability?.normalizedStatus} (raw: "${j.availability?.rawStatus}", seats: ${j.availability?.seatsAvailable}), fare=₹${j.pricing?.totalFare} (est: ${j.pricing?.isEstimated})`);
    }

    // 4. Classify outcome based on user preferences and availability
    const allowWaitlist = preferences.allowWaitlist === true;
    const allowRac = preferences.allowRac !== false;
    const maxBudget = preferences.maxBudget ? Number(preferences.maxBudget) : null;

    // Filter budget suitability
    let suitableJourneys = validEnrichedJourneys;
    if (maxBudget && maxBudget > 0) {
      suitableJourneys = enrichedJourneys.filter((j) => Number(j.totalPrice) <= maxBudget);
      if (suitableJourneys.length === 0) {
        return {
          status: DIRECT_SEARCH_STATUS.DIRECT_UNSUITABLE,
          directJourneys: enrichedJourneys,
          failureReason: `Direct trains exist but all exceed maximum budget of ₹${maxBudget}.`,
          shouldTriggerRecovery: true,
        };
      }
    }

    // Availability classification
    const hasAvailable = suitableJourneys.some(
      (j) => j.availability?.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE
    );
    const hasRac = suitableJourneys.some(
      (j) => j.availability?.normalizedStatus === AVAILABILITY_STATUS.RAC
    );
    const hasWaitlist = suitableJourneys.some(
      (j) => j.availability?.normalizedStatus === AVAILABILITY_STATUS.WAITLISTED
    );
    const allUnavailable = suitableJourneys.every(
      (j) => j.availability?.normalizedStatus === AVAILABILITY_STATUS.NOT_AVAILABLE
    );
    const allUnknown = suitableJourneys.every(
      (j) => j.availability?.normalizedStatus === AVAILABILITY_STATUS.UNKNOWN
    );

    logger.info(`[DIAGNOSTIC - STAGE 6 (DIRECT CLASSIFICATION)] suitable=${suitableJourneys.length}, hasAvailable=${hasAvailable}, hasRac=${hasRac}, hasWaitlist=${hasWaitlist}, allUnavailable=${allUnavailable}, allUnknown=${allUnknown}`);

    if (hasAvailable) {
      // Confirmed-seat requirement (Section 5):
      // Rank confirmed trains and select ONE best direct train initially
      const confirmedDirect = suitableJourneys.filter(
        (j) => j.availability?.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE
      );

      // Rank confirmed candidates (prefer shortest duration, then lowest price)
      confirmedDirect.sort((a, b) => {
        if (a.duration !== b.duration) return a.duration - b.duration;
        return a.totalPrice - b.totalPrice;
      });

      if (confirmedDirect.length > 0) {
        confirmedDirect[0].isTopPick = true;
        confirmedDirect[0].ranking = {
          strategy: 'overall',
          label: 'Best Overall',
          rank: 1,
        };
      }

      return {
        status: DIRECT_SEARCH_STATUS.DIRECT_AVAILABLE,
        directJourneys: confirmedDirect,
        bestDirectJourney: confirmedDirect[0] || null,
        additionalDirectJourneys: confirmedDirect.slice(1),
        hasMoreDirect: confirmedDirect.length > 1,
        totalDirectConfirmedCount: confirmedDirect.length,
        failureReason: null,
        shouldTriggerRecovery: false,
      };
    }

    if (hasRac && allowRac) {
      if (suitableJourneys.length > 0 && !suitableJourneys[0].ranking) {
        suitableJourneys[0].isTopPick = true;
        suitableJourneys[0].ranking = {
          strategy: 'overall',
          label: 'Best Overall',
          rank: 1,
        };
      }
      return {
        status: DIRECT_SEARCH_STATUS.DIRECT_RAC_ONLY,
        directJourneys: options.confirmedOnly === true ? [] : suitableJourneys,
        timetableJourneys: suitableJourneys,
        bestDirectJourney: suitableJourneys[0] || null,
        additionalDirectJourneys: suitableJourneys.slice(1),
        hasMoreDirect: suitableJourneys.length > 1,
        totalDirectConfirmedCount: suitableJourneys.length,
        failureReason: null,
        shouldTriggerRecovery: preferences.requireConfirmedBerth === true,
      };
    }

    if (hasWaitlist) {
      return {
        status: DIRECT_SEARCH_STATUS.DIRECT_WAITLIST_ONLY,
        directJourneys: options.confirmedOnly === true ? [] : suitableJourneys,
        timetableJourneys: suitableJourneys,
        bestDirectJourney: suitableJourneys[0] || null,
        failureReason: 'Direct trains are waitlisted only. No confirmed seats available.',
        shouldTriggerRecovery: !allowWaitlist,
      };
    }

    if (allUnavailable) {
      return {
        status: DIRECT_SEARCH_STATUS.DIRECT_UNAVAILABLE,
        directJourneys: [],
        timetableJourneys: suitableJourneys,
        failureReason: 'Direct trains are sold out. No seats or waitlists remaining.',
        shouldTriggerRecovery: true,
      };
    }

    // When all availability checks returned UNKNOWN (e.g. provider rate-limited or disabled),
    // strictly enforce that UNKNOWN availability does NOT qualify as confirmed available seats.
    if (allUnknown) {
      suitableJourneys.sort((a, b) => a.duration - b.duration);
      if (suitableJourneys.length > 0) {
        suitableJourneys[0].isTopPick = true;
        suitableJourneys[0].ranking = {
          strategy: 'overall',
          label: 'Best Overall',
          rank: 1,
        };
      }
      const isConfirmedOnly = options.confirmedOnly === true;
      return {
        status: DIRECT_SEARCH_STATUS.DIRECT_AVAILABILITY_UNKNOWN,
        directJourneys: isConfirmedOnly ? [] : suitableJourneys,
        timetableJourneys: suitableJourneys,
        unconfirmedDirectJourneys: suitableJourneys,
        bestDirectJourney: suitableJourneys[0] || null,
        additionalDirectJourneys: suitableJourneys.slice(1),
        hasMoreDirect: suitableJourneys.length > 1,
        totalDirectConfirmedCount: 0,
        failureReason: 'Real-time seat availability could not be verified (provider rate-limited). Showing scheduled trains.',
        // Must trigger recovery when searching for confirmed seats so alternatives can be explored
        shouldTriggerRecovery: true,
      };
    }

    const confirmedDirectList = suitableJourneys.filter(
      (j) => j.availability?.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE
    );

    const isConfirmedOnly = options.confirmedOnly === true;

    return {
      status: confirmedDirectList.length > 0 ? DIRECT_SEARCH_STATUS.DIRECT_AVAILABLE : DIRECT_SEARCH_STATUS.DIRECT_UNAVAILABLE,
      directJourneys: confirmedDirectList.length > 0 ? confirmedDirectList : (isConfirmedOnly ? [] : suitableJourneys),
      timetableJourneys: suitableJourneys,
      bestDirectJourney: confirmedDirectList[0] || suitableJourneys[0] || null,
      additionalDirectJourneys: (confirmedDirectList.length > 0 ? confirmedDirectList : suitableJourneys).slice(1),
      hasMoreDirect: (confirmedDirectList.length > 0 ? confirmedDirectList : suitableJourneys).length > 1,
      totalDirectConfirmedCount: confirmedDirectList.length,
      failureReason: confirmedDirectList.length > 0 ? null : 'No confirmed direct train seats found.',
      shouldTriggerRecovery: confirmedDirectList.length === 0,
    };
  }

  /**
   * Evaluates direct candidate trains against an availability map and preferences.
   */
  evaluateDirectCandidates(directTrains = [], availabilityMap = {}, options = {}) {
    if (!Array.isArray(directTrains) || directTrains.length === 0) {
      return {
        status: DIRECT_SEARCH_STATUS.DIRECT_NOT_FOUND,
        suitableTrains: [],
        directJourneys: [],
        shouldTriggerRecovery: true,
      };
    }

    const travelClass = options.travelClass || '3A';
    const allowWaitlist = options.allowWaitlist === true;
    const allowRac = options.allowRac !== false;

    let hasAvailable = false;
    let hasRac = false;
    let hasWaitlist = false;
    const suitableTrains = [];
    const confirmedTrains = [];

    for (const train of directTrains) {
      const trainNum = String(train.trainNumber || train.number || '');
      const key = `${trainNum}-${travelClass}-GN`;
      const avail = availabilityMap[key] || train.availability || {};
      const rawStatus = avail.status || avail.normalizedStatus || 'UNKNOWN';
      const status = normalizeSeatAvailability(rawStatus).normalizedStatus;

      if (status === AVAILABILITY_STATUS.AVAILABLE) {
        hasAvailable = true;
        confirmedTrains.push(train);
        suitableTrains.push(train);
      } else if (status === AVAILABILITY_STATUS.RAC) {
        hasRac = true;
        if (allowRac) suitableTrains.push(train);
      } else if (status === AVAILABILITY_STATUS.WAITLIST) {
        hasWaitlist = true;
        if (allowWaitlist) suitableTrains.push(train);
      }
    }

    if (hasAvailable) {
      return {
        status: DIRECT_SEARCH_STATUS.DIRECT_AVAILABLE,
        suitableTrains,
        directJourneys: options.confirmedOnly === true ? confirmedTrains : suitableTrains,
        shouldTriggerRecovery: false,
      };
    }

    if (hasRac && !allowRac) {
      return {
        status: DIRECT_SEARCH_STATUS.DIRECT_RAC_ONLY,
        suitableTrains: [],
        directJourneys: [],
        shouldTriggerRecovery: true,
      };
    }

    if (hasWaitlist && !allowWaitlist) {
      return {
        status: DIRECT_SEARCH_STATUS.DIRECT_WAITLIST_ONLY,
        suitableTrains: [],
        directJourneys: [],
        shouldTriggerRecovery: true,
      };
    }

    return {
      status: DIRECT_SEARCH_STATUS.DIRECT_UNAVAILABLE,
      suitableTrains: [],
      directJourneys: [],
      shouldTriggerRecovery: true,
    };
  }

  /**
   * Checks whether the direct search outcome warrants activating the recovery engine.
   */
  shouldTriggerRecovery(evaluated) {
    if (!evaluated) return true;
    if (typeof evaluated.shouldTriggerRecovery === 'boolean') {
      return evaluated.shouldTriggerRecovery;
    }
    return evaluated.status !== DIRECT_SEARCH_STATUS.DIRECT_AVAILABLE;
  }
}

export const directJourneyService = new DirectJourneyService();
export default directJourneyService;
