import config from '../config/index.js';
import logger from '../utils/logger.js';
import { errorResponse } from '../utils/apiResponse.js';

/**
 * Global Error Handling Middleware
 */
export function errorHandler(err, req, res, _next) {
  const status = err.statusCode || err.status || 500;
  const message = err.message || 'An unexpected internal server error occurred.';
  const code = err.code || (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');

  logger.error(`Error processing request: ${req.method} ${req.originalUrl}`, {
    status,
    message,
    stack: config.isDevelopment ? err.stack : undefined,
  });

  const details = config.isDevelopment ? { stack: err.stack } : null;

  res.status(status).json(errorResponse(message, code, details));
}

export default errorHandler;
