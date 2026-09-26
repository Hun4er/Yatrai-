import logger from '../../utils/logger.js';
import { ProviderError, sanitizeCredentials } from './errors.js';

/**
 * Executes a resilient HTTP fetch request with bounded timeouts, rate-limit translation,
 * and transient error retry logic.
 *
 * @param {string} url - Target URL
 * @param {Object} [options]
 * @param {string} [options.provider='transport'] - Provider name for error tagging
 * @param {number} [options.timeoutMs=5000] - Request timeout in milliseconds
 * @param {number} [options.maxRetries=1] - Maximum retries for transient failures (502, 503, 504)
 * @param {Function} [options.fetchFn=globalThis.fetch] - Custom fetch implementation for testing
 * @returns {Promise<{ status: number, data: any, headers: Headers }>}
 */
export async function httpFetch(url, options = {}) {
  const {
    provider = 'transport',
    timeoutMs = 5000,
    maxRetries = 1,
    fetchFn = globalThis.fetch,
    ...fetchOptions
  } = options;

  let attempt = 0;
  const startTime = Date.now();

  while (attempt <= maxRetries) {
    attempt++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      logger.debug(
        `[${provider}] HTTP Request Attempt ${attempt}/${maxRetries + 1}: ${fetchOptions.method || 'GET'} ${url.split('?')[0]}`
      );

      const response = await fetchFn(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const durationMs = Date.now() - startTime;
      logger.debug(`[${provider}] HTTP Response Status: ${response.status} (${durationMs}ms)`);

      // Parse JSON or text safely
      let data = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch {
          data = null;
        }
      } else {
        try {
          data = await response.text();
        } catch {
          data = null;
        }
      }

      // 1. Successful HTTP 2xx
      if (response.ok) {
        return {
          status: response.status,
          data,
          headers: response.headers,
        };
      }

      // 2. Rate-limited HTTP 429 (Do not retry immediately)
      if (response.status === 429) {
        throw new ProviderError(`Rate limit exceeded for provider "${provider}".`, {
          provider,
          code: 'PROVIDER_RATE_LIMITED',
          statusCode: 429,
          retryable: false,
          details: sanitizeCredentials(data),
        });
      }

      // 3. Authentication & Authorization errors (HTTP 401, 403 - Do not retry)
      if (response.status === 401 || response.status === 403) {
        throw new ProviderError(
          `Authentication failed for provider "${provider}" (HTTP ${response.status}).`,
          {
            provider,
            code: 'PROVIDER_AUTH_ERROR',
            statusCode: response.status,
            retryable: false,
            details: sanitizeCredentials(data),
          }
        );
      }

      // 4. Bad Request / Validation errors (HTTP 400, 422 - Do not retry)
      if (response.status === 400 || response.status === 422) {
        throw new ProviderError(
          `Provider "${provider}" rejected request payload (HTTP ${response.status}).`,
          {
            provider,
            code: 'PROVIDER_BAD_REQUEST',
            statusCode: response.status,
            retryable: false,
            details: sanitizeCredentials(data),
          }
        );
      }

      // 5. Transient Server Errors (HTTP 502, 503, 504) - Retryable
      const isTransient = [502, 503, 504].includes(response.status);
      if (isTransient && attempt <= maxRetries) {
        logger.warn(`[${provider}] Transient HTTP ${response.status} error, retrying in 250ms...`);
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }

      throw new ProviderError(`Provider "${provider}" returned HTTP ${response.status}.`, {
        provider,
        code: 'PROVIDER_UNAVAILABLE',
        statusCode: response.status,
        retryable: isTransient,
        details: sanitizeCredentials(data),
      });
    } catch (err) {
      clearTimeout(timeoutId);

      // Handle AbortController timeout
      if (err.name === 'AbortError') {
        const isLastAttempt = attempt > maxRetries;
        if (!isLastAttempt) {
          logger.warn(`[${provider}] Request timed out after ${timeoutMs}ms, retrying...`);
          continue;
        }
        throw new ProviderError(`Provider "${provider}" timed out after ${timeoutMs}ms.`, {
          provider,
          code: 'PROVIDER_TIMEOUT',
          statusCode: 504,
          retryable: true,
        });
      }

      // Re-throw already normalized ProviderError
      if (err instanceof ProviderError) {
        throw err;
      }

      // Network connection failure (e.g. ECONNREFUSED)
      const isLastAttempt = attempt > maxRetries;
      if (!isLastAttempt) {
        logger.warn(`[${provider}] Network error: ${err.message}, retrying...`);
        continue;
      }

      throw new ProviderError(
        `Network connection to provider "${provider}" failed: ${err.message}`,
        {
          provider,
          code: 'PROVIDER_UNAVAILABLE',
          statusCode: 503,
          retryable: true,
        }
      );
    }
  }
}

export default {
  httpFetch,
};
