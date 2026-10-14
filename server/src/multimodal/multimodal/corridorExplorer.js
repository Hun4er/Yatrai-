import railTransportProvider from '../../providers/transport/rail/rail.provider.js';
import roadTransportProvider from '../../providers/transport/road/road.provider.js';
import locationService from '../../services/locationService.js';
import logger from '../../utils/logger.js';

/**
 * Key intercity railway junctions / transit hubs across Indian travel corridors.
 */
export const MAJOR_TRANSIT_HUBS = [
  // North-East mainline (Delhi - Howrah / Patna corridor)
  { name: 'Varanasi', city: 'Varanasi', code: 'BSB', state: 'Uttar Pradesh', coordinates: [82.9739, 25.3176] },
  { name: 'Kanpur Central', city: 'Kanpur', code: 'CNB', state: 'Uttar Pradesh', coordinates: [80.3319, 26.4499] },
  { name: 'Prayagraj Junction', city: 'Prayagraj', code: 'PRYJ', state: 'Uttar Pradesh', coordinates: [81.8463, 25.4358] },
  { name: 'Lucknow', city: 'Lucknow', code: 'LKO', state: 'Uttar Pradesh', coordinates: [80.9462, 26.8467] },
  { name: 'Pt Deen Dayal Upadhyaya Junction', city: 'Mughalsarai', code: 'DDU', state: 'Uttar Pradesh', coordinates: [83.1167, 25.2833] },

  // North-West mainline (Delhi - Mumbai corridor)
  { name: 'Jaipur', city: 'Jaipur', code: 'JP', state: 'Rajasthan', coordinates: [75.7873, 26.9124] },
  { name: 'Kota Junction', city: 'Kota', code: 'KOTA', state: 'Rajasthan', coordinates: [75.8648, 25.2138] },
  { name: 'Vadodara', city: 'Vadodara', code: 'BRC', state: 'Gujarat', coordinates: [73.1812, 22.3072] },
  { name: 'Ahmedabad', city: 'Ahmedabad', code: 'ADI', state: 'Gujarat', coordinates: [72.5714, 23.0225] },

  // South-East corridor (Chennai - Howrah / Patna)
  { name: 'Vijayawada', city: 'Vijayawada', code: 'BZA', state: 'Andhra Pradesh', coordinates: [80.6480, 16.5062] },
  { name: 'Visakhapatnam', city: 'Visakhapatnam', code: 'VSKP', state: 'Andhra Pradesh', coordinates: [83.2185, 17.6868] },
  { name: 'Bhubaneswar', city: 'Bhubaneswar', code: 'BBS', state: 'Odisha', coordinates: [85.8245, 20.2961] },

  // Central corridor (Delhi - Chennai / Bengaluru)
  { name: 'Bhopal', city: 'Bhopal', code: 'BPL', state: 'Madhya Pradesh', coordinates: [77.4126, 23.2599] },
  { name: 'Nagpur', city: 'Nagpur', code: 'NGP', state: 'Maharashtra', coordinates: [79.0882, 21.1458] },

  // South-West corridor (Mumbai - Bengaluru)
  { name: 'Pune', city: 'Pune', code: 'PUNE', state: 'Maharashtra', coordinates: [73.8567, 18.5204] },
  { name: 'Hubballi', city: 'Hubli', code: 'UBL', state: 'Karnataka', coordinates: [75.1240, 15.3647] },
];

/**
 * Satellite / feeder cities mapping to primary metropolitan rail/transit hubs.
 */
export const SATELLITE_FEEDER_HUBS = {
  sonipat: 'New Delhi',
  panipat: 'New Delhi',
  gurgaon: 'New Delhi',
  gurugram: 'New Delhi',
  noida: 'New Delhi',
  faridabad: 'New Delhi',
  ghaziabad: 'New Delhi',
  rohtak: 'New Delhi',
  meerut: 'New Delhi',
  thane: 'Mumbai',
  'navi mumbai': 'Mumbai',
  kalyan: 'Mumbai',
  panvel: 'Mumbai',
  howrah: 'Kolkata',
  hooghly: 'Kolkata',
  kalyani: 'Kolkata',
  tambaram: 'Chennai',
  avadi: 'Chennai',
  chengalpattu: 'Chennai',
  yelahanka: 'Bengaluru',
  whitefield: 'Bengaluru',
  'electronic city': 'Bengaluru',
};

export class CorridorExplorer {
  /**
   * Identifies candidate intermediate transit hubs that lie along the corridor between origin and destination.
   *
   * @param {Object} origin
   * @param {Object} destination
   * @returns {Array<Object>} List of relevant intermediate hub objects
   */
  findCandidateHubs(origin, destination) {
    if (!origin || !destination) return [];

    const oName = (origin.name || origin.city || '').toLowerCase();
    const dName = (destination.name || destination.city || '').toLowerCase();

    const oCoords = origin.coordinates || [0, 0];
    const dCoords = destination.coordinates || [0, 0];

    const hasCoords = oCoords[0] !== 0 && dCoords[0] !== 0;

    // Direct distance between origin and destination
    const totalDist = hasCoords ? this.computeDistance(oCoords, dCoords) : 1000;

    // Filter hubs that are strictly between origin and destination (progressively along the route)
    const candidates = [];

    for (const hub of MAJOR_TRANSIT_HUBS) {
      const hName = hub.name.toLowerCase();
      const hCity = hub.city.toLowerCase();

      // Skip if hub is origin or destination
      if (oName.includes(hCity) || dName.includes(hCity)) continue;
      if (hCity.includes(oName) || hCity.includes(dName)) continue;

      if (hasCoords && hub.coordinates) {
        const distFromOrigin = this.computeDistance(oCoords, hub.coordinates);
        const distToDest = this.computeDistance(hub.coordinates, dCoords);

        // A valid intermediate hub satisfies:
        // 1. Neither segment is negligible (min 100 km)
        // 2. Sum of segments does not exceed direct distance by more than 35% (detour limit)
        const detourRatio = (distFromOrigin + distToDest) / Math.max(totalDist, 100);

        if (distFromOrigin >= 80 && distToDest >= 80 && detourRatio <= 1.35) {
          candidates.push({ ...hub, detourRatio, distFromOrigin, distToDest });
        }
      } else {
        // Fallback name-based corridor heuristic
        if (
          (oName.includes('delhi') && dName.includes('patna')) ||
          (oName.includes('patna') && dName.includes('delhi'))
        ) {
          if (['varanasi', 'kanpur', 'prayagraj'].includes(hCity)) {
            candidates.push(hub);
          }
        }
      }
    }

    // Sort candidate hubs by lowest detour ratio (most direct route)
    candidates.sort((a, b) => (a.detourRatio || 1) - (b.detourRatio || 1));
    return candidates.slice(0, 3); // Top 3 intermediate hubs
  }

  /**
   * Explores and queries real provider edges for intermediate corridors and feeder links.
   *
   * @param {Object} params
   * @param {Object} params.origin
   * @param {Object} params.destination
   * @param {Date|string} params.departureDate
   * @param {number} [params.passengers=1]
   * @returns {Promise<Array<Object>>} Additional raw normalized candidate legs
   */
  async exploreIntermediateCorridors({ origin, destination, departureDate, passengers = 1 }) {
    const additionalCandidates = [];
    const oName = (origin.name || origin.city || '').toLowerCase().trim();
    const dName = (destination.name || destination.city || '').toLowerCase().trim();

    // 1. Feeder Link: Satellite town to primary transit hub (e.g. Sonipat -> New Delhi)
    let feederHubName = null;
    for (const [satellite, hub] of Object.entries(SATELLITE_FEEDER_HUBS)) {
      if (oName === satellite || oName.includes(satellite)) {
        feederHubName = hub;
        break;
      }
    }

    if (feederHubName && feederHubName.toLowerCase() !== dName) {
      try {
        const feederHubLoc =
          (await locationService.resolveSingle(feederHubName)) ||
          (await locationService.search(feederHubName, { limit: 1 }))?.[0];

        if (feederHubLoc && !feederHubLoc._id?.equals?.(origin._id)) {
          // Query road route from origin to feeder hub
          const roadRes = await roadTransportProvider.search({
            origin,
            destination: feederHubLoc,
            departureDate,
          });
          if (roadRes?.candidates?.length > 0) {
            additionalCandidates.push(...roadRes.candidates);
          }

          // Query rail routes from feeder hub to destination
          const railRes = await railTransportProvider.search({
            origin: feederHubLoc,
            destination,
            departureDate,
            passengers,
          });
          if (railRes?.candidates?.length > 0) {
            additionalCandidates.push(...railRes.candidates.slice(0, 6));
          }
        }
      } catch (feederErr) {
        logger.warn(`[CorridorExplorer] Feeder hub search skipped: ${feederErr.message}`);
      }
    }

    // 2. City Center to Mainline Station Feeder (e.g. Delhi -> New Delhi Railway Station)
    const isGenericCity =
      (['city', 'region', 'district', 'state'].includes(origin.type) || !origin.stationCode) &&
      ['delhi', 'new delhi', 'chennai', 'bangalore', 'bengaluru', 'mumbai', 'kolkata'].some((c) =>
        oName.includes(c)
      );

    if (isGenericCity) {
      const primaryStationName =
        oName.includes('delhi') ? 'New Delhi Railway Station' :
        oName.includes('chennai') ? 'Chennai Central' :
        oName.includes('bangalore') || oName.includes('bengaluru') ? 'KSR Bengaluru Railway Station' :
        oName.includes('mumbai') ? 'Chhatrapati Shivaji Maharaj Terminus' :
        'Howrah Junction';

      if (!dName.includes(primaryStationName.toLowerCase())) {
        let stationDoc = null;
        try {
          stationDoc = await locationService.resolveSingle(primaryStationName);
        } catch {
          stationDoc = null; // Resolution failure is non-fatal; feeder will use fallback name
        }

        const stationDestination = stationDoc || { name: primaryStationName, type: 'railway_station' };
        const baseDate = departureDate instanceof Date ? departureDate : new Date(departureDate);
        const feederSlots = [
          { h: 4, m: 30 },
          { h: 7, m: 30 },
          { h: 10, m: 30 },
          { h: 14, m: 30 },
          { h: 16, m: 30 },
          { h: 18, m: 30 },
          { h: 20, m: 30 },
          { h: 22, m: 0 },
        ];

        for (const slot of feederSlots) {
          const depTime = new Date(baseDate);
          depTime.setUTCHours(slot.h, slot.m, 0, 0);
          const feederDuration = 45;
          const feederArrTime = new Date(depTime.getTime() + feederDuration * 60000);

          additionalCandidates.push({
            origin,
            destination: stationDestination,
            departureTime: depTime,
            arrivalTime: feederArrTime,
            duration: feederDuration,
            totalDistance: 15,
            totalPrice: 250,
            currency: 'INR',
            numberOfTransfers: 0,
            transportModes: ['road'],
            status: 'scheduled',
            source: 'road',
            metadata: {
              provider: 'City Transit Feeder',
              isEstimatedPrice: true,
              pricingType: 'estimated',
              fromStation: origin.name,
              toStation: primaryStationName,
            },
            legs: [
              {
                sequence: 1,
                origin,
                destination: stationDestination,
                mode: 'road',
                departureTime: depTime,
                arrivalTime: feederArrTime,
                duration: feederDuration,
                distance: 15,
                price: 250,
                currency: 'INR',
                vehicle: { type: 'Car / Cab', identifier: 'Road Feeder' },
                service: { name: `Road Feeder to ${primaryStationName}`, operator: 'City Feeder' },
                booking: { status: 'not_bookable' },
                metadata: { isEstimatedPrice: true, fromStation: origin.name, toStation: primaryStationName },
              },
            ],
          });
        }
      }
    }

    // 3. Intermediate Transit Junction Hubs (e.g. Delhi -> Varanasi -> Patna)
    const candidateHubs = this.findCandidateHubs(origin, destination);

    for (const hub of candidateHubs.slice(0, 2)) {
      try {
        let hubDoc = null;
        try {
          hubDoc = await locationService.resolveSingle(hub.city || hub.name);
        } catch {
          hubDoc = null; // Hub resolution failure is non-fatal; fallback hub data will be used
        }

        const hubLoc = {
          id: hubDoc?._id ? hubDoc._id.toString() : (hub.code ? hub.code.toLowerCase() : hub.name.toLowerCase()),
          _id: hubDoc?._id || undefined,
          name: hubDoc?.name || hub.name,
          city: hubDoc?.city || hub.city,
          stationCode: hub.code,
          code: hub.code,
          coordinates: hubDoc?.location?.coordinates || hub.coordinates,
          type: 'railway_station',
        };

        logger.info(`[CorridorExplorer] Querying real multi-modal corridor via intermediate hub: ${hub.name} (${hub.code})`);

        // Leg 1: Origin -> Hub
        const leg1Res = await railTransportProvider.search({
          origin,
          destination: hubLoc,
          departureDate,
          passengers,
        });

        await new Promise((r) => setTimeout(r, 200));

        // Leg 2: Hub -> Destination
        const leg2Res = await railTransportProvider.search({
          origin: hubLoc,
          destination,
          departureDate,
          passengers,
        });

        await new Promise((r) => setTimeout(r, 200));

        if (leg1Res?.candidates?.length > 0) {
          additionalCandidates.push(...leg1Res.candidates);
        }
        if (leg2Res?.candidates?.length > 0) {
          additionalCandidates.push(...leg2Res.candidates);
        }
      } catch (hubErr) {
        logger.warn(`[CorridorExplorer] Hub exploration failed for ${hub.name}: ${hubErr.message}`);
      }
    }

    return additionalCandidates;
  }

  computeDistance([lon1, lat1], [lon2, lat2]) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }
}

export const corridorExplorer = new CorridorExplorer();
export default corridorExplorer;
