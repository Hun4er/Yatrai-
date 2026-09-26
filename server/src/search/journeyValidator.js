import { TRANSPORT_MODES } from '../models/TransportProvider.js';

/**
 * Validates a journey candidate and its legs against strict domain constraints.
 * Ensures referential integrity, leg sequence order, and physical transfer continuity.
 *
 * @param {Object} candidate - Normalized journey candidate
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
export function validateJourneyCandidate(candidate) {
  const errors = [];

  if (!candidate || typeof candidate !== 'object') {
    return { valid: false, errors: ['Candidate must be an object'] };
  }

  // 1. Origin & Destination presence
  const originStr = candidate.origin ? String(candidate.origin._id || candidate.origin) : null;
  const destStr = candidate.destination
    ? String(candidate.destination._id || candidate.destination)
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
    candidate.departureTime instanceof Date
      ? candidate.departureTime
      : candidate.departureTime
        ? new Date(candidate.departureTime)
        : null;
  const arrTime =
    candidate.arrivalTime instanceof Date
      ? candidate.arrivalTime
      : candidate.arrivalTime
        ? new Date(candidate.arrivalTime)
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
    typeof candidate.duration !== 'number' ||
    isNaN(candidate.duration) ||
    candidate.duration < 0
  ) {
    errors.push('Journey duration must be a non-negative number');
  }
  if (
    candidate.totalPrice !== undefined &&
    (typeof candidate.totalPrice !== 'number' ||
      isNaN(candidate.totalPrice) ||
      candidate.totalPrice < 0)
  ) {
    errors.push('Journey total price must be a non-negative number');
  }
  if (
    candidate.totalDistance !== undefined &&
    (typeof candidate.totalDistance !== 'number' ||
      isNaN(candidate.totalDistance) ||
      candidate.totalDistance < 0)
  ) {
    errors.push('Journey total distance must be a non-negative number');
  }

  // 5. Currency validation
  if (candidate.currency && typeof candidate.currency !== 'string') {
    errors.push('Journey currency must be a valid string');
  }

  // 6. Legs validation
  if (!Array.isArray(candidate.legs) || candidate.legs.length === 0) {
    errors.push('Journey must contain at least one leg');
    return { valid: false, errors };
  }

  // Validate each leg
  for (let i = 0; i < candidate.legs.length; i++) {
    const leg = candidate.legs[i];
    const expectedSequence = i + 1;

    if (leg.sequence !== expectedSequence) {
      errors.push(`Leg at index ${i} has sequence ${leg.sequence}, expected ${expectedSequence}`);
    }

    const legOrigin = leg.origin ? String(leg.origin._id || leg.origin) : null;
    const legDest = leg.destination ? String(leg.destination._id || leg.destination) : null;

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
  const firstLegOrigin = candidate.legs[0]?.origin
    ? String(candidate.legs[0].origin._id || candidate.legs[0].origin)
    : null;
  const lastLegDest = candidate.legs[candidate.legs.length - 1]?.destination
    ? String(
        candidate.legs[candidate.legs.length - 1].destination._id ||
          candidate.legs[candidate.legs.length - 1].destination
      )
    : null;

  if (originStr && firstLegOrigin && originStr !== firstLegOrigin) {
    errors.push('First leg origin does not match journey origin');
  }

  if (destStr && lastLegDest && destStr !== lastLegDest) {
    errors.push('Last leg destination does not match journey destination');
  }

  for (let i = 0; i < candidate.legs.length - 1; i++) {
    const currentLeg = candidate.legs[i];
    const nextLeg = candidate.legs[i + 1];

    const currentDest = currentLeg.destination
      ? String(currentLeg.destination._id || currentLeg.destination)
      : null;
    const nextOrigin = nextLeg.origin ? String(nextLeg.origin._id || nextLeg.origin) : null;

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
