import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { LOCATION_TYPES } from '../../models/Location.js';

/**
 * Normalizes provider place types into canonical Yatrai LOCATION_TYPES.
 *
 * @param {Object} item - Raw Nominatim item
 * @returns {string} Canonical location type
 */
export function mapProviderType(item = {}) {
  const osmClass = (item.class || item.category || '').toLowerCase();
  const osmType = (item.type || '').toLowerCase();
  const displayName = (item.display_name || '').toLowerCase();

  // 1. Airports
  if (
    osmClass === 'aeroway' ||
    osmType === 'aerodrome' ||
    osmType === 'airport' ||
    osmClass === 'airport' ||
    /airport|aerodrome|airfield/i.test(displayName)
  ) {
    return 'airport';
  }

  // 2. Railway Stations
  if (
    osmClass === 'railway' ||
    osmType === 'station' ||
    osmType === 'halt' ||
    osmType === 'stop' ||
    /junction|railway\s*station|train\s*station|railway\s*terminal/i.test(displayName)
  ) {
    if (/bus/i.test(displayName) || osmType === 'bus_station') {
      return 'bus_station';
    }
    return 'railway_station';
  }

  // 3. Bus Stations
  if (
    osmClass === 'bus' ||
    osmType === 'bus_station' ||
    osmType === 'bus_stop' ||
    /bus\s*(?:stand|station|terminal)/i.test(displayName)
  ) {
    return 'bus_station';
  }

  // 4. Highways, Expressways & Roads
  if (
    osmClass === 'highway' ||
    ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'expressway'].includes(osmType) ||
    /expressway|highway|bypass|nh-\d|tollway/i.test(displayName)
  ) {
    return 'highway';
  }
  if (
    osmClass === 'highway' &&
    ['residential', 'service', 'track', 'unclassified', 'road', 'street'].includes(osmType)
  ) {
    return 'road';
  }
  if (osmClass !== 'building' && ['road', 'street'].includes(osmType)) {
    return 'road';
  }

  // 5. Cities / Municipalities
  if (
    item.addresstype === 'city' ||
    (osmClass === 'place' && ['city', 'municipality'].includes(osmType)) ||
    (osmClass === 'boundary' && osmType === 'administrative' && item.place_rank === 16)
  ) {
    return 'city';
  }

  // 6. Towns / Villages
  if (
    item.addresstype === 'town' ||
    item.addresstype === 'village' ||
    (osmClass === 'place' && ['town', 'village', 'hamlet', 'suburb', 'neighbourhood'].includes(osmType))
  ) {
    return 'town';
  }

  // 7. States / Regions / Districts
  if (
    (osmClass === 'boundary' && osmType === 'administrative') ||
    ['state', 'region', 'district', 'county', 'province'].includes(osmType)
  ) {
    return 'region';
  }

  // 8. Countries
  if (osmType === 'country' || (osmClass === 'place' && osmType === 'country')) {
    return 'country';
  }

  // 9. Universities, Landmarks, POIs
  if (
    ['amenity', 'tourism', 'historic', 'leisure'].includes(osmClass) ||
    ['university', 'college', 'school', 'hospital', 'monument', 'museum'].includes(osmType)
  ) {
    return 'landmark';
  }

  // 10. Addresses / Buildings
  if (['building', 'address'].includes(osmClass)) {
    return 'address';
  }

  // Fallback: match against valid canonical types or default to poi
  if (LOCATION_TYPES.includes(osmType)) {
    return osmType;
  }

  return 'poi';
}

/**
 * Validates and transforms a raw Nominatim item into canonical Yatrai structure.
 *
 * @param {Object} item
 * @returns {Object|null} Canonical location object or null if invalid
 */
export function normalizeNominatimResult(item) {
  if (!item || typeof item !== 'object') return null;

  const lat = parseFloat(item.lat);
  const lng = parseFloat(item.lon);

  // Mandatory coordinate validation
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    logger.warn('Skipping geocoding result with invalid coordinates:', {
      lat: item.lat,
      lon: item.lon,
    });
    return null;
  }

  const address = item.address || {};
  const canonicalType = mapProviderType(item);

  // Extract clean primary name
  let rawName =
    item.name ||
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    item.display_name?.split(',')[0]?.trim() ||
    'Unknown Location';

  // If name has municipal suffix like "Chennai Corporation" or "Delhi Municipal Corporation", clean it for city search
  if (/corporation|municipal/i.test(rawName) && address.state_district) {
    rawName = address.state_district;
  } else {
    rawName = rawName.replace(/\s+(?:Corporation|Municipal\s*Corporation)$/i, '').trim();
  }

  const name = rawName.trim();
  const city =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    address.state_district ||
    name;
  const state = address.state || address.region || null;
  const country = address.country || 'India';
  const countryCode = (address.country_code || 'IN').toUpperCase();

  const placeId = item.place_id
    ? `nominatim:${item.place_id}`
    : item.osm_id
      ? `osm:${item.osm_id}`
      : null;

  return {
    name,
    displayName: item.display_name || `${name}, ${state || ''}, ${country}`.replace(', ,', ','),
    type: canonicalType,
    city: city.replace(/\s+(?:Corporation|Municipal\s*Corporation)$/i, '').trim(),
    state: state ? state.trim() : null,
    country: country.trim(),
    countryCode,
    location: {
      type: 'Point',
      // Strict GeoJSON order: [longitude, latitude]
      coordinates: [lng, lat],
    },
    latitude: lat,
    longitude: lng,
    source: 'nominatim',
    placeId,
    timezone: 'Asia/Kolkata',
    aliases: item.namedetails ? Object.values(item.namedetails).filter(Boolean) : [],
    metadata: {
      provider: 'nominatim',
      osmId: item.osm_id || null,
      osmType: item.osm_type || null,
      category: item.category || item.class || null,
      importance: typeof item.importance === 'number' ? item.importance : null,
      addresstype: item.addresstype || null,
    },
  };
}

/**
 * Nominatim Provider Adapter
 * Performs remote HTTP geocoding queries with timeout, validation, and error translation.
 */
export const nominatimAdapter = {
  /**
   * Search for locations matching text query.
   *
   * @param {string} query
   * @param {Object} [options]
   * @param {number} [options.limit=5]
   * @param {Function} [options.fetchFn] - Custom fetch function for testing/mocking
   * @returns {Promise<Array<Object>>} Normalized canonical location objects
   */
  async search(query, options = {}) {
    const { limit = 5, fetchFn = globalThis.fetch } = options;
    const cleanQuery = (query || '').trim();

    if (!cleanQuery) return [];

    const baseUrl = config.geocoding.baseUrl.replace(/\/+$/, '');
    const url = new URL(`${baseUrl}/search`);
    url.searchParams.set('q', cleanQuery);
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', String(Math.min(limit, 10)));
    url.searchParams.set('countrycodes', 'in'); // Prioritize India while allowing broad matches

    if (config.geocoding.apiKey) {
      url.searchParams.set('key', config.geocoding.apiKey);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.geocoding.timeoutMs);

    try {
      logger.debug(`Querying geocoding provider: ${cleanQuery}`);
      const response = await fetchFn(url.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': config.geocoding.userAgent,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429) {
          const err = new Error(
            'Geocoding provider rate limit exceeded. Please try again shortly.'
          );
          err.status = 429;
          err.code = 'PROVIDER_RATE_LIMITED';
          throw err;
        }

        if (response.status === 401 || response.status === 403) {
          const err = new Error('Geocoding provider authentication failure.');
          err.status = 502;
          err.code = 'PROVIDER_AUTH_ERROR';
          throw err;
        }

        const err = new Error(`Geocoding provider error (status: ${response.status})`);
        err.status = 502;
        err.code = 'PROVIDER_ERROR';
        throw err;
      }

      let data;
      try {
        data = await response.json();
      } catch {
        const err = new Error('Geocoding provider returned a malformed response.');
        err.status = 502;
        err.code = 'PROVIDER_MALFORMED_RESPONSE';
        throw err;
      }

      if (!Array.isArray(data)) {
        logger.warn('Geocoding provider returned non-array payload:', data);
        return [];
      }

      // Validate and normalize all results
      const canonicalLocations = data.map(normalizeNominatimResult).filter((loc) => loc !== null);

      return canonicalLocations;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        const timeoutErr = new Error('Geocoding provider request timed out.');
        timeoutErr.status = 504;
        timeoutErr.code = 'PROVIDER_TIMEOUT';
        throw timeoutErr;
      }

      // If already a translated provider error, rethrow
      if (error.code?.startsWith('PROVIDER_')) {
        throw error;
      }

      // Connection / network failure
      const networkErr = new Error('Failed to connect to location geocoding provider.');
      networkErr.status = 502;
      networkErr.code = 'PROVIDER_NETWORK_ERROR';
      networkErr.originalError = error;
      throw networkErr;
    }
  },
};

export default nominatimAdapter;
