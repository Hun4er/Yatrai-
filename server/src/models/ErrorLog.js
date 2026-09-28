import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ERROR_SEVERITIES = ['info', 'warn', 'error', 'fatal'];

const ErrorLogSchema = new Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    severity: {
      type: String,
      enum: {
        values: ERROR_SEVERITIES,
        message: '{VALUE} is not a valid error severity',
      },
      default: 'error',
      index: true,
    },
    service: {
      type: String,
      default: 'yatrai-api',
      trim: true,
    },
    module: {
      type: String,
      default: 'core',
      trim: true,
    },
    endpoint: {
      type: String,
      default: null,
      trim: true,
    },
    method: {
      type: String,
      default: null,
      trim: true,
    },
    statusCode: {
      type: Number,
      default: 500,
      index: true,
    },
    errorCode: {
      type: String,
      default: 'INTERNAL_ERROR',
      trim: true,
    },
    message: {
      type: String,
      required: [true, 'Error message is required'],
      trim: true,
    },
    stack: {
      type: String,
      default: null,
    },
    provider: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    details: {
      type: Schema.Types.Mixed,
      default: null,
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

ErrorLogSchema.index({ createdAt: -1 });
ErrorLogSchema.index({ severity: 1, createdAt: -1 });
ErrorLogSchema.index({ statusCode: 1, createdAt: -1 });
ErrorLogSchema.index({ provider: 1, createdAt: -1 });

export const ErrorLog = mongoose.model('ErrorLog', ErrorLogSchema);
export default ErrorLog;
