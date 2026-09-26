import { TRANSPORT_MODES } from '../models/TransportProvider.js';

/**
 * Validates a normalized journey candidate and its legs against strict canonical domain constraints.
 * Ensures referential integrity, leg sequence order, spatial connection, and physical transfer continuity.
 *
 * @param {Object} candidate - Normalized journey candidate (supports flat candidate or { journey, legs })
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
export function validateJourneyCandidate(candidate) {
  const errors = [];

  if (!candidate || typeof candidate !== 'object') {
    return { valid: false, errors: ['Candidate must be an object'] };
  }

  // Extract journey-level properties
  const journey = candidate.journey || candidate;
  const legs = Array.isArray(candidate.legs) ? candidate.legs : Array.isArray(journey.legs) ? journey.legs : null;

  // 1. Origin & Destination presence
  const originStr = journey.origin ? String(journey.origin._id || journey.origin.id || journey.origin) : null;
  const destStr = journey.destination
    ? String(journey.destination._id || journey.destination.id || journey.destination)
    : null;

  if (!originStr) {
    errors.push('Journey origin is required');
  }
  if (!destStr) {
    errors.push('Journey destination is required');
  }

  // 2. Origin != Destination
  if (originStr && destStr && originStr === destStr) {
    errors.push('Journey origin and destination cannot be the same');
  }

  // 3. Timestamps validation
  const depTime =
    journey.departureTime instanceof Date
      ? journey.departureTime
      : journey.departureTime
        ? new Date(journey.departureTime)
        : null;
  const arrTime =
    journey.arrivalTime instanceof Date
      ? journey.arrivalTime
      : journey.arrivalTime
        ? new Date(journey.arrivalTime)
        : null;

  if (!depTime || isNaN(depTime.getTime())) {
    errors.push('Valid journey departure time is required');
  }
  if (!arrTime || isNaN(arrTime.getTime())) {
    errors.push('Valid journey arrival time is required');
  }
  if (depTime && arrTime && !isNaN(depTime.getTime()) && !isNaN(arrTime.getTime())) {
    if (arrTime.getTime() < depTime.getTime()) {
      errors.push('Journey arrival time cannot be earlier than departure time');
    }
  }

  // 4. Duration, distance, and price validation
  if (
    typeof journey.duration !== 'number' ||
    isNaN(journey.duration) ||
    journey.duration < 0
  ) {
    errors.push('Journey duration must be a non-negative number');
  }

  const priceToCheck = journey.totalPrice !== undefined ? journey.totalPrice : journey.price;
  if (
    priceToCheck !== undefined &&
    (typeof priceToCheck !== 'number' || isNaN(priceToCheck) || priceToCheck < 0)
  ) {
    errors.push('Journey total price must be a non-negative number');
  }

  const distToCheck = journey.totalDistance !== undefined ? journey.totalDistance : journey.distance;
  if (
    distToCheck !== undefined &&
    (typeof distToCheck !== 'number' || isNaN(distToCheck) || distToCheck < 0)
  ) {
    errors.push('Journey total distance must be a non-negative number');
  }

  // 5. Currency validation
  if (journey.currency && (typeof journey.currency !== 'string' || !journey.currency.trim())) {
    errors.push('Journey currency must be a valid non-empty string');
  }

  // 6. Legs validation
  if (!legs || !Array.isArray(legs) || legs.length === 0) {
    errors.push('Journey must contain at least one leg');
    return { valid: false, errors };
  }

  // Validate each leg
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const expectedSequence = i + 1;

    if (leg.sequence !== expectedSequence) {
      errors.push(`Leg at index ${i} has sequence ${leg.sequence}, expected ${expectedSequence}`);
    }

    const legOrigin = leg.origin ? String(leg.origin._id || leg.origin.id || leg.origin) : null;
    const legDest = leg.destination ? String(leg.destination._id || leg.destination.id || leg.destination) : null;

    if (!legOrigin) {
      errors.push(`Leg ${expectedSequence} origin is required`);
    }
    if (!legDest) {
      errors.push(`Leg ${expectedSequence} destination is required`);
    }
    if (legOrigin && legDest && legOrigin === legDest) {
      errors.push(`Leg ${expectedSequence} origin and destination cannot be the same`);
    }

    if (!leg.mode || !TRANSPORT_MODES.includes(leg.mode)) {
      errors.push(
        `Leg ${expectedSequence} has invalid mode "${leg.mode}". Must be one of: ${TRANSPORT_MODES.join(', ')}`
      );
    }

    const legDepTime =
      leg.departureTime instanceof Date
        ? leg.departureTime
        : leg.departureTime
          ? new Date(leg.departureTime)
          : null;
    const legArrTime =
      leg.arrivalTime instanceof Date
        ? leg.arrivalTime
        : leg.arrivalTime
          ? new Date(leg.arrivalTime)
          : null;

    if (!legDepTime || isNaN(legDepTime.getTime())) {
      errors.push(`Leg ${expectedSequence} departure time is invalid`);
    }
    if (!legArrTime || isNaN(legArrTime.getTime())) {
      errors.push(`Leg ${expectedSequence} arrival time is invalid`);
    }
    if (legDepTime && legArrTime && !isNaN(legDepTime.getTime()) && !isNaN(legArrTime.getTime())) {
      if (legArrTime.getTime() < legDepTime.getTime()) {
        errors.push(`Leg ${expectedSequence} arrival time cannot be earlier than departure time`);
      }
    }

    if (typeof leg.duration !== 'number' || isNaN(leg.duration) || leg.duration < 0) {
      errors.push(`Leg ${expectedSequence} duration must be a non-negative number`);
    }
    if (
      leg.price !== undefined &&
      (typeof leg.price !== 'number' || isNaN(leg.price) || leg.price < 0)
    ) {
      errors.push(`Leg ${expectedSequence} price must be a non-negative number`);
    }
  }

  // 7. Leg Continuity & Spatial Alignment
  const firstLegOrigin = legs[0]?.origin
    ? String(legs[0].origin._id || legs[0].origin.id || legs[0].origin)
    : null;
  const lastLegDest = legs[legs.length - 1]?.destination
    ? String(legs[legs.length - 1].destination._id || legs[legs.length - 1].destination.id || legs[legs.length - 1].destination)
    : null;

  if (originStr && firstLegOrigin && originStr !== firstLegOrigin) {
    errors.push('First leg origin does not match journey origin');
  }

  if (destStr && lastLegDest && destStr !== lastLegDest) {
    errors.push('Last leg destination does not match journey destination');
  }

  for (let i = 0; i < legs.length - 1; i++) {
    const currentLeg = legs[i];
    const nextLeg = legs[i + 1];

    const currentDest = currentLeg.destination
      ? String(currentLeg.destination._id || currentLeg.destination.id || currentLeg.destination)
      : null;
    const nextOrigin = nextLeg.origin
      ? String(nextLeg.origin._id || nextLeg.origin.id || nextLeg.origin)
      : null;

    if (currentDest && nextOrigin && currentDest !== nextOrigin) {
      errors.push(
        `Leg continuity broken: Leg ${i + 1} destination (${currentDest}) does not connect to Leg ${i + 2} origin (${nextOrigin})`
      );
    }

    // Transfer timing continuity
    const currentArr =
      currentLeg.arrivalTime instanceof Date
        ? currentLeg.arrivalTime
        : new Date(currentLeg.arrivalTime);
    const nextDep =
      nextLeg.departureTime instanceof Date
        ? nextLeg.departureTime
        : new Date(nextLeg.departureTime);

    if (!isNaN(currentArr.getTime()) && !isNaN(nextDep.getTime())) {
      if (nextDep.getTime() < currentArr.getTime()) {
        errors.push(
          `Leg timing continuity broken: Leg ${i + 2} departs (${nextDep.toISOString()}) before Leg ${i + 1} arrives (${currentArr.toISOString()})`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  validateJourneyCandidate,
};
