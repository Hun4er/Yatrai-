/**
 * Creates a standard successful API response structure.
 *
 * @param {string} message - Human-readable success message
 * @param {object|array|null} data - Payload data
 * @param {object} meta - Optional metadata (pagination, tracing, etc.)
 */
export function successResponse(message, data = null, meta = {}) {
  const response = {
    success: true,
    message,
  };

  if (data !== null) {
    response.data = data;
  }

  if (Object.keys(meta).length > 0) {
    response.meta = meta;
  }

  return response;
}

/**
 * Creates a standard error API response structure.
 *
 * @param {string} message - Human-readable error message
 * @param {string} code - Machine-readable error code (e.g. NOT_FOUND, VALIDATION_ERROR)
 * @param {object|array|null} details - Optional error details
 */
export function errorResponse(message, code = 'INTERNAL_ERROR', details = null) {
  const response = {
    success: false,
    error: {
      code,
      message,
    },
  };

  if (details !== null) {
    response.error.details = details;
  }

  return response;
}
