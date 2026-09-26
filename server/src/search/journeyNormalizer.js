import mongoose from 'mongoose';

/**
 * Normalizes raw candidate data from any candidate source or provider into
 * the canonical internal Journey and JourneyLeg structure.
 *
 * @param {Object} rawCandidate
 * @param {Object} context - Search context with origin, destination, etc.
 * @returns {Object} Normalized journey candidate object
 */
export function normalizeJourneyCandidate(rawCandidate, context = {}) {
  if (!rawCandidate || typeof rawCandidate !== 'object') {
    throw new Error('Raw candidate must be a valid object');
  }

  // Helper to extract ObjectId or string
  const toObjectId = (val) => {
    if (!val) return null;
    if (val._id) return val._id;
    if (mongoose.Types.ObjectId.isValid(val)) return new mongoose.Types.ObjectId(val);
    return val;
  };

  const originId = toObjectId(rawCandidate.origin) || toObjectId(context.origin);
  const destinationId = toObjectId(rawCandidate.destination) || toObjectId(context.destination);

  // Normalize dates
  const departureTime = rawCandidate.departureTime ? new Date(rawCandidate.departureTime) : null;
  const arrivalTime = rawCandidate.arrivalTime ? new Date(rawCandidate.arrivalTime) : null;

  // Normalize legs
  const rawLegs = Array.isArray(rawCandidate.legs) ? rawCandidate.legs : [];
  const normalizedLegs = rawLegs.map((leg, index) => {
    const legDepTime = leg.departureTime ? new Date(leg.departureTime) : null;
    const legArrTime = leg.arrivalTime ? new Date(leg.arrivalTime) : null;
    const legDuration =
      typeof leg.duration === 'number'
        ? leg.duration
        : legDepTime && legArrTime && !isNaN(legDepTime.getTime()) && !isNaN(legArrTime.getTime())
          ? Math.max(0, Math.round((legArrTime.getTime() - legDepTime.getTime()) / 60000))
          : 0;

    return {
      sequence: typeof leg.sequence === 'number' ? leg.sequence : index + 1,
      origin: toObjectId(leg.origin) || (index === 0 ? originId : null),
      destination:
        toObjectId(leg.destination) || (index === rawLegs.length - 1 ? destinationId : null),
      mode: leg.mode || 'rail',
      provider: toObjectId(leg.provider) || null,
      departureTime: legDepTime,
      arrivalTime: legArrTime,
      duration: legDuration,
      distance: typeof leg.distance === 'number' ? leg.distance : 0,
      price: typeof leg.price === 'number' ? leg.price : 0,
      currency: (leg.currency || rawCandidate.currency || 'INR').toUpperCase(),
      vehicle: {
        type: leg.vehicle?.type || '',
        identifier: leg.vehicle?.identifier || '',
      },
      service: {
        name: leg.service?.name || '',
        operator: leg.service?.operator || '',
        class: leg.service?.class || '',
      },
      booking: {
        status: leg.booking?.status || 'available',
        reference: leg.booking?.reference || '',
        url: leg.booking?.url || '',
      },
      metadata: leg.metadata || {},
    };
  });

  // Calculate aggregated metrics
  const computedDuration =
    typeof rawCandidate.duration === 'number'
      ? rawCandidate.duration
      : departureTime &&
          arrivalTime &&
          !isNaN(departureTime.getTime()) &&
          !isNaN(arrivalTime.getTime())
        ? Math.max(0, Math.round((arrivalTime.getTime() - departureTime.getTime()) / 60000))
        : normalizedLegs.reduce((sum, l) => sum + (l.duration || 0), 0);

  const computedPrice =
    typeof rawCandidate.totalPrice === 'number'
      ? rawCandidate.totalPrice
      : normalizedLegs.reduce((sum, l) => sum + (l.price || 0), 0);

  const computedDistance =
    typeof rawCandidate.totalDistance === 'number'
      ? rawCandidate.totalDistance
      : normalizedLegs.reduce((sum, l) => sum + (l.distance || 0), 0);

  const transportModes =
    Array.isArray(rawCandidate.transportModes) && rawCandidate.transportModes.length > 0
      ? rawCandidate.transportModes
      : Array.from(new Set(normalizedLegs.map((l) => l.mode).filter(Boolean)));

  const numberOfTransfers =
    typeof rawCandidate.numberOfTransfers === 'number'
      ? rawCandidate.numberOfTransfers
      : Math.max(0, normalizedLegs.length - 1);

  return {
    origin: originId,
    destination: destinationId,
    departureTime,
    arrivalTime,
    duration: computedDuration,
    totalDistance: computedDistance,
    totalPrice: computedPrice,
    currency: (rawCandidate.currency || 'INR').toUpperCase(),
    numberOfTransfers,
    transportModes,
    status: rawCandidate.status || 'scheduled',
    metadata: {
      source: rawCandidate.source || rawCandidate.metadata?.source || 'development',
      isMock: Boolean(rawCandidate.isMock ?? rawCandidate.metadata?.isMock ?? true),
      ...(rawCandidate.metadata || {}),
    },
    legs: normalizedLegs,
    rawData: rawCandidate.rawData || rawCandidate,
  };
}

export default {
  normalizeJourneyCandidate,
};
