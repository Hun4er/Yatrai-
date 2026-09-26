import { BaseNormalizerStrategy } from './base.normalizer.js';

/**
 * Bus Transport Normalization Strategy
 * Converts intercity bus ticketing responses (RedBus, state road transport)
 * into canonical Yatrai Journey and JourneyLeg representations.
 */
export class BusNormalizerStrategy extends BaseNormalizerStrategy {
  constructor() {
    super('bus');
  }

  /**
   * Normalizes a raw bus candidate or envelope item.
   *
   * @param {Object} raw
   * @param {Object} context
   * @returns {Object} Normalized canonical journey candidate
   */
  normalize(raw, context = {}) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Bus candidate must be an object');
    }

    const defaultBaseDate = context.departureDate || new Date();
    const originId = this.toObjectId(raw.origin, context.origin);
    const destinationId = this.toObjectId(raw.destination, context.destination);

    // 1. Timestamps normalization
    const rawDep = raw.departureTime || raw.departure_time || raw.departure;
    const rawArr = raw.arrivalTime || raw.arrival_time || raw.arrival;

    const departureTime = this.normalizeDateTime(rawDep, defaultBaseDate);
    const arrivalTime = this.normalizeDateTime(rawArr, defaultBaseDate);

    // 2. Bus identifiers
    const busNumber = String(raw.busNumber || raw.bus_number || raw.number || raw.id || '').trim();
    const operator = (raw.operator || raw.operatorName || raw.operator_name || 'Intercity Bus Service').trim();
    const busType = (raw.busType || raw.bus_type || raw.class || 'AC Semi-Sleeper').trim();

    // 3. Price & Currency
    const priceVal = raw.price !== undefined ? raw.price : raw.fare !== undefined ? raw.fare : raw.totalFare;
    const price = this.normalizePrice(priceVal);
    const currency = this.normalizeCurrency(raw.currency || context.currency);

    // 4. Duration & Distance
    const duration = this.normalizeDuration(raw.duration, departureTime, arrivalTime);
    const distance = this.normalizeDistance(raw.distance || raw.totalDistance);

    // 5. Booking & Amenities
    const availableSeats = raw.availableSeats !== undefined ? raw.availableSeats : raw.seats;
    const bookingStatus =
      raw.bookingStatus ||
      raw.booking?.status ||
      (availableSeats !== undefined ? (Number(availableSeats) > 0 ? 'available' : 'sold_out') : 'available');
    const bookingRef = raw.bookingReference || raw.booking?.reference || raw.id || (busNumber ? `BUS-${busNumber}` : '');
    const amenities = raw.amenities || raw.metadata?.amenities || [];

    // 6. Handle multi-leg bus routes if any
    const rawLegs = Array.isArray(raw.legs) && raw.legs.length > 0 ? raw.legs : null;

    let normalizedLegs = [];
    if (rawLegs) {
      normalizedLegs = rawLegs.map((leg, index) => {
        const legDep = this.normalizeDateTime(
          leg.departureTime || leg.departure_time || leg.departure,
          defaultBaseDate
        );
        const legArr = this.normalizeDateTime(
          leg.arrivalTime || leg.arrival_time || leg.arrival,
          defaultBaseDate
        );
        const legBusNum = String(leg.busNumber || leg.bus_number || leg.number || busNumber).trim();
        const legOp = (leg.operator || leg.operatorName || operator).trim();
        const legPriceVal = leg.price !== undefined ? leg.price : leg.fare;
        const legPrice = this.normalizePrice(legPriceVal);

        return {
          sequence: typeof leg.sequence === 'number' ? leg.sequence : index + 1,
          origin: this.toObjectId(leg.origin, index === 0 ? originId : null),
          destination: this.toObjectId(leg.destination, index === rawLegs.length - 1 ? destinationId : null),
          mode: this.normalizeMode(leg.mode, 'bus'),
          provider: this.toObjectId(leg.provider, raw.provider || null),
          departureTime: legDep,
          arrivalTime: legArr,
          duration: this.normalizeDuration(leg.duration, legDep, legArr),
          distance: this.normalizeDistance(leg.distance),
          price: legPrice,
          currency: this.normalizeCurrency(leg.currency || currency),
          vehicle: {
            type: leg.vehicle?.type || 'Bus',
            identifier: leg.vehicle?.identifier || legBusNum || legOp,
          },
          service: {
            name: leg.service?.name || legOp,
            operator: leg.service?.operator || legOp,
            class: leg.service?.class || leg.busType || busType,
            number: leg.service?.number || legBusNum,
          },
          booking: {
            status: leg.booking?.status || bookingStatus,
            reference: leg.booking?.reference || bookingRef,
            url: leg.booking?.url || '',
          },
          metadata: {
            amenities: leg.amenities || amenities,
            ...(leg.metadata || {}),
          },
          schemaVersion: 1,
        };
      });
    } else {
      normalizedLegs = [
        {
          sequence: 1,
          origin: originId,
          destination: destinationId,
          mode: 'bus',
          provider: this.toObjectId(raw.provider, null),
          departureTime,
          arrivalTime,
          duration,
          distance,
          price,
          currency,
          vehicle: {
            type: 'Bus',
            identifier: busNumber || operator,
          },
          service: {
            name: operator,
            operator,
            class: busType,
            number: busNumber,
          },
          booking: {
            status: bookingStatus,
            reference: bookingRef,
            url: raw.bookingUrl || raw.booking?.url || '',
          },
          metadata: {
            amenities,
            availableSeats,
            ...(raw.metadata || {}),
          },
          schemaVersion: 1,
        },
      ];
    }

    const totalDuration =
      typeof raw.duration === 'number' && raw.duration >= 0
        ? raw.duration
        : normalizedLegs.reduce((sum, l) => sum + (l.duration || 0), 0);

    const totalPrice =
      typeof raw.totalPrice === 'number' && raw.totalPrice >= 0
        ? raw.totalPrice
        : raw.price !== undefined
          ? price
          : normalizedLegs.reduce((sum, l) => sum + (l.price || 0), 0);

    const totalDistance =
      typeof raw.totalDistance === 'number' && raw.totalDistance >= 0
        ? raw.totalDistance
        : normalizedLegs.reduce((sum, l) => sum + (l.distance || 0), 0);

    const numberOfTransfers =
      typeof raw.numberOfTransfers === 'number'
        ? raw.numberOfTransfers
        : Math.max(0, normalizedLegs.length - 1);

    const transportModes = Array.from(new Set(normalizedLegs.map((l) => l.mode)));

    const candidate = {
      origin: originId,
      destination: destinationId,
      departureTime: normalizedLegs[0]?.departureTime || departureTime,
      arrivalTime: normalizedLegs[normalizedLegs.length - 1]?.arrivalTime || arrivalTime,
      duration: totalDuration,
      totalDistance,
      totalPrice,
      currency,
      numberOfTransfers,
      transportModes,
      status: this.normalizeStatus(raw.status),
      metadata: {
        source: 'bus',
        provider: raw.providerName || raw.metadata?.provider || operator,
        operator,
        busType,
        busNumber,
        amenities,
        ...(raw.metadata || {}),
      },
      legs: normalizedLegs,
      rawData: raw.rawData || raw,
      schemaVersion: 1,
    };

    candidate.journey = {
      origin: candidate.origin,
      destination: candidate.destination,
      departureTime: candidate.departureTime,
      arrivalTime: candidate.arrivalTime,
      duration: candidate.duration,
      totalDistance: candidate.totalDistance,
      totalPrice: candidate.totalPrice,
      currency: candidate.currency,
      numberOfTransfers: candidate.numberOfTransfers,
      transportModes: candidate.transportModes,
      status: candidate.status,
      metadata: candidate.metadata,
      schemaVersion: candidate.schemaVersion,
    };

    return candidate;
  }
}

export const busNormalizerStrategy = new BusNormalizerStrategy();
export default busNormalizerStrategy;
