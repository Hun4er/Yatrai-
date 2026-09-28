import config from '../config/index.js';
import logger from '../utils/logger.js';
import { errorResponse } from '../utils/apiResponse.js';
import { errorLogService } from '../services/errorLogService.js';

/**
 * Global Error Handling Middleware
 */
export function errorHandler(err, req, res, _next) {
  let status = err.statusCode || err.status || 500;
  let message = err.message || 'An unexpected internal server error occurred.';
  let code = err.code || (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');

  if (err.code === 11000) {
    status = 409;
    code = 'DUPLICATE_KEY_ERROR';
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'field';
    message = `An account with that ${field} already exists.`;
  }

  logger.error(`Error processing request: ${req.method} ${req.originalUrl}`, {
    status,
    message,
    stack: config.isDevelopment ? err.stack : undefined,
  });

  // Asynchronously record operational error into ErrorLog
  errorLogService
    .recordError({
      message,
      severity: status >= 500 ? 'error' : 'warn',
      service: 'yatrai-api',
      module: req.baseUrl || 'api',
      endpoint: req.originalUrl ? req.originalUrl.split('?')[0] : null,
      method: req.method,
      statusCode: status,
      errorCode: code,
      stack: err.stack || null,
      details: {
        query: req.query,
      },
    })
    .catch(() => {});

  const details = config.isDevelopment ? { stack: err.stack } : null;

  res.status(status).json(errorResponse(message, code, details));
}

export default errorHandler;
