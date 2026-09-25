import { errorResponse } from '../utils/apiResponse.js';

/**
 * 404 Not Found Middleware
 */
export function notFoundHandler(req, res) {
  res
    .status(404)
    .json(errorResponse(`Resource not found: ${req.method} ${req.originalUrl}`, 'NOT_FOUND'));
}

export default notFoundHandler;
