import { MULTIMODAL_CONFIG } from '../config.js';

/**
 * TransferValidator
 * Validates connection compatibility between two consecutive transport legs.
 */
export class TransferValidator {
  constructor(options = {}) {
    this.minTransferMinutes = options.minTransferMinutes ?? MULTIMODAL_CONFIG.MIN_TRANSFER_MINUTES;
    this.crossStationTransferMinutes =
      options.crossStationTransferMinutes ?? MULTIMODAL_CONFIG.CROSS_STATION_TRANSFER_MINUTES;
    this.maxLayoverMinutes = options.maxLayoverMinutes ?? MULTIMODAL_CONFIG.MAX_LAYOVER_MINUTES;
  }

  /**
   * Determines required transfer buffer in minutes based on modes and stations.
   *
   * @param {Object} prevEdge
   * @param {Object} nextEdge
   * @returns {number}
   */
  getRequiredTransferMinutes(prevEdge, nextEdge) {
    const prevMode = prevEdge.mode;
    const nextMode = nextEdge.mode;

    // Flight arrival requires extra time for deplaning, baggage retrieval, and airport exit
    if (prevMode === 'flight') {
      return nextMode === 'road' ? 60 : 90;
    }

    // Flight departure requires security check-in buffer
    if (nextMode === 'flight') {
      return 120;
    }

    // Road transfer arriving at railway station / bus terminal
    if (prevMode === 'road' && (nextMode === 'rail' || nextMode === 'bus')) {
      return 45;
    }

    // Train arriving to road feeder departure
    if (prevMode === 'rail' && nextMode === 'road') {
      return 30;
    }

    // Same station train to train transfer (platform change)
    if (prevMode === 'rail' && nextMode === 'rail') {
      return this.minTransferMinutes; // 45 mins
    }

    // Bus to train or train to bus
    if ((prevMode === 'bus' && nextMode === 'rail') || (prevMode === 'rail' && nextMode === 'bus')) {
      return this.crossStationTransferMinutes; // 60 mins
    }

    return this.minTransferMinutes;
  }

  /**
   * Validates spatial and temporal connection between two consecutive edges.
   *
   * @param {Object} prevEdge - Incoming transport leg
   * @param {Object} nextEdge - Outgoing transport leg
   * @param {Object} [context]
   * @returns {{ valid: boolean, reason?: string, transferMinutes: number }}
   */
  validateConnection(prevEdge, nextEdge, context = {}) {
    if (!prevEdge || !nextEdge) {
      return { valid: false, reason: 'Missing edge in connection evaluation', transferMinutes: 0 };
    }

    // 1. Spatial Compatibility Check
    const prevTo = String(prevEdge.toNodeId).toLowerCase().trim();
    const nextFrom = String(nextEdge.fromNodeId).toLowerCase().trim();

    const isSameLocation =
      prevTo === nextFrom ||
      (prevEdge.toNodeName &&
        nextEdge.fromNodeName &&
        prevEdge.toNodeName.toLowerCase() === nextEdge.fromNodeName.toLowerCase());

    if (!isSameLocation) {
      // Check if they are compatible metro cluster stations (e.g. MAS/PER in Chennai, NDLS/DLI in Delhi)
      const prevCluster = context.getCluster ? context.getCluster(prevTo) : null;
      const nextCluster = context.getCluster ? context.getCluster(nextFrom) : null;

      const isClusterCompatible =
        prevCluster && nextCluster && prevCluster === nextCluster;

      if (!isClusterCompatible) {
        return {
          valid: false,
          reason: `Spatial mismatch: leg 1 ends at "${prevEdge.toNodeName}" but leg 2 starts at "${nextEdge.fromNodeName}"`,
          transferMinutes: 0,
        };
      }
    }

    // 2. Temporal Compatibility Check
    const prevArr = prevEdge.arrivalTime instanceof Date ? prevEdge.arrivalTime : new Date(prevEdge.arrivalTime);
    const nextDep = nextEdge.departureTime instanceof Date ? nextEdge.departureTime : new Date(nextEdge.departureTime);

    const actualBufferMs = nextDep.getTime() - prevArr.getTime();
    const actualBufferMinutes = Math.round(actualBufferMs / 60000);

    const requiredMinutes = this.getRequiredTransferMinutes(prevEdge, nextEdge);

    if (actualBufferMinutes < requiredMinutes) {
      return {
        valid: false,
        reason: `Insufficient transfer buffer: ${actualBufferMinutes}m available between ${prevArr.toISOString().slice(11, 16)} and ${nextDep.toISOString().slice(11, 16)}, but ${requiredMinutes}m required`,
        transferMinutes: actualBufferMinutes,
      };
    }

    // 3. Maximum Layover Check (prevent unreasonable wait times e.g. > 14 hours)
    if (actualBufferMinutes > this.maxLayoverMinutes) {
      return {
        valid: false,
        reason: `Excessive transfer layover: ${actualBufferMinutes}m exceeds maximum allowed of ${this.maxLayoverMinutes}m`,
        transferMinutes: actualBufferMinutes,
      };
    }

    // 4. Duplicate Carrier / Service Loop Check
    if (
      prevEdge.mode === nextEdge.mode &&
      prevEdge.vehicle?.identifier &&
      nextEdge.vehicle?.identifier &&
      prevEdge.vehicle.identifier === nextEdge.vehicle.identifier
    ) {
      return {
        valid: false,
        reason: `Redundant transfer: same vehicle ${prevEdge.vehicle.identifier} across consecutive legs`,
        transferMinutes: actualBufferMinutes,
      };
    }

    return {
      valid: true,
      transferMinutes: actualBufferMinutes,
    };
  }
}

export const transferValidator = new TransferValidator();
export default transferValidator;
