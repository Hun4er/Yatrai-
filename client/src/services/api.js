/**
 * Centralized API Client for Yatrai
 * Handles all HTTP communications with the Yatrai Backend Service.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * In-memory access token storage.
 * Never stored in localStorage or sessionStorage for security.
 */
let inMemoryAccessToken = null;

export function setAccessToken(token) {
  inMemoryAccessToken = token;
}

export function getAccessToken() {
  return inMemoryAccessToken;
}

/**
 * Standard fetch wrapper with JSON serialization, credentials transport, and error normalization.
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const defaultHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  // Attach in-memory Bearer token if present and not explicitly overridden
  if (inMemoryAccessToken && !options.headers?.Authorization && !options.headers?.authorization) {
    defaultHeaders.Authorization = `Bearer ${inMemoryAccessToken}`;
  }

  const config = {
    // Automatically include HTTP-only cookies for session transport
    credentials: 'include',
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

  // Phase 2: Authentication
  auth: {
    register: (name, email, password) =>
      request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      }),

    login: (email, password) =>
      request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),

    refresh: () =>
      request('/auth/refresh', {
        method: 'POST',
      }),

    logout: () =>
      request('/auth/logout', {
        method: 'POST',
      }),

    me: () =>
      request('/auth/me', {
        method: 'GET',
      }),
  },

  // Phase 3: Location Resolution
  locations: {
    search: (query, limit = 5) =>
      request(`/locations/search?q=${encodeURIComponent(query)}&limit=${limit}`),

    resolve: (query) =>
      request('/locations/resolve', {
        method: 'POST',
        body: JSON.stringify({ query }),
      }),

    getById: (id) => request(`/locations/${id}`),
  },

  // Phase 4 & Phase 8: Journey Search Engine & Orchestrator
  journeys: {
    search: ({
      origin,
      destination,
      departureDate,
      returnDate,
      passengers,
      requestedModes,
      preferences,
      ranking,
    }) =>
      request('/journeys/search', {
        method: 'POST',
        body: JSON.stringify({
          origin,
          destination,
          departureDate,
          returnDate,
          passengers,
          requestedModes,
          preferences,
          ranking,
        }),
      }),
  },
};

export default api;
