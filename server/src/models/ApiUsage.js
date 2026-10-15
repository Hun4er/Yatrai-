import mongoose from 'mongoose';

/**
 * ApiUsage Schema
 *
 * Persists external API usage counters per month across restarts.
 */
const apiUsageSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      index: true,
      enum: ['railkit', 'railradar'],
    },
    month: {
      type: String,
      required: true,
      index: true, // format YYYY-MM
    },
    count: {
      type: Number,
      default: 0,
    },
    limit: {
      type: Number,
      default: 100,
    },
    warningThresholdReached: {
      type: Boolean,
      default: false,
    },
    criticalThresholdReached: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

apiUsageSchema.index({ provider: 1, month: 1 }, { unique: true });

export const ApiUsage = mongoose.models.ApiUsage || mongoose.model('ApiUsage', apiUsageSchema);

export default ApiUsage;
