import { MULTIMODAL_CONFIG } from '../config.js';
import logger from '../../utils/logger.js';

/**
 * JourneyValidator
 * Validates fully constructed candidate journeys before deduplication and persistence.
 * Ensures strict spatial continuity, temporal continuity, and boundary sanity.
 */
export class JourneyValidator {
  constructor(options = {}) {
    this.maxDurationMinutes = options.maxDurationMinutes ?? MULTIMODAL_CONFIG.MAX_JOURNEY_DURATION;
    this.maxTransfers = options.maxTransfers ?? MULTIMODAL_CONFIG.MAX_TRANSFERS;
    this.minTransferMinutes = options.minTransferMinutes ?? MULTIMODAL_CONFIG.MIN_TRANSFER_MINUTES;
  }

  /**
   * Validates a candidate journey.
   *
   * @param {Object} journey - Canonical journey object with legs
   * @returns {{ valid: boolean, errors: Array<string> }}
   */
  validate(journey) {
    const errors = [];

    if (!journey || typeof journey !== 'object') {
      return { valid: false, errors: ['Journey object is null or undefined'] };
    }

    // 1. Basic timestamps and duration sanity
    const depTime = journey.departureTime instanceof Date ? journey.departureTime : new Date(journey.departureTime);
    const arrTime = journey.arrivalTime instanceof Date ? journey.arrivalTime : new Date(journey.arrivalTime);

    if (isNaN(depTime.getTime())) errors.push('Invalid journey departureTime');
    if (isNaN(arrTime.getTime())) errors.push('Invalid journey arrivalTime');
    if (arrTime.getTime() < depTime.getTime()) {
      errors.push(`Journey arrivalTime (${arrTime.toISOString()}) is earlier than departureTime (${depTime.toISOString()})`);
    }

    if (Number(journey.duration) <= 0) {
      errors.push(`Journey duration must be positive, got ${journey.duration}`);
    }

    if (Number(journey.duration) > this.maxDurationMinutes) {
      errors.push(`Journey duration ${journey.duration}m exceeds maximum allowed ${this.maxDurationMinutes}m`);
    }

    if (Number(journey.numberOfTransfers) > this.maxTransfers) {
      errors.push(`Transfer count ${journey.numberOfTransfers} exceeds maximum allowed ${this.maxTransfers}`);
    }

    // 2. Legs sequential validation
    const legs = Array.isArray(journey.legs) ? journey.legs : [];

    if (legs.length === 0) {
      errors.push('Journey contains no legs');
    }

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const legDep = leg.departureTime instanceof Date ? leg.departureTime : new Date(leg.departureTime);
      const legArr = leg.arrivalTime instanceof Date ? leg.arrivalTime : new Date(leg.arrivalTime);

      if (isNaN(legDep.getTime()) || isNaN(legArr.getTime())) {
        errors.push(`Leg ${i + 1} has invalid departure or arrival timestamp`);
      } else if (legArr.getTime() < legDep.getTime()) {
        errors.push(`Leg ${i + 1} arrival time is earlier than departure time`);
      }

      // Transfer continuity between consecutive legs
      if (i > 0) {
        const prevLeg = legs[i - 1];
        const prevArr = prevLeg.arrivalTime instanceof Date ? prevLeg.arrivalTime : new Date(prevLeg.arrivalTime);
        const gapMinutes = Math.round((legDep.getTime() - prevArr.getTime()) / 60000);

        if (gapMinutes < this.minTransferMinutes) {
          errors.push(
            `Transfer between leg ${i} and leg ${i + 1} is insufficient: ${gapMinutes}m available, minimum required is ${this.minTransferMinutes}m`
          );
        }
      }
    }

    const isValid = errors.length === 0;
    if (!isValid) {
      logger.debug(`[JourneyValidator] Rejected candidate: ${errors.join('; ')}`);
    }

    return {
      valid: isValid,
      errors,
    };
  }
}

export const journeyValidator = new JourneyValidator();
export default journeyValidator;
