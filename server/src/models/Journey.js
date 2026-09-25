import mongoose from 'mongoose';
import { TRANSPORT_MODES } from './TransportProvider.js';

const { Schema } = mongoose;

export const JOURNEY_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled', 'disrupted'];

const JourneySchema = new Schema(
  {
    origin: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: [true, 'Journey origin location is required'],
      index: true,
    },
    destination: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: [true, 'Journey destination location is required'],
      index: true,
    },
    departureTime: {
      type: Date,
      required: [true, 'Journey departure time (UTC) is required'],
      index: true,
    },
    arrivalTime: {
      type: Date,
      required: [true, 'Journey arrival time (UTC) is required'],
      validate: {
        validator: function (value) {
          if (!this.departureTime || !value) return true;
          return value >= this.departureTime;
        },
        message: 'Arrival time cannot be earlier than departure time',
      },
    },
    duration: {
      type: Number, // duration in minutes
      required: [true, 'Journey duration in minutes is required'],
      min: [0, 'Duration cannot be negative'],
    },
    totalDistance: {
      type: Number, // distance in kilometers
      min: [0, 'Total distance cannot be negative'],
      default: 0,
    },
    totalPrice: {
      type: Number,
      required: [true, 'Total price is required'],
      min: [0, 'Total price cannot be negative'],
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      trim: true,
    },
    numberOfTransfers: {
      type: Number,
      default: 0,
      min: [0, 'Number of transfers cannot be negative'],
    },
    transportModes: {
      type: [
        {
          type: String,
          enum: TRANSPORT_MODES,
        },
      ],
      default: [],
    },
    status: {
      type: String,
      enum: {
        values: JOURNEY_STATUSES,
        message: '{VALUE} is not a valid journey status',
      },
      default: 'scheduled',
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    schemaVersion: {
      type: Number,
      default: 1,
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

// Compound index for journey search and retrieval
JourneySchema.index({ origin: 1, destination: 1, departureTime: 1 });

export const Journey = mongoose.model('Journey', JourneySchema);
export default Journey;
