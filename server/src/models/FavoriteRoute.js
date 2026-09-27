import mongoose from 'mongoose';

const { Schema } = mongoose;

const FavoriteRouteSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    origin: {
      type: String,
      required: [true, 'Origin name is required'],
      trim: true,
    },
    destination: {
      type: String,
      required: [true, 'Destination name is required'],
      trim: true,
    },
    preferredModes: {
      type: [String],
      default: [],
    },
    label: {
      type: String,
      trim: true,
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

// Unique constraint ensuring a user cannot save the identical origin-destination pair twice
FavoriteRouteSchema.index({ user: 1, origin: 1, destination: 1 }, { unique: true });
FavoriteRouteSchema.index({ user: 1, createdAt: -1 });

export const FavoriteRoute = mongoose.model('FavoriteRoute', FavoriteRouteSchema);
export default FavoriteRoute;
