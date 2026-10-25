import mongoose from 'mongoose';

/**
 * PersistentCache Schema
 *
 * Persists external API responses (RailKit, RailRadar, station timetables) across server restarts.
 * Uses a TTL index on `expiresAt` so MongoDB automatically cleans up expired entries.
 */
const persistentCacheSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        'availability',
        'fare',
        'timetable',
        'station',
        'search',
        'schedule',
        'trainInfo',
        'pnr',
        'live',
        'cancelled',
        'negative',
        'route',
        'static',
        'preview',
      ],
      index: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    fetchedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// MongoDB TTL index: automatically deletes document when expiresAt < current time
persistentCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PersistentCache =
  mongoose.models.PersistentCache || mongoose.model('PersistentCache', persistentCacheSchema);

export default PersistentCache;
