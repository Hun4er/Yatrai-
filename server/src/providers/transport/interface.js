import {
  createSuccessEnvelope,
  createEmptyEnvelope,
  createFailedEnvelope,
  createUnavailableEnvelope,
} from './envelope.js';
import { ProviderError } from './errors.js';

/**
 * Base Transport Provider Interface
 * Defines the contract that Road, Rail, Bus, and Flight providers must implement.
 */
export class BaseTransportProvider {
  /**
   * @param {Object} options
   * @param {string} options.name - Human-readable provider name
   * @param {string} options.code - Machine provider identifier (e.g. IRCTC, OSRM)
   * @param {string} options.mode - Primary transport mode ('road', 'rail', 'bus', 'flight')
   * @param {boolean} [options.enabled=true] - Whether the provider is active
   * @param {number} [options.timeoutMs=5000] - Default timeout in ms
   */
  constructor(options = {}) {
    if (this.constructor === BaseTransportProvider) {
      throw new Error('BaseTransportProvider is abstract and cannot be directly instantiated.');
    }
    this.name = options.name || 'Unnamed Provider';
    this.code = (options.code || 'UNKNOWN').toUpperCase();
    this.mode = options.mode || 'other';
    this.enabled = options.enabled !== false;
    this.timeoutMs = options.timeoutMs || 5000;
  }

  /**
   * Determines if the provider is currently enabled and configured.
   *
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Validates external provider response structure.
   * Subclasses must implement provider-specific validation.
   *
   * @param {*} rawResponse
   * @throws {ProviderError} If malformed
   */
  validateResponse(rawResponse) {
    if (!rawResponse || typeof rawResponse !== 'object') {
      throw new ProviderError(`Provider "${this.name}" returned empty or non-object response.`, {
        provider: this.mode,
        code: 'PROVIDER_MALFORMED_RESPONSE',
        statusCode: 502,
        retryable: false,
      });
    }
  }

  /**
   * Executes candidate search. Must be implemented by each adapter subclass.
   *
   * @param {Object} request - Common provider-independent request
   * @param {Object} [options]
   * @returns {Promise<Object>} Common Provider Result Envelope
   */
  async search(_request, _options = {}) {
    throw new Error(`search() must be implemented by ${this.constructor.name}`);
  }

  // Envelope convenience helpers
  success(candidates, rawData, metadata) {
    return createSuccessEnvelope({
      provider: this.mode,
      providerCode: this.code,
      source: `${this.code.toLowerCase()}-adapter`,
      candidates,
      rawData,
      metadata,
    });
  }

  empty(rawData, metadata) {
    return createEmptyEnvelope({
      provider: this.mode,
      providerCode: this.code,
      source: `${this.code.toLowerCase()}-adapter`,
      rawData,
      metadata,
    });
  }

  failed(error, rawData, metadata) {
    return createFailedEnvelope({
      provider: this.mode,
      providerCode: this.code,
      source: `${this.code.toLowerCase()}-adapter`,
      error,
      rawData,
      metadata,
    });
  }

  unavailable(reason) {
    return createUnavailableEnvelope({
      provider: this.mode,
      providerCode: this.code,
      source: `${this.code.toLowerCase()}-adapter`,
      reason,
    });
  }
}

export default BaseTransportProvider;
