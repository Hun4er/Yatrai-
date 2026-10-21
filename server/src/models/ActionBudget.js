import mongoose from 'mongoose';

/**
 * ActionBudget — per-action RailKit call ledger.
 *
 * Keyed by actionId (client-generated per user click).
 * TTL 2 minutes (configurable). Shared across all requests that use the same actionId.
 * Cache hits never increment the ledger.
 */
const actionBudgetSchema = new mongoose.Schema(
  {
    actionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Action type drives the cap
    actionType: {
      type: String,
      enum: ['default', 'alternatives_button', 'deep', 'check_class'],
      default: 'default',
    },
    cap: { type: Number, required: true, default: 40 },

    // ── Sub-category counters ─────────────────────────────────────
    used: { type: Number, default: 0 },
    usedDirect: { type: Number, default: 0 },
    usedScheduleRoutes: { type: Number, default: 0 },
    usedSameTrain: { type: Number, default: 0 },
    usedCrossTrain: { type: Number, default: 0 },
    usedReserve: { type: Number, default: 0 },

    // ── Cache accounting ──────────────────────────────────────────
    cacheHits: { type: Number, default: 0 },
    cacheMisses: { type: Number, default: 0 },

    // ── Partial result flag ───────────────────────────────────────
    partial: { type: Boolean, default: false },

    // TTL index — MongoDB auto-removes docs after expiry
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true }
);

export default mongoose.model('ActionBudget', actionBudgetSchema);
