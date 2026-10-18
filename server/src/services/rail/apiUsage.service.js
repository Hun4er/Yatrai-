import mongoose from 'mongoose';
import ApiUsage from '../../models/ApiUsage.js';
import logger from '../../utils/logger.js';

class ApiUsageService {
  constructor() {
    this._memoryCounts = new Map(); // provider -> count
  }

  getCurrentMonthKey() {
    return new Date().toISOString().slice(0, 7); // YYYY-MM
  }

  /**
   * Records an outbound request for a provider and returns usage status.
   *
   * @param {string} provider - 'railkit' or 'railradar'
   * @param {number} [limit=100]
   * @returns {Promise<{ count: number, limit: number, percentage: number, isWarning: boolean, isCritical: boolean, shouldBlockNonEssential: boolean }>}
   */
  async recordRequest(provider = 'railkit', limit = 100) {
    const month = this.getCurrentMonthKey();
    const memKey = `${provider}:${month}`;

    const currentMem = (this._memoryCounts.get(memKey) || 0) + 1;
    this._memoryCounts.set(memKey, currentMem);

    let count = currentMem;

    if (mongoose.connection.readyState === 1) {
      try {
        const doc = await ApiUsage.findOneAndUpdate(
          { provider, month },
          { $inc: { count: 1 }, $setOnInsert: { limit } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        count = doc.count;
      } catch (err) {
        logger.debug(`[ApiUsageService] Failed to record usage to MongoDB: ${err.message}`);
      }
    }

    const percentage = Math.round((count / limit) * 100);
    const isWarning = percentage >= 80;
    const isCritical = percentage >= 95;

    if (isCritical) {
      logger.warn(
        `[CRITICAL USAGE WARNING] ${provider.toUpperCase()} has consumed ${count}/${limit} requests (${percentage}% of monthly quota). Halting non-essential enrichment!`
      );
    } else if (isWarning) {
      logger.warn(
        `[USAGE WARNING] ${provider.toUpperCase()} has consumed ${count}/${limit} requests (${percentage}% of monthly quota). Approaching limit!`
      );
    }

    return {
      count,
      limit,
      percentage,
      isWarning,
      isCritical,
      shouldBlockNonEssential: isCritical,
    };
  }

  /**
   * Retrieves current usage stats for a provider.
   */
  async getUsage(provider = 'railkit', limit = 100) {
    const month = this.getCurrentMonthKey();
    const memKey = `${provider}:${month}`;

    let count = this._memoryCounts.get(memKey) || 0;

    if (mongoose.connection.readyState === 1) {
      try {
        const doc = await ApiUsage.findOne({ provider, month });
        if (doc) count = doc.count;
      } catch {
        // Fallback to in-memory count if database query fails
      }
    }

    const percentage = Math.round((count / limit) * 100);
    return {
      provider,
      month,
      count,
      limit,
      percentage,
      isWarning: percentage >= 80,
      isCritical: percentage >= 95,
      shouldBlockNonEssential: percentage >= 95,
    };
  }
}

export const apiUsageService = new ApiUsageService();
export default apiUsageService;
