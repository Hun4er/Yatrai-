import { sanitizeCredentials } from './errors.js';

/**
 * Common Provider Result Envelope
 * Wraps all external transport provider responses behind a strict, stable boundary.
 *
 * Prevents provider-specific API schemas from leaking into the core search engine
 * and provides safe isolation for raw payloads before Phase 6 normalization.
 */

/**
 * Creates a successful provider result envelope.
 */
export function createSuccessEnvelope({
  provider,
  providerCode,
  source,
  candidates = [],
  rawData = {},
  metadata = {},
}) {
  return {
    provider,
    providerCode,
    status: candidates.length > 0 ? 'success' : 'empty',
    requestedAt: new Date().toISOString(),
    source: source || `${provider}-adapter`,
    candidates,
    rawData: sanitizeCredentials(rawData),
    metadata: {
      candidateCount: candidates.length,
      ...metadata,
    },
    error: null,
  };
}

/**
 * Creates an empty provider result envelope (provider queried successfully but returned 0 candidates).
 */
export function createEmptyEnvelope({
  provider,
  providerCode,
  source,
  rawData = {},
  metadata = {},
}) {
  return {
    provider,
    providerCode,
    status: 'empty',
    requestedAt: new Date().toISOString(),
    source: source || `${provider}-adapter`,
    candidates: [],
    rawData: sanitizeCredentials(rawData),
    metadata: {
      candidateCount: 0,
      ...metadata,
    },
    error: null,
  };
}

/**
 * Creates a failed provider result envelope (provider query threw or returned an error).
 */
export function createFailedEnvelope({
  provider,
  providerCode,
  source,
  error,
  rawData = {},
  metadata = {},
}) {
  return {
    provider,
    providerCode,
    status: 'failed',
    requestedAt: new Date().toISOString(),
    source: source || `${provider}-adapter`,
    candidates: [],
    rawData: sanitizeCredentials(rawData),
    metadata: {
      candidateCount: 0,
      ...metadata,
    },
    error:
      error && typeof error.toJSON === 'function'
        ? error.toJSON()
        : {
            code: error?.code || 'PROVIDER_ERROR',
            message: error?.message || 'Transport provider request failed',
            statusCode: error?.statusCode || 500,
            retryable: Boolean(error?.retryable),
          },
  };
}

/**
 * Creates an unavailable provider result envelope (e.g. credentials not configured or disabled).
 */
export function createUnavailableEnvelope({
  provider,
  providerCode,
  source,
  reason = 'Provider is not configured or disabled',
}) {
  return {
    provider,
    providerCode,
    status: 'unavailable',
    requestedAt: new Date().toISOString(),
    source: source || `${provider}-adapter`,
    candidates: [],
    rawData: {},
    metadata: {
      candidateCount: 0,
      reason,
    },
    error: {
      code: 'PROVIDER_UNAVAILABLE',
      message: reason,
      statusCode: 503,
      retryable: false,
    },
  };
}

export default {
  createSuccessEnvelope,
  createEmptyEnvelope,
  createFailedEnvelope,
  createUnavailableEnvelope,
};
