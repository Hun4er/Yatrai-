import mongoose from 'mongoose';

const { Schema } = mongoose;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [emailRegex, 'Please provide a valid email address'],
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    avatar: {
      type: String,
      trim: true,
      default: null,
    },
    preferences: {
      preferredTransportModes: {
        type: [
          {
            type: String,
            enum: ['road', 'rail', 'bus', 'flight', 'walk', 'taxi', 'metro'],
          },
        ],
        default: ['rail', 'bus'],
      },
      preferredCurrency: {
        type: String,
        default: 'INR',
        uppercase: true,
        trim: true,
      },
      preferredLanguage: {
        type: String,
        default: 'en',
        trim: true,
      },
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
      index: true,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
      index: true,
    },
    passwordHash: {
      type: String,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        delete ret.id;
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

UserSchema.index({ role: 1, createdAt: -1 });

export const User = mongoose.model('User', UserSchema);
export default User;
