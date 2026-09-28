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
        "We couldn't connect to Yatrai. Check your connection and try again."
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

    // Phase 11: Natural Language Journey Search
    searchNatural: ({ query, referenceDate, timezone }) =>
      request('/journeys/search/natural', {
        method: 'POST',
        body: JSON.stringify({
          query,
          referenceDate,
          timezone,
        }),
      }),
  },

  // Phase 13: User Profile & Preferences
  users: {
    me: () => request('/users/me'),
  },

  // Phase 13: Saved Journeys
  savedJourneys: {
    list: () => request('/saved-journeys'),
    save: ({ journeyId, name, notes }) =>
      request('/saved-journeys', {
        method: 'POST',
        body: JSON.stringify({ journeyId, name, notes }),
      }),
    remove: (journeyId) =>
      request(`/saved-journeys/${journeyId}`, {
        method: 'DELETE',
      }),
    check: (journeyId) => request(`/saved-journeys/check/${journeyId}`),
  },

  // Phase 13: Recent Searches
  recentSearches: {
    list: (limit = 20) => request(`/searches/recent?limit=${limit}`),
    record: (searchData) =>
      request('/searches/recent', {
        method: 'POST',
        body: JSON.stringify(searchData),
      }),
    remove: (id) =>
      request(`/searches/recent/${id}`, {
        method: 'DELETE',
      }),
    clear: () =>
      request('/searches/recent', {
        method: 'DELETE',
      }),
  },

  // Phase 13: Favorite Routes
  favoriteRoutes: {
    list: () => request('/favorite-routes'),
    add: ({ origin, destination, preferredModes, label }) =>
      request('/favorite-routes', {
        method: 'POST',
        body: JSON.stringify({ origin, destination, preferredModes, label }),
      }),
    remove: (id) =>
      request(`/favorite-routes/${id}`, {
        method: 'DELETE',
      }),
    check: (origin, destination) =>
      request(
        `/favorite-routes/check?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`
      ),
  },

  // Phase 13: Journey History
  journeyHistory: {
    list: (limit = 30) => request(`/journey-history?limit=${limit}`),
    record: (journeyId) =>
      request('/journey-history', {
        method: 'POST',
        body: JSON.stringify({ journeyId }),
      }),
    clear: () =>
      request('/journey-history', {
        method: 'DELETE',
      }),
  },

  // Phase 14: Notifications
  notifications: {
    list: ({ page = 1, limit = 20, unreadOnly = false } = {}) =>
      request(
        `/notifications?page=${page}&limit=${limit}${unreadOnly ? '&unreadOnly=true' : ''}`
      ),
    unreadCount: () => request('/notifications/unread-count'),
    markRead: (id) =>
      request(`/notifications/${id}/read`, {
        method: 'PATCH',
      }),
    markAllRead: () =>
      request('/notifications/read-all', {
        method: 'PATCH',
      }),
    delete: (id) =>
      request(`/notifications/${id}`, {
        method: 'DELETE',
      }),
    sweep: () =>
      request('/notifications/reminders/sweep', {
        method: 'POST',
      }),
  },

  // Phase 15: Admin Dashboard
  admin: {
    getOverview: () => request('/admin/overview'),
    getUsers: ({ page = 1, limit = 20, search = '', role = '', status = '' } = {}) => {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) q.set('search', search);
      if (role) q.set('role', role);
      if (status) q.set('status', status);
      return request(`/admin/users?${q.toString()}`);
    },
    getSearches: ({ page = 1, limit = 20, status = '', search = '' } = {}) => {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (status) q.set('status', status);
      if (search) q.set('search', search);
      return request(`/admin/searches?${q.toString()}`);
    },
    getJourneys: ({ page = 1, limit = 20, mode = '', status = '' } = {}) => {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (mode) q.set('mode', mode);
      if (status) q.set('status', status);
      return request(`/admin/journeys?${q.toString()}`);
    },
    getProviders: () => request('/admin/providers'),
    getErrors: ({ page = 1, limit = 20, severity = '', statusCode = '', search = '' } = {}) => {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (severity) q.set('severity', severity);
      if (statusCode) q.set('statusCode', statusCode);
      if (search) q.set('search', search);
      return request(`/admin/errors?${q.toString()}`);
    },
    getErrorById: (id) => request(`/admin/errors/${id}`),
    getAnalytics: () => request('/admin/analytics'),
    getSystemHealth: () => request('/admin/system-health'),
  },
};

export default api;
