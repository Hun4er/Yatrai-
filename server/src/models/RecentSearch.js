import mongoose from 'mongoose';

const { Schema } = mongoose;

const RecentSearchSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    origin: {
      type: String,
      required: [true, 'Origin is required'],
      trim: true,
    },
    destination: {
      type: String,
      required: [true, 'Destination is required'],
      trim: true,
    },
    departureDate: {
      type: String,
      required: [true, 'Departure date is required'],
      trim: true,
    },
    ranking: {
      type: String,
      default: 'overall',
      trim: true,
    },
    departureWindow: {
      type: Schema.Types.Mixed,
      default: null,
    },
    maxBudget: {
      type: Number,
      default: null,
    },
    transportTypes: {
      type: [String],
      default: [],
    },
    passengers: {
      type: Number,
      default: 1,
    },
    query: {
      type: String,
      trim: true,
      default: '',
    },
    searchedAt: {
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

RecentSearchSchema.index({ user: 1, searchedAt: -1 });
RecentSearchSchema.index({ user: 1, origin: 1, destination: 1, departureDate: 1 });

export const RecentSearch = mongoose.model('RecentSearch', RecentSearchSchema);
export default RecentSearch;
