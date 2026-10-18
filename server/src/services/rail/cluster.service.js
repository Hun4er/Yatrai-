import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { haversineDistanceKm } from './distance.service.js';
import { findStationByCode } from './stationRegistry.js';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLUSTERS_CONFIG_PATH = path.resolve(__dirname, '../../config/clusters.json');

let clustersData = {};
try {
  const raw = fs.readFileSync(CLUSTERS_CONFIG_PATH, 'utf8');
  clustersData = JSON.parse(raw);
} catch (err) {
  logger.error(`[ClusterService] Failed to load clusters config from ${CLUSTERS_CONFIG_PATH}: ${err.message}`);
}

/**
 * Station details index by uppercase station code.
 */
const stationIndex = new Map();
const stationToClusterMap = new Map();

for (const [clusterKey, clusterInfo] of Object.entries(clustersData)) {
  for (const stn of clusterInfo.stations || []) {
    const code = String(stn.code).toUpperCase().trim();
    stationIndex.set(code, {
      code,
      name: stn.name,
      lat: stn.lat,
      lon: stn.lon,
      city: clusterInfo.name,
      clusterKey,
    });
    stationToClusterMap.set(code, {
      clusterKey,
      clusterName: clusterInfo.name,
      primaryCode: clusterInfo.primaryCode,
    });
  }
}

/**
 * Returns station metadata (code, name, lat, lon) from clusters or station registry.
 */
export function getStationDetails(stationCode) {
  if (!stationCode) return null;
  const upper = String(stationCode).toUpperCase().trim();
  if (stationIndex.has(upper)) {
    return stationIndex.get(upper);
  }
  const reg = findStationByCode(upper);
  if (reg) {
    return {
      code: upper,
      name: reg.name,
      lat: reg.coordinates?.[1] || null,
      lon: reg.coordinates?.[0] || null,
      city: reg.city || null,
      clusterKey: null,
    };
  }
  return { code: upper, name: upper, lat: null, lon: null, city: null, clusterKey: null };
}

/**
 * Returns cluster information for a given station code or city name.
 */
export function getClusterForStation(stationCodeOrCity) {
  if (!stationCodeOrCity) return null;
  const upper = String(stationCodeOrCity).toUpperCase().trim();
  const lower = String(stationCodeOrCity).toLowerCase().trim();

  if (stationToClusterMap.has(upper)) {
    const meta = stationToClusterMap.get(upper);
    return clustersData[meta.clusterKey] || null;
  }

  for (const [key, cluster] of Object.entries(clustersData)) {
    if (key.toLowerCase() === lower || cluster.name.toLowerCase() === lower) {
      return cluster;
    }
  }

  return null;
}

/**
 * Returns all station codes in the cluster for the given station code.
 * If not in any cluster, returns [stationCode].
 */
export function getClusterStationCodes(stationCode) {
  if (!stationCode) return [];
  const upper = String(stationCode).toUpperCase().trim();
  const cluster = getClusterForStation(upper);
  if (cluster && Array.isArray(cluster.stations)) {
    // Return primary station first, then others
    const codes = cluster.stations.map((s) => s.code.toUpperCase());
    const reordered = [upper, ...codes.filter((c) => c !== upper)];
    return Array.from(new Set(reordered));
  }
  return [upper];
}

/**
 * Calculates geographic distance in km between two stations.
 */
export function calculateStationDistanceKm(codeA, codeB) {
  if (!codeA || !codeB) return 0;
  const upperA = String(codeA).toUpperCase().trim();
  const upperB = String(codeB).toUpperCase().trim();
  if (upperA === upperB) return 0;

  const stnA = getStationDetails(upperA);
  const stnB = getStationDetails(upperB);

  if (stnA?.lat && stnA?.lon && stnB?.lat && stnB?.lon) {
    return haversineDistanceKm([stnA.lon, stnA.lat], [stnB.lon, stnB.lat]);
  }
  return 0;
}

/**
 * Evaluates whether an actual station differs from the requested station.
 * Returns label and distance info if shifted.
 */
export function getStationDifference(requestedCode, actualCode, role = 'origin') {
  const req = String(requestedCode || '').toUpperCase().trim();
  const act = String(actualCode || '').toUpperCase().trim();

  if (!req || !act || req === act) {
    return null;
  }

  const actDetails = getStationDetails(act);
  const reqDetails = getStationDetails(req);
  const distanceKm = calculateStationDistanceKm(req, act);

  const actName = actDetails?.name || act;
  const reqName = reqDetails?.name || req;

  const actionText = role === 'origin' ? 'Departing from' : 'Arriving at';
  const label = distanceKm > 0
    ? `${actionText} nearby ${actName} (${act}), ${distanceKm} km from ${reqName} (${req})`
    : `${actionText} nearby ${actName} (${act})`;

  return {
    isShift: true,
    role,
    requestedCode: req,
    requestedName: reqName,
    actualCode: act,
    actualName: actName,
    distanceKm,
    label,
  };
}

/**
 * Returns tiered cluster pairs for station pairs:
 * - Tier 1: Primary requested pair only
 * - Tier 2: (other origin cluster stations -> primary dest) and (primary origin -> other dest cluster stations),
 *           filtered by distance <= maxDistance (default 25 km).
 * - Tier 3: remaining pairs (other origin -> other dest), filtered by distance <= maxDistance.
 *
 * @param {string} originCode
 * @param {string} destCode
 * @param {Object} [options]
 * @returns {{ tier1: Array, tier2: Array, tier3: Array }}
 */
export function getTieredClusterPairs(originCode, destCode, options = {}) {
  const upperOrigin = String(originCode || '').toUpperCase().trim();
  const upperDest = String(destCode || '').toUpperCase().trim();
  const maxDistance = options.maxClusterDistanceKm ?? config.railRecovery?.maxClusterDistanceKm ?? 25;

  const fromClusters = getClusterStationCodes(upperOrigin);
  const toClusters = getClusterStationCodes(upperDest);

  const tier1 = [{ from: upperOrigin, to: upperDest, tier: 'tier1', isPrimary: true, distanceKm: 0 }];

  const tier2 = [];
  // other origin cluster stations -> primary dest
  for (const f of fromClusters) {
    if (f === upperOrigin) continue;
    const dist = calculateStationDistanceKm(upperOrigin, f);
    if (dist <= maxDistance) {
      tier2.push({ from: f, to: upperDest, tier: 'tier2', isPrimary: false, distanceKm: dist });
    }
  }
  // primary origin -> other dest cluster stations
  for (const t of toClusters) {
    if (t === upperDest) continue;
    const dist = calculateStationDistanceKm(upperDest, t);
    if (dist <= maxDistance) {
      tier2.push({ from: upperOrigin, to: t, tier: 'tier2', isPrimary: false, distanceKm: dist });
    }
  }

  const tier3 = [];
  // other origin cluster stations -> other dest cluster stations
  for (const f of fromClusters) {
    if (f === upperOrigin) continue;
    const distF = calculateStationDistanceKm(upperOrigin, f);
    if (distF > maxDistance) continue;
    for (const t of toClusters) {
      if (t === upperDest) continue;
      const distT = calculateStationDistanceKm(upperDest, t);
      if (distT > maxDistance) continue;
      tier3.push({ from: f, to: t, tier: 'tier3', isPrimary: false, distanceKm: distF + distT });
    }
  }

  return { tier1, tier2, tier3 };
}

export default {
  getStationDetails,
  getClusterForStation,
  getClusterStationCodes,
  calculateStationDistanceKm,
  getStationDifference,
  getTieredClusterPairs,
};
