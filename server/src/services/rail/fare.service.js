import railRadarAdapter from '../../providers/rail/railRadar.adapter.js';
import aopayAdapter from '../../providers/rail/aopay.adapter.js';
import logger from '../../utils/logger.js';

/**
 * FareService
 *
 * Implements Section 8:
 * - Real-time leg-level fare retrieval
 * - Aggregated total estimated journey fare
 * - Clear distinction between verified provider fare vs estimated tariff
 * - Transparent fee breakdown and currency support
 */
export class FareService {
  constructor(dependencies = {}) {
    this.railRadar = dependencies.railRadar || railRadarAdapter;
    this.aopay = dependencies.aopay || aopayAdapter;
  }

  /**
   * Retrieves or computes fare for an individual train leg.
   *
   * @param {Object} legParams
   * @param {string} legParams.trainNumber
   * @param {string} legParams.fromCode
   * @param {string} legParams.toCode
   * @param {string} [legParams.travelClass='3A']
   * @param {number} [legParams.distanceKm=500]
   * @param {number} [legParams.passengers=1]
   * @returns {Promise<Object>} Formatted leg fare breakdown
   */
  async getLegFare(
    trainNumberOrParams,
    date,
    fromCode,
    toCode,
    travelClass = '3A',
    quota = 'GN'
  ) {
    let num, from, to, tClass, distanceKm, passengers;
    if (typeof trainNumberOrParams === 'object' && trainNumberOrParams !== null) {
      num = trainNumberOrParams.trainNumber;
      from = trainNumberOrParams.fromCode || trainNumberOrParams.fromStation;
      to = trainNumberOrParams.toCode || trainNumberOrParams.toStation;
      tClass = trainNumberOrParams.travelClass || '3A';
      distanceKm = trainNumberOrParams.distanceKm || 500;
      passengers = trainNumberOrParams.passengers || 1;
    } else {
      num = trainNumberOrParams;
      from = fromCode;
      to = toCode;
      tClass = travelClass;
      distanceKm = 500;
      passengers = 1;
    }

    const numStr = String(num || '').trim();
    const fromStr = String(from || '').trim().toUpperCase();
    const toStr = String(to || '').trim().toUpperCase();
    const pCount = Math.max(1, Number(passengers) || 1);

    // 1. Try RailRadar primary provider
    let fareRes = null;
    try {
      fareRes = await this.railRadar.getFare(numStr, fromStr, toStr, tClass, distanceKm);
    } catch (err) {
      logger.debug(`[FareService] RailRadar fare retrieval failed: ${err.message}`);
    }

    // 2. Try AOPAY secondary fallback if authorized and needed
    if ((!fareRes || fareRes.isEstimated) && this.aopay.isAuthorized()) {
      try {
        const aopayFare = await this.aopay.getFare(numStr, fromStr, toStr, tClass);
        if (aopayFare && aopayFare.success && !aopayFare.isEstimated) {
          fareRes = aopayFare;
        }
      } catch (err) {
        logger.debug(`[FareService] AOPAY fare fallback failed: ${err.message}`);
      }
    }

    const baseFarePerPassenger = fareRes?.baseFare || 450;
    const totalLegFare = baseFarePerPassenger * pCount;
    const bookingFee = 15 * pCount; // IRCTC standard convenience fee
    const isEstimated = fareRes?.isEstimated ?? true;

    return {
      success: true,
      amount: totalLegFare + bookingFee,
      trainNumber: numStr,
      fromCode: fromStr,
      toCode: toStr,
      travelClass: tClass,
      passengers: pCount,
      baseFare: totalLegFare,
      totalFare: totalLegFare + bookingFee,
      bookingFee,
      currency: 'INR',
      isEstimated,
      source: fareRes?.source || 'tariff_schedule',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Aggregates total fare across all legs of a candidate journey.
   *
   * @param {Array<Object>} legs
   * @param {number} [passengers=1]
   * @returns {Object} Comprehensive journey pricing summary
   */
  calculateJourneyTotalFare(legs = [], passengers = 1) {
    if (!Array.isArray(legs) || legs.length === 0) {
      return {
        totalPrice: 0,
        currency: 'INR',
        isEstimated: true,
        breakdown: [],
        containsUnavailableFare: true,
      };
    }

    let sumBase = 0;
    let sumFees = 0;
    let anyEstimated = false;
    let anyUnavailable = false;
    const breakdown = [];

    for (const leg of legs) {
      const legPrice = Number(leg.price ?? leg.fare ?? leg.totalPrice);
      const isEst = Boolean(leg.metadata?.isEstimatedPrice || leg.isEstimated);

      if (isNaN(legPrice) || legPrice <= 0) {
        anyUnavailable = true;
      } else {
        sumBase += legPrice;
      }

      if (isEst) anyEstimated = true;

      breakdown.push({
        sequence: leg.sequence || 1,
        trainNumber: leg.vehicle?.identifier || leg.service?.number || 'TRAIN',
        mode: leg.mode || 'rail',
        price: legPrice || 0,
        isEstimated: isEst,
      });
    }

    return {
      totalPrice: sumBase,
      currency: 'INR',
      isEstimated: anyEstimated,
      containsUnavailableFare: anyUnavailable,
      breakdown,
      label: anyEstimated ? 'Estimated fare' : 'Total fare',
      timestamp: new Date().toISOString(),
    };
  }
}

export const fareService = new FareService();
export default fareService;
