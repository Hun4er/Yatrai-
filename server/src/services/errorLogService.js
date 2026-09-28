import { ErrorLog } from '../models/ErrorLog.js';
import logger from '../utils/logger.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'cookies',
  'credentials',
]);

/**
 * Recursively redacts sensitive properties from error details and metadata.
 */
export function sanitizeSensitiveData(obj, depth = 0) {
  if (depth > 5 || !obj) return obj;

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeSensitiveData(item, depth + 1));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('secret') || lowerKey.includes('password')) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeSensitiveData(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export const errorLogService = {
  /**
   * Asynchronously records an operational error into the ErrorLog collection.
   * Never throws or interrupts request execution.
   */
  async recordError({
    message,
    severity = 'error',
    service = 'yatrai-api',
    module = 'core',
    endpoint = null,
    method = null,
    statusCode = 500,
    errorCode = 'INTERNAL_ERROR',
    stack = null,
    provider = null,
    details = null,
  }) {
    try {
      const sanitizedDetails = details ? sanitizeSensitiveData(details) : null;

      return await ErrorLog.create({
        timestamp: new Date(),
        severity: ['info', 'warn', 'error', 'fatal'].includes(severity) ? severity : 'error',
        service,
        module,
        endpoint,
        method,
        statusCode: Number(statusCode) || 500,
        errorCode: String(errorCode || 'INTERNAL_ERROR'),
        message: String(message || 'Unknown error'),
        stack: stack ? String(stack) : null,
        provider: provider ? String(provider) : null,
        details: sanitizedDetails,
      });
    } catch (loggingErr) {
      logger.error('[errorLogService] Failed to record error log:', {
        message: loggingErr.message,
      });
      return null;
    }
  },
};

export default errorLogService;
