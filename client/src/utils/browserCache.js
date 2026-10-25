/**
 * Yatrai Browser LocalStorage Cache Utility
 *
 * Provides a resilient, versioned client-side cache for public, non-sensitive data
 * (such as station suggestions, popular route previews, and local recent searches).
 *
 * Implements:
 * - Versioned cache envelope: { version: 1, cachedAt, expiresAt, data }
 * - Graceful fallback to memory Map if localStorage is restricted or disabled
 * - Safe JSON parsing and serialization
 * - Quota error detection & automatic expired entry eviction
 * - Stale-while-revalidate pattern for eligible public data
 * - Strict exclusion of credentials, auth tokens, and sensitive passenger details
 */

const CACHE_VERSION = 1;
const CACHE_PREFIX = 'yatrai_cache_v1_';
const RECENT_SEARCHES_KEY = 'yatrai_recent_searches_local';
const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes default

// In-memory fallback if localStorage is unavailable
const memoryFallback = new Map();

/**
 * Check if window.localStorage is functional.
 */
function isLocalStorageAvailable() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const testKey = '__yt_ls_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

const hasLocalStorage = isLocalStorageAvailable();

/**
 * Clean prefix for namespacing.
 */
function getStorageKey(key) {
  return `${CACHE_PREFIX}${key}`;
}

/**
 * Retrieves valid cached data for a key.
 * Returns null if not found or expired.
 *
 * @param {string} key
 * @returns {any|null}
 */
export function getCachedData(key) {
  if (!key) return null;
  const storageKey = getStorageKey(key);

  try {
    let raw = null;
    if (hasLocalStorage) {
      raw = window.localStorage.getItem(storageKey);
    } else {
      raw = memoryFallback.get(storageKey) || null;
    }

    if (!raw) return null;

    const entry = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!entry || typeof entry !== 'object') return null;

    // Check version
    if (entry.version !== CACHE_VERSION) {
      removeCachedData(key);
      return null;
    }

    // Check expiration
    const now = Date.now();
    if (typeof entry.expiresAt === 'number' && entry.expiresAt <= now) {
      removeCachedData(key);
      return null;
    }

    return entry.data;
  } catch {
    // Malformed JSON or read error: discard invalid entry
    removeCachedData(key);
    return null;
  }
}

/**
 * Retrieves cached data with freshness metadata (useful for stale-while-revalidate).
 *
 * @param {string} key
 * @returns {{ data: any, cachedAt: number, expiresAt: number, isStale: boolean }|null}
 */
export function getCachedDataWithMeta(key) {
  if (!key) return null;
  const storageKey = getStorageKey(key);

  try {
    let raw = null;
    if (hasLocalStorage) {
      raw = window.localStorage.getItem(storageKey);
    } else {
      raw = memoryFallback.get(storageKey) || null;
    }

    if (!raw) return null;

    const entry = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!entry || typeof entry !== 'object' || entry.version !== CACHE_VERSION) {
      return null;
    }

    const now = Date.now();
    const isStale = typeof entry.expiresAt === 'number' && entry.expiresAt <= now;

    return {
      data: entry.data,
      cachedAt: entry.cachedAt || now,
      expiresAt: entry.expiresAt || now,
      isStale,
    };
  } catch {
    return null;
  }
}

/**
 * Stores non-sensitive data into cache with a specified TTL.
 *
 * @param {string} key
 * @param {any} data
 * @param {number} [ttlMs]
 */
export function setCachedData(key, data, ttlMs = DEFAULT_TTL_MS) {
  if (!key || data === undefined || data === null) return;

  // Prevent caching errors
  if (data instanceof Error || data.status === 'error' || data.isError) {
    return;
  }

  const now = Date.now();
  const entry = {
    version: CACHE_VERSION,
    cachedAt: now,
    expiresAt: now + ttlMs,
    data,
  };

  const storageKey = getStorageKey(key);

  if (!hasLocalStorage) {
    memoryFallback.set(storageKey, entry);
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(entry));
  } catch (err) {
    // Handle QuotaExceededError by clearing expired entries first
    if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
      clearExpiredCache();
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(entry));
      } catch {
        // Fall back to memory map if localStorage is permanently full
        memoryFallback.set(storageKey, entry);
      }
    } else {
      memoryFallback.set(storageKey, entry);
    }
  }
}

/**
 * Removes a cached entry.
 *
 * @param {string} key
 */
export function removeCachedData(key) {
  if (!key) return;
  const storageKey = getStorageKey(key);
  if (hasLocalStorage) {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore
    }
  }
  memoryFallback.delete(storageKey);
}

/**
 * Scans localStorage and removes all expired Yatrai cache entries.
 */
export function clearExpiredCache() {
  if (!hasLocalStorage) {
    const now = Date.now();
    for (const [k, v] of memoryFallback.entries()) {
      if (v?.expiresAt && v.expiresAt <= now) {
        memoryFallback.delete(k);
      }
    }
    return;
  }

  try {
    const now = Date.now();
    const keysToRemove = [];

    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) {
        try {
          const raw = window.localStorage.getItem(k);
          const entry = JSON.parse(raw);
          if (entry?.expiresAt && entry.expiresAt <= now) {
            keysToRemove.push(k);
          }
        } catch {
          keysToRemove.push(k);
        }
      }
    }

    for (const k of keysToRemove) {
      window.localStorage.removeItem(k);
    }
  } catch {
    // Ignore scan errors
  }
}

/**
 * Clears all Yatrai application cache entries from storage.
 */
export function clearApplicationCache() {
  memoryFallback.clear();
  if (!hasLocalStorage) return;

  try {
    const keysToRemove = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      window.localStorage.removeItem(k);
    }
  } catch {
    // Ignore
  }
}

/**
 * Stale-While-Revalidate execution helper.
 * If fresh cached data exists, returns it immediately.
 * If stale cached data exists, returns it and schedules an asynchronous revalidation.
 * If no data exists, awaits the fetch function and caches the result.
 *
 * @param {string} key
 * @param {() => Promise<any>} fetchFn
 * @param {number} ttlMs
 * @param {(freshData: any) => void} [onRevalidate] Callback triggered if stale data was revalidated with changes
 * @returns {Promise<any>}
 */
export async function staleWhileRevalidate(key, fetchFn, ttlMs = DEFAULT_TTL_MS, onRevalidate = null) {
  const meta = getCachedDataWithMeta(key);

  if (meta && !meta.isStale) {
    return meta.data;
  }

  // Stale entry exists: return immediately and revalidate in background
  if (meta && meta.isStale && meta.data !== null && meta.data !== undefined) {
    // Background revalidation
    (async () => {
      try {
        const fresh = await fetchFn();
        if (fresh !== null && fresh !== undefined) {
          setCachedData(key, fresh, ttlMs);
          if (typeof onRevalidate === 'function') {
            onRevalidate(fresh);
          }
        }
      } catch {
        // Retain stale data silently on background failure
      }
    })();

    return meta.data;
  }

  // No cache entry: fetch synchronously
  const fresh = await fetchFn();
  if (fresh !== null && fresh !== undefined) {
    setCachedData(key, fresh, ttlMs);
  }
  return fresh;
}

// ============================================================================
// Visitor Recent Searches (localStorage backed)
// ============================================================================

/**
 * Retrieve local search queries for visitors.
 */
export function getLocalRecentSearches(limit = 6) {
  try {
    let raw = null;
    if (hasLocalStorage) {
      raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    } else {
      raw = memoryFallback.get(RECENT_SEARCHES_KEY);
    }
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.slice(0, limit) : [];
  } catch {
    return [];
  }
}

/**
 * Save a search query locally for visitors.
 * Prevents duplicates on (origin + destination + date).
 */
export function saveLocalRecentSearch(search) {
  if (!search || !search.origin || !search.destination) return;
  try {
    const list = getLocalRecentSearches(20);
    const newEntry = {
      id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      origin: String(search.origin).trim(),
      destination: String(search.destination).trim(),
      departureDate: search.departureDate || '',
      ranking: search.ranking || 'overall',
      timestamp: Date.now(),
    };

    // Filter duplicates
    const filtered = list.filter(
      (item) =>
        !(
          item.origin.toUpperCase() === newEntry.origin.toUpperCase() &&
          item.destination.toUpperCase() === newEntry.destination.toUpperCase() &&
          item.departureDate === newEntry.departureDate
        )
    );

    const updated = [newEntry, ...filtered].slice(0, 10);
    const serialized = JSON.stringify(updated);

    if (hasLocalStorage) {
      window.localStorage.setItem(RECENT_SEARCHES_KEY, serialized);
    } else {
      memoryFallback.set(RECENT_SEARCHES_KEY, serialized);
    }
  } catch {
    // Ignore storage write errors
  }
}

/**
 * Remove a single local recent search.
 */
export function removeLocalRecentSearch(id) {
  try {
    const list = getLocalRecentSearches(20);
    const updated = list.filter((s) => s.id !== id);
    const serialized = JSON.stringify(updated);
    if (hasLocalStorage) {
      window.localStorage.setItem(RECENT_SEARCHES_KEY, serialized);
    } else {
      memoryFallback.set(RECENT_SEARCHES_KEY, serialized);
    }
  } catch {
    // Ignore
  }
}

/**
 * Clears all local recent searches.
 */
export function clearLocalRecentSearches() {
  try {
    if (hasLocalStorage) {
      window.localStorage.removeItem(RECENT_SEARCHES_KEY);
    }
    memoryFallback.delete(RECENT_SEARCHES_KEY);
  } catch {
    // Ignore
  }
}

export default {
  getCachedData,
  getCachedDataWithMeta,
  setCachedData,
  removeCachedData,
  clearExpiredCache,
  clearApplicationCache,
  staleWhileRevalidate,
  getLocalRecentSearches,
  saveLocalRecentSearch,
  removeLocalRecentSearch,
  clearLocalRecentSearches,
};
