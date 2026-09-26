import { BaseNormalizerStrategy } from './base.normalizer.js';

/**
 * Default / Development Normalization Strategy
 * Handles Phase 4 development candidate fixtures and generic pre-formatted candidates.
 */
export class DefaultNormalizerStrategy extends BaseNormalizerStrategy {
  constructor() {
    super('rail');
  }

  normalize(raw, context = {}) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Candidate must be an object');
    }

    const defaultBaseDate = context.departureDate || new Date();
    const originId = this.toObjectId(raw.origin, context.origin);
    const destinationId = this.toObjectId(raw.destination, context.destination);

    const departureTime = this.normalizeDateTime(
      raw.departureTime || raw.departure_time || raw.departure,
      defaultBaseDate
    );
    const arrivalTime = this.normalizeDateTime(
      raw.arrivalTime || raw.arrival_time || raw.arrival,
      defaultBaseDate
    );

    const rawLegs = Array.isArray(raw.legs) ? raw.legs : [];
    const normalizedLegs = rawLegs.map((leg, index) => {
      const legDep = this.normalizeDateTime(
        leg.departureTime || leg.departure_time || leg.departure,
        defaultBaseDate
      );
      const legArr = this.normalizeDateTime(
        leg.arrivalTime || leg.arrival_time || leg.arrival,
        defaultBaseDate
      );
      const legPriceVal = leg.price !== undefined ? leg.price : leg.fare;

      return {
        sequence: typeof leg.sequence === 'number' ? leg.sequence : index + 1,
        origin: this.toObjectId(leg.origin, index === 0 ? originId : null),
        destination: this.toObjectId(leg.destination, index === rawLegs.length - 1 ? destinationId : null),
        mode: this.normalizeMode(leg.mode, 'rail'),
        provider: this.toObjectId(leg.provider, null),
        departureTime: legDep,
        arrivalTime: legArr,
        duration: this.normalizeDuration(leg.duration, legDep, legArr),
        distance: this.normalizeDistance(leg.distance),
        price: this.normalizePrice(legPriceVal),
        currency: this.normalizeCurrency(leg.currency || raw.currency || 'INR'),
        vehicle: {
          type: leg.vehicle?.type || '',
          identifier: leg.vehicle?.identifier || '',
        },
        service: {
          name: leg.service?.name || '',
          operator: leg.service?.operator || '',
          class: leg.service?.class || '',
          number: leg.service?.number || leg.vehicle?.identifier || '',
        },
        booking: {
          status: leg.booking?.status || 'available',
          reference: leg.booking?.reference || '',
          url: leg.booking?.url || '',
        },
        metadata: leg.metadata || {},
        schemaVersion: 1,
      };
    });

    // If no legs were present, create single leg
    if (normalizedLegs.length === 0) {
      const mode = this.normalizeMode(raw.mode, 'rail');
      const priceVal = raw.totalPrice !== undefined ? raw.totalPrice : raw.price;
      const durationVal = this.normalizeDuration(raw.duration, departureTime, arrivalTime);

      normalizedLegs.push({
        sequence: 1,
        origin: originId,
        destination: destinationId,
        mode,
        provider: this.toObjectId(raw.provider, null),
        departureTime,
        arrivalTime,
        duration: durationVal,
        distance: this.normalizeDistance(raw.totalDistance || raw.distance),
        price: this.normalizePrice(priceVal),
        currency: this.normalizeCurrency(raw.currency),
        vehicle: {
          type: raw.vehicle?.type || '',
          identifier: raw.vehicle?.identifier || '',
        },
        service: {
          name: raw.service?.name || '',
          operator: raw.service?.operator || '',
          class: raw.service?.class || '',
          number: raw.service?.number || raw.vehicle?.identifier || '',
        },
        booking: {
          status: raw.booking?.status || 'available',
          reference: raw.booking?.reference || '',
          url: raw.booking?.url || '',
        },
        metadata: raw.metadata || {},
        schemaVersion: 1,
      });
    }

    const totalDuration =
      typeof raw.duration === 'number' && raw.duration >= 0
        ? raw.duration
        : normalizedLegs.reduce((sum, l) => sum + (l.duration || 0), 0);

    const totalPrice =
      typeof raw.totalPrice === 'number' && raw.totalPrice >= 0
        ? raw.totalPrice
        : normalizedLegs.reduce((sum, l) => sum + (l.price || 0), 0);

    const totalDistance =
      typeof raw.totalDistance === 'number' && raw.totalDistance >= 0
        ? raw.totalDistance
        : normalizedLegs.reduce((sum, l) => sum + (l.distance || 0), 0);

    const numberOfTransfers =
      typeof raw.numberOfTransfers === 'number'
        ? raw.numberOfTransfers
        : Math.max(0, normalizedLegs.length - 1);

    const transportModes =
      Array.isArray(raw.transportModes) && raw.transportModes.length > 0
        ? raw.transportModes.map((m) => this.normalizeMode(m))
        : Array.from(new Set(normalizedLegs.map((l) => l.mode)));

    const candidate = {
      origin: originId,
      destination: destinationId,
      departureTime: normalizedLegs[0]?.departureTime || departureTime,
      arrivalTime: normalizedLegs[normalizedLegs.length - 1]?.arrivalTime || arrivalTime,
      duration: totalDuration,
      totalDistance,
      totalPrice,
      currency: this.normalizeCurrency(raw.currency),
      numberOfTransfers,
      transportModes,
      status: this.normalizeStatus(raw.status),
      metadata: {
        source: raw.source || raw.metadata?.source || 'development',
        isMock: Boolean(raw.isMock ?? raw.metadata?.isMock ?? true),
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

export const defaultNormalizerStrategy = new DefaultNormalizerStrategy();
export default defaultNormalizerStrategy;
