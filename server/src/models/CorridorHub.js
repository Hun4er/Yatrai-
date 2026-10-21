import mongoose from 'mongoose';

/**
 * CorridorHub — learned hub stations per (origin, destination) corridor.
 *
 * Hubs that produced a verified plan are stored with their score.
 * TTL 7 days, shared across all users.
 * Presence of a corridor record skips hub discovery (0 route calls).
 */
const corridorHubSchema = new mongoose.Schema(
  {
    // Canonical corridor key: "ORIGIN_CODE:DEST_CODE"
    corridorKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    originCode: { type: String, required: true, uppercase: true, trim: true },
    destCode: { type: String, required: true, uppercase: true, trim: true },
    hubs: [
      {
        code: { type: String, required: true },
        name: String,
        score: { type: Number, default: 0 },
        distanceFromOriginKm: Number,
        distanceToDestKm: Number,
        verifiedAt: { type: Date, default: Date.now },
      },
    ],
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true }
);

export default mongoose.model('CorridorHub', corridorHubSchema);
