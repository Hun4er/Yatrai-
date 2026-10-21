import mongoose from 'mongoose';

/**
 * CancelledTrain — cached list of cancelled trains for a date.
 *
 * TTL 1 hour, shared across all users.
 */
const cancelledTrainSchema = new mongoose.Schema(
  {
    // Date key: "YYYY-MM-DD"
    dateKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    trainNumbers: [{ type: String }],
    fetchedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: false }
);

export default mongoose.model('CancelledTrain', cancelledTrainSchema);
