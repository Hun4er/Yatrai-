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
        const remainingMonthHeader = response.headers.get('x-ratelimit-remaining-month');
        const limitMonthHeader = response.headers.get('x-ratelimit-limit-month');
        const remainingMinHeader = response.headers.get('x-ratelimit-remaining-min');
        const limitMinHeader = response.headers.get('x-ratelimit-limit-min');
        const retryAfterHeader = response.headers.get('retry-after');

        const rawBodyText = typeof data === 'string' ? data : JSON.stringify(data || '');
        const isMonthlyQuota =
          remainingMonthHeader === '0' ||
          /monthly quota/i.test(data?.error?.message || '') ||
          /monthly quota/i.test(rawBodyText);

        const errorCode = isMonthlyQuota ? 'PROVIDER_MONTHLY_QUOTA_EXHAUSTED' : 'PROVIDER_RATE_LIMITED';
        const errorMessage = isMonthlyQuota
          ? `Monthly quota exceeded for provider "${provider}". Upstream provider limit reached.`
          : `Rate limit exceeded for provider "${provider}".`;

        throw new ProviderError(errorMessage, {
          provider,
          code: errorCode,
          statusCode: 429,
          retryable: false,
          details: {
            ...sanitizeCredentials(data),
            isMonthlyQuota,
            limitMonth: limitMonthHeader ? Number(limitMonthHeader) : 100,
            remainingMonth: remainingMonthHeader ? Number(remainingMonthHeader) : (isMonthlyQuota ? 0 : null),
            limitMin: limitMinHeader ? Number(limitMinHeader) : 10,
            remainingMin: remainingMinHeader ? Number(remainingMinHeader) : null,
            retryAfterSeconds: retryAfterHeader ? Number(retryAfterHeader) : null,
          },
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
        if (options.budgetTracker) {
          const allowed = options.budgetTracker.recordOutboundRequest({
            isRecovery: options.isRecovery !== false,
            endpoint: url,
            isRetry: true,
          });
          if (!allowed) {
            logger.warn(`[${provider}] Request budget exhausted on retry. Ceasing retries.`);
            throw new ProviderError(`Provider "${provider}" returned HTTP ${response.status} (budget exhausted on retry).`, {
              provider,
              code: 'PROVIDER_UNAVAILABLE',
              statusCode: response.status,
              retryable: false,
              details: sanitizeCredentials(data),
            });
          }
        }
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
          if (options.budgetTracker) {
            const allowed = options.budgetTracker.recordOutboundRequest({
              isRecovery: options.isRecovery !== false,
              endpoint: url,
              isRetry: true,
            });
            if (!allowed) {
              logger.warn(`[${provider}] Request budget exhausted on timeout retry. Ceasing retries.`);
              throw new ProviderError(`Provider "${provider}" timed out after ${timeoutMs}ms (budget exhausted on retry).`, {
                provider,
                code: 'PROVIDER_TIMEOUT',
                statusCode: 504,
                retryable: false,
              });
            }
          }
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

      // Network connection failure (e.g. ECONNREFUSED, ENOTFOUND)
      const isLastAttempt = attempt > maxRetries;
      if (!isLastAttempt) {
        if (options.budgetTracker) {
          const allowed = options.budgetTracker.recordOutboundRequest({
            isRecovery: options.isRecovery !== false,
            endpoint: url,
            isRetry: true,
          });
          if (!allowed) {
            logger.warn(`[${provider}] Request budget exhausted on network error retry. Ceasing retries.`);
            throw new ProviderError(`Network connection to provider "${provider}" failed (budget exhausted on retry).`, {
              provider,
              code: 'NETWORK_ERROR',
              statusCode: 503,
              retryable: false,
            });
          }
        }
        logger.warn(`[${provider}] Network error: ${err.message}, retrying...`);
        continue;
      }

      throw new ProviderError(
        `Network connection to provider "${provider}" failed: ${err.message}`,
        {
          provider,
          code: 'NETWORK_ERROR',
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
