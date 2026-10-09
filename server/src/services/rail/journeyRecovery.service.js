import railRadarAdapter from '../../providers/rail/railRadar.adapter.js';
import stationExpansionService from './stationExpansion.service.js';
import connectionValidator from './connectionValidator.js';
import availabilityService, { AVAILABILITY_STATUS, JOURNEY_AVAILABILITY } from './availability.service.js';
import fareService from './fare.service.js';
import distanceService from './distance.service.js';
import logger from '../../utils/logger.js';
import { calculateJourneyTiming } from '../../utils/railwayTime.js';

/**
 * JourneyRecoveryService
 *
 * Implements Section 6:
 * - Bounded candidate pipeline for railway recovery
 * - Real provider train schedule queries for connecting legs
 * - Chronological transfer pairing and validation
 * - Independent availability and fare enrichment
 * - Categorized ranking: BEST_OVERALL, FASTEST, CHEAPEST, FEWEST_TRANSFERS, MOST_AVAILABLE
 */
export class JourneyRecoveryService {
  constructor(dependencies = {}) {
    this.railRadar = dependencies.railRadar || railRadarAdapter;
    this.stationExpansion = dependencies.stationExpansion || stationExpansionService;
    this.connectionValidator = dependencies.connectionValidator || connectionValidator;
    this.availabilityService = dependencies.availabilityService || availabilityService;
    this.fareService = dependencies.fareService || fareService;
    this.distanceService = dependencies.distanceService || distanceService;
  }

  /**
   * Executes recovery engine to find feasible connecting railway alternatives.
   *
   * @param {Object} searchContext
   * @param {Object} [options={}]
   * @returns {Promise<Object>} { recoveredJourneys, totalCandidatesGenerated, feasibleCount }
   */
  async recoverJourneys(searchContext, options = {}) {
    const origin = searchContext.originLocation || searchContext.origin;
    const destination = searchContext.destLocation || searchContext.destination;
    const originName = origin?.name || origin?.city || String(origin || '');
    const destName = destination?.name || destination?.city || String(destination || '');
    const departureDate = searchContext.departureDate;
    const passengers = Math.max(1, Number(searchContext.passengers) || 1);
    const preferences = searchContext.preferences || {};
    const travelClass = preferences.class || preferences.travelClass || '3A';
    const quota = preferences.quota || 'GN';

    const maxAlternatives = options.maxAlternatives || 5;

    logger.info(
      `[JourneyRecoveryService] Activating railway recovery for ${originName} -> ${destName}`
    );

    // Step 1: Generate candidate route topologies using station expansion
    const topologies = this.stationExpansion.generateExpansionCandidateTopologies(
      origin,
      destination,
      options
    );

    if (topologies.length === 0) {
      return {
        recoveredJourneys: [],
        journeys: [],
        status: 'NO_ALTERNATIVES_FOUND',
        totalCandidatesGenerated: 0,
        feasibleCount: 0,
        reason: 'NO_EXPANSION_TOPOLOGIES',
      };
    }

    const candidateJourneys = [];
    const dateObj = departureDate instanceof Date ? departureDate : new Date(departureDate);

    // Step 2-4: For each topology, query real train schedules and pair connections
    for (const topo of topologies) {
      const { stages, originExpansionHops, destinationExpansionHops, trainChanges } = topo;
      const leg1Stage = stages[0];
      const leg2Stage = stages[1];

      try {
        // Query schedules for Leg 1 and Leg 2 concurrently
        const [leg1Res, leg2Res] = await Promise.all([
          this.railRadar.searchDirectTrains(leg1Stage.from, leg1Stage.to, options),
          this.railRadar.searchDirectTrains(leg2Stage.from, leg2Stage.to, options),
        ]);

        const leg1Trains = leg1Res.trains || [];
        const leg2Trains = leg2Res.trains || [];

        if (leg1Trains.length === 0 || leg2Trains.length === 0) {
          continue;
        }

        // Pair compatible connections
        // Pair compatible connections
        for (const t1 of leg1Trains.slice(0, 4)) {
          const t1Num = String(t1.train?.number || t1.trainNumber || t1.number || '');
          const t1Name = t1.train?.name || t1.trainName || t1.name || 'Express Train 1';

          const depStr1 = t1.from?.departure || t1.departureTime || '06:00';
          const arrStr1 = t1.to?.arrival || t1.arrivalTime || '12:00';

          let explicitOffset1 = null;
          if (t1.to?.day && t1.from?.day && t1.to.day > t1.from.day) {
            explicitOffset1 = t1.to.day - t1.from.day;
          }

          const timing1 = calculateJourneyTiming(
            depStr1,
            arrStr1,
            departureDate,
            explicitOffset1,
            t1.duration
          );

          for (const t2 of leg2Trains.slice(0, 4)) {
            const t2Num = String(t2.train?.number || t2.trainNumber || t2.number || '');
            const t2Name = t2.train?.name || t2.trainName || t2.name || 'Express Train 2';

            const depStr2 = t2.from?.departure || t2.departureTime || '14:00';
            const arrStr2 = t2.to?.arrival || t2.arrivalTime || '22:00';

            // Leg 2 departs on or after Leg 1 arrival date in IST
            const [d2H, d2M] = depStr2.split(':').map((n) => parseInt(n, 10));
            const [a1H, a1M] = timing1.arrivalLocalTime.split(':').map((n) => parseInt(n, 10));

            let leg2Date = timing1.arrivalLocalDate;
            const dep2MinOfDay = (isNaN(d2H) ? 14 : d2H) * 60 + (isNaN(d2M) ? 0 : d2M);
            const arr1MinOfDay = (isNaN(a1H) ? 12 : a1H) * 60 + (isNaN(a1M) ? 0 : a1M);

            // If Leg 2 departure time in minutes from midnight is earlier than Leg 1 arrival time + 25 mins buffer,
            // then Leg 2 departs the next calendar day
            if (dep2MinOfDay < arr1MinOfDay + 25) {
              const dParts = leg2Date.split('-').map(Number);
              const nextDayEpoch = Date.UTC(dParts[0], dParts[1] - 1, dParts[2] + 1);
              const nextDay = new Date(nextDayEpoch);
              leg2Date = `${nextDay.getUTCFullYear()}-${String(nextDay.getUTCMonth() + 1).padStart(2, '0')}-${String(nextDay.getUTCDate()).padStart(2, '0')}`;
            }

            let explicitOffset2 = null;
            if (t2.to?.day && t2.from?.day && t2.to.day > t2.from.day) {
              explicitOffset2 = t2.to.day - t2.from.day;
            }

            const timing2 = calculateJourneyTiming(
              depStr2,
              arrStr2,
              leg2Date,
              explicitOffset2,
              t2.duration
            );

            const bufferMinutes = Math.round((timing2.departureTime.getTime() - timing1.arrivalTime.getTime()) / 60000);

            // Transfer buffer sanity: must be between 25 minutes and 8 hours (480 mins)
            if (bufferMinutes < 25 || bufferMinutes > 8 * 60) {
              continue;
            }

            const dist1 = Math.round(Number(t1.distance) || 450);
            const dist2 = Math.round(Number(t2.distance) || 550);
            const totalDist = dist1 + dist2;
            const totalDuration = Math.round((timing2.arrivalTime.getTime() - timing1.departureTime.getTime()) / 60000);

            const intermediateStation = t1.to?.name || leg1Stage.to;
            const totalDayOffset = Math.max(
              0,
              Math.round(
                (new Date(timing2.arrivalLocalDate) - new Date(timing1.departureLocalDate)) /
                  (1000 * 60 * 60 * 24)
              )
            );

            candidateJourneys.push({
              origin: origin._id || origin.id || origin,
              destination: destination._id || destination.id || destination,
              departureTime: timing1.departureTime,
              arrivalTime: timing2.arrivalTime,
              departureTimeFormatted: timing1.departureLocalTime,
              arrivalTimeFormatted: timing2.arrivalLocalTime,
              departureDateFormatted: timing1.departureLocalDate,
              arrivalDateFormatted: timing2.arrivalLocalDate,
              dayOffset: totalDayOffset,
              duration: totalDuration,
              totalDistance: totalDist,
              numberOfTransfers: 1,
              transportModes: ['rail'],
              status: 'scheduled',
              source: 'rail_recovery',
              isRecoveryJourney: true,
              originExpansionHops,
              destinationExpansionHops,
              intermediateStations: [intermediateStation],
              trainChanges,
              stationTransfers: 0,
              legs: [
                {
                  sequence: 1,
                  origin: origin._id || origin.id || origin,
                  destination: intermediateStation,
                  mode: 'rail',
                  providerCode: 'IRCTC',
                  departureTime: timing1.departureTime,
                  arrivalTime: timing1.arrivalTime,
                  departureTimeFormatted: timing1.departureLocalTime,
                  arrivalTimeFormatted: timing1.arrivalLocalTime,
                  departureDateFormatted: timing1.departureLocalDate,
                  arrivalDateFormatted: timing1.arrivalLocalDate,
                  dayOffset: timing1.dayOffset,
                  duration: timing1.durationMinutes,
                  distance: dist1,
                  trainNumber: t1Num,
                  vehicle: { type: 'Train', identifier: t1Num },
                  service: { name: t1Name, operator: 'Indian Railways', class: travelClass, number: t1Num },
                  metadata: { fromStation: t1.from?.name || leg1Stage.from, toStation: intermediateStation },
                },
                {
                  sequence: 2,
                  origin: intermediateStation,
                  destination: destination._id || destination.id || destination,
                  mode: 'rail',
                  providerCode: 'IRCTC',
                  departureTime: timing2.departureTime,
                  arrivalTime: timing2.arrivalTime,
                  departureTimeFormatted: timing2.departureLocalTime,
                  arrivalTimeFormatted: timing2.arrivalLocalTime,
                  departureDateFormatted: timing2.departureLocalDate,
                  arrivalDateFormatted: timing2.arrivalLocalDate,
                  dayOffset: timing2.dayOffset,
                  duration: timing2.durationMinutes,
                  distance: dist2,
                  trainNumber: t2Num,
                  vehicle: { type: 'Train', identifier: t2Num },
                  service: { name: t2Name, operator: 'Indian Railways', class: travelClass, number: t2Num },
                  metadata: { fromStation: intermediateStation, toStation: t2.to?.name || leg2Stage.to },
                },
              ],
            });

            // Cap raw candidates per topology to avoid combinatoric explosion
            if (candidateJourneys.length >= 25) break;
          }
          if (candidateJourneys.length >= 25) break;
        }
      } catch (err) {
        logger.debug(`[JourneyRecoveryService] Topology pairing failed: ${err.message}`);
      }
      if (candidateJourneys.length >= 25) break;
    }

    if (candidateJourneys.length === 0) {
      return {
        recoveredJourneys: [],
        journeys: [],
        status: 'NO_ALTERNATIVES_FOUND',
        totalCandidatesGenerated: 0,
        feasibleCount: 0,
        reason: 'NO_VALID_CONNECTING_SCHEDULES',
      };
    }

    // Step 5-6: Validate connection timing and feasibility
    const feasibleJourneys = [];
    for (const cand of candidateJourneys) {
      const validation = await this.connectionValidator.validateJourney(cand, preferences);
      if (validation.valid) {
        feasibleJourneys.push(cand);
      }
    }

    // Step 7-8: Enrich availability and fares independently for top candidates (bounded to 8)
    const enrichedJourneys = [];
    const candidatesToEnrich = feasibleJourneys.slice(0, 8);

    for (const journey of candidatesToEnrich) {
      try {
        const leg1 = journey.legs[0];
        const leg2 = journey.legs[1];

        const [avail1, fare1, avail2, fare2] = await Promise.all([
          this.availabilityService.checkLegAvailability({
            trainNumber: leg1.trainNumber,
            fromCode: leg1.metadata?.fromStation,
            toCode: leg1.metadata?.toStation,
            date: leg1.departureTime,
            travelClass,
            quota,
          }),
          this.fareService.getLegFare({
            trainNumber: leg1.trainNumber,
            fromCode: leg1.metadata?.fromStation,
            toCode: leg1.metadata?.toStation,
            travelClass,
            distanceKm: leg1.distance,
            passengers,
          }),
          this.availabilityService.checkLegAvailability({
            trainNumber: leg2.trainNumber,
            fromCode: leg2.metadata?.fromStation,
            toCode: leg2.metadata?.toStation,
            date: leg2.departureTime,
            travelClass,
            quota,
          }),
          this.fareService.getLegFare({
            trainNumber: leg2.trainNumber,
            fromCode: leg2.metadata?.fromStation,
            toCode: leg2.metadata?.toStation,
            travelClass,
            distanceKm: leg2.distance,
            passengers,
          }),
        ]);

        leg1.availability = avail1;
        leg1.price = fare1.totalFare;
        leg1.isEstimated = fare1.isEstimated;
        leg1.booking = {
          status: avail1.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE ? 'available' : 'waitlist',
          availability: avail1,
        };

        leg2.availability = avail2;
        leg2.price = fare2.totalFare;
        leg2.isEstimated = fare2.isEstimated;
        leg2.booking = {
          status: avail2.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE ? 'available' : 'waitlist',
          availability: avail2,
        };

        const journeyAvail = this.availabilityService.evaluateJourneyAvailability(
          [leg1, leg2],
          preferences
        );
        const journeyFare = this.fareService.calculateJourneyTotalFare([leg1, leg2], passengers);

        journey.totalPrice = journeyFare.totalPrice;
        journey.currency = 'INR';
        journey.availability = journeyAvail;
        journey.pricing = journeyFare;
        journey.availabilityStatus = journeyAvail.journeyStatus;
        journey.isBookable = journeyAvail.isBookable;
        journey.isRecoveredAlternative = true;

        journey.metadata = {
          isRecovery: true,
          isRecoveredAlternative: true,
          provider: 'Indian Railways (RailRadar Multi-Leg)',
          originExpansionHops: journey.originExpansionHops,
          destinationExpansionHops: journey.destinationExpansionHops,
          intermediateStations: journey.intermediateStations,
          trainChanges: journey.trainChanges,
          availabilityStatus: journeyAvail.journeyStatus,
          isEstimatedPrice: journeyFare.isEstimated,
        };

        enrichedJourneys.push(journey);
      } catch (enrichErr) {
        logger.debug(`[JourneyRecoveryService] Leg enrichment failed: ${enrichErr.message}`);
      }
    }

    // Step 9-10: Rank and categorize recovered journeys (Section 6: display 1 recommended option initially, up to 5 total)
    const rankedAlternatives = this.categorizeAndRank(enrichedJourneys, preferences).slice(0, maxAlternatives);

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
      `[JourneyRecoveryService] Recovery complete: ${rankedAlternatives.length} verified alternatives returned`
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
      originExpansionHops: candidateJourneys[0]?.originExpansionHops || 0,
      destinationExpansionHops: candidateJourneys[0]?.destinationExpansionHops || 0,
    };
  }

  /**
   * Assigns category labels and ranks recovery alternatives.
   * Categories: BEST_OVERALL, FASTEST, CHEAPEST, FEWEST_TRANSFERS, MOST_AVAILABLE
   */
  categorizeAndRank(journeys = [], preferences = {}) {
    if (journeys.length === 0) return [];

    // Filter out completely non-bookable routes if bookable alternatives exist
    const bookable = journeys.filter((j) => j.availability?.isBookable);
    const pool = bookable.length > 0 ? bookable : journeys;

    // Sort copies for different categories
    const byDuration = [...pool].sort((a, b) => a.duration - b.duration);
    const byFare = [...pool].sort((a, b) => a.totalPrice - b.totalPrice);
    const byAvailability = [...pool].sort((a, b) => {
      const aAv = a.availability?.journeyStatus === JOURNEY_AVAILABILITY.AVAILABILITY_VERIFIED ? 1 : 0;
      const bAv = b.availability?.journeyStatus === JOURNEY_AVAILABILITY.AVAILABILITY_VERIFIED ? 1 : 0;
      return bAv - aAv || a.duration - b.duration;
    });

    const fastest = byDuration[0];
    const cheapest = byFare[0];
    const mostAvailable = byAvailability[0];

    // Multi-factor balanced scoring for BEST_OVERALL
    const minDur = byDuration[0]?.duration || 1;
    const maxDur = byDuration[byDuration.length - 1]?.duration || 1;
    const minPrice = byFare[0]?.totalPrice || 1;
    const maxPrice = byFare[byFare.length - 1]?.totalPrice || 1;

    const scored = pool.map((j) => {
      const durNorm = maxDur === minDur ? 1 : (j.duration - minDur) / (maxDur - minDur);
      const priceNorm = maxPrice === minPrice ? 1 : (j.totalPrice - minPrice) / (maxPrice - minPrice);
      const availBonus = j.availability?.journeyStatus === JOURNEY_AVAILABILITY.AVAILABILITY_VERIFIED ? 0.3 : 0;

      // Lower score is better
      const compositeScore = durNorm * 0.45 + priceNorm * 0.35 + (j.numberOfTransfers * 0.2) - availBonus;
      return { journey: j, score: compositeScore };
    });

    scored.sort((a, b) => a.score - b.score);
    const bestOverall = scored[0]?.journey;

    // Apply ranking strategy badges
    const result = [];
    const seen = new Set();

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

    addWithCategory(bestOverall, 'overall', 'BEST_OVERALL', 'Best Overall');
    if (fastest && fastest !== bestOverall) {
      addWithCategory(fastest, 'fastest', 'FASTEST', 'Fastest');
    } else if (fastest) {
      addWithCategory(fastest, 'fastest', 'FASTEST', 'Fastest');
    }
    if (cheapest && cheapest !== bestOverall && cheapest !== fastest) {
      addWithCategory(cheapest, 'cheapest', 'CHEAPEST', 'Cheapest');
    } else if (cheapest) {
      addWithCategory(cheapest, 'cheapest', 'CHEAPEST', 'Cheapest');
    }
    if (mostAvailable && mostAvailable !== bestOverall) {
      addWithCategory(mostAvailable, 'most_available', 'MOST_AVAILABLE', 'Most Available');
    }

    // Add remaining up to limit
    for (const item of scored) {
      if (result.length >= 5) break;
      addWithCategory(item.journey, 'alternative', 'Feasible Alternative');
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
