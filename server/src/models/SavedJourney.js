import mongoose from 'mongoose';

const { Schema } = mongoose;

const SavedJourneySchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
    },
    journey: {
      type: Schema.Types.ObjectId,
      ref: 'Journey',
      required: [true, 'Journey reference is required'],
    },
    name: {
      type: String,
      trim: true,
      maxlength: [100, 'Custom journey name cannot exceed 100 characters'],
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
      default: '',
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

// Compound unique index ensuring a user cannot save the identical journey twice
SavedJourneySchema.index({ user: 1, journey: 1 }, { unique: true });

export const SavedJourney = mongoose.model('SavedJourney', SavedJourneySchema);
export default SavedJourney;
