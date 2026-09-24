import mongoose from 'mongoose';
import { TRANSPORT_MODES } from './TransportProvider.js';

const { Schema } = mongoose;

export const SEARCH_STATUSES = ['pending', 'processing', 'completed', 'failed'];

const SearchRequestSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    origin: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: [true, 'Search origin location is required'],
    },
    destination: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: [true, 'Search destination location is required'],
    },
    departureDate: {
      type: Date,
      required: [true, 'Departure date is required'],
    },
    returnDate: {
      type: Date,
      default: null,
    },
    passengers: {
      type: Number,
      default: 1,
      min: [1, 'Passengers count must be at least 1'],
    },
    preferences: {
      priority: {
        type: String,
        enum: ['fastest', 'cheapest', 'fewestTransfers', 'mostConvenient', 'balanced'],
        default: 'balanced',
      },
      maxBudget: {
        type: Number,
        min: [0, 'Max budget cannot be negative'],
        default: null,
      },
      maxTransfers: {
        type: Number,
        min: [0, 'Max transfers cannot be negative'],
        default: null,
      },
    },
    requestedModes: {
      type: [
        {
          type: String,
          enum: TRANSPORT_MODES,
        },
      ],
      default: [],
    },
    filters: {
      type: Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: {
        values: SEARCH_STATUSES,
        message: '{VALUE} is not a valid search status',
      },
      default: 'pending',
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

SearchRequestSchema.index({ user: 1, createdAt: -1 });
SearchRequestSchema.index({ origin: 1, destination: 1, departureDate: 1 });

export const SearchRequest = mongoose.model('SearchRequest', SearchRequestSchema);
export default SearchRequest;
