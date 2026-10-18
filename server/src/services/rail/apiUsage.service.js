import mongoose from 'mongoose';
import ApiUsage from '../../models/ApiUsage.js';
import config from '../../config/index.js';
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
   * @param {number} [customLimit]
   * @returns {Promise<{ rawCount: number, usageOffset: number, count: number, limit: number, percentage: number, isWarning: boolean, isCritical: boolean, shouldBlockNonEssential: boolean }>}
   */
  async recordRequest(provider = 'railkit', customLimit = null) {
    const month = this.getCurrentMonthKey();
    const memKey = `${provider}:${month}`;

    const currentMem = (this._memoryCounts.get(memKey) || 0) + 1;
    this._memoryCounts.set(memKey, currentMem);

    let count = currentMem;
    const limit = customLimit || config.apiQuota?.monthlyLimit || 10000;
    const offset = Number(config.apiQuota?.usageOffset || 0);

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

    const totalCount = count + offset;
    const percentage = Math.round((totalCount / limit) * 100);
    const isWarning = percentage >= (config.apiQuota?.warningPercent || 80);
    const isCritical = percentage >= (config.apiQuota?.criticalPercent || 95);

    if (isCritical) {
      logger.warn(
        `[CRITICAL USAGE WARNING] ${provider.toUpperCase()} has consumed ${totalCount}/${limit} requests (${percentage}% of monthly quota). Halting non-essential enrichment!`
      );
    } else if (isWarning) {
      logger.warn(
        `[USAGE WARNING] ${provider.toUpperCase()} has consumed ${totalCount}/${limit} requests (${percentage}% of monthly quota). Approaching limit!`
      );
    }

    return {
      rawCount: count,
      usageOffset: offset,
      count: totalCount,
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
  async getUsage(provider = 'railkit', customLimit = null) {
    const month = this.getCurrentMonthKey();
    const memKey = `${provider}:${month}`;

    let count = this._memoryCounts.get(memKey) || 0;
    const limit = customLimit || config.apiQuota?.monthlyLimit || 10000;
    const offset = Number(config.apiQuota?.usageOffset || 0);

    if (mongoose.connection.readyState === 1) {
      try {
        const doc = await ApiUsage.findOne({ provider, month });
        if (doc) count = doc.count;
      } catch {
        // Fallback to in-memory count if database query fails
      }
    }

    const totalCount = count + offset;
    const percentage = Math.round((totalCount / limit) * 100);
    return {
      provider,
      month,
      rawCount: count,
      usageOffset: offset,
      count: totalCount,
      limit,
      percentage,
      isWarning: percentage >= (config.apiQuota?.warningPercent || 80),
      isCritical: percentage >= (config.apiQuota?.criticalPercent || 95),
      shouldBlockNonEssential: percentage >= (config.apiQuota?.criticalPercent || 95),
    };
  }
}

export const apiUsageService = new ApiUsageService();
export default apiUsageService;
