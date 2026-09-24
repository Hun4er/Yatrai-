/**
 * Centralized API Client for Yatrai
 * Handles all HTTP communications with the Yatrai Backend Service.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * Standard fetch wrapper with JSON serialization, timeout, and error normalization.
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const defaultHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);

    // Parse JSON response safely
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = { raw: await response.text() };
    }

    if (!response.ok) {
      const errorMessage = data?.error?.message || `Request failed with status ${response.status}`;
      const error = new Error(errorMessage);
      error.status = response.status;
      error.code = data?.error?.code || 'API_ERROR';
      error.details = data?.error?.details || null;
      throw error;
    }

    return data;
  } catch (err) {
    if (!err.status) {
      // Network or connection failure
      const networkError = new Error(
        `Unable to connect to Yatrai API server at ${url}. Please verify the backend is running.`
      );
      networkError.code = 'NETWORK_ERROR';
      networkError.originalError = err;
      throw networkError;
    }
    throw err;
  }
}

/**
 * API Service Modules
 */
export const api = {
  // Phase 0: Health verification
  health: {
    check: () => request('/health'),
  },

  // Future Phases Extension Points (Phase 1+)
  /*
  auth: { ... },
  locations: { ... },
  journeys: { ... },
  providers: { ... },
  savedJourneys: { ... },
  notifications: { ... },
  admin: { ... }
  */
};

export default api;
