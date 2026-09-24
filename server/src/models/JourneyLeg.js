import mongoose from 'mongoose';
import { TRANSPORT_MODES } from './TransportProvider.js';

const { Schema } = mongoose;

const JourneyLegSchema = new Schema(
  {
    journey: {
      type: Schema.Types.ObjectId,
      ref: 'Journey',
      required: [true, 'Parent journey reference is required'],
      index: true,
    },
    sequence: {
      type: Number,
      required: [true, 'Leg sequence number is required'],
      min: [1, 'Leg sequence must be a positive integer starting from 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Leg sequence must be an integer',
      },
    },
    origin: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: [true, 'Leg origin location is required'],
    },
    destination: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: [true, 'Leg destination location is required'],
    },
    mode: {
      type: String,
      required: [true, 'Transport mode is required'],
      enum: {
        values: TRANSPORT_MODES,
        message: '{VALUE} is not a valid transport mode',
      },
      index: true,
    },
    provider: {
      type: Schema.Types.ObjectId,
      ref: 'TransportProvider',
      default: null,
      index: true,
    },
    departureTime: {
      type: Date,
      required: [true, 'Leg departure time (UTC) is required'],
    },
    arrivalTime: {
      type: Date,
      required: [true, 'Leg arrival time (UTC) is required'],
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
      required: [true, 'Leg duration in minutes is required'],
      min: [0, 'Duration cannot be negative'],
    },
    distance: {
      type: Number, // distance in km
      min: [0, 'Distance cannot be negative'],
      default: 0,
    },
    price: {
      type: Number,
      min: [0, 'Price cannot be negative'],
      default: 0,
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      trim: true,
    },
    vehicle: {
      type: { type: String, trim: true },
      identifier: { type: String, trim: true }, // Train/Flight/Bus number
    },
    service: {
      name: { type: String, trim: true },
      operator: { type: String, trim: true },
      class: { type: String, trim: true },
    },
    booking: {
      reference: { type: String, trim: true },
      url: { type: String, trim: true },
      status: {
        type: String,
        enum: ['available', 'waitlist', 'sold_out', 'unknown'],
        default: 'unknown',
      },
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

// Compound unique index ensuring no duplicate sequence per journey
JourneyLegSchema.index({ journey: 1, sequence: 1 }, { unique: true });
JourneyLegSchema.index({ origin: 1, destination: 1, mode: 1 });

export const JourneyLeg = mongoose.model('JourneyLeg', JourneyLegSchema);
export default JourneyLeg;
