import mongoose from 'mongoose';

const { Schema } = mongoose;

export const PROVIDER_TYPES = [
  'airline',
  'rail',
  'bus',
  'taxi',
  'ride_hailing',
  'rental',
  'other',
];

export const TRANSPORT_MODES = [
  'road',
  'rail',
  'bus',
  'flight',
  'walk',
  'taxi',
  'metro',
];

const TransportProviderSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Provider name is required'],
      trim: true,
      maxlength: [120, 'Provider name cannot exceed 120 characters'],
    },
    code: {
      type: String,
      required: [true, 'Provider code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    type: {
      type: String,
      required: [true, 'Provider type is required'],
      enum: {
        values: PROVIDER_TYPES,
        message: '{VALUE} is not a valid provider type',
      },
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    website: {
      type: String,
      trim: true,
      default: null,
    },
    logo: {
      type: String,
      trim: true,
      default: null,
    },
    supportedModes: {
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
      enum: ['active', 'inactive', 'deprecated'],
      default: 'active',
      index: true,
    },
    capabilities: {
      realtimeAvailability: { type: Boolean, default: false },
      bookingRedirect: { type: Boolean, default: true },
      directBooking: { type: Boolean, default: false },
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
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

TransportProviderSchema.index({ type: 1, status: 1 });

export const TransportProvider = mongoose.model('TransportProvider', TransportProviderSchema);
export default TransportProvider;
