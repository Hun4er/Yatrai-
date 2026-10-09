import distanceService from './distance.service.js';
import liveStatusService from './liveStatus.service.js';
import logger from '../../utils/logger.js';

/**
 * ConnectionValidator
 *
 * Implements Section 11:
 * - Station sequence verification
 * - Arrival before next departure check
 * - Station-specific & different-station transfer buffer validation
 * - Overnight date rollover handling
 * - Transfer count & total duration limits
 * - Rejection of impossible or excessively risky connections
 */
export class ConnectionValidator {
  constructor(options = {}) {
    this.minSameStationBufferMinutes = options.minSameStationBufferMinutes || 25;
    this.minCrossStationBufferMinutes = options.minCrossStationBufferMinutes || 60;
    this.maxTransferBufferMinutes = options.maxTransferBufferMinutes || 12 * 60; // 12 hours max layover
    this.maxTransfersAllowed = options.maxTransfersAllowed || 2;
    this.maxTotalDurationMinutes = options.maxTotalDurationMinutes || 48 * 60; // 48 hours
  }

  /**
   * Validates connection timing between two consecutive legs.
   */
  validateConnectingLegs(leg1, leg2) {
    if (!leg1 || !leg2) {
      return { isValid: false, layoverMinutes: 0, reason: 'MISSING_LEGS' };
    }

    const currentArr = new Date(leg1.arrivalTime).getTime();
    const nextDep = new Date(leg2.departureTime).getTime();

    if (isNaN(currentArr) || isNaN(nextDep)) {
      return { isValid: false, layoverMinutes: 0, reason: 'INVALID_TIMESTAMPS' };
    }

    const layoverMinutes = Math.round((nextDep - currentArr) / 60000);
    const stationA = (leg1.destination?.code || leg1.destinationStation || leg1.destination?.name || leg1.destination || '').toUpperCase().trim();
    const stationB = (leg2.origin?.code || leg2.originStation || leg2.origin?.name || leg2.origin || '').toUpperCase().trim();
    const isSameStation = stationA === stationB && stationA.length > 0;
    const minBuffer = isSameStation ? this.minSameStationBufferMinutes : this.minCrossStationBufferMinutes;

    const isValid = layoverMinutes >= minBuffer && layoverMinutes <= this.maxTransferBufferMinutes;
    return {
      isValid,
      layoverMinutes,
      minBufferRequired: minBuffer,
      isSameStation,
      reason: isValid ? null : layoverMinutes < minBuffer ? 'TIGHT_CONNECTION' : 'EXCESSIVE_LAYOVER',
    };
  }

  /**
   * Validates a candidate connecting journey.
   *
   * @param {Object} journey - Candidate journey with sequential legs
   * @param {Object} [constraints={}] - User preferences or constraints
   * @returns {Promise<Object>} { valid: boolean, errors: Array<string>, warnings: Array<string> }
   */
  async validateJourney(journey, constraints = {}) {
    const errors = [];
    const warnings = [];

    if (!journey || !Array.isArray(journey.legs) || journey.legs.length === 0) {
      return { valid: false, errors: ['Journey has no valid segments.'], warnings: [] };
    }

    const legs = journey.legs;
    const maxTransfers = constraints.maxTransfers ?? this.maxTransfersAllowed;

    // 1. Transfer count constraint
    const transfers = legs.length - 1;
    if (transfers > maxTransfers) {
      errors.push(`Journey has ${transfers} transfers, exceeding maximum allowed of ${maxTransfers}.`);
    }

    // 2. Validate consecutive leg connections
    for (let i = 0; i < legs.length - 1; i++) {
      const currentLeg = legs[i];
      const nextLeg = legs[i + 1];

      const currentArr = new Date(currentLeg.arrivalTime).getTime();
      const nextDep = new Date(nextLeg.departureTime).getTime();

      // Check chronologically valid timestamps
      if (isNaN(currentArr) || isNaN(nextDep)) {
        errors.push(`Invalid timestamp format on transfer between segment ${i + 1} and ${i + 2}.`);
        continue;
      }

      // Check arrival before next departure
      if (currentArr >= nextDep) {
        errors.push(
          `Impossible connection: segment ${i + 1} arrives at ${currentLeg.arrivalTime} which is after next departure at ${nextLeg.departureTime}.`
        );
        continue;
      }

      const availableBufferMinutes = Math.round((nextDep - currentArr) / 60000);

      // Check physical transfer between stations
      const transferAssessment = distanceService.evaluateStationTransfer(
        currentLeg.destination,
        nextLeg.origin
      );

      if (!transferAssessment.feasible) {
        errors.push(
          `Physically impossible station transfer between ${currentLeg.destination?.name || 'A'} and ${nextLeg.origin?.name || 'B'}.`
        );
        continue;
      }

      const requiredBuffer = transferAssessment.isSameStation
        ? this.minSameStationBufferMinutes
        : Math.max(this.minCrossStationBufferMinutes, transferAssessment.estimatedTransferMinutes);

      if (availableBufferMinutes < requiredBuffer) {
        errors.push(
          `Insufficient connection time at ${currentLeg.destination?.name || 'transfer'}: ${availableBufferMinutes}m available, but minimum ${requiredBuffer}m required.`
        );
      }

      if (availableBufferMinutes > this.maxTransferBufferMinutes) {
        errors.push(
          `Excessive layover duration of ${Math.round(availableBufferMinutes / 60)}h at ${currentLeg.destination?.name || 'transfer'}, exceeding limit of ${Math.round(this.maxTransferBufferMinutes / 60)}h.`
        );
      }

      // Live status connection risk assessment
      try {
        const risk = await liveStatusService.evaluateTransferRisk(currentLeg, nextLeg, requiredBuffer);
        if (!risk.feasible) {
          warnings.push(`High connection risk: ${risk.message}`);
        }
      } catch (err) {
        logger.debug(`[ConnectionValidator] Risk assessment failed: ${err.message}`);
      }
    }

    // 3. Overall duration constraint
    const depTime = new Date(journey.departureTime || legs[0]?.departureTime).getTime();
    const arrTime = new Date(journey.arrivalTime || legs[legs.length - 1]?.arrivalTime).getTime();
    if (!isNaN(depTime) && !isNaN(arrTime)) {
      const totalElapsedMinutes = Math.round((arrTime - depTime) / 60000);
      if (totalElapsedMinutes > this.maxTotalDurationMinutes) {
        errors.push(`Total journey duration (${Math.round(totalElapsedMinutes / 60)}h) exceeds 48-hour limit.`);
      }
      if (constraints.maxDurationMinutes && totalElapsedMinutes > constraints.maxDurationMinutes) {
        errors.push(`Total journey duration exceeds user-specified maximum of ${constraints.maxDurationMinutes}m.`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

export const connectionValidator = new ConnectionValidator();
export default connectionValidator;
