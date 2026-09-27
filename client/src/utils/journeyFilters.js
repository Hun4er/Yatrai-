/**
 * Pure Journey Filtering Utilities for Yatrai
 *
 * Implements deterministic, side-effect free, testable filtering logic
 * operating over canonical Journey objects returned from the backend.
 * Never calls external APIs, never mutates source data.
 */

export const DEPARTURE_TIME_BUCKETS = {
  ANY: 'any',
  EARLY_MORNING: 'early_morning', // 00:00 - 05:59
  MORNING: 'morning',             // 06:00 - 11:59
  AFTERNOON: 'afternoon',         // 12:00 - 17:59
  EVENING: 'evening',             // 18:00 - 23:59
};

export const DEPARTURE_TIME_BUCKET_CONFIG = [
  { id: 'any', label: 'Any time', startHour: 0, endHour: 24, description: 'All departures' },
  { id: 'early_morning', label: 'Early Morning', startHour: 0, endHour: 6, description: '00:00 – 06:00' },
  { id: 'morning', label: 'Morning', startHour: 6, endHour: 12, description: '06:00 – 12:00' },
  { id: 'afternoon', label: 'Afternoon', startHour: 12, endHour: 18, description: '12:00 – 18:00' },
  { id: 'evening', label: 'Evening / Night', startHour: 18, endHour: 24, description: '18:00 – 24:00' },
];

export const TRANSFER_FILTER_OPTIONS = [
  { id: 'any', label: 'Any' },
  { id: '0', label: 'Direct (0)' },
  { id: '1', label: '1 Transfer' },
  { id: '2+', label: '2+ Transfers' },
];

/**
 * Returns default initial filter state.
 */
export function getDefaultFilters() {
  return {
    minPrice: null,
    maxPrice: null,
    maxDuration: null,
    transfers: 'any',
    transportModes: [], // Empty means all allowed
    departureTimeBucket: 'any',
  };
}

/**
 * Derives available bounds and options from the canonical journeys array.
 *
 * @param {Array<Object>} journeys - Array of canonical journeys
 * @returns {Object} { minPrice, maxPrice, minDuration, maxDuration, availableModes, currencies }
 */
export function deriveFilterBounds(journeys = []) {
  if (!Array.isArray(journeys) || journeys.length === 0) {
    return {
      minPrice: 0,
      maxPrice: 0,
      minDuration: 0,
      maxDuration: 0,
      availableModes: [],
      currencies: ['INR'],
    };
  }

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let minDuration = Infinity;
  let maxDuration = -Infinity;
  const modesSet = new Set();
  const currenciesSet = new Set();

  for (const j of journeys) {
    const price = Number(j.totalPrice) || 0;
    const duration = Number(j.duration) || 0;

    if (price < minPrice) minPrice = price;
    if (price > maxPrice) maxPrice = price;

    if (duration < minDuration) minDuration = duration;
    if (duration > maxDuration) maxDuration = duration;

    if (Array.isArray(j.transportModes)) {
      for (const m of j.transportModes) {
        if (m) modesSet.add(m.toLowerCase());
      }
    }

    if (j.currency) currenciesSet.add(j.currency);
  }

  return {
    minPrice: minPrice === Infinity ? 0 : minPrice,
    maxPrice: maxPrice === -Infinity ? 0 : maxPrice,
    minDuration: minDuration === Infinity ? 0 : minDuration,
    maxDuration: maxDuration === -Infinity ? 0 : maxDuration,
    availableModes: Array.from(modesSet),
    currencies: Array.from(currenciesSet),
  };
}

/**
 * Evaluates whether a journey's departure timestamp matches a given time bucket.
 */
export function matchesDepartureTime(departureTime, bucket) {
  if (!bucket || bucket === 'any') return true;
  if (!departureTime) return false;

  try {
    const d = new Date(departureTime);
    if (isNaN(d.getTime())) return false;
    const hour = d.getHours();

    switch (bucket) {
      case 'early_morning':
        return hour >= 0 && hour < 6;
      case 'morning':
        return hour >= 6 && hour < 12;
      case 'afternoon':
        return hour >= 12 && hour < 18;
      case 'evening':
        return hour >= 18 && hour < 24;
      default:
        return true;
    }
  } catch {
    return false;
  }
}

/**
 * Evaluates whether a journey's transfer count matches the transfer filter.
 */
export function matchesTransfers(numberOfTransfers, transferFilter) {
  if (!transferFilter || transferFilter === 'any') return true;
  const transfers = Number(numberOfTransfers) || 0;

  if (transferFilter === '0') return transfers === 0;
  if (transferFilter === '1') return transfers === 1;
  if (transferFilter === '2+') return transfers >= 2;

  return true;
}

/**
 * Evaluates whether a journey's transport modes match selected mode filters.
 * In a multimodal journey (e.g. Train + Road), matching ANY selected mode satisfies the filter.
 */
export function matchesTransportModes(journeyModes = [], selectedModes = []) {
  if (!Array.isArray(selectedModes) || selectedModes.length === 0) return true;
  if (!Array.isArray(journeyModes) || journeyModes.length === 0) return false;

  const normalizedSelected = selectedModes.map((m) => m.toLowerCase());
  const normalizedJourney = journeyModes.map((m) => m.toLowerCase());

  return normalizedSelected.some((mode) => normalizedJourney.includes(mode));
}

/**
 * Pure filter function: filters an array of journeys according to the provided filter state.
 *
 * @param {Array<Object>} journeys - Canonical journeys
 * @param {Object} filters - Active filter settings
 * @returns {Array<Object>} Filtered journeys (new array, original objects preserved)
 */
export function filterJourneys(journeys = [], filters = {}) {
  if (!Array.isArray(journeys) || journeys.length === 0) {
    return [];
  }

  const {
    minPrice,
    maxPrice,
    maxDuration,
    transfers,
    transportModes,
    departureTimeBucket,
  } = filters;

  return journeys.filter((journey) => {
    // 1. Price Filtering (numeric comparison)
    const price = Number(journey.totalPrice) || 0;
    if (minPrice !== null && minPrice !== undefined && price < Number(minPrice)) {
      return false;
    }
    if (maxPrice !== null && maxPrice !== undefined && price > Number(maxPrice)) {
      return false;
    }

    // 2. Duration Filtering (numeric comparison in minutes)
    const duration = Number(journey.duration) || 0;
    if (maxDuration !== null && maxDuration !== undefined && duration > Number(maxDuration)) {
      return false;
    }

    // 3. Transfers Filtering
    if (transfers && transfers !== 'any') {
      if (!matchesTransfers(journey.numberOfTransfers, transfers)) {
        return false;
      }
    }

    // 4. Transport Mode Filtering
    if (Array.isArray(transportModes) && transportModes.length > 0) {
      if (!matchesTransportModes(journey.transportModes, transportModes)) {
        return false;
      }
    }

    // 5. Departure Time Filtering
    if (departureTimeBucket && departureTimeBucket !== 'any') {
      if (!matchesDepartureTime(journey.departureTime, departureTimeBucket)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Count active filters compared against default dataset bounds.
 */
export function countActiveFilters(filters = {}, bounds = {}) {
  let count = 0;

  if (
    filters.minPrice !== null &&
    filters.minPrice !== undefined &&
    bounds.minPrice !== undefined &&
    filters.minPrice > bounds.minPrice
  ) {
    count++;
  }

  if (
    filters.maxPrice !== null &&
    filters.maxPrice !== undefined &&
    bounds.maxPrice !== undefined &&
    filters.maxPrice < bounds.maxPrice
  ) {
    count++;
  }

  if (
    filters.maxDuration !== null &&
    filters.maxDuration !== undefined &&
    bounds.maxDuration !== undefined &&
    filters.maxDuration < bounds.maxDuration
  ) {
    count++;
  }

  if (filters.transfers && filters.transfers !== 'any') {
    count++;
  }

  if (Array.isArray(filters.transportModes) && filters.transportModes.length > 0) {
    count++;
  }

  if (filters.departureTimeBucket && filters.departureTimeBucket !== 'any') {
    count++;
  }

  return count;
}
