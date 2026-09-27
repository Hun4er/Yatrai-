import mongoose from 'mongoose';

const { Schema } = mongoose;

const JourneyHistorySchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    journey: {
      type: Schema.Types.ObjectId,
      ref: 'Journey',
      required: [true, 'Journey reference is required'],
      index: true,
    },
    viewedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        delete ret.id;
        return ret;
      },
    },
  }
);

// Unique compound index so repeated viewings update timestamp rather than duplicate rows
JourneyHistorySchema.index({ user: 1, journey: 1 }, { unique: true });
JourneyHistorySchema.index({ user: 1, viewedAt: -1 });

export const JourneyHistory = mongoose.model('JourneyHistory', JourneyHistorySchema);
export default JourneyHistory;
