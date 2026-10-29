import mongoose from 'mongoose';

const { Schema } = mongoose;

export const BOOKING_STATUSES = [
  'unconfirmed',
  'confirmed',
  'pending',
  'cancelled',
  'failed',
  'partially_booked',
];

const LegBookingSchema = new Schema(
  {
    sequence: { type: Number, required: true },
    trainNumber: { type: String, trim: true },
    trainName: { type: String, trim: true },
    origin: {
      code: { type: String, trim: true, uppercase: true },
      name: { type: String, trim: true },
    },
    destination: {
      code: { type: String, trim: true, uppercase: true },
      name: { type: String, trim: true },
    },
    departureTime: { type: Date },
    arrivalTime: { type: Date },
    duration: { type: Number },
    distance: { type: Number, default: 0 },
    travelClass: { type: String, trim: true },
    quota: { type: String, trim: true, default: 'GN' },
    fare: { type: Number, min: 0 },
    availabilityStatus: { type: String },
    bookingStatus: {
      type: String,
      enum: ['unconfirmed', 'confirmed', 'pending', 'cancelled', 'failed', 'not_bookable'],
      default: 'unconfirmed',
    },
    pnr: { type: String, default: null, trim: true },
    providerBookingReference: { type: String, default: null },
    seat: { type: String, default: null },
    coach: { type: String, default: null },
    ticketDocumentReference: { type: String, default: null },
  },
  { _id: false }
);

const TransferSchema = new Schema(
  {
    transferStationCode: { type: String, trim: true, uppercase: true },
    transferStationName: { type: String, trim: true },
    arrivalStationCode: { type: String, trim: true, uppercase: true },
    departureStationCode: { type: String, trim: true, uppercase: true },
    arrivalTimestamp: { type: Date },
    nextDepartureTimestamp: { type: Date },
    waitingTimeMinutes: { type: Number, min: 0 },
    isSameStation: { type: Boolean, default: true },
    connectionStatus: { type: String, default: 'validated' },
  },
  { _id: false }
);

const PassengerSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Passenger name is required'],
      trim: true,
      minlength: [2, 'Passenger name must be at least 2 characters'],
      maxlength: [80, 'Passenger name cannot exceed 80 characters'],
    },
    age: {
      type: Number,
      required: [true, 'Passenger age is required'],
      min: [1, 'Passenger age must be at least 1 year'],
      max: [120, 'Passenger age cannot exceed 120 years'],
    },
    gender: {
      type: String,
      required: [true, 'Passenger gender is required'],
      enum: {
        values: ['male', 'female', 'other'],
        message: '{VALUE} is not a valid gender',
      },
    },
    berthPreference: {
      type: String,
      default: 'no_preference',
      enum: ['no_preference', 'lower', 'middle', 'upper', 'side_lower', 'side_upper', 'window'],
    },
    category: {
      type: String,
      default: 'general',
      enum: ['general', 'senior_citizen', 'child', 'divyang'],
    },
  },
  { _id: false }
);

const BookingSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    bookingReference: {
      type: String,
      required: [true, 'Booking reference is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    journey: {
      type: Schema.Types.ObjectId,
      ref: 'Journey',
      required: [true, 'Journey reference is required'],
      index: true,
    },
    journeySnapshot: {
      type: Schema.Types.Mixed,
      required: [true, 'Journey snapshot is required'],
    },
    passengerDetails: {
      type: [PassengerSchema],
      required: [true, 'At least one passenger is required'],
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 6,
        message: 'A booking must have between 1 and 6 passengers',
      },
    },
    contactInfo: {
      email: {
        type: String,
        required: [true, 'Contact email is required'],
        trim: true,
        lowercase: true,
      },
      phone: {
        type: String,
        required: [true, 'Contact phone is required'],
        trim: true,
      },
    },
    fare: {
      baseFare: { type: Number, required: true, min: 0 },
      taxesAndFees: { type: Number, default: 0, min: 0 },
      totalFare: { type: Number, required: true, min: 0 },
      currency: { type: String, default: 'INR', uppercase: true },
    },
    status: {
      type: String,
      enum: {
        values: BOOKING_STATUSES,
        message: '{VALUE} is not a valid booking status',
      },
      default: 'unconfirmed',
      index: true,
    },
    isConfirmed: {
      type: Boolean,
      default: false,
      index: true,
    },
    complianceNotice: {
      type: String,
      default:
        'Per Indian Railways (IRCTC) regulations, this document represents an itinerary and fare summary. Official railway tickets must be confirmed via authorized IRCTC channels.',
    },
    provider: {
      type: String,
      default: 'Indian Railways / IRCTC',
      trim: true,
    },
    providerBookingReference: {
      type: String,
      default: null,
    },
    pnr: {
      type: String,
      default: null,
      trim: true,
      index: true,
      sparse: true,
    },
    idempotencyKey: {
      type: String,
      index: true,
      sparse: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    legs: {
      type: [LegBookingSchema],
      default: [],
    },
    transfers: {
      type: [TransferSchema],
      default: [],
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

BookingSchema.index({ user: 1, createdAt: -1 });
BookingSchema.index({ user: 1, status: 1 });
BookingSchema.index({ user: 1, idempotencyKey: 1 }, { sparse: true });

export const Booking = mongoose.model('Booking', BookingSchema);
export default Booking;
