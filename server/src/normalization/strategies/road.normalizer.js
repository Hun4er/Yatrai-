import { BaseNormalizerStrategy } from './base.normalizer.js';

/**
 * Road Transport Normalization Strategy
 * Converts OSRM driving routes or road transit adapter responses into
 * canonical Yatrai Journey and JourneyLeg representations.
 */
export class RoadNormalizerStrategy extends BaseNormalizerStrategy {
  constructor() {
    super('road');
  }

  /**
   * Normalizes a raw road candidate or OSRM driving result.
   *
   * @param {Object} raw
   * @param {Object} context
   * @returns {Object} Normalized canonical journey candidate
   */
  normalize(raw, context = {}) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Road candidate must be an object');
    }

    const defaultBaseDate = context.departureDate || null;
    const originId = this.toObjectId(raw.origin, context.origin);
    const destinationId = this.toObjectId(raw.destination, context.destination);

    // 1. Duration & Distance
    // Note: OSRM route duration is in seconds, candidate duration might be in minutes
    let rawDuration = raw.duration;
    let rawDistance = raw.distance || raw.totalDistance;

    if (raw.routes && Array.isArray(raw.routes) && raw.routes[0]) {
      const primaryRoute = raw.routes[0];
      if (rawDuration === undefined && primaryRoute.duration !== undefined) {
        rawDuration = Math.round(primaryRoute.duration / 60);
      }
      if (rawDistance === undefined && primaryRoute.distance !== undefined) {
        rawDistance = Math.round(primaryRoute.distance / 1000);
      }
    }

    const duration = this.normalizeDuration(rawDuration);
    const distance = this.normalizeDistance(rawDistance);

    // 2. Timestamps normalization
    // Do not invent departure time if the provider only provides travel duration
    let departureTime = null;
    let arrivalTime = null;

    const rawDep = raw.departureTime || raw.departure_time || raw.departure;
    const rawArr = raw.arrivalTime || raw.arrival_time || raw.arrival;

    if (rawDep) {
      departureTime = this.normalizeDateTime(rawDep, defaultBaseDate);
    } else if (defaultBaseDate) {
      // If caller explicitly provided context departureDate, use it
      departureTime = this.normalizeDateTime(defaultBaseDate);
    }

    if (rawArr) {
      arrivalTime = this.normalizeDateTime(rawArr, defaultBaseDate);
    } else if (departureTime && duration > 0) {
      arrivalTime = new Date(departureTime.getTime() + duration * 60000);
    }

    // 3. Price & Currency
    // Rule 48: Do not invent a price when the road provider does not provide one
    const rawPrice = raw.price !== undefined ? raw.price : raw.totalPrice !== undefined ? raw.totalPrice : raw.fare;
    const price = rawPrice !== undefined && rawPrice !== null ? this.normalizePrice(rawPrice) : 0;
    const currency = this.normalizeCurrency(raw.currency || context.currency);

    // 4. Vehicle & Service
    const vehicleType = raw.vehicle?.type || 'Car / Cab';
    const vehicleIdentifier = raw.vehicle?.identifier || 'Road Transit';
    const serviceName = raw.service?.name || 'Highway Driving Route';
    const operator = raw.service?.operator || raw.operator || 'Road Transit Service';

    // 5. Handle legs
    const rawLegs = Array.isArray(raw.legs) && raw.legs.length > 0 ? raw.legs : null;

    let normalizedLegs = [];
    if (rawLegs) {
      normalizedLegs = rawLegs.map((leg, index) => {
        const legDep = leg.departureTime ? this.normalizeDateTime(leg.departureTime, defaultBaseDate) : departureTime;
        const legArr = leg.arrivalTime ? this.normalizeDateTime(leg.arrivalTime, defaultBaseDate) : arrivalTime;
        const legPriceVal = leg.price !== undefined ? leg.price : price;

        return {
          sequence: typeof leg.sequence === 'number' ? leg.sequence : index + 1,
          origin: this.toObjectId(leg.origin, index === 0 ? originId : null),
          destination: this.toObjectId(leg.destination, index === rawLegs.length - 1 ? destinationId : null),
          mode: this.normalizeMode(leg.mode, 'road'),
          provider: this.toObjectId(leg.provider, raw.provider || null),
          departureTime: legDep,
          arrivalTime: legArr,
          duration: this.normalizeDuration(leg.duration, legDep, legArr),
          distance: this.normalizeDistance(leg.distance || distance),
          price: legPriceVal !== undefined && legPriceVal !== null ? this.normalizePrice(legPriceVal) : 0,
          currency: this.normalizeCurrency(leg.currency || currency),
          vehicle: {
            type: leg.vehicle?.type || vehicleType,
            identifier: leg.vehicle?.identifier || vehicleIdentifier,
          },
          service: {
            name: leg.service?.name || serviceName,
            operator: leg.service?.operator || operator,
            class: leg.service?.class || 'Standard',
            number: leg.service?.number || '',
          },
          booking: {
            status: leg.booking?.status || 'available',
            reference: leg.booking?.reference || 'ROAD-DIRECT',
            url: leg.booking?.url || '',
          },
          metadata: {
            routingEngine: 'OSRM Driving',
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
          mode: 'road',
          provider: this.toObjectId(raw.provider, null),
          departureTime,
          arrivalTime,
          duration,
          distance,
          price,
          currency,
          vehicle: {
            type: vehicleType,
            identifier: vehicleIdentifier,
          },
          service: {
            name: serviceName,
            operator,
            class: 'Standard',
            number: '',
          },
          booking: {
            status: 'available',
            reference: raw.booking?.reference || 'ROAD-DIRECT',
            url: raw.booking?.url || '',
          },
          metadata: {
            routingEngine: raw.routingEngine || 'OSRM Driving',
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
        : rawPrice !== undefined
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
        source: 'road',
        provider: raw.providerName || raw.metadata?.provider || 'Road Transit Service',
        routingEngine: 'OSRM Driving',
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

export const roadNormalizerStrategy = new RoadNormalizerStrategy();
export default roadNormalizerStrategy;
