import mongoose from 'mongoose';

const { Schema } = mongoose;

export const LOCATION_TYPES = [
  'city',
  'airport',
  'railway_station',
  'bus_station',
  'landmark',
  'address',
  'region',
  'country',
];

const LocationSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Location name is required'],
      trim: true,
      maxlength: [150, 'Location name cannot exceed 150 characters'],
      index: true,
    },
    displayName: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      required: [true, 'Location type is required'],
      enum: {
        values: LOCATION_TYPES,
        message: '{VALUE} is not a supported location type',
      },
      index: true,
    },
    city: {
      type: String,
      trim: true,
      index: true,
    },
    state: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
      default: 'India',
    },
    countryCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: 'IN',
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
        required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: [true, 'Location coordinates [longitude, latitude] are required'],
        validate: {
          validator: function (coords) {
            if (!Array.isArray(coords) || coords.length !== 2) return false;
            const [lng, lat] = coords;
            return (
              typeof lng === 'number' &&
              typeof lat === 'number' &&
              !isNaN(lng) &&
              !isNaN(lat) &&
              lng >= -180 &&
              lng <= 180 &&
              lat >= -90 &&
              lat <= 90
            );
          },
          message:
            'Invalid coordinates. Longitude must be between -180 and 180, and latitude between -90 and 90.',
        },
      },
    },
    placeId: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    timezone: {
      type: String,
      trim: true,
      default: 'Asia/Kolkata',
    },
    aliases: {
      type: [String],
      default: [],
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

// 2dsphere index for geospatial proximity queries
LocationSchema.index({ location: '2dsphere' });
LocationSchema.index({ city: 1, type: 1 });

export const Location = mongoose.model('Location', LocationSchema);
export default Location;
