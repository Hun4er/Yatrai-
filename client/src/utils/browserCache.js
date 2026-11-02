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
const SAVED_JOURNEYS_KEY = 'yatrai_saved_journeys_local';
const FAVORITE_ROUTES_KEY = 'yatrai_favorite_routes_local';
const JOURNEY_HISTORY_KEY = 'yatrai_journey_history_local';
const NOTIFICATIONS_KEY = 'yatrai_notifications_local';
const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes default

function dispatchSyncEvent(type, payload = null) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('yatrai:sync-state', { detail: { type, payload } }));
    } catch {
      // ignore
    }
  }
}

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
    const list = getLocalRecentSearches(30);
    const originStr = String(search.originCode || search.origin || '').trim();
    const destStr = String(search.destinationCode || search.destination || '').trim();
    const newEntry = {
      id: `local_search_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      origin: originStr,
      destination: destStr,
      originName: search.originName || search.originStation?.name || originStr,
      destinationName: search.destinationName || search.destinationStation?.name || destStr,
      departureDate: search.departureDate || '',
      ranking: search.ranking || 'overall',
      timestamp: Date.now(),
    };

    // Filter duplicates on (origin + destination + departureDate)
    const filtered = list.filter(
      (item) =>
        !(
          String(item.origin || '').toUpperCase() === newEntry.origin.toUpperCase() &&
          String(item.destination || '').toUpperCase() === newEntry.destination.toUpperCase() &&
          String(item.departureDate || '') === String(newEntry.departureDate || '')
        )
    );

    const updated = [newEntry, ...filtered].slice(0, 20);
    const serialized = JSON.stringify(updated);

    if (hasLocalStorage) {
      window.localStorage.setItem(RECENT_SEARCHES_KEY, serialized);
    } else {
      memoryFallback.set(RECENT_SEARCHES_KEY, serialized);
    }
    dispatchSyncEvent('recent-searches', newEntry);
  } catch {
    // Ignore storage write errors
  }
}

/**
 * Remove a single local recent search.
 */
export function removeLocalRecentSearch(id) {
  try {
    const list = getLocalRecentSearches(30);
    const updated = list.filter((s) => s.id !== id);
    const serialized = JSON.stringify(updated);
    if (hasLocalStorage) {
      window.localStorage.setItem(RECENT_SEARCHES_KEY, serialized);
    } else {
      memoryFallback.set(RECENT_SEARCHES_KEY, serialized);
    }
    dispatchSyncEvent('recent-searches', { removedId: id });
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
    dispatchSyncEvent('recent-searches', { cleared: true });
  } catch {
    // Ignore
  }
}

// ============================================================================
// Saved Journeys (localStorage backed for visitors and offline resilience)
// ============================================================================

export function getLocalSavedJourneys(limit = 50) {
  try {
    let raw = null;
    if (hasLocalStorage) {
      raw = window.localStorage.getItem(SAVED_JOURNEYS_KEY);
    } else {
      raw = memoryFallback.get(SAVED_JOURNEYS_KEY);
    }
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.slice(0, limit) : [];
  } catch {
    return [];
  }
}

export function saveLocalSavedJourney(journey, notes = '') {
  if (!journey) return;
  try {
    const list = getLocalSavedJourneys(100);
    const journeyId = String(journey.id || journey._id || journey.trainNumber || `j_${Date.now()}`);
    
    // Check if already saved
    const existingIndex = list.findIndex(
      (item) => String(item.journeyId || item.journey?.id || item.journey?._id || item.journey?.trainNumber) === journeyId
    );

    const savedItem = {
      savedJourneyId: `local_saved_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      journeyId,
      name: journey.title || journey.trainName || `${journey.origin?.name || journey.from || 'Origin'} to ${journey.destination?.name || journey.to || 'Dest'}`,
      notes: notes || '',
      savedAt: new Date().toISOString(),
      journey: {
        ...journey,
        id: journeyId,
        _id: journeyId,
      },
    };

    let updated;
    if (existingIndex >= 0) {
      updated = [...list];
      updated[existingIndex] = { ...updated[existingIndex], ...savedItem };
    } else {
      updated = [savedItem, ...list].slice(0, 50);
    }

    const serialized = JSON.stringify(updated);
    if (hasLocalStorage) {
      window.localStorage.setItem(SAVED_JOURNEYS_KEY, serialized);
    } else {
      memoryFallback.set(SAVED_JOURNEYS_KEY, serialized);
    }
    dispatchSyncEvent('saved-journeys', savedItem);
    return savedItem;
  } catch {
    return null;
  }
}

export function removeLocalSavedJourney(journeyId) {
  if (!journeyId) return;
  try {
    const list = getLocalSavedJourneys(100);
    const targetStr = String(journeyId);
    const updated = list.filter(
      (item) =>
        String(item.savedJourneyId) !== targetStr &&
        String(item.journeyId) !== targetStr &&
        String(item.journey?.id) !== targetStr &&
        String(item.journey?._id) !== targetStr &&
        String(item.journey?.trainNumber) !== targetStr
    );
    const serialized = JSON.stringify(updated);
    if (hasLocalStorage) {
      window.localStorage.setItem(SAVED_JOURNEYS_KEY, serialized);
    } else {
      memoryFallback.set(SAVED_JOURNEYS_KEY, serialized);
    }
    dispatchSyncEvent('saved-journeys', { removedId: targetStr });
  } catch {
    // Ignore
  }
}

export function isLocalSavedJourney(journeyId) {
  if (!journeyId) return false;
  try {
    const list = getLocalSavedJourneys(100);
    const targetStr = String(journeyId);
    return list.some(
      (item) =>
        String(item.savedJourneyId) === targetStr ||
        String(item.journeyId) === targetStr ||
        String(item.journey?.id) === targetStr ||
        String(item.journey?._id) === targetStr ||
        String(item.journey?.trainNumber) === targetStr
    );
  } catch {
    return false;
  }
}

export function clearLocalSavedJourneys() {
  try {
    if (hasLocalStorage) {
      window.localStorage.removeItem(SAVED_JOURNEYS_KEY);
    }
    memoryFallback.delete(SAVED_JOURNEYS_KEY);
    dispatchSyncEvent('saved-journeys', { cleared: true });
  } catch {
    // Ignore
  }
}

// ============================================================================
// Favorite Routes (Corridors)
// ============================================================================

const DEFAULT_POPULAR_CORRIDORS = [
  {
    id: 'fav_default_ndls_pnbe',
    origin: 'NDLS',
    destination: 'PNBE',
    originName: 'New Delhi',
    destinationName: 'Patna Jn',
    label: 'High-Frequency Eastern Corridor',
    preferredModes: ['rail'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fav_default_ndls_mmct',
    origin: 'NDLS',
    destination: 'MMCT',
    originName: 'New Delhi',
    destinationName: 'Mumbai Central',
    label: 'Rajdhani Western Trunk Route',
    preferredModes: ['rail'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fav_default_hwh_ndls',
    origin: 'HWH',
    destination: 'NDLS',
    originName: 'Howrah Jn',
    destinationName: 'New Delhi',
    label: 'Grand Chord Express Line',
    preferredModes: ['rail'],
    createdAt: new Date().toISOString(),
  },
];

export function getLocalFavoriteRoutes() {
  try {
    let raw = null;
    if (hasLocalStorage) {
      raw = window.localStorage.getItem(FAVORITE_ROUTES_KEY);
    } else {
      raw = memoryFallback.get(FAVORITE_ROUTES_KEY);
    }
    if (!raw) {
      // Seed default popular corridors so the view is immediately informative
      saveDefaultFavoriteRoutes();
      return DEFAULT_POPULAR_CORRIDORS;
    }
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : DEFAULT_POPULAR_CORRIDORS;
  } catch {
    return DEFAULT_POPULAR_CORRIDORS;
  }
}

function saveDefaultFavoriteRoutes() {
  try {
    const serialized = JSON.stringify(DEFAULT_POPULAR_CORRIDORS);
    if (hasLocalStorage) {
      window.localStorage.setItem(FAVORITE_ROUTES_KEY, serialized);
    } else {
      memoryFallback.set(FAVORITE_ROUTES_KEY, serialized);
    }
  } catch {
    // Ignore
  }
}

export function saveLocalFavoriteRoute({ origin, destination, label = '', preferredModes = ['rail'] }) {
  if (!origin || !destination) return null;
  try {
    const list = getLocalFavoriteRoutes();
    const cleanOrigin = String(origin).trim().toUpperCase();
    const cleanDest = String(destination).trim().toUpperCase();

    // Check duplicate
    const existing = list.find(
      (r) => String(r.origin).toUpperCase() === cleanOrigin && String(r.destination).toUpperCase() === cleanDest
    );
    if (existing) return existing;

    const newRoute = {
      id: `local_fav_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      origin: cleanOrigin,
      destination: cleanDest,
      originName: origin,
      destinationName: destination,
      label: label.trim() || `${cleanOrigin} → ${cleanDest}`,
      preferredModes: Array.isArray(preferredModes) ? preferredModes : ['rail'],
      createdAt: new Date().toISOString(),
    };

    const updated = [newRoute, ...list].slice(0, 30);
    const serialized = JSON.stringify(updated);
    if (hasLocalStorage) {
      window.localStorage.setItem(FAVORITE_ROUTES_KEY, serialized);
    } else {
      memoryFallback.set(FAVORITE_ROUTES_KEY, serialized);
    }
    dispatchSyncEvent('favorite-routes', newRoute);
    return newRoute;
  } catch {
    return null;
  }
}

export function removeLocalFavoriteRoute(id) {
  if (!id) return;
  try {
    const list = getLocalFavoriteRoutes();
    const updated = list.filter((r) => r.id !== id && r._id !== id);
    const serialized = JSON.stringify(updated);
    if (hasLocalStorage) {
      window.localStorage.setItem(FAVORITE_ROUTES_KEY, serialized);
    } else {
      memoryFallback.set(FAVORITE_ROUTES_KEY, serialized);
    }
    dispatchSyncEvent('favorite-routes', { removedId: id });
  } catch {
    // Ignore
  }
}

export function isLocalFavoriteRoute(origin, destination) {
  if (!origin || !destination) return false;
  try {
    const list = getLocalFavoriteRoutes();
    const o = String(origin).trim().toUpperCase();
    const d = String(destination).trim().toUpperCase();
    return list.some((r) => String(r.origin).toUpperCase() === o && String(r.destination).toUpperCase() === d);
  } catch {
    return false;
  }
}

// ============================================================================
// Travel / Journey History (Previously Viewed Itineraries)
// ============================================================================

export function getLocalJourneyHistory(limit = 40) {
  try {
    let raw = null;
    if (hasLocalStorage) {
      raw = window.localStorage.getItem(JOURNEY_HISTORY_KEY);
    } else {
      raw = memoryFallback.get(JOURNEY_HISTORY_KEY);
    }
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.slice(0, limit) : [];
  } catch {
    return [];
  }
}

export function saveLocalJourneyHistory(journey) {
  if (!journey) return;
  try {
    const list = getLocalJourneyHistory(50);
    const journeyId = String(journey.id || journey._id || journey.trainNumber || `j_${Date.now()}`);

    const newEntry = {
      historyId: `local_hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      journeyId,
      viewedAt: new Date().toISOString(),
      journey: {
        ...journey,
        id: journeyId,
        _id: journeyId,
      },
    };

    // Filter out previous view of same journey to avoid duplicates, keeping newest at top
    const filtered = list.filter(
      (item) => String(item.journeyId || item.journey?.id || item.journey?._id || item.journey?.trainNumber) !== journeyId
    );

    const updated = [newEntry, ...filtered].slice(0, 30);
    const serialized = JSON.stringify(updated);
    if (hasLocalStorage) {
      window.localStorage.setItem(JOURNEY_HISTORY_KEY, serialized);
    } else {
      memoryFallback.set(JOURNEY_HISTORY_KEY, serialized);
    }
    dispatchSyncEvent('journey-history', newEntry);
  } catch {
    // Ignore
  }
}

export function clearLocalJourneyHistory() {
  try {
    if (hasLocalStorage) {
      window.localStorage.removeItem(JOURNEY_HISTORY_KEY);
    }
    memoryFallback.delete(JOURNEY_HISTORY_KEY);
    dispatchSyncEvent('journey-history', { cleared: true });
  } catch {
    // Ignore
  }
}

// ============================================================================
// Operational Alerts & Travel Notifications
// ============================================================================

const INITIAL_OPERATIONAL_NOTIFICATIONS = [
  {
    id: 'notif_arp_window',
    type: 'departure_reminder',
    title: 'IRCTC 120-Day Advance Reservation Window Active',
    message: 'Official Indian Railways General quota opens 120 days ahead at 08:00 AM IST. Tatkal AC reservations open at 10:00 AM IST; Tatkal Non-AC opens at 11:00 AM IST daily.',
    read: false,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    actionLabel: 'Check Routes',
  },
  {
    id: 'notif_split_ticketing',
    type: 'saved_journey_update',
    title: 'Same-Train Split Recovery Engine Online',
    message: 'If your through-journey is waitlisted, Yatrai scans intermediate junction quotas (CNB, PRYJ, DDU) so you can stay on the same train with two confirmed tickets.',
    read: false,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    actionLabel: 'Learn More',
  },
  {
    id: 'notif_timetable_sync',
    type: 'schedule_change',
    title: 'Indian Railways Timetable & Berth Cache Synced',
    message: 'Live seat vacancy and PRS timetable feeds are verified for Northern, Eastern, Western, and Central railway divisions.',
    read: false,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    actionLabel: 'View Status',
  },
  {
    id: 'notif_govt_id_rule',
    type: 'info',
    title: 'Mandatory Government Photo ID for Train Travel',
    message: 'Per Indian Railways regulations, at least one passenger on each reservation slip must carry an original government ID (Aadhaar, Voter ID, Passport, or DL).',
    read: true,
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    actionLabel: 'Read Notice',
  },
];

export function getLocalNotifications() {
  try {
    let raw = null;
    if (hasLocalStorage) {
      raw = window.localStorage.getItem(NOTIFICATIONS_KEY);
    } else {
      raw = memoryFallback.get(NOTIFICATIONS_KEY);
    }
    if (!raw) {
      // Seed operational notifications
      const serialized = JSON.stringify(INITIAL_OPERATIONAL_NOTIFICATIONS);
      if (hasLocalStorage) {
        window.localStorage.setItem(NOTIFICATIONS_KEY, serialized);
      } else {
        memoryFallback.set(NOTIFICATIONS_KEY, serialized);
      }
      return INITIAL_OPERATIONAL_NOTIFICATIONS;
    }
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : INITIAL_OPERATIONAL_NOTIFICATIONS;
  } catch {
    return INITIAL_OPERATIONAL_NOTIFICATIONS;
  }
}

export function markLocalNotificationRead(id) {
  try {
    const list = getLocalNotifications();
    const updated = list.map((n) => (n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n));
    const serialized = JSON.stringify(updated);
    if (hasLocalStorage) {
      window.localStorage.setItem(NOTIFICATIONS_KEY, serialized);
    } else {
      memoryFallback.set(NOTIFICATIONS_KEY, serialized);
    }
    dispatchSyncEvent('notifications', { markedReadId: id });
  } catch {
    // Ignore
  }
}

export function markAllLocalNotificationsRead() {
  try {
    const list = getLocalNotifications();
    const updated = list.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() }));
    const serialized = JSON.stringify(updated);
    if (hasLocalStorage) {
      window.localStorage.setItem(NOTIFICATIONS_KEY, serialized);
    } else {
      memoryFallback.set(NOTIFICATIONS_KEY, serialized);
    }
    dispatchSyncEvent('notifications', { allRead: true });
  } catch {
    // Ignore
  }
}

export function deleteLocalNotification(id) {
  try {
    const list = getLocalNotifications();
    const updated = list.filter((n) => n.id !== id);
    const serialized = JSON.stringify(updated);
    if (hasLocalStorage) {
      window.localStorage.setItem(NOTIFICATIONS_KEY, serialized);
    } else {
      memoryFallback.set(NOTIFICATIONS_KEY, serialized);
    }
    dispatchSyncEvent('notifications', { deletedId: id });
  } catch {
    // Ignore
  }
}

export function getUnreadAlertsCount() {
  try {
    const list = getLocalNotifications();
    return list.filter((n) => !n.read).length;
  } catch {
    return 0;
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
  getLocalSavedJourneys,
  saveLocalSavedJourney,
  removeLocalSavedJourney,
  isLocalSavedJourney,
  clearLocalSavedJourneys,
  getLocalFavoriteRoutes,
  saveLocalFavoriteRoute,
  removeLocalFavoriteRoute,
  isLocalFavoriteRoute,
  getLocalJourneyHistory,
  saveLocalJourneyHistory,
  clearLocalJourneyHistory,
  getLocalNotifications,
  markLocalNotificationRead,
  markAllLocalNotificationsRead,
  deleteLocalNotification,
  getUnreadAlertsCount,
};
