import railRadarAdapter from '../../providers/rail/railRadar.adapter.js';
import logger from '../../utils/logger.js';

/**
 * LiveStatusService
 *
 * Implements Section 9:
 * - Real-time running status and delay retrieval
 * - Connection risk assessment between consecutive train legs
 * - Schedule-based labeling when live status is unavailable
 */
export class LiveStatusService {
  constructor(dependencies = {}) {
    this.railRadar = dependencies.railRadar || railRadarAdapter;
  }

  /**
   * Retrieves live status for a train leg.
   *
   * @param {string} trainNumber
   * @param {string|Date} date
   * @returns {Promise<Object>}
   */
  async getTrainStatus(trainNumber, date) {
    if (!trainNumber) {
      return {
        isLive: false,
        delayMinutes: 0,
        statusMessage: 'Schedule-based',
      };
    }

    try {
      return await this.railRadar.getLiveStatus(trainNumber, date);
    } catch (err) {
      logger.debug(`[LiveStatusService] Failed to query live status for ${trainNumber}: ${err.message}`);
      return {
        isLive: false,
        delayMinutes: 0,
        statusMessage: 'Schedule-based (Live status unavailable)',
      };
    }
  }

  /**
   * Assesses connection risk given live delay and scheduled layover buffer.
   */
  assessDelayRisk(delayMinutes = 0, scheduledLayoverMinutes = 45, minBuffer = 25) {
    const effectiveBufferMinutes = scheduledLayoverMinutes - delayMinutes;
    const hasRisk = effectiveBufferMinutes < minBuffer || delayMinutes > 20;
    let riskLevel = 'LOW';
    if (effectiveBufferMinutes <= 0) riskLevel = 'CRITICAL';
    else if (effectiveBufferMinutes < minBuffer) riskLevel = 'HIGH';
    else if (effectiveBufferMinutes < minBuffer + 15) riskLevel = 'MEDIUM';

    return {
      hasRisk,
      riskLevel,
      effectiveBufferMinutes,
      delayMinutes,
      scheduledLayoverMinutes,
    };
  }

  /**
   * Evaluates connection risk between arriving train leg and departing train leg.
   *
   * @param {Object} arrivalLeg - Leg 1
   * @param {Object} departureLeg - Leg 2
   * @param {number} minimumBufferMinutes - Configured station transfer buffer (e.g. 30 mins)
   * @returns {Promise<Object>} Connection feasibility evaluation
   */
  async evaluateTransferRisk(arrivalLeg, departureLeg, minimumBufferMinutes = 30) {
    const scheduledEnd = new Date(arrivalLeg.arrivalTime).getTime();
    const scheduledNextStart = new Date(departureLeg.departureTime).getTime();

    if (isNaN(scheduledEnd) || isNaN(scheduledNextStart)) {
      return {
        feasible: false,
        bufferMinutes: 0,
        riskLevel: 'HIGH',
        reason: 'INVALID_TIMESTAMPS',
      };
    }

    const scheduledBuffer = Math.round((scheduledNextStart - scheduledEnd) / 60000);

    // Retrieve live delay of incoming train ONLY if running today (IST)
    let incomingDelay = 0;
    let liveAvailable = false;

    const isTodayIST = (dateInput) => {
      if (!dateInput) return false;
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) return false;
      const istFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
      return istFormatter.format(d) === istFormatter.format(new Date());
    };

    const trainNum = arrivalLeg.vehicle?.identifier || arrivalLeg.service?.number;
    if (trainNum && isTodayIST(arrivalLeg.departureTime)) {
      const status = await this.getTrainStatus(trainNum, arrivalLeg.departureTime);
      if (status && status.isLive) {
        incomingDelay = status.delayMinutes || 0;
        liveAvailable = true;
      }
    }

    const estimatedActualBuffer = scheduledBuffer - incomingDelay;

    let riskLevel = 'LOW';
    let feasible = true;
    let message = 'Safe transfer connection';

    if (estimatedActualBuffer < 0) {
      feasible = false;
      riskLevel = 'CRITICAL';
      message = 'Missed connection: incoming train delay exceeds available buffer';
    } else if (estimatedActualBuffer < minimumBufferMinutes) {
      feasible = false;
      riskLevel = 'HIGH';
      message = `Tight connection: available buffer (${estimatedActualBuffer}m) is below safe minimum (${minimumBufferMinutes}m)`;
    } else if (estimatedActualBuffer < minimumBufferMinutes + 20) {
      riskLevel = 'MODERATE';
      message = `Moderate transfer buffer (${estimatedActualBuffer}m)`;
    }

    return {
      feasible,
      scheduledBufferMinutes: scheduledBuffer,
      effectiveBufferMinutes: Math.max(0, estimatedActualBuffer),
      incomingDelayMinutes: incomingDelay,
      riskLevel,
      liveAvailable,
      message,
    };
  }
}

export const liveStatusService = new LiveStatusService();
export default liveStatusService;
