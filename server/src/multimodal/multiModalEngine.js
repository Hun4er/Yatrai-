import { JourneyGraph } from './graph/journeyGraph.js';
import { pathFinder } from './multimodal/pathFinder.js';
import { journeyBuilder } from './multimodal/journeyBuilder.js';
import { corridorExplorer } from './multimodal/corridorExplorer.js';
import { journeyValidator } from './validation/journeyValidator.js';
import { MULTIMODAL_CONFIG } from './config.js';
import logger from '../utils/logger.js';

/**
 * MultiModalEngine
 * Coordinates graph construction, intermediate corridor exploration, temporal path discovery,
 * and canonical journey assembly.
 */
export class MultiModalEngine {
  constructor(dependencies = {}) {
    this.pathFinder = dependencies.pathFinder || pathFinder;
    this.journeyBuilder = dependencies.journeyBuilder || journeyBuilder;
    this.corridorExplorer = dependencies.corridorExplorer || corridorExplorer;
    this.journeyValidator = dependencies.journeyValidator || journeyValidator;
  }

  /**
   * Discovers direct and multi-modal journeys between origin and destination.
   *
   * @param {Object} searchContext - Canonical search context
   * @param {Array<Object>} directCandidates - Normalized candidates directly returned by providers
   * @param {Object} [options]
   * @returns {Promise<Array<Object>>} All valid canonical candidate journeys (direct + multi-modal)
   */
  async discoverJourneys(searchContext, directCandidates = [], options = {}) {
    const origin = searchContext.originLocation || searchContext.origin;
    const destination = searchContext.destLocation || searchContext.destination;

    if (!origin || !destination) {
      return directCandidates;
    }

    const graph = new JourneyGraph();

    // 1. Add origin and destination nodes
    const originNode = graph.addNode(origin);
    const destNode = graph.addNode(destination);

    // 2. Populate graph with direct candidates
    graph.populateFromCandidates(directCandidates);

    // 3. Dynamic Corridor Exploration (real provider intermediate hubs and feeder links)
    const shouldExploreCorridors =
      options.exploreCorridors !== false &&
      (options.includeMultiModal === true ||
        (!searchContext.requestedModes?.length || searchContext.requestedModes.includes('multimodal')));

    if (shouldExploreCorridors) {
      try {
        const intermediateCandidates = await this.corridorExplorer.exploreIntermediateCorridors({
          origin,
          destination,
          departureDate: searchContext.departureDate,
          passengers: searchContext.passengers,
        });

        if (intermediateCandidates.length > 0) {
          logger.debug(
            `[MultiModalEngine] Ingesting ${intermediateCandidates.length} real intermediate/feeder legs into graph`
          );
          graph.populateFromCandidates(intermediateCandidates);
        }
      } catch (exploreErr) {
        logger.warn(`[MultiModalEngine] Corridor exploration skipped: ${exploreErr.message}`);
      }
    }

    const graphSummary = graph.getSummary();
    logger.info(
      `[MultiModalEngine] Journey graph ready: ${graphSummary.nodes} nodes, ${graphSummary.edges} edges for ${originNode?.name} -> ${destNode?.name}`
    );

    // 4. Find all valid temporal paths (direct + multi-modal)
    const edgePaths = this.pathFinder.findPaths(graph, originNode.id, destNode.id, options);

    // 5. Build and validate canonical journeys
    const validJourneys = [];
    const buildContext = {
      originLocation: origin,
      destLocation: destination,
      resolveLocationDoc: (id) => graph.findNode(id)?.locationDoc,
    };

    for (const path of edgePaths) {
      const journey = this.journeyBuilder.buildJourney(path, buildContext);
      if (!journey) continue;

      const validation = this.journeyValidator.validate(journey);
      if (validation.valid) {
        validJourneys.push(journey);
      } else {
        logger.debug(
          `[MultiModalEngine] Journey rejected: ${validation.errors.join(', ')} (${journey.transportModes?.join(' -> ')})`
        );
      }
    }

    // 6. Ensure direct candidates and diverse multi-modal journeys coexist cleanly
    const directJourneys = validJourneys.filter((j) => j.numberOfTransfers === 0);
    const multiModalJourneys = validJourneys.filter((j) => j.numberOfTransfers > 0);

    // Deduplicate multi-modal paths by leg timing & service signature
    const seenMultiModal = new Set();
    const uniqueMultiModal = [];
    for (const mm of multiModalJourneys) {
      const fp = `${mm.transportModes?.join('+')}::${mm.legs
        ?.map(
          (l) =>
            `${l.metadata?.fromStation || l.origin}->${l.metadata?.toStation || l.destination}@${l.departureTime?.toISOString?.().slice(0, 16)}`
        )
        .join('|')}`;
      if (!seenMultiModal.has(fp)) {
        seenMultiModal.add(fp);
        uniqueMultiModal.push(mm);
      }
    }

    // Sort by duration and select diverse candidates
    uniqueMultiModal.sort((a, b) => (a.duration || 0) - (b.duration || 0));
    const maxMultiModal = options.maxMultiModalCandidates || MULTIMODAL_CONFIG.MAX_MULTIMODAL_CANDIDATES || 20;
    const selectedMultiModal = uniqueMultiModal.slice(0, maxMultiModal);

    const allCandidates = [...directJourneys, ...selectedMultiModal];

    // Ensure direct provider candidates are preserved
    for (const direct of directCandidates) {
      const alreadyPresent = allCandidates.some((c) => {
        if (c.numberOfTransfers !== 0) return false;
        return (
          c.departureTime?.toISOString?.() === direct.departureTime?.toISOString?.() &&
          c.totalPrice === direct.totalPrice &&
          c.transportModes?.[0] === direct.transportModes?.[0]
        );
      });
      if (!alreadyPresent) {
        allCandidates.push(direct);
      }
    }

    logger.info(
      `[MultiModalEngine] Discovery complete: ${allCandidates.length} journey candidates produced (${allCandidates.filter((j) => j.numberOfTransfers > 0).length} multi-modal, ${allCandidates.filter((j) => j.numberOfTransfers === 0).length} direct)`
    );

    return allCandidates;
  }
}

export const multiModalEngine = new MultiModalEngine();
export default multiModalEngine;
