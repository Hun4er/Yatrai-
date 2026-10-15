import railRadarAdapter from '../../providers/rail/railRadar.adapter.js';
import { resolveStationCode, getClusterStationCodes } from '../../providers/transport/rail/rail.provider.js';
import availabilityService, { AVAILABILITY_STATUS, JOURNEY_AVAILABILITY, normalizeSeatAvailability } from './availability.service.js';
import fareService from './fare.service.js';
import logger from '../../utils/logger.js';
import { calculateJourneyTiming } from '../../utils/railwayTime.js';
import { findVerifiedDirectTrains } from './verifiedTrainData.js';

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
 * - Direct train search via RailRadar (sole external provider)
 * - Cluster/metro station group resolution
 * - Accurate Indian railway timetable and IST timing calculation
 * - Confirmed-seat availability validation
 * - Strictly 1 best confirmed direct train initial recommendation
 * - Excludes waitlist/RAC from confirmed initial recommendation
 * - Determines whether recovery engine should be activated
 */
export class DirectJourneyService {
  constructor(dependencies = {}) {
    this.railRadar = dependencies.railRadar || railRadarAdapter;
    this.availabilityService = dependencies.availabilityService || availabilityService;
    this.fareService = dependencies.fareService || fareService;
  }

  /**
   * Searches for direct trains matching the user request and evaluates availability.
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

    // 1. Query direct trains between primary stations via RailRadar
    const searchOpts = { ...options, departureDate, date: departureDate, isRecovery: false };
    let searchResult = await this.railRadar.searchDirectTrains(originCode, destCode, searchOpts);

    logger.info(`[DIAGNOSTIC - STAGE 1 (TIMETABLE FETCH)] Direct search for ${originCode} -> ${destCode} on ${departureDate}: success=${searchResult.success}, trainsCount=${searchResult.trains?.length || 0}, error=${searchResult.error || 'none'}`);

    // Handle provider complete failure (e.g. timeout, 429 quota exceeded, disabled, connection error)
    if (!searchResult.success) {
      const isDisabled = searchResult.reason === 'PROVIDER_DISABLED';
      const isRateLimited =
        !isDisabled &&
        (searchResult.statusCode === 429 ||
          /rate limit|quota exceeded|429/i.test(String(searchResult.error)));
      const isMonthlyQuota = Boolean(
        searchResult.isMonthlyQuota ||
        /monthly quota/i.test(String(searchResult.error))
      );

      // When provider fails (timeout, 5xx, rate-limited, network failure), do NOT silently mask error with static schedules
      // unless explicitly opted in via options.allowTimetableFallback === true
      if (options.allowTimetableFallback === true) {
        const fromClusters = getClusterStationCodes(origin, originCode);
        const toClusters = getClusterStationCodes(destination, destCode);
        const verifiedFallback = [];
        for (const f of fromClusters.slice(0, 3)) {
          for (const t of toClusters.slice(0, 3)) {
            const v = findVerifiedDirectTrains(f, t, departureDate);
            if (v.length > 0) verifiedFallback.push(...v);
          }
        }
        if (verifiedFallback.length > 0) {
          searchResult = { success: true, trains: verifiedFallback, source: 'verified_schedule', isTimetableFallback: true };
        }
      }

      if (!searchResult.success) {
        return {
          status: isRateLimited ? 'RATE_LIMITED' : DIRECT_SEARCH_STATUS.DIRECT_SEARCH_FAILED,
          isRateLimited,
          isMonthlyQuota,
          statusCode: searchResult.statusCode || (isRateLimited ? 429 : 500),
          directJourneys: [],
          failureReason: isMonthlyQuota
            ? 'Railway API monthly quota exceeded (100 requests limit). Real-time search is currently paused.'
            : (isRateLimited
                ? 'Railway search is temporarily rate-limited. Please try again shortly.'
                : isDisabled
                  ? 'Railway provider is currently disabled. Please configure a valid API key.'
                  : (searchResult.error || 'Direct train search provider failed to respond or quota exhausted.')),
          shouldTriggerRecovery: false, // Provider failure must not be treated as proof no direct train exists
        };
      }
    }

    // If primary stations returned 0, try cluster station pairs (e.g. NDLS/DLI/NZM to PNBE/DNR/PPTA)
    let trainItems = searchResult.trains || [];
    if (trainItems.length === 0) {
      const fromClusters = getClusterStationCodes(origin, originCode);
      const toClusters = getClusterStationCodes(destination, destCode);

      if (fromClusters.length > 1 || toClusters.length > 1) {
        // 1. Check verified schedules first across cluster pairs (0 external API cost)
        for (const f of fromClusters.slice(0, 3)) {
          for (const t of toClusters.slice(0, 3)) {
            const verified = findVerifiedDirectTrains(f, t, departureDate);
            if (verified.length > 0) {
              trainItems.push(...verified);
            }
          }
        }

        // 2. If still 0 and searchResult was success, query at most 1 primary cluster pair
        if (trainItems.length === 0 && searchResult.success) {
          const clusterPairs = [];
          for (const f of fromClusters.slice(0, 2)) {
            for (const t of toClusters.slice(0, 2)) {
              if (f === originCode && t === destCode) continue;
              clusterPairs.push({ f, t });
            }
          }
          for (const { f, t } of clusterPairs.slice(0, 1)) {
            const clusterRes = await this.railRadar.searchDirectTrains(f, t, searchOpts);
            if (clusterRes.trains && clusterRes.trains.length > 0) {
              trainItems.push(...clusterRes.trains);
              break;
            }
          }
        }
      }
    }

    // Handle no direct trains found
    if (trainItems.length === 0) {
      return {
        status: DIRECT_SEARCH_STATUS.DIRECT_NOT_FOUND,
        directJourneys: [],
        failureReason: `No direct railway services connect ${origin.name || originCode} and ${destination.name || destCode}.`,
        shouldTriggerRecovery: true,
      };
    }

    // 2. Format candidate trains and check running day and suitability
    const formattedCandidates = [];
    const dateObj = departureDate instanceof Date ? departureDate : new Date(departureDate);
    const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dateObj.getUTCDay()];

    for (const item of trainItems) {
      const trainNum = String(item.train?.number || item.trainNumber || item.number || '');
      const trainName = item.train?.name || item.trainName || item.name || 'Express';
      const runDays = item.train?.runDays || item.runDays || [];

      // Check running day
      const isRunningOnDate = runDays.length === 0 || runDays.map((d) => d.toLowerCase()).includes(dayOfWeek);

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

      formattedCandidates.push({
        trainNumber: trainNum,
        trainName,
        fromCode: item.from?.code || originCode,
        toCode: item.to?.code || destCode,
        fromStationName: item.from?.name || origin.name || originCode,
        toStationName: item.to?.name || destination.name || destCode,
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
        raw: item,
      });
    }

    // Filter trains running on the travel date
    logger.info(`[DIAGNOSTIC - STAGE 2 (DATE/RUNNING-DAY FILTER)] Formatted candidate trains in=${formattedCandidates.length}, target dayOfWeek=${dayOfWeek}`);
    for (const c of formattedCandidates) {
      logger.info(`  [CANDIDATE] Train ${c.trainNumber} (${c.trainName}): runDays=[${c.raw.train?.runDays || c.raw.runDays || ''}], isRunningOnDate=${c.isRunningOnDate}`);
    }
    const runningCandidates = formattedCandidates.filter((c) => c.isRunningOnDate);
    logger.info(`[DIAGNOSTIC - STAGE 2 (DATE/RUNNING-DAY FILTER)] Output running trains count=${runningCandidates.length}`);
    if (runningCandidates.length === 0) {
      logger.info(`[DIAGNOSTIC - DROPPED TO ZERO AT STAGE 2] All ${formattedCandidates.length} trains dropped because none operate on ${dayOfWeek} (${departureDate})`);
      return {
        status: DIRECT_SEARCH_STATUS.DIRECT_NOT_RUNNING,
        directJourneys: [],
        failureReason: 'Direct trains exist along this corridor but do not operate on the selected travel date.',
        shouldTriggerRecovery: true,
      };
    }

    // 3. Concurrently validate availability and fares for running candidates (pre-ranked by duration, bounded to top 5)
    const sortedCandidates = [...runningCandidates].sort((a, b) => (a.duration || 9999) - (b.duration || 9999));
    const maxDirectCandidates = Math.min(5, sortedCandidates.length);
    const candidatesToValidate = sortedCandidates.slice(0, maxDirectCandidates);
    logger.info(`[DIAGNOSTIC - STAGE 4 & 5 (ENRICHMENT START)] Validating availability & fare for top ${candidatesToValidate.length} pre-ranked direct candidates`);
    const enrichedJourneys = await Promise.all(
      candidatesToValidate.map(async (cand) => {
        if (options.budgetTracker && !options.budgetTracker.canMakeDirectRequest()) {
          logger.info(`[DirectJourneyService] Direct budget limit reached. Skipping enrichment for train ${cand.trainNumber}.`);
          return null;
        }

        const avail = await this.availabilityService.checkLegAvailability({
          trainNumber: cand.trainNumber,
          fromCode: cand.fromCode,
          toCode: cand.toCode,
          date: cand.departureTime,
          travelClass,
          quota,
          budgetTracker: options.budgetTracker,
          isRecovery: false,
        });

        const fare = await this.fareService.getLegFare({
          trainNumber: cand.trainNumber,
          fromCode: cand.fromCode,
          toCode: cand.toCode,
          date: cand.departureTime,
          travelClass,
          quota,
          distanceKm: cand.distance,
          passengers,
          budgetTracker: options.budgetTracker,
          isRecovery: false,
          availability: avail,
          isSearchEnrichment: true,
        });

        return {
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
          availability: avail,
          availabilityStatus:
            avail.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE
              ? 'AVAILABILITY_VERIFIED'
              : (avail.normalizedStatus === AVAILABILITY_STATUS.RAC ? 'RAC_AVAILABLE' : 'WAITLIST_ONLY'),
          isBookable: avail.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE || avail.normalizedStatus === AVAILABILITY_STATUS.RAC,
          pricing: fare,
          metadata: {
            isDirect: true,
            provider: 'Indian Railways (RailRadar)',
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
        };
      })
    );

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
