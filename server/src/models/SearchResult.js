import mongoose from 'mongoose';

const { Schema } = mongoose;

const SENSITIVE_KEY_PATTERNS = [
  /api[-_]?key/i,
  /secret/i,
  /token/i,
  /auth/i,
  /password/i,
  /bearer/i,
];

/**
 * Deep sanitization function to strip sensitive credentials from raw external data.
 */
function sanitizeRawData(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeRawData);

  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
    if (isSensitive) {
      clean[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      clean[key] = sanitizeRawData(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

const SearchResultSchema = new Schema(
  {
    searchRequest: {
      type: Schema.Types.ObjectId,
      ref: 'SearchRequest',
      required: [true, 'Parent search request reference is required'],
      index: true,
    },
    journey: {
      type: Schema.Types.ObjectId,
      ref: 'Journey',
      required: [true, 'Normalized journey reference is required'],
      index: true,
    },
    provider: {
      type: Schema.Types.ObjectId,
      ref: 'TransportProvider',
      default: null,
      index: true,
    },
    source: {
      type: String,
      default: 'direct',
      trim: true,
    },
    externalId: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'stale'],
      default: 'active',
      index: true,
    },
    rawData: {
      type: Schema.Types.Mixed,
      default: {},
    },
    normalizedData: {
      type: Schema.Types.Mixed,
      default: {},
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours TTL default
      index: { expires: 0 },
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

SearchResultSchema.index({ searchRequest: 1, journey: 1 });

// Sanitize rawData before saving to prevent persisting credentials
SearchResultSchema.pre('save', function () {
  if (this.rawData && typeof this.rawData === 'object') {
    this.rawData = sanitizeRawData(this.rawData);
  }
});

export const SearchResult = mongoose.model('SearchResult', SearchResultSchema);
export default SearchResult;
