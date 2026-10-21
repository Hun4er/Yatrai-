/**
 * P0 v2 Client Cache & In-Flight Deduplication Service
 *
 * Implements the frontend cache requirements:
 * - staleTime: 5 minutes
 * - in-flight deduplication (concurrent requests for identical criteria share one Promise)
 * - no refetch on window focus
 * - cached date searches cost 0 network calls
 */

const STALE_TIME_MS = 5 * 60 * 1000; // 5 minutes

// In-memory cache: cacheKey -> { timestamp, data }
const _cache = new Map();

// In-flight request deduplication: cacheKey -> Promise
const _inFlight = new Map();

export function buildP0CacheKey({ origins, destinations, date, travelClass = 'ANY', quota = 'GN', mode = 'direct' }) {
  const o = Array.isArray(origins) ? origins.slice().sort().join(',') : String(origins || '');
  const d = Array.isArray(destinations) ? destinations.slice().sort().join(',') : String(destinations || '');
  return `${o.toUpperCase()}:${d.toUpperCase()}:${date}:${travelClass.toUpperCase()}:${quota.toUpperCase()}:${mode}`;
}

export function getCachedP0Result(cacheKey) {
  const entry = _cache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > STALE_TIME_MS) {
    _cache.delete(cacheKey);
    return null;
  }
  return entry.data;
}

export function setCachedP0Result(cacheKey, data) {
  _cache.set(cacheKey, {
    timestamp: Date.now(),
    data,
  });
}

export function clearP0Cache() {
  _cache.clear();
  _inFlight.clear();
}

/**
 * Deduplicated fetch wrapper.
 * If a request for cacheKey is already pending, returns that pending Promise.
 * If cached and fresh (< 5 min), returns cached data immediately.
 */
export async function deduplicatedFetch(cacheKey, fetchFn) {
  const cached = getCachedP0Result(cacheKey);
  if (cached) {
    return cached;
  }

  if (_inFlight.has(cacheKey)) {
    return _inFlight.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const data = await fetchFn();
      setCachedP0Result(cacheKey, data);
      return data;
    } finally {
      _inFlight.delete(cacheKey);
    }
  })();

  _inFlight.set(cacheKey, promise);
  return promise;
}

/**
 * Helper to generate a UUID actionId
 */
export function generateActionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `act_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

export default {
  buildP0CacheKey,
  getCachedP0Result,
  setCachedP0Result,
  clearP0Cache,
  deduplicatedFetch,
  generateActionId,
};
