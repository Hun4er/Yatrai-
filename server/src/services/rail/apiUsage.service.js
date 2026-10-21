import mongoose from 'mongoose';
import ApiUsage from '../../models/ApiUsage.js';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

class ApiUsageService {
  constructor() {
    this._memoryCounts = new Map(); // provider:month -> count
    this._dailyCounts = new Map();  // provider:YYYY-MM-DD -> count
  }

  getCurrentMonthKey() {
    return new Date().toISOString().slice(0, 7); // YYYY-MM
  }

  getCurrentDayKey() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  /**
   * Records an outbound request for a provider and returns usage status.
   *
   * @param {string} provider - 'railkit' or 'railradar'
   * @param {number} [customLimit]
   * @returns {Promise<object>}
   */
  async recordRequest(provider = 'railkit', customLimit = null) {
    const month = this.getCurrentMonthKey();
    const day = this.getCurrentDayKey();
    const memKey = `${provider}:${month}`;
    const dayKey = `${provider}:${day}`;

    // Memory counters
    const currentMem = (this._memoryCounts.get(memKey) || 0) + 1;
    this._memoryCounts.set(memKey, currentMem);

    const currentDay = (this._dailyCounts.get(dayKey) || 0) + 1;
    this._dailyCounts.set(dayKey, currentDay);

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
    const remaining = Math.max(0, limit - totalCount);
    const remainingPercent = Math.max(0, Math.round((remaining / limit) * 100));

    const degradedThresholdPercent = config.apiQuota?.degradedThresholdPercent || 10;
    const isDegraded = remaining <= (limit * (degradedThresholdPercent / 100));

    const planExpiry = config.apiQuota?.planExpiry || '2026-11-13';
    const isExpired = Date.now() > new Date(`${planExpiry}T23:59:59+05:30`).getTime();

    const isWarning = percentage >= (config.apiQuota?.warningPercent || 80);
    const isCritical = percentage >= (config.apiQuota?.criticalPercent || 95);

    if (isDegraded) {
      logger.warn(
        `[DEGRADED USAGE WARNING] ${provider.toUpperCase()} has only ${remaining}/${limit} requests remaining (${remainingPercent}%). Running in degraded mode (direct + same-train only)!`
      );
    } else if (isCritical) {
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
      remaining,
      remainingPercent,
      percentage,
      isWarning,
      isCritical,
      isDegraded,
      isExpired,
      planExpiry,
      callsToday: currentDay,
      callsThisMonth: totalCount,
      shouldBlockNonEssential: isCritical,
    };
  }

  /**
   * Retrieves current usage stats for a provider.
   */
  async getUsage(provider = 'railkit', customLimit = null) {
    const month = this.getCurrentMonthKey();
    const day = this.getCurrentDayKey();
    const memKey = `${provider}:${month}`;
    const dayKey = `${provider}:${day}`;

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
    const remaining = Math.max(0, limit - totalCount);
    const remainingPercent = Math.max(0, Math.round((remaining / limit) * 100));

    const degradedThresholdPercent = config.apiQuota?.degradedThresholdPercent || 10;
    const isDegraded = remaining <= (limit * (degradedThresholdPercent / 100));

    const planExpiry = config.apiQuota?.planExpiry || '2026-11-13';
    const isExpired = Date.now() > new Date(`${planExpiry}T23:59:59+05:30`).getTime();

    const callsToday = this._dailyCounts.get(dayKey) || 0;

    return {
      provider,
      month,
      today: day,
      rawCount: count,
      usageOffset: offset,
      count: totalCount,
      limit,
      remaining,
      remainingPercent,
      percentage,
      isWarning: percentage >= (config.apiQuota?.warningPercent || 80),
      isCritical: percentage >= (config.apiQuota?.criticalPercent || 95),
      isDegraded,
      isExpired,
      planExpiry,
      callsToday,
      callsThisMonth: totalCount,
      shouldBlockNonEssential: percentage >= (config.apiQuota?.criticalPercent || 95),
    };
  }

  getCallsToday(provider = 'railkit') {
    const day = this.getCurrentDayKey();
    const dayKey = `${provider}:${day}`;
    return this._dailyCounts.get(dayKey) || 0;
  }
}

export const apiUsageService = new ApiUsageService();
export default apiUsageService;
