import { MULTIMODAL_CONFIG } from '../config.js';
import { transferValidator } from './transferValidator.js';
import logger from '../../utils/logger.js';

/**
 * PathFinder
 * Discovers valid single-leg and multi-modal paths through the JourneyGraph.
 * Applies depth-bounded exploration with temporal pruning and transfer validation.
 */
export class PathFinder {
  constructor(options = {}) {
    this.maxLegs = options.maxLegs ?? MULTIMODAL_CONFIG.MAX_JOURNEY_LEGS;
    this.maxTransfers = options.maxTransfers ?? MULTIMODAL_CONFIG.MAX_TRANSFERS;
    this.maxDurationMinutes = options.maxDurationMinutes ?? MULTIMODAL_CONFIG.MAX_JOURNEY_DURATION;
    this.transferValidator = options.transferValidator || transferValidator;
  }

  /**
   * Finds all valid paths from origin to destination through the graph.
   *
   * @param {Object} journeyGraph - JourneyGraph instance
   * @param {string} originId - Origin node ID
   * @param {string} destinationId - Destination node ID
   * @param {Object} [options]
   * @returns {Array<Array<Object>>} List of valid path edge sequences
   */
  findPaths(journeyGraph, originId, destinationId, options = {}) {
    const originNode = journeyGraph.findNode(originId);
    const destNode = journeyGraph.findNode(destinationId);

    if (!originNode || !destNode) {
      logger.debug(`[PathFinder] Node not found in graph: origin="${originId}" dest="${destinationId}"`);
      return [];
    }

    const startId = originNode.id;
    const targetId = destNode.id;

    if (startId === targetId) {
      return [];
    }

    const maxLegs = options.maxLegs || this.maxLegs;
    const maxTransfers = options.maxTransfers || this.maxTransfers;
    const maxDuration = options.maxDurationMinutes || this.maxDurationMinutes;

    const validPaths = [];
    const rejectedPaths = [];

    // Helper: DFS path exploration
    const explore = (currentNodeId, currentPath, visitedNodes) => {
      // Depth limit
      if (currentPath.length >= maxLegs) return;

      const outgoingEdges = journeyGraph.getOutgoingEdges(currentNodeId);

      for (const edge of outgoingEdges) {
        const nextNodeId = edge.toNodeId;

        // Prevent graph cycles
        if (visitedNodes.has(nextNodeId)) {
          continue;
        }

        // Validate transfer connection with previous edge (if multi-leg)
        if (currentPath.length > 0) {
          const prevEdge = currentPath[currentPath.length - 1];
          const conn = this.transferValidator.validateConnection(prevEdge, edge);

          if (!conn.valid) {
            rejectedPaths.push({
              path: [...currentPath, edge].map((e) => `${e.fromNodeName} -> ${e.toNodeName} (${e.mode})`),
              reason: conn.reason,
            });
            continue;
          }
        }

        const newPath = [...currentPath, edge];

        // Check if destination is reached
        const isDestination =
          nextNodeId === targetId ||
          edge.toNodeName.toLowerCase() === destNode.name.toLowerCase() ||
          destNode.matches(edge.toNodeId);

        if (isDestination) {
          // Validate total journey duration
          const firstDep = newPath[0].departureTime.getTime();
          const lastArr = newPath[newPath.length - 1].arrivalTime.getTime();
          const totalDuration = Math.round((lastArr - firstDep) / 60000);

          if (totalDuration > maxDuration) {
            rejectedPaths.push({
              path: newPath.map((e) => `${e.fromNodeName} -> ${e.toNodeName} (${e.mode})`),
              reason: `Total duration ${totalDuration}m exceeds maximum allowed ${maxDuration}m`,
            });
            continue;
          }

          if (newPath.length - 1 > maxTransfers) {
            rejectedPaths.push({
              path: newPath.map((e) => `${e.fromNodeName} -> ${e.toNodeName} (${e.mode})`),
              reason: `Transfer count ${newPath.length - 1} exceeds max transfers ${maxTransfers}`,
            });
            continue;
          }

          validPaths.push(newPath);
        } else {
          // Continue exploration if depth allows
          const nextVisited = new Set(visitedNodes);
          nextVisited.add(nextNodeId);
          explore(nextNodeId, newPath, nextVisited);
        }
      }
    };

    // Begin exploration from start node
    const initialVisited = new Set([startId]);
    explore(startId, [], initialVisited);

    logger.debug(
      `[PathFinder] Explored paths for ${originNode.name} -> ${destNode.name}: ${validPaths.length} valid, ${rejectedPaths.length} rejected`
    );

    return validPaths;
  }
}

export const pathFinder = new PathFinder();
export default pathFinder;
