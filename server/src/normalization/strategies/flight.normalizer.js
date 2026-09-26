import { BaseNormalizerStrategy } from './base.normalizer.js';

/**
 * Flight Transport Normalization Strategy
 * Converts Aviation GDS / Airline search responses into canonical Yatrai Journey and JourneyLeg models.
 */
export class FlightNormalizerStrategy extends BaseNormalizerStrategy {
  constructor() {
    super('flight');
  }

  /**
   * Normalizes a raw flight candidate or envelope item.
   *
   * @param {Object} raw
   * @param {Object} context
   * @returns {Object} Normalized canonical journey candidate
   */
  normalize(raw, context = {}) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Flight candidate must be an object');
    }

    const defaultBaseDate = context.departureDate || new Date();
    const originId = this.toObjectId(raw.origin, context.origin);
    const destinationId = this.toObjectId(raw.destination, context.destination);

    // 1. Timestamps normalization
    const rawDep = raw.departure || raw.departure_time || raw.departureTime;
    const rawArr = raw.arrival || raw.arrival_time || raw.arrivalTime;

    const departureTime = this.normalizeDateTime(rawDep, defaultBaseDate);
    const arrivalTime = this.normalizeDateTime(rawArr, defaultBaseDate);

    // 2. Flight identifiers
    const flightNumber = String(
      raw.flight_number || raw.flightNumber || raw.number || raw.code || raw.id || ''
    ).trim();
    const airline = (raw.airline || raw.operator || 'Commercial Airline').trim();
    const cabinClass = (raw.cabin_class || raw.cabinClass || raw.class || 'Economy').trim();
    const aircraft = (raw.aircraft || raw.vehicle?.type || 'Aircraft').trim();

    // 3. Price & Currency
    const priceVal = raw.price !== undefined ? raw.price : raw.fare !== undefined ? raw.fare : raw.totalFare;
    const price = this.normalizePrice(priceVal);
    const currency = this.normalizeCurrency(raw.currency || context.currency);

    // 4. Duration & Distance
    const duration = this.normalizeDuration(raw.duration, departureTime, arrivalTime);
    const distance = this.normalizeDistance(raw.distance || raw.totalDistance);

    // 5. Booking & Airport metadata
    const bookingStatus = raw.bookingStatus || raw.booking?.status || 'available';
    const bookingRef = raw.bookingCode || raw.pnr || raw.booking?.reference || (flightNumber ? `PNR-${flightNumber}` : '');
    const originAirport = raw.origin_airport || raw.originAirport || raw.from || null;
    const destAirport = raw.destination_airport || raw.destAirport || raw.to || null;
    const terminal = raw.terminal || raw.metadata?.terminal || null;
    const gate = raw.gate || raw.metadata?.gate || null;
    const baggage = raw.baggage || raw.metadata?.baggage || null;
    const stops = typeof raw.stops === 'number' ? raw.stops : 0;

    // 6. Handle segments / multi-leg itineraries
    const rawSegments =
      Array.isArray(raw.legs) && raw.legs.length > 0
        ? raw.legs
        : Array.isArray(raw.segments) && raw.segments.length > 0
          ? raw.segments
          : null;

    let normalizedLegs = [];
    if (rawSegments) {
      normalizedLegs = rawSegments.map((seg, index) => {
        const segDep = this.normalizeDateTime(
          seg.departure || seg.departure_time || seg.departureTime,
          defaultBaseDate
        );
        const segArr = this.normalizeDateTime(
          seg.arrival || seg.arrival_time || seg.arrivalTime,
          defaultBaseDate
        );
        const segFlightNum = String(
          seg.flight_number || seg.flightNumber || seg.number || seg.code || flightNumber
        ).trim();
        const segAirline = (seg.airline || seg.operator || airline).trim();
        const segPriceVal = seg.price !== undefined ? seg.price : seg.fare;
        const segPrice = this.normalizePrice(segPriceVal);

        return {
          sequence: typeof seg.sequence === 'number' ? seg.sequence : index + 1,
          origin: this.toObjectId(seg.origin, index === 0 ? originId : null),
          destination: this.toObjectId(seg.destination, index === rawSegments.length - 1 ? destinationId : null),
          mode: this.normalizeMode(seg.mode, 'flight'),
          provider: this.toObjectId(seg.provider, raw.provider || null),
          departureTime: segDep,
          arrivalTime: segArr,
          duration: this.normalizeDuration(seg.duration, segDep, segArr),
          distance: this.normalizeDistance(seg.distance),
          price: segPrice,
          currency: this.normalizeCurrency(seg.currency || currency),
          vehicle: {
            type: seg.vehicle?.type || seg.aircraft || aircraft,
            identifier: seg.vehicle?.identifier || segFlightNum,
          },
          service: {
            name: seg.service?.name || `${segAirline} ${segFlightNum}`.trim(),
            operator: seg.service?.operator || segAirline,
            class: seg.service?.class || seg.cabinClass || cabinClass,
            number: seg.service?.number || segFlightNum,
          },
          booking: {
            status: seg.booking?.status || bookingStatus,
            reference: seg.booking?.reference || bookingRef,
            url: seg.booking?.url || '',
          },
          metadata: {
            originAirport: seg.originAirport || originAirport,
            destAirport: seg.destAirport || destAirport,
            terminal: seg.terminal || terminal,
            gate: seg.gate || gate,
            baggage: seg.baggage || baggage,
            ...(seg.metadata || {}),
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
          mode: 'flight',
          provider: this.toObjectId(raw.provider, null),
          departureTime,
          arrivalTime,
          duration,
          distance,
          price,
          currency,
          vehicle: {
            type: aircraft,
            identifier: flightNumber,
          },
          service: {
            name: `${airline} ${flightNumber}`.trim(),
            operator: airline,
            class: cabinClass,
            number: flightNumber,
          },
          booking: {
            status: bookingStatus,
            reference: bookingRef,
            url: raw.bookingUrl || raw.booking?.url || '',
          },
          metadata: {
            originAirport,
            destAirport,
            terminal,
            gate,
            baggage,
            stops,
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
        source: 'flight',
        provider: raw.providerName || raw.metadata?.provider || airline,
        flightNumber,
        airline,
        aircraft,
        originAirport,
        destAirport,
        stops,
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

export const flightNormalizerStrategy = new FlightNormalizerStrategy();
export default flightNormalizerStrategy;
