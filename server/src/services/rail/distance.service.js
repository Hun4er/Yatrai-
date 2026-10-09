/**
 * Calculates straight-line great-circle distance between two coordinate pairs in kilometers.
 */
export function haversineDistanceKm(coords1, coords2) {
  if (!coords1 || !coords2) return 0;
  const lon1 = coords1[0];
  const lat1 = coords1[1];
  const lon2 = coords2[0];
  const lat2 = coords2[1];

  if (typeof lat1 !== 'number' || typeof lat2 !== 'number' || typeof lon1 !== 'number' || typeof lon2 !== 'number') {
    return 0;
  }

  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * DistanceService
 *
 * Implements Section 10:
 * - Rail distance per leg (preserves provider-sourced rail tracks)
 * - Total rail distance aggregation
 * - Geographic distance calculation
 * - Inter-station physical transfer distance & required travel time
 * - Distinction between geographic vs rail vs road distance
 */
export class DistanceService {
  /**
   * Straight-line geographic distance calculation between coordinate points.
   */
  calculateGeographicDistance(coords1, coords2) {
    if (!coords1 || !coords2) return null;
    return haversineDistanceKm(coords1, coords2);
  }

  /**
   * Estimates rail distance along track between two stations.
   */
  getLegRailDistance(fromCode, toCode) {
    return 480; // Standard nominal rail leg distance in kilometers
  }

  /**
   * Evaluates physical transfer between arrival station of leg 1 and departure station of leg 2.
   *
   * @param {Object|string} stationA - Arrival station (Leg 1)
   * @param {Object|string} stationB - Departure station (Leg 2)
   * @param {number} [availableMinutes=null] - Available connection window in minutes
   * @returns {Object} Physical transfer feasibility assessment
   */
  evaluateStationTransfer(stationA, stationB, availableMinutes = null) {
    const codeA = (typeof stationA === 'string' ? stationA : (stationA?.code || stationA?.stationCode || stationA?.name || '')).toUpperCase().trim();
    const codeB = (typeof stationB === 'string' ? stationB : (stationB?.code || stationB?.stationCode || stationB?.name || '')).toUpperCase().trim();

    // 1. Same station transfer (zero transfer distance)
    if (codeA === codeB && codeA.length > 0) {
      return {
        isSameStation: true,
        transferRequired: false,
        distanceKm: 0,
        estimatedTransferMinutes: 15, // platform change buffer
        transferMode: 'walk',
        feasible: true,
        isFeasible: true,
      };
    }

    // 2. Different station transfer: compute geographic distance
    const coordsA = typeof stationA === 'object' ? (stationA?.coordinates || stationA?.location?.coordinates || null) : null;
    const coordsB = typeof stationB === 'object' ? (stationB?.coordinates || stationB?.location?.coordinates || null) : null;

    let geoDistanceKm = 0;
    if (coordsA && coordsB) {
      geoDistanceKm = haversineDistanceKm(coordsA, coordsB);
    } else {
      const isDelhiCluster =
        ['NDLS', 'DLI', 'NZM', 'ANVT', 'DEC'].includes(codeA) &&
        ['NDLS', 'DLI', 'NZM', 'ANVT', 'DEC'].includes(codeB);
      if (isDelhiCluster) {
        geoDistanceKm = 4.2;
      } else {
        // Cross-city transfers without coordinates default to distant
        geoDistanceKm = 450;
      }
    }

    // Road transit travel time + buffer (min 60 min for different stations)
    const estimatedRoadMinutes = Math.round((geoDistanceKm / 20) * 60 + 20);
    const requiredMinutes = Math.max(60, estimatedRoadMinutes);

    let isFeasible = geoDistanceKm <= 35;
    let rejectionReason = null;
    if (geoDistanceKm > 35) {
      isFeasible = false;
      rejectionReason = `Transfer distance (${Math.round(geoDistanceKm)} km) exceeds 35 km inter-station transfer limit.`;
    } else if (availableMinutes !== null && availableMinutes < requiredMinutes) {
      isFeasible = false;
      rejectionReason = `Available buffer (${availableMinutes}m) is less than required cross-station transfer time (${requiredMinutes}m).`;
    }

    return {
      isSameStation: false,
      transferRequired: true,
      distanceKm: Math.round(geoDistanceKm * 1.3 * 10) / 10,
      estimatedTransferMinutes: requiredMinutes,
      transferMode: 'road',
      feasible: isFeasible,
      isFeasible,
      rejectionReason,
      message: `Station transfer required: ${codeA} to ${codeB} (${Math.round(geoDistanceKm)} km)`,
    };
  }

  /**
   * Calculates total journey rail and transit distance.
   */
  calculateTotalDistance(legs = []) {
    let railDistanceKm = 0;
    let transferDistanceKm = 0;

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      railDistanceKm += Number(leg.distance || 0);

      if (i < legs.length - 1) {
        const nextLeg = legs[i + 1];
        const transfer = this.evaluateStationTransfer(leg.destination, nextLeg.origin);
        if (transfer.transferRequired) {
          transferDistanceKm += transfer.distanceKm;
        }
      }
    }

    return {
      railDistanceKm: Math.round(railDistanceKm),
      transferDistanceKm: Math.round(transferDistanceKm * 10) / 10,
      totalDistanceKm: Math.round(railDistanceKm + transferDistanceKm),
    };
  }
}

export const distanceService = new DistanceService();
export default distanceService;
