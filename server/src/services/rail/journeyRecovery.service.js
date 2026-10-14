import railRadarAdapter from '../../providers/rail/railRadar.adapter.js';
import stationExpansionService from './stationExpansion.service.js';
import connectionValidator from './connectionValidator.js';
import availabilityService, { AVAILABILITY_STATUS, JOURNEY_AVAILABILITY } from './availability.service.js';
import fareService from './fare.service.js';
import distanceService from './distance.service.js';
import rankingEngine from '../../ranking/rankingEngine.js';
import RequestBudgetTracker from './requestBudget.js';
import logger from '../../utils/logger.js';
import { calculateJourneyTiming } from '../../utils/railwayTime.js';
import { resolveStationCode } from '../../providers/transport/rail/rail.provider.js';
import config from '../../config/index.js';

/**
 * Directed Railway Graph for Bounded Recovery Pathfinding
 * Represents stations as nodes and scheduled train connections as directed edges.
 */
class RailwayRecoveryGraph {
  constructor() {
    this.nodes = new Map(); // stationCode -> { code, name, city, isAlternateOrigin, isAlternateDest }
    this.adjacency = new Map(); // fromCode -> Array<Edge>
  }

  addStation(code, metadata = {}) {
    const clean = String(code).trim().toUpperCase();
    if (!clean) return;
    if (!this.nodes.has(clean)) {
      this.nodes.set(clean, { code: clean, ...metadata });
      this.adjacency.set(clean, []);
    }
  }

  addEdge(edge) {
    const from = String(edge.from).trim().toUpperCase();
    const to = String(edge.to).trim().toUpperCase();
    if (!from || !to || from === to) return;

    this.addStation(from);
    this.addStation(to);

    const edges = this.adjacency.get(from) || [];
    // Avoid duplicate edges with identical train number and departure time
    const exists = edges.some(
      (e) => e.trainNumber === edge.trainNumber && e.departureTimeStr === edge.departureTimeStr
    );
    if (!exists) {
      edges.push(edge);
      this.adjacency.set(from, edges);
    }
  }

  getOutgoingEdges(code) {
    const clean = String(code).trim().toUpperCase();
    return this.adjacency.get(clean) || [];
  }
}

/**
 * JourneyRecoveryService
 *
 * Implements Sections 4, 5, 6, 7, 8, 9, 10, 11:
 * - Bounded railway network recovery algorithm (Indian railways only)
 * - Directed graph search supporting direct alternates, 2-train (1 transfer), and 3-train (2 transfers) routes
 * - Strict per-search RequestBudgetTracker enforcement
 * - Accurate IST overnight date rollover handling
 * - Clear identification of alternate boarding/arrival vs requested stations
 * - Independent availability & fare enrichment without fabricating confirmed status
 * - Integrated ranking via RankingEngine
 */
export class JourneyRecoveryService {
  constructor(dependencies = {}) {
    this.railRadar = dependencies.railRadar || railRadarAdapter;
    this.stationExpansion = dependencies.stationExpansion || stationExpansionService;
    this.connectionValidator = dependencies.connectionValidator || connectionValidator;
    this.availabilityService = dependencies.availabilityService || availabilityService;
    this.fareService = dependencies.fareService || fareService;
    this.distanceService = dependencies.distanceService || distanceService;
    this.rankingEngine = dependencies.rankingEngine || rankingEngine;
  }

  /**
   * Executes bounded railway journey recovery algorithm.
   *
   * @param {Object} searchContext
   * @param {Object} [options={}]
   * @returns {Promise<Object>} Recovery result envelope
   */
  async recoverJourneys(searchContext, options = {}) {
    const origin = searchContext.originLocation || searchContext.origin || searchContext.originCode || searchContext.from;
    const destination = searchContext.destLocation || searchContext.destination || searchContext.destCode || searchContext.to;

    if (!origin || !destination) {
      return {
        recoveredJourneys: [],
        journeys: [],
        status: 'NO_ALTERNATIVES_FOUND',
        totalCandidatesGenerated: 0,
        feasibleCount: 0,
        reason: 'INVALID_STATION_IDENTIFIERS',
        budgetStats: (options.budgetTracker instanceof RequestBudgetTracker ? options.budgetTracker : new RequestBudgetTracker(options)).getSummary(),
      };
    }

    const originCode = resolveStationCode(origin);
    const destCode = resolveStationCode(destination);

    if (originCode === destCode) {
      return {
        recoveredJourneys: [],
        journeys: [],
        status: 'NO_ALTERNATIVES_FOUND',
        totalCandidatesGenerated: 0,
        feasibleCount: 0,
        reason: 'IDENTICAL_ORIGIN_AND_DESTINATION',
        budgetStats: (options.budgetTracker instanceof RequestBudgetTracker ? options.budgetTracker : new RequestBudgetTracker(options)).getSummary(),
      };
    }

    const originName = origin?.name || origin?.city || originCode;
    const destName = destination?.name || destination?.city || destCode;

    const departureDate = searchContext.departureDate || searchContext.travelDate || searchContext.date;
    const passengers = Math.max(1, Number(searchContext.passengers) || 1);
    const preferences = searchContext.preferences || {};
    const travelClass = preferences.class || preferences.travelClass || searchContext.travelClass || '3A';
    const quota = preferences.quota || searchContext.quota || 'GN';

    const maxAlternatives = Number(options.maxAlternatives || 5);
    const maxTransfersAllowed = Number(
      options.maxTransfers ?? preferences.maxTransfers ?? 2
    );

    // Initialize Request Budget Tracker (Section 6)
    const budgetTracker =
      options.budgetTracker instanceof RequestBudgetTracker
        ? options.budgetTracker
        : new RequestBudgetTracker({
            ...options,
            correlationId: searchContext.searchId || searchContext.correlationId,
          });

    logger.info(
      `[JourneyRecoveryService] Activating bounded railway recovery for ${originCode} -> ${destCode} (Budget: ${budgetTracker.remainingRecoveryRequests} requests)`
    );

    // Step 1: Verify railway connectivity (Section 4)
    if (
      !this.stationExpansion.hasRailwayConnectivity(originCode) ||
      !this.stationExpansion.hasRailwayConnectivity(destCode)
    ) {
      logger.info(
        `[JourneyRecoveryService] Unverified station connectivity for ${originCode} or ${destCode}. Excluding from route recovery.`
      );
      return {
        recoveredJourneys: [],
        journeys: [],
        status: 'NO_ALTERNATIVES_FOUND',
        totalCandidatesGenerated: 0,
        feasibleCount: 0,
        reason: 'UNVERIFIED_STATION_CONNECTIVITY',
        budgetStats: budgetTracker.getSummary(),
      };
    }

    // Step 2: Directional bounded station expansion around both endpoints (Section 4)
    const maxBefore = Math.min(options.maxStationsBefore ?? 5, 5);
    const maxAfter = Math.min(options.maxStationsAfter ?? 5, 5);

    const originExpansion = this.stationExpansion.expandStationDirectional(originCode, {
      maxBefore,
      maxAfter,
      targetStation: destCode,
    });
    const destExpansion = this.stationExpansion.expandStationDirectional(destCode, {
      maxBefore,
      maxAfter,
      targetStation: originCode,
    });

    const originAlternatives = originExpansion.allAlternatives || [];
    const destAlternatives = destExpansion.allAlternatives || [];

    // Step 3: Generate candidate connecting topologies
    const topologies = this.stationExpansion.generateExpansionCandidateTopologies(
      originCode,
      destCode,
      {
        ...options,
        maxTransfers: maxTransfersAllowed,
      }
    );

    if (topologies.length === 0) {
      return {
        recoveredJourneys: [],
        journeys: [],
        status: 'NO_ALTERNATIVES_FOUND',
        totalCandidatesGenerated: 0,
        feasibleCount: 0,
        reason: 'NO_EXPANSION_TOPOLOGIES',
        budgetStats: budgetTracker.getSummary(),
      };
    }

    // Step 4: Build directed railway graph with verified schedules
    const graph = new RailwayRecoveryGraph();
    graph.addStation(originCode, { isOrigin: true, isAlternate: false });
    graph.addStation(destCode, { isDest: true, isAlternate: false });

    for (const alt of originAlternatives) {
      graph.addStation(alt.code, { isOrigin: true, isAlternate: true, hops: alt.hops });
    }
    for (const alt of destAlternatives) {
      graph.addStation(alt.code, { isDest: true, isAlternate: true, hops: alt.hops });
    }

    // Gather distinct stage pairs to query while enforcing request budget and deduplication
    const stagesToQuery = [];
    const seenStages = new Set();

    for (const topo of topologies) {
      for (const stage of topo.stages) {
        const key = `${stage.from}->${stage.to}`;
        if (!seenStages.has(key)) {
          seenStages.add(key);
          stagesToQuery.push(stage);
        }
      }
    }

    // Query schedules for distinct stages bounded by recovery request budget.
    // Reserve at least 2 requests (or 20% of recovery budget) for seat availability verification.
    const maxStageRequests = Math.max(1, budgetTracker.maxRecoveryRequests - 2);

    for (const stage of stagesToQuery) {
      // Check budget before making query
      if (budgetTracker.recoveryRequestsUsed >= maxStageRequests || !budgetTracker.canMakeRecoveryRequest()) {
        logger.debug(
          `[JourneyRecoveryService] Schedule stage quota reached (${budgetTracker.recoveryRequestsUsed}/${maxStageRequests}). Reserving remaining budget for availability verification.`
        );
        break;
      }

      const queryOpts = {
        ...options,
        departureDate,
        date: departureDate,
        budgetTracker,
        isRecovery: true,
      };

      try {
        const res = await this.railRadar.searchDirectTrains(stage.from, stage.to, queryOpts);
        const trains = res?.trains || [];

        for (const t of trains.slice(0, 5)) {
          const tNum = String(t.train?.number || t.trainNumber || t.number || '');
          const tName = t.train?.name || t.trainName || t.name || 'Express';
          const tFromCode = t.from?.code || t.fromStation;
          const tToCode = t.to?.code || t.toStation;

          // If the train explicitly belongs to a different origin/destination station
          // than this corridor stage, do not bind it to stage.from/to (prevent invalid provider calls)
          if (tFromCode && tFromCode !== stage.from) {
            continue;
          }
          if (tToCode && tToCode !== stage.to) {
            continue;
          }

          const departureTimeStr = t.from?.departure || t.departureTime || '06:00';
          const arrivalTimeStr = t.to?.arrival || t.arrivalTime || '18:00';
          const distKm = Math.round(Number(t.distance) || 450);
          const duration = Math.round(Number(t.duration) || 600);

          let explicitDayOffset = 0;
          if (t.to?.day && t.from?.day && t.to.day > t.from.day) {
            explicitDayOffset = t.to.day - t.from.day;
          }

          graph.addEdge({
            from: stage.from,
            to: stage.to,
            trainNumber: tNum,
            trainName: tName,
            departureTimeStr,
            arrivalTimeStr,
            distanceKm: distKm,
            durationMinutes: duration,
            explicitDayOffset,
            fromStationName: t.from?.name || stage.from,
            toStationName: t.to?.name || stage.to,
            rawTrain: t,
          });
        }
      } catch (err) {
        logger.debug(`[JourneyRecoveryService] Schedule query failed for ${stage.from} -> ${stage.to}: ${err.message}`);
      }
    }

    // Step 5: Bounded graph search to discover valid multi-leg journey paths
    const allowedOrigins = [originCode, ...originAlternatives.map((a) => a.code)];
    const allowedDests = [destCode, ...destAlternatives.map((a) => a.code)];
    const candidateJourneys = [];

    // Helper: recursively find chronological paths through graph
    const findPathsDFS = (currentStation, currentLegs, visitedStations, targetDestSet) => {
      if (currentLegs.length > maxTransfersAllowed + 1) {
        return;
      }

      // If destination reached
      if (currentLegs.length > 0 && targetDestSet.has(currentStation)) {
        candidateJourneys.push(this.assembleCandidateFromLegs(currentLegs, origin, destination, originCode, destCode));
        if (candidateJourneys.length >= 35) return;
      }

      if (currentLegs.length >= maxTransfersAllowed + 1) {
        return;
      }

      const outgoing = graph.getOutgoingEdges(currentStation);
      for (const edge of outgoing) {
        const nextStation = edge.to;
        if (visitedStations.has(nextStation)) {
          continue; // Prevent circular routing
        }

        // Timing validation with previous leg
        let legTiming = null;
        if (currentLegs.length === 0) {
          // First leg departs on requested departure date
          legTiming = calculateJourneyTiming(
            edge.departureTimeStr,
            edge.arrivalTimeStr,
            departureDate,
            edge.explicitDayOffset,
            edge.durationMinutes
          );
        } else {
          const prevLeg = currentLegs[currentLegs.length - 1];
          const prevArrTime = prevLeg.timing.arrivalTime;
          const [dHours, dMins] = edge.departureTimeStr.split(':').map((v) => parseInt(v, 10));
          const [aHours, aMins] = prevLeg.timing.arrivalLocalTime.split(':').map((v) => parseInt(v, 10));

          let nextLegDate = prevLeg.timing.arrivalLocalDate;
          const depMinutes = (isNaN(dHours) ? 14 : dHours) * 60 + (isNaN(dMins) ? 0 : dMins);
          const arrMinutes = (isNaN(aHours) ? 12 : aHours) * 60 + (isNaN(aMins) ? 0 : aMins);

          // If departure time of day is earlier than arrival time + minimum 25 min transfer buffer,
          // then next leg departs on the next calendar day
          if (depMinutes < arrMinutes + 25) {
            const dParts = nextLegDate.split('-').map(Number);
            const nextDayEpoch = Date.UTC(dParts[0], dParts[1] - 1, dParts[2] + 1);
            const nextDay = new Date(nextDayEpoch);
            nextLegDate = `${nextDay.getUTCFullYear()}-${String(nextDay.getUTCMonth() + 1).padStart(2, '0')}-${String(nextDay.getUTCDate()).padStart(2, '0')}`;
          }

          legTiming = calculateJourneyTiming(
            edge.departureTimeStr,
            edge.arrivalTimeStr,
            nextLegDate,
            edge.explicitDayOffset,
            edge.durationMinutes
          );

          // Transfer buffer check between consecutive legs
          const bufferMinutes = Math.round((legTiming.departureTime.getTime() - prevArrTime.getTime()) / 60000);
          const isSameStation = prevLeg.edge.to === edge.from;
          const minBuffer = isSameStation ? 25 : 60;

          if (bufferMinutes < minBuffer || bufferMinutes > 12 * 60) {
            continue; // Tight connection or excessive layover (>12h)
          }

          // Same train number should not be repeated in consecutive connecting legs
          if (prevLeg.edge.trainNumber === edge.trainNumber && edge.trainNumber.length > 0) {
            continue;
          }
        }

        const newLeg = { edge, timing: legTiming };
        visitedStations.add(nextStation);
        findPathsDFS(nextStation, [...currentLegs, newLeg], visitedStations, targetDestSet);
        visitedStations.delete(nextStation);

        if (candidateJourneys.length >= 35) break;
      }
    };

    const targetDestSet = new Set(allowedDests);
    for (const startStation of allowedOrigins) {
      const visited = new Set([startStation]);
      findPathsDFS(startStation, [], visited, targetDestSet);
      if (candidateJourneys.length >= 35) break;
    }

    logger.info(`[DIAGNOSTIC - RECOVERY STAGE 1] candidateJourneys found via DFS: ${candidateJourneys.length}`);
    if (candidateJourneys.length === 0) {
      logger.info(`[DIAGNOSTIC - DROPPED TO ZERO AT RECOVERY STAGE 1] No connecting paths found in station expansion graph.`);
      return {
        recoveredJourneys: [],
        journeys: [],
        status: 'NO_ALTERNATIVES_FOUND',
        totalCandidatesGenerated: 0,
        feasibleCount: 0,
        reason: 'NO_VALID_CONNECTING_SCHEDULES',
        budgetStats: budgetTracker.getSummary(),
      };
    }

    // Step 6: Deduplicate candidates with identical train sequences
    const dedupedCandidates = this.deduplicateCandidates(candidateJourneys);
    logger.info(`[DIAGNOSTIC - RECOVERY STAGE 3 (TRANSFER MATCHING)] dedupedCandidates in=${dedupedCandidates.length}`);

    // Step 7: Connection timing and feasibility validation
    const feasibleJourneys = [];
    for (const cand of dedupedCandidates) {
      const validation = await this.connectionValidator.validateJourney(cand, preferences);
      if (validation.valid) {
        feasibleJourneys.push(cand);
      }
    }
    logger.info(`[DIAGNOSTIC - RECOVERY STAGE 3 (TRANSFER MATCHING)] feasibleJourneys out=${feasibleJourneys.length}`);

    // Step 8: Enrich availability and fares independently (bounded to top candidates within budget)
    // RAILKIT_MAX_ENRICH_CANDIDATES caps RailKit calls per search (default 5, ~10 calls per search)
    const maxToEnrich = Number(
      process.env.RAILKIT_MAX_ENRICH_CANDIDATES ||
      (options.maxCandidatesToValidate ??
       config.railRecovery?.maxCandidatesToValidate ??
       5)
    );
    const candidatesToEnrich = feasibleJourneys.slice(0, maxToEnrich);
    logger.info(`[DIAGNOSTIC - RECOVERY STAGE 4 & 5 (ENRICHMENT START)] candidatesToEnrich count=${candidatesToEnrich.length}`);
    const enrichedJourneys = [];

    for (const journey of candidatesToEnrich) {
      try {
        const enrichedLegs = [];
        for (const leg of journey.legs) {
          const fromCode = typeof leg.origin === 'string' && leg.origin.length <= 5 ? leg.origin : (leg.origin?.code || leg.metadata?.fromStationCode || leg.metadata?.fromStation);
          const toCode = typeof leg.destination === 'string' && leg.destination.length <= 5 ? leg.destination : (leg.destination?.code || leg.metadata?.toStationCode || leg.metadata?.toStation);

          const avail = await this.availabilityService.checkLegAvailability({
            trainNumber: leg.trainNumber,
            fromCode,
            toCode,
            date: leg.departureTime,
            travelClass,
            quota,
            budgetTracker,
            isRecovery: true,
          });

          const fare = await this.fareService.getLegFare({
            trainNumber: leg.trainNumber,
            fromCode,
            toCode,
            date: leg.departureTime,       // correct per-leg date (midnight-aware)
            travelClass,
            quota,
            distanceKm: leg.distance,
            passengers,
            budgetTracker,
            isRecovery: true,
            availability: avail,
          });

          leg.availability = avail;
          leg.price = fare.totalFare;
          leg.isEstimated = fare.isEstimated;
          leg.booking = {
            status: avail.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE ? 'available' : 'waitlist',
            availability: avail,
          };
          enrichedLegs.push(leg);
        }

        const journeyAvail = this.availabilityService.evaluateJourneyAvailability(
          enrichedLegs,
          preferences
        );
        const journeyFare = this.fareService.calculateJourneyTotalFare(enrichedLegs, passengers);

        journey.totalPrice = journeyFare.totalPrice;
        journey.currency = 'INR';
        journey.availability = journeyAvail;
        journey.pricing = journeyFare;
        journey.availabilityStatus = journeyAvail.journeyStatus;
        journey.isBookable = journeyAvail.isBookable;
        journey.isRecoveredAlternative = true;

        journey.metadata = {
          ...journey.metadata,
          isRecovery: true,
          isRecoveredAlternative: true,
          provider: 'Indian Railways (RailRadar Multi-Leg)',
          originExpansionHops: journey.originExpansionHops,
          destinationExpansionHops: journey.destinationExpansionHops,
          intermediateStations: journey.intermediateStations,
          trainChanges: journey.trainChanges,
          availabilityStatus: journeyAvail.journeyStatus,
          isEstimatedPrice: journeyFare.isEstimated,
          isFareConfirmed: Boolean(journeyFare.isFareAvailable && !journeyFare.isEstimated),
        };

        enrichedJourneys.push(journey);
      } catch (enrichErr) {
        logger.error(`[DIAGNOSTIC - RECOVERY ENRICHMENT ERROR] Leg enrichment failed: ${enrichErr.message}`);
      }
    }

    logger.info(`[DIAGNOSTIC - RECOVERY STAGE 4 & 5 (ENRICHMENT END)] Enriched recovery journeys count=${enrichedJourneys.length}`);
    for (const j of enrichedJourneys) {
      logger.info(`  [RECOVERY ENRICHED] ${j.legs.length}-leg journey: ${j.legs.map(l => `${l.trainNumber}:${l.availability?.normalizedStatus}`).join(' -> ')}, price=₹${j.totalPrice}`);
    }

    // Step 8.5: Enforce Confirmed-Availability Rule (Section 6)
    // A journey may appear in confirmed results only when EVERY leg has verified AVAILABLE seats.
    const confirmedJourneys = [];
    const unconfirmedCandidates = [];

    for (const journey of enrichedJourneys) {
      const allLegsAvailable =
        Array.isArray(journey.legs) &&
        journey.legs.length > 0 &&
        journey.legs.every((leg) => {
          const avail = leg.availability;
          return (
            avail &&
            avail.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE &&
            Boolean(avail.isLive !== false || avail.success)
          );
        });

      if (allLegsAvailable) {
        journey.isConfirmedAvailable = true;
        confirmedJourneys.push(journey);
      } else {
        journey.isConfirmedAvailable = false;
        unconfirmedCandidates.push(journey);
      }
    }

    const requireConfirmed = options.confirmedOnly === true;
    logger.info(`[DIAGNOSTIC - RECOVERY STAGE 6 (CONFIRMED FILTER)] requireConfirmed=${requireConfirmed}, confirmedJourneys=${confirmedJourneys.length}, unconfirmedCandidates=${unconfirmedCandidates.length}`);
    if (requireConfirmed && confirmedJourneys.length === 0) {
      logger.info(`[DIAGNOSTIC - DROPPED TO ZERO AT RECOVERY STAGE 6] All ${enrichedJourneys.length} recovered journeys dropped because not all legs have confirmed AVAILABLE seats.`);
    }
    const candidatesToRank = confirmedJourneys.length > 0
      ? confirmedJourneys
      : (requireConfirmed
          ? []
          : enrichedJourneys.filter((j) =>
              Array.isArray(j.legs) &&
              j.legs.length > 0 &&
              j.legs.every((leg) =>
                leg.availability?.normalizedStatus &&
                leg.availability.normalizedStatus !== AVAILABILITY_STATUS.UNKNOWN &&
                leg.availability.normalizedStatus !== AVAILABILITY_STATUS.UNAVAILABLE
              )
            ));

    // Step 9: Rank and categorize recovered journeys (Section 8)
    const rankedAlternatives = this.categorizeAndRank(candidatesToRank, preferences).slice(0, maxAlternatives);

    if (rankedAlternatives.length > 0) {
      rankedAlternatives[0].isTopPick = true;
      rankedAlternatives[0].isRecommendedAlternative = true;
      rankedAlternatives[0].ranking = {
        strategy: 'overall',
        label: 'Best Alternative',
        rank: 1,
      };
    }

    logger.info(
      `[JourneyRecoveryService] Recovery complete: ${rankedAlternatives.length} verified alternatives returned. Budget used: ${budgetTracker.recoveryRequestsUsed}/${budgetTracker.maxRecoveryRequests}`
    );

    return {
      recoveredJourneys: rankedAlternatives,
      journeys: rankedAlternatives,
      bestAlternative: rankedAlternatives[0] || null,
      additionalAlternatives: rankedAlternatives.slice(1),
      hasMoreAlternatives: rankedAlternatives.length > 1,
      totalAlternativesCount: rankedAlternatives.length,
      status: rankedAlternatives.length > 0 ? 'RECOVERED_ALTERNATIVES_FOUND' : 'NO_ALTERNATIVES_FOUND',
      totalCandidatesGenerated: candidateJourneys.length,
      feasibleCount: feasibleJourneys.length,
      confirmedCount: confirmedJourneys.length,
      rejectedUnconfirmedCount: unconfirmedCandidates.length,
      originExpansionHops: candidateJourneys[0]?.originExpansionHops || 0,
      destinationExpansionHops: candidateJourneys[0]?.destinationExpansionHops || 0,
      budgetStats: budgetTracker.getSummary(),
      diagnostics: {
        totalEnriched: enrichedJourneys.length,
        confirmedCount: confirmedJourneys.length,
        rejectedUnconfirmedCount: unconfirmedCandidates.length,
        unconfirmedCandidates: options.includeDiagnostics ? unconfirmedCandidates : undefined,
      },
    };
  }

  /**
   * Assembles a structured candidate journey object from sequential legs.
   */
  assembleCandidateFromLegs(legItems, origin, destination, requestedOriginCode, requestedDestCode) {
    const firstLeg = legItems[0];
    const lastLeg = legItems[legItems.length - 1];

    const actualOriginCode = firstLeg.edge.from;
    const actualDestCode = lastLeg.edge.to;
    const isAlternateOrigin = actualOriginCode !== requestedOriginCode;
    const isAlternateDest = actualDestCode !== requestedDestCode;

    const totalDistance = legItems.reduce((sum, item) => sum + item.edge.distanceKm, 0);
    const totalDuration = Math.round(
      (lastLeg.timing.arrivalTime.getTime() - firstLeg.timing.departureTime.getTime()) / 60000
    );

    const totalDayOffset = Math.max(
      0,
      Math.round(
        (new Date(lastLeg.timing.arrivalLocalDate) - new Date(firstLeg.timing.departureLocalDate)) /
          (1000 * 60 * 60 * 24)
      )
    );

    const intermediateStations = legItems.slice(0, -1).map((item) => item.edge.to);
    const numberOfTransfers = legItems.length - 1;

    // Interchange detail structures
    const interchanges = [];
    for (let i = 0; i < legItems.length - 1; i++) {
      const arrLeg = legItems[i];
      const depLeg = legItems[i + 1];
      const waitingMinutes = Math.round(
        (depLeg.timing.departureTime.getTime() - arrLeg.timing.arrivalTime.getTime()) / 60000
      );
      interchanges.push({
        station: arrLeg.edge.to,
        stationName: arrLeg.edge.toStationName,
        waitingTimeMinutes: waitingMinutes,
        arrivalTrain: arrLeg.edge.trainNumber,
        departureTrain: depLeg.edge.trainNumber,
      });
    }

    const legs = legItems.map((item, index) => ({
      sequence: index + 1,
      origin: item.edge.from,
      destination: item.edge.to,
      mode: 'rail',
      providerCode: 'IRCTC',
      departureTime: item.timing.departureTime,
      arrivalTime: item.timing.arrivalTime,
      departureTimeFormatted: item.timing.departureLocalTime,
      arrivalTimeFormatted: item.timing.arrivalLocalTime,
      departureDateFormatted: item.timing.departureLocalDate,
      arrivalDateFormatted: item.timing.arrivalLocalDate,
      dayOffset: item.timing.dayOffset,
      duration: item.timing.durationMinutes,
      distance: item.edge.distanceKm,
      trainNumber: item.edge.trainNumber,
      vehicle: { type: 'Train', identifier: item.edge.trainNumber },
      service: {
        name: item.edge.trainName,
        operator: 'Indian Railways',
        number: item.edge.trainNumber,
      },
      metadata: {
        fromStation: item.edge.from,
        toStation: item.edge.to,
        fromStationName: item.edge.fromStationName || item.edge.from,
        toStationName: item.edge.toStationName || item.edge.to,
      },
    }));

    const candidateId = `rec_${actualOriginCode}_${actualDestCode}_${legItems.map((item) => item.edge.trainNumber || `${item.edge.from}-${item.edge.to}`).join('_')}_${firstLeg.timing.departureLocalDate}`;

    return {
      id: candidateId,
      _id: candidateId,
      origin: origin?._id || origin?.id || origin,
      destination: destination?._id || destination?.id || destination,
      requestedOrigin: requestedOriginCode,
      requestedDestination: requestedDestCode,
      actualOrigin: actualOriginCode,
      actualDestination: actualDestCode,
      isAlternateBoarding: isAlternateOrigin,
      isAlternateArrival: isAlternateDest,
      departureTime: firstLeg.timing.departureTime,
      arrivalTime: lastLeg.timing.arrivalTime,
      departureTimeFormatted: firstLeg.timing.departureLocalTime,
      arrivalTimeFormatted: lastLeg.timing.arrivalLocalTime,
      departureDateFormatted: firstLeg.timing.departureLocalDate,
      arrivalDateFormatted: lastLeg.timing.arrivalLocalDate,
      dayOffset: totalDayOffset,
      duration: totalDuration,
      totalDistance,
      numberOfTransfers,
      transportModes: ['rail'],
      status: 'scheduled',
      source: 'rail_recovery',
      isRecoveryJourney: true,
      isRecoveredAlternative: true,
      originExpansionHops: isAlternateOrigin ? 1 : 0,
      destinationExpansionHops: isAlternateDest ? 1 : 0,
      intermediateStations,
      interchanges,
      trainChanges: numberOfTransfers,
      stationTransfers: 0,
      legs,
      metadata: {
        isRecovery: true,
        isRecoveredAlternative: true,
        provider: 'Indian Railways (RailRadar Multi-Leg)',
        originExpansionHops: isAlternateOrigin ? 1 : 0,
        destinationExpansionHops: isAlternateDest ? 1 : 0,
        intermediateStations,
        interchanges,
        trainChanges: numberOfTransfers,
        actualOrigin: actualOriginCode,
        actualDestination: actualDestCode,
        requestedOrigin: requestedOriginCode,
        requestedDestination: requestedDestCode,
        isAlternateBoarding: isAlternateOrigin,
        isAlternateArrival: isAlternateDest,
      },
    };
  }

  /**
   * Categorizes and ranks candidate recovery alternatives using the ranking engine.
   * Categories: BEST_OVERALL, FASTEST, CHEAPEST, FEWEST_TRANSFERS, MOST_AVAILABLE
   *
   * @param {Array<Object>} journeys
   * @param {Object} [preferences={}]
   * @returns {Array<Object>}
   */
  categorizeAndRank(journeys = [], preferences = {}) {
    if (!Array.isArray(journeys) || journeys.length === 0) return [];

    // Prioritize confirmed-available alternatives if any exist
    const bookable = journeys.filter((j) => j.availability?.isBookable);
    const pool = bookable.length > 0 ? bookable : journeys;

    // Use RankingEngine overall strategy for primary ranking
    let scored = [];
    try {
      scored = this.rankingEngine.rank(pool, 'overall', preferences);
    } catch {
      // Fallback internal sort if ranking engine encounters unrecognized preference
      scored = [...pool].sort((a, b) => a.duration - b.duration);
    }

    const bestOverall = scored[0] || null;

    // Identify legitimately verified fastest journey
    const validDurationJourneys = pool.filter(
      (j) => typeof j.duration === 'number' && j.duration > 0
    );
    const fastest =
      validDurationJourneys.length > 0
        ? [...validDurationJourneys].sort((a, b) => a.duration - b.duration)[0]
        : null;

    // Identify legitimately verified cheapest journey (NEVER claim cheapest if fare is unknown/unavailable)
    const validFareJourneys = pool.filter(
      (j) =>
        typeof j.totalPrice === 'number' &&
        j.totalPrice > 0 &&
        !j.pricing?.containsUnavailableFare
    );
    const cheapest =
      validFareJourneys.length > 0
        ? [...validFareJourneys].sort((a, b) => a.totalPrice - b.totalPrice)[0]
        : null;

    // Identify most available journey
    const availablePool = pool.filter(
      (j) => j.availability?.journeyStatus === JOURNEY_AVAILABILITY.AVAILABILITY_VERIFIED
    );
    const mostAvailable = availablePool.length > 0 ? availablePool[0] : null;

    // Fewest transfers journey
    const fewestTransfers = [...pool].sort((a, b) => a.numberOfTransfers - b.numberOfTransfers)[0] || null;

    const result = [];

    const getJourneyKey = (j) => {
      if (!j) return '';
      if (j.id) return String(j.id);
      if (j._id) return String(j._id);
      const legSig = Array.isArray(j.legs)
        ? j.legs.map((l) => `${l.trainNumber || ''}:${l.origin || ''}-${l.destination || ''}`).join('|')
        : '';
      return `${j.actualOrigin || j.origin || ''}->${j.actualDestination || j.destination || ''}:${legSig}`;
    };

    const addWithCategory = (j, strategy, category, label) => {
      if (!j) return;
      const clone = {
        ...j,
        ranking: {
          strategy,
          label,
          category,
        },
      };
      result.push(clone);
    };

    if (bestOverall) {
      addWithCategory(bestOverall, 'overall', 'BEST_OVERALL', 'Best Overall');
    }
    if (fastest) {
      addWithCategory(fastest, 'fastest', 'FASTEST', 'Fastest');
    }
    if (cheapest) {
      addWithCategory(cheapest, 'cheapest', 'CHEAPEST', 'Cheapest');
    }
    if (mostAvailable && mostAvailable !== bestOverall && mostAvailable !== fastest && mostAvailable !== cheapest) {
      addWithCategory(mostAvailable, 'most_available', 'MOST_AVAILABLE', 'Most Available');
    }

    // Add remaining scored journeys up to limit (distinct journeys only)
    for (const item of scored) {
      if (result.length >= 5) break;
      const itemJourney = item.journey || item;
      const key = getJourneyKey(itemJourney);
      const alreadyInResult = result.some((r) => getJourneyKey(r) === key);
      if (!alreadyInResult) {
        addWithCategory(itemJourney, 'alternative', 'FEASIBLE_ALTERNATIVE', 'Feasible Alternative');
      }
    }

    for (const item of pool) {
      if (result.length >= 5) break;
      const key = getJourneyKey(item);
      const alreadyInResult = result.some((r) => getJourneyKey(r) === key);
      if (!alreadyInResult) {
        addWithCategory(item, 'alternative', 'FEASIBLE_ALTERNATIVE', 'Feasible Alternative');
      }
    }

    return result;
  }

  /**
   * Deduplicates candidate itineraries with identical train sequences.
   */
  deduplicateCandidates(candidates = []) {
    const seen = new Set();
    return candidates.filter((c) => {
      const key = (c.legs || []).map((l) => l.trainNumber || l.vehicle?.identifier).join(':');
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Public ranking method alias.
   */
  rankAlternatives(journeys = [], preferences = {}) {
    return this.categorizeAndRank(journeys, preferences);
  }
}

export const journeyRecoveryService = new JourneyRecoveryService();
export default journeyRecoveryService;
