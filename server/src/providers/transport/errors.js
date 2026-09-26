const SENSITIVE_KEY_PATTERNS = [
  /api[-_]?key/i,
  /secret/i,
  /token/i,
  /auth/i,
  /password/i,
  /bearer/i,
  /cookie/i,
];

/**
 * Deeply sanitizes any credentials or sensitive tokens from data structures
 * before storing in rawData, metadata, or logs.
 *
 * @param {*} data
 * @returns {*}
 */
export function sanitizeCredentials(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeCredentials);

  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
    if (isSensitive) {
      clean[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      clean[key] = sanitizeCredentials(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Normalized transport provider error.
 * Encapsulates provider failure codes without leaking external provider internals.
 */
export class ProviderError extends Error {
  /**
   * @param {string} message
   * @param {Object} [options]
   * @param {string} [options.provider]
   * @param {string} [options.code]
   * @param {number} [options.statusCode]
   * @param {boolean} [options.retryable]
   * @param {*} [options.details]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'ProviderError';
    this.provider = options.provider || 'unknown';
    this.code = options.code || 'PROVIDER_ERROR';
    this.statusCode = options.statusCode || 500;
    this.retryable = Boolean(options.retryable);
    this.details = options.details ? sanitizeCredentials(options.details) : null;
  }

  toJSON() {
    return {
      provider: this.provider,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable,
      details: this.details,
    };
  }
}

export default {
  ProviderError,
  sanitizeCredentials,
};
