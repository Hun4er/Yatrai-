import { BaseNormalizerStrategy } from './base.normalizer.js';

/**
 * Rail Transport Normalization Strategy
 * Converts Indian Railways / IRCTC or external rail scheduling provider formats
 * into canonical Yatrai Journey and JourneyLeg representations.
 */
export class RailNormalizerStrategy extends BaseNormalizerStrategy {
  constructor() {
    super('rail');
  }

  /**
   * Normalizes a raw rail candidate or envelope record.
   *
   * @param {Object} raw
   * @param {Object} context
   * @returns {Object} Normalized canonical journey candidate
   */
  normalize(raw, context = {}) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Rail candidate must be an object');
    }

    const defaultBaseDate = context.departureDate || new Date();
    const originId = this.toObjectId(raw.origin, context.origin);
    const destinationId = this.toObjectId(raw.destination, context.destination);

    // 1. Timestamps normalization
    const rawDep = raw.departure_time || raw.departureTime || raw.departure;
    const rawArr = raw.arrival_time || raw.arrivalTime || raw.arrival;

    const departureTime = this.normalizeDateTime(rawDep, defaultBaseDate);
    const arrivalTime = this.normalizeDateTime(rawArr, defaultBaseDate);

    // 2. Identify train identifiers and metadata
    const trainNumber = String(raw.train_number || raw.trainNumber || raw.number || raw.id || '').trim();
    const trainName = (raw.train_name || raw.trainName || raw.name || 'Express Train').trim();
    const operator = (raw.operator || 'Indian Railways').trim();
    const serviceClass = (raw.class || raw.trainClass || raw.cabinClass || '3A').trim();

    // 3. Price & Currency
    const priceVal = raw.price !== undefined ? raw.price : raw.fare !== undefined ? raw.fare : raw.totalFare;
    const price = this.normalizePrice(priceVal);
    const currency = this.normalizeCurrency(raw.currency || context.currency);

    // 4. Duration & Distance
    const duration = this.normalizeDuration(raw.duration, departureTime, arrivalTime);
    const distance = this.normalizeDistance(raw.distance || raw.totalDistance);

    // 5. Booking & Station codes
    const bookingStatus = raw.bookingStatus || raw.booking?.status || (raw.available ? 'available' : 'available');
    const pnr = raw.pnr || raw.booking?.reference || (trainNumber ? `IRCTC-${trainNumber}` : '');
    const originStation = raw.origin_station || raw.from_station || raw.from || raw.stationCode || null;
    const destStation = raw.destination_station || raw.to_station || raw.to || null;

    // 6. Multi-leg vs Single-leg
    const rawLegs = Array.isArray(raw.legs) && raw.legs.length > 0 ? raw.legs : null;

    let normalizedLegs = [];
    if (rawLegs) {
      normalizedLegs = rawLegs.map((leg, index) => {
        const legDep = this.normalizeDateTime(
          leg.departure_time || leg.departureTime || leg.departure,
          defaultBaseDate
        );
        const legArr = this.normalizeDateTime(
          leg.arrival_time || leg.arrivalTime || leg.arrival,
          defaultBaseDate
        );
        const legTrainNum = String(leg.train_number || leg.trainNumber || leg.number || trainNumber).trim();
        const legTrainName = (leg.train_name || leg.trainName || leg.name || trainName).trim();
        const legPriceVal = leg.price !== undefined ? leg.price : leg.fare;
        const legPrice = this.normalizePrice(legPriceVal);

        return {
          sequence: typeof leg.sequence === 'number' ? leg.sequence : index + 1,
          origin: this.toObjectId(leg.origin, index === 0 ? originId : null),
          destination: this.toObjectId(leg.destination, index === rawLegs.length - 1 ? destinationId : null),
          mode: this.normalizeMode(leg.mode, 'rail'),
          provider: this.toObjectId(leg.provider, raw.provider || null),
          departureTime: legDep,
          arrivalTime: legArr,
          duration: this.normalizeDuration(leg.duration, legDep, legArr),
          distance: this.normalizeDistance(leg.distance),
          price: legPrice,
          currency: this.normalizeCurrency(leg.currency || currency),
          vehicle: {
            type: leg.vehicle?.type || 'Train',
            identifier: leg.vehicle?.identifier || legTrainNum,
          },
          service: {
            name: leg.service?.name || legTrainName,
            operator: leg.service?.operator || leg.operator || operator,
            class: leg.service?.class || leg.class || serviceClass,
            number: leg.service?.number || legTrainNum,
          },
          booking: {
            status: leg.booking?.status || bookingStatus,
            reference: leg.booking?.reference || leg.pnr || pnr,
            url: leg.booking?.url || '',
          },
          metadata: {
            stationCode: leg.stationCode || null,
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
          mode: 'rail',
          provider: this.toObjectId(raw.provider, null),
          departureTime,
          arrivalTime,
          duration,
          distance,
          price,
          currency,
          vehicle: {
            type: 'Train',
            identifier: trainNumber,
          },
          service: {
            name: trainName,
            operator,
            class: serviceClass,
            number: trainNumber,
          },
          booking: {
            status: bookingStatus,
            reference: pnr,
            url: raw.bookingUrl || raw.booking?.url || '',
          },
          metadata: {
            originStation,
            destinationStation: destStation,
            classes: raw.classes || (serviceClass ? [serviceClass] : []),
            ...(raw.metadata || {}),
          },
          schemaVersion: 1,
        },
      ];
    }

    // Aggregated metrics
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
        source: 'rail',
        provider: raw.providerName || raw.metadata?.provider || 'Indian Railways',
        originStation,
        destinationStation: destStation,
        trainNumber,
        trainName,
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

export const railNormalizerStrategy = new RailNormalizerStrategy();
export default railNormalizerStrategy;
