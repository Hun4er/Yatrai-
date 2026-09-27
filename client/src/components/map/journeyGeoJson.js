import { isValidCoordinate, calculateBounds } from './mapUtils.js';

/**
 * Pure GeoJSON Adapter for Canonical Yatrai Journeys (Phase 12)
 *
 * Converts canonical Journey and JourneyLeg models into GeoJSON FeatureCollections.
 * Strictly decoupled from Mapbox GL JS and React.
 *
 * @param {Object} journey - Canonical journey object
 * @param {number|null} [selectedLegSequence=null] - Currently focused leg sequence
 * @returns {Object} Structured GeoJSON collections and geographic bounds
 */
export function journeyToGeoJSON(journey, selectedLegSequence = null) {
  const emptyResult = {
    routes: { type: 'FeatureCollection', features: [] },
    stops: { type: 'FeatureCollection', features: [] },
    allCoordinates: [],
    bounds: null,
    hasValidGeometry: false,
    pointCount: 0,
  };

  if (!journey || typeof journey !== 'object') {
    return emptyResult;
  }

  const legs = Array.isArray(journey.legs) ? journey.legs : [];
  const routeFeatures = [];
  const stopFeatures = [];
  const allCoordinates = [];

  // 1. Process Route LineStrings for each leg
  legs.forEach((leg, idx) => {
    const sequence = leg.sequence ?? idx + 1;
    const isSelected = selectedLegSequence !== null && sequence === Number(selectedLegSequence);

    let legCoordinates = [];
    let isExact = false;

    // Level 1: Check for exact route geometry (LineString coordinates)
    const rawGeometry =
      leg.geometry?.coordinates ||
      leg.routeGeometry?.coordinates ||
      leg.metadata?.geometry?.coordinates;

    if (Array.isArray(rawGeometry) && rawGeometry.length >= 2) {
      const validPoints = rawGeometry.filter(isValidCoordinate);
      if (validPoints.length >= 2) {
        legCoordinates = validPoints;
        isExact = true;
      }
    }

    // Level 2: Fallback to known endpoints of the leg
    if (legCoordinates.length === 0) {
      const originCoord = leg.origin?.coordinates || leg.origin?.location?.coordinates;
      const destCoord = leg.destination?.coordinates || leg.destination?.location?.coordinates;

      if (isValidCoordinate(originCoord) && isValidCoordinate(destCoord)) {
        legCoordinates = [originCoord, destCoord];
      }
    }

    if (legCoordinates.length >= 2) {
      legCoordinates.forEach((c) => allCoordinates.push(c));

      routeFeatures.push({
        type: 'Feature',
        id: leg.id || `leg-${sequence}`,
        properties: {
          type: 'route',
          legId: leg.id || `leg-${sequence}`,
          sequence,
          mode: (leg.mode || 'rail').toLowerCase(),
          originName: leg.origin?.name || leg.origin?.city || 'Origin',
          destinationName: leg.destination?.name || leg.destination?.city || 'Destination',
          duration: leg.duration || 0,
          distance: leg.distance || 0,
          price: leg.price || 0,
          currency: leg.currency || 'INR',
          serviceName:
            leg.service?.name ||
            leg.service?.operator ||
            leg.vehicle?.identifier ||
            (leg.mode ? leg.mode.toUpperCase() : 'Transit'),
          isSelected,
          isExactGeometry: isExact,
        },
        geometry: {
          type: 'LineString',
          coordinates: legCoordinates,
        },
      });
    }
  });

  // Level 2 fallback if journey has 0 legs but top-level origin & destination have coordinates
  if (routeFeatures.length === 0) {
    const originCoord = journey.origin?.coordinates || journey.origin?.location?.coordinates;
    const destCoord = journey.destination?.coordinates || journey.destination?.location?.coordinates;

    if (isValidCoordinate(originCoord) && isValidCoordinate(destCoord)) {
      allCoordinates.push(originCoord, destCoord);
      routeFeatures.push({
        type: 'Feature',
        id: 'direct-route',
        properties: {
          type: 'route',
          legId: 'direct',
          sequence: 1,
          mode: (journey.transportModes?.[0] || 'rail').toLowerCase(),
          originName: journey.origin?.name || journey.origin?.city || 'Origin',
          destinationName: journey.destination?.name || journey.destination?.city || 'Destination',
          duration: journey.duration || 0,
          distance: journey.totalDistance || 0,
          price: journey.totalPrice || 0,
          currency: journey.currency || 'INR',
          isSelected: true,
          isExactGeometry: false,
        },
        geometry: {
          type: 'LineString',
          coordinates: [originCoord, destCoord],
        },
      });
    }
  }

  // 2. Process Origin Point
  const journeyOriginCoord =
    journey.origin?.coordinates ||
    journey.origin?.location?.coordinates ||
    legs[0]?.origin?.coordinates ||
    legs[0]?.origin?.location?.coordinates;

  if (isValidCoordinate(journeyOriginCoord)) {
    if (!allCoordinates.some((c) => c[0] === journeyOriginCoord[0] && c[1] === journeyOriginCoord[1])) {
      allCoordinates.push(journeyOriginCoord);
    }

    stopFeatures.push({
      type: 'Feature',
      id: 'stop-origin',
      properties: {
        type: 'origin',
        name: journey.origin?.name || journey.origin?.city || legs[0]?.origin?.name || 'Origin',
        time: journey.departureTime || legs[0]?.departureTime || null,
        label: 'Origin Departure',
        sequence: 0,
      },
      geometry: {
        type: 'Point',
        coordinates: journeyOriginCoord,
      },
    });
  }

  // 3. Process Intermediate Transfer Stops for multi-leg journeys
  if (legs.length > 1) {
    for (let i = 0; i < legs.length - 1; i++) {
      const currentLeg = legs[i];
      const nextLeg = legs[i + 1];

      const transferCoord =
        currentLeg.destination?.coordinates ||
        currentLeg.destination?.location?.coordinates ||
        nextLeg.origin?.coordinates ||
        nextLeg.origin?.location?.coordinates;

      if (isValidCoordinate(transferCoord)) {
        if (!allCoordinates.some((c) => c[0] === transferCoord[0] && c[1] === transferCoord[1])) {
          allCoordinates.push(transferCoord);
        }

        stopFeatures.push({
          type: 'Feature',
          id: `stop-transfer-${i + 1}`,
          properties: {
            type: 'transfer',
            name:
              currentLeg.destination?.name ||
              currentLeg.destination?.city ||
              nextLeg.origin?.name ||
              `Transfer Station ${i + 1}`,
            arrivalTime: currentLeg.arrivalTime || null,
            departureTime: nextLeg.departureTime || null,
            fromMode: currentLeg.mode || 'Transit',
            toMode: nextLeg.mode || 'Transit',
            label: 'Transfer Connection',
            sequence: i + 1,
          },
          geometry: {
            type: 'Point',
            coordinates: transferCoord,
          },
        });
      }
    }
  }

  // 4. Process Destination Point
  const lastLeg = legs[legs.length - 1];
  const journeyDestCoord =
    journey.destination?.coordinates ||
    journey.destination?.location?.coordinates ||
    lastLeg?.destination?.coordinates ||
    lastLeg?.destination?.location?.coordinates;

  if (isValidCoordinate(journeyDestCoord)) {
    if (!allCoordinates.some((c) => c[0] === journeyDestCoord[0] && c[1] === journeyDestCoord[1])) {
      allCoordinates.push(journeyDestCoord);
    }

    stopFeatures.push({
      type: 'Feature',
      id: 'stop-destination',
      properties: {
        type: 'destination',
        name:
          journey.destination?.name ||
          journey.destination?.city ||
          lastLeg?.destination?.name ||
          'Destination',
        time: journey.arrivalTime || lastLeg?.arrivalTime || null,
        label: 'Final Destination',
        sequence: legs.length,
      },
      geometry: {
        type: 'Point',
        coordinates: journeyDestCoord,
      },
    });
  }

  // 5. Calculate Geographic Bounding Box
  const bounds = calculateBounds(allCoordinates);

  return {
    routes: {
      type: 'FeatureCollection',
      features: routeFeatures,
    },
    stops: {
      type: 'FeatureCollection',
      features: stopFeatures,
    },
    allCoordinates,
    bounds,
    hasValidGeometry: routeFeatures.length > 0 || stopFeatures.length > 0,
    pointCount: allCoordinates.length,
  };
}

export default journeyToGeoJSON;
