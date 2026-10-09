/**
 * GraphEdge
 * Represents a directed transport leg in the Journey Graph.
 * Holds complete spatial, temporal, pricing, and provider service metadata.
 */
export class GraphEdge {
  constructor({
    id,
    fromNodeId,
    toNodeId,
    fromNodeName,
    toNodeName,
    mode, // 'rail', 'road', 'bus', 'flight'
    provider = 'unknown',
    providerCode = null,
    departureTime,
    arrivalTime,
    duration, // in minutes
    distance = 0, // in km
    price = 0,
    currency = 'INR',
    isEstimatedPrice = false,
    vehicle = {},
    service = {},
    booking = {},
    metadata = {},
    rawLeg = null,
    source = 'provider',
  }) {
    this.id = id || `${fromNodeId}-${toNodeId}-${mode}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.fromNodeId = String(fromNodeId).toLowerCase().trim();
    this.toNodeId = String(toNodeId).toLowerCase().trim();
    this.fromNodeName = fromNodeName || fromNodeId;
    this.toNodeName = toNodeName || toNodeId;
    this.mode = String(mode).toLowerCase();
    this.provider = provider;
    this.providerCode = providerCode;
    this.departureTime =
      departureTime instanceof Date
        ? departureTime
        : departureTime
          ? new Date(departureTime)
          : new Date(NaN);
    this.arrivalTime =
      arrivalTime instanceof Date
        ? arrivalTime
        : arrivalTime
          ? new Date(arrivalTime)
          : new Date(NaN);
    this.duration =
      Number(duration) ||
      (isNaN(this.arrivalTime.getTime()) || isNaN(this.departureTime.getTime())
        ? 0
        : Math.max(1, Math.round((this.arrivalTime.getTime() - this.departureTime.getTime()) / 60000)));
    this.distance = Math.round(Number(distance) || 0);
    this.price = Math.round(Number(price) || 0);
    this.currency = (currency || 'INR').toUpperCase();
    this.isEstimatedPrice = Boolean(isEstimatedPrice);
    this.vehicle = vehicle || {};
    this.service = service || {};
    this.booking = booking || { status: isEstimatedPrice ? 'not_bookable' : 'available' };
    this.metadata = metadata || {};
    this.rawLeg = rawLeg;
    this.source = source;
  }

  /**
   * Checks temporal validity of this single leg: arrival must be >= departure.
   */
  isValidTiming() {
    return (
      !isNaN(this.departureTime.getTime()) &&
      !isNaN(this.arrivalTime.getTime()) &&
      this.arrivalTime.getTime() >= this.departureTime.getTime() &&
      this.duration >= 0
    );
  }
}

export default GraphEdge;
