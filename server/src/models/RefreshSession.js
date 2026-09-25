import mongoose from 'mongoose';

const { Schema } = mongoose;

const RefreshSessionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    tokenHash: {
      type: String,
      required: [true, 'Token hash is required'],
      index: true,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
      index: { expires: 0 },
    },
    revokedAt: {
      type: Date,
      default: null,
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

/**
 * Check if the session is currently active (not revoked and not expired)
 */
RefreshSessionSchema.methods.isValid = function () {
  return !this.revokedAt && this.expiresAt > new Date();
};

export const RefreshSession = mongoose.model('RefreshSession', RefreshSessionSchema);
export default RefreshSession;
