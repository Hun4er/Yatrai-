/**
 * Centralized API Client for Yatrai
 * Handles all HTTP communications with the Yatrai Backend Service.
 */

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  '/api';

/**
 * In-memory access token storage.
 * Never stored in localStorage or sessionStorage for security.
 */
let inMemoryAccessToken = null;
let sessionExpiredCallback = null;
let activeRefreshPromise = null;

export function setAccessToken(token) {
  inMemoryAccessToken = token;
}

export function getAccessToken() {
  return inMemoryAccessToken;
}

export function setOnSessionExpired(cb) {
  sessionExpiredCallback = cb;
}

/**
 * Deduplicated, single-flight token refresh executor.
 * Concurrent callers share the exact same active refresh promise.
 */
async function performTokenRefresh() {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const url = `${API_BASE_URL}/auth/refresh`;
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = { raw: await response.text() };
      }

      if (!response.ok || !data?.data?.accessToken) {
        setAccessToken(null);
        if (sessionExpiredCallback) {
          sessionExpiredCallback('Your session has expired. Please sign in again.');
        }
        const error = new Error(
          data?.error?.message || 'Your session has expired. Please sign in again.'
        );
        error.status = response.status;
        error.code = data?.error?.code || 'SESSION_EXPIRED';
        throw error;
      }

      const newAccessToken = data.data.accessToken;
      setAccessToken(newAccessToken);
      return data;
    } catch (err) {
      setAccessToken(null);
      throw err;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

/**
 * Standard fetch wrapper with JSON serialization, credentials transport, single-flight auto-refresh, and error normalization.
 */
async function request(endpoint, options = {}, isRetry = false) {
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

    // If 401 unauthorized on a non-auth endpoint, attempt token refresh and retry once
    const isAuthEndpoint =
      endpoint.includes('/auth/login') ||
      endpoint.includes('/auth/register') ||
      endpoint.includes('/auth/refresh') ||
      endpoint.includes('/auth/logout');

    if (response.status === 401 && !isAuthEndpoint && !isRetry) {
      try {
        const refreshResult = await performTokenRefresh();
        if (refreshResult?.data?.accessToken) {
          // Retry the original request once with the renewed token
          const retryHeaders = {
            ...options.headers,
            Authorization: `Bearer ${refreshResult.data.accessToken}`,
          };
          return await request(endpoint, { ...options, headers: retryHeaders }, true);
        }
      } catch (refreshErr) {
        // Refresh failed; clear local token and rethrow
        setAccessToken(null);
        throw refreshErr;
      }
    }

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

    refresh: () => performTokenRefresh(),

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
    search: (query, limit = 6, options = {}) => {
      const railwayOnly = options.railwayOnly !== false;
      const url = `/locations/search?q=${encodeURIComponent(query)}&limit=${limit}${railwayOnly ? '&railwayOnly=true' : ''}`;
      return request(url);
    },

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
      exploreAlternatives,
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
          exploreAlternatives,
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

    // Search Interpretation & Location Resolution Discovery
    interpret: ({ query, referenceDate, timezone }) =>
      request('/journeys/interpret', {
        method: 'POST',
        body: JSON.stringify({
          query,
          referenceDate,
          timezone,
        }),
      }),

    // Real-Time Railway Journey Recovery
    recover: ({ origin, destination, departureDate, travelClass, quota, passengers, ranking, exploreAlternatives = true }) =>
      request('/journeys/recover', {
        method: 'POST',
        body: JSON.stringify({
          origin,
          destination,
          departureDate,
          travelClass,
          quota,
          passengers,
          ranking,
          exploreAlternatives,
          options: { exploreAlternatives: true },
        }),
      }),

    getAvailability: (id) => request(`/journeys/${id}/availability`),
    getFare: (id) => request(`/journeys/${id}/fare`),
    getById: (id) => request(`/journeys/${id}`),
    getPreview: () => request('/journeys/preview'),
  },

  /**
   * P0 v2 — Budget-aware journey search (4 new endpoints).
   *
   * Each user action generates a new UUID actionId on the client.
   * The direct request and its automatic alternatives follow-up share the SAME actionId
   * so they share one cap (DEFAULT 40).
   *
   * React Query usage:
   *   staleTime: 5 * 60 * 1000,   // 5 min
   *   refetchOnWindowFocus: false,
   */
  journeysV2: {
    /**
     * Main search endpoint.
     *
     * @param {object} params
     * @param {string} params.actionId  — UUID generated per user click
     * @param {string[]} params.origins — station codes
     * @param {string[]} params.destinations — station codes
     * @param {string} params.date — "YYYY-MM-DD"
     * @param {string} [params.class] — travel class or "ANY"
     * @param {string} [params.quota] — "GN"
     * @param {'direct'|'auto'|'alternatives'|'deep'} [params.mode]
     */
    search: ({ actionId, origins, destinations, date, class: travelClass = 'ANY', quota = 'GN', mode = 'direct', includeRisky }) =>
      request('/v2/journeys/search', {
        method: 'POST',
        body: JSON.stringify({ actionId, origins, destinations, date, class: travelClass, quota, mode, includeRisky }),
      }),

    /**
     * Tap on "?" chip → check single class.
     */
    checkClass: ({ actionId, trainNo, from, to, class: travelClass, date, quota = 'GN' }) =>
      request('/v2/journeys/check-class', {
        method: 'POST',
        body: JSON.stringify({ actionId, trainNo, from, to, class: travelClass, date, quota }),
      }),

    /**
     * Refresh-card icon tap → bypasses cache, rate-limited 1/min/card.
     */
    refreshCard: ({ trainNo, from, to, class: travelClass, date, quota = 'GN' }) =>
      request('/v2/journeys/refresh-card', {
        method: 'POST',
        body: JSON.stringify({ trainNo, from, to, class: travelClass, date, quota }),
      }),

    /**
     * "Check more trains" button → checks next batch of 8 waiting trains.
     */
    moreTrains: ({ actionId, trainNos, waitingTrains, date, class: travelClass = 'ANY', quota = 'GN' }) =>
      request('/v2/journeys/more-trains', {
        method: 'POST',
        body: JSON.stringify({ actionId, trainNos, waitingTrains, date, class: travelClass, quota }),
      }),
  },

  // Railway Booking Preparation & Compliance
  booking: {
    prepare: ({ journeyId, passengers, travelClass, quota, contactDetails }) =>
      request('/booking/prepare', {
        method: 'POST',
        body: JSON.stringify({
          journeyId,
          passengers,
          travelClass,
          quota,
          contactDetails,
        }),
      }),
    create: (bookingData) =>
      request('/booking', {
        method: 'POST',
        body: JSON.stringify(bookingData),
      }),
    myBookings: (params = {}) => {
      const q = params.status ? `?status=${encodeURIComponent(params.status)}` : '';
      return request(`/booking/my-bookings${q}`);
    },
    getById: (id) => request(`/booking/${id}`),
    checkPnr: (pnrNumber) => request(`/booking/pnr/${encodeURIComponent(pnrNumber)}`),
    downloadPdf: async (id, bookingReference) => {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/booking/${id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!response.ok) {
        let errMsg = `Failed to generate PDF (${response.status})`;
        try {
          const errData = await response.json();
          if (errData?.error?.message) errMsg = errData.error.message;
        } catch {
          // ignore
        }
        throw new Error(errMsg);
      }
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = downloadUrl;
      a.download = `Yatrai_${bookingReference || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(downloadUrl);
        a.remove();
      }, 100);
      return true;
    },
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
  // PNR Status Verification
  pnr: {
    check: (pnrNumber) => request(`/pnr/${encodeURIComponent(pnrNumber)}`),
  },

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
