/**
 * Mapbox Geographic Utilities (Phase 12)
 *
 * Provides pure validation, bounds calculation, and visual styling helpers.
 * Independent of Mapbox and React.
 */

/**
 * Validates a GeoJSON coordinate pair [longitude, latitude].
 *
 * @param {Array<number>} coord
 * @returns {boolean}
 */
export function isValidCoordinate(coord) {
  if (!Array.isArray(coord) || coord.length < 2) return false;
  const [lng, lat] = coord;
  return (
    typeof lng === 'number' &&
    typeof lat === 'number' &&
    !isNaN(lng) &&
    !isNaN(lat) &&
    isFinite(lng) &&
    isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

/**
 * Calculates geographic bounding box for an array of [lng, lat] coordinates.
 * Returns [[minLng, minLat], [maxLng, maxLat]] or null if invalid/empty.
 *
 * @param {Array<Array<number>>} coordinates
 * @returns {Array<Array<number>>|null}
 */
export function calculateBounds(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null;

  const valid = coordinates.filter(isValidCoordinate);
  if (valid.length === 0) return null;

  let minLng = valid[0][0];
  let minLat = valid[0][1];
  let maxLng = valid[0][0];
  let maxLat = valid[0][1];

  for (let i = 1; i < valid.length; i++) {
    const [lng, lat] = valid[i];
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  // If all points are identical (or single point), add a small buffer so fitBounds does not fail
  if (minLng === maxLng && minLat === maxLat) {
    const delta = 0.05;
    return [
      [minLng - delta, minLat - delta],
      [maxLng + delta, maxLat + delta],
    ];
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/**
 * Visual styling palette for transport modes following Yatrai Design System.
 */
export const MODE_COLORS = {
  rail: '#32D583', // Emerald green
  train: '#32D583',
  road: '#F5B942', // Amber gold
  car: '#F5B942',
  cab: '#F5B942',
  bus: '#4EA1FF', // Brand Info blue
  flight: '#FF5C67', // Coral pink
  air: '#FF5C67',
  walk: '#A7AFBD', // Secondary text grey
  default: '#7C5CFF', // Brand primary purple
};

/**
 * Get color hex code for a transport mode.
 *
 * @param {string} mode
 * @returns {string} Hex color
 */
export function getModeColor(mode) {
  if (!mode) return MODE_COLORS.default;
  const key = String(mode).toLowerCase();
  return MODE_COLORS[key] || MODE_COLORS.default;
}

/**
 * Line dash patterns for transport modes.
 * Returns empty array for solid line, or [dash, gap] array.
 *
 * @param {string} mode
 * @returns {Array<number>}
 */
export function getModeDashArray(mode) {
  if (!mode) return [];
  const key = String(mode).toLowerCase();
  switch (key) {
    case 'flight':
    case 'air':
      return [2, 2];
    case 'bus':
      return [3, 1];
    case 'walk':
      return [1, 2];
    default:
      return []; // Solid line for rail and road
  }
}

/**
 * Stop point type styling.
 */
export const STOP_COLORS = {
  origin: '#32D583', // Green start
  destination: '#7C5CFF', // Brand purple target
  transfer: '#F5B942', // Amber transfer
  waypoint: '#4EA1FF', // Blue waypoint
  default: '#A7AFBD',
};

export default {
  isValidCoordinate,
  calculateBounds,
  MODE_COLORS,
  STOP_COLORS,
  getModeColor,
  getModeDashArray,
};
