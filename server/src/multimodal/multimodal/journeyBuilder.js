/**
 * JourneyBuilder
 * Assembles canonical Yatrai Journey objects from edge sequences discovered by PathFinder.
 * Supports both DIRECT (1 leg) and MULTI_MODAL (2+ legs) paths.
 */
export class JourneyBuilder {
  /**
   * Constructs a canonical Journey candidate object from a path of GraphEdges.
   *
   * @param {Array<Object>} edgePath - Sequential list of GraphEdge objects
   * @param {Object} [context]
   * @returns {Object|null}
   */
  buildJourney(edgePath, context = {}) {
    if (!Array.isArray(edgePath) || edgePath.length === 0) return null;

    const firstEdge = edgePath[0];
    const lastEdge = edgePath[edgePath.length - 1];

    const departureTime = firstEdge.departureTime;
    const arrivalTime = lastEdge.arrivalTime;
    const durationMinutes = Math.max(
      1,
      Math.round((arrivalTime.getTime() - departureTime.getTime()) / 60000)
    );

    const totalDistance = edgePath.reduce((sum, e) => sum + (e.distance || 0), 0);
    const totalPrice = edgePath.reduce((sum, e) => sum + (e.price || 0), 0);
    const containsEstimated = edgePath.some((e) => e.isEstimatedPrice || e.mode === 'road');

    const transportModes = [...new Set(edgePath.map((e) => e.mode))];
    const isMultiModal = edgePath.length > 1;
    const transfers = edgePath.length - 1;

    // Build sequential legs
    const legs = edgePath.map((edge, index) => {
      const legOrigin =
        context.resolveLocationDoc?.(edge.fromNodeId) ||
        edge.rawLeg?.origin || {
          id: edge.fromNodeId,
          name: edge.fromNodeName,
        };

      const legDest =
        context.resolveLocationDoc?.(edge.toNodeId) ||
        edge.rawLeg?.destination || {
          id: edge.toNodeId,
          name: edge.toNodeName,
        };

      return {
        sequence: index + 1,
        origin: legOrigin._id || legOrigin.id || legOrigin,
        destination: legDest._id || legDest.id || legDest,
        mode: edge.mode,
        provider: edge.rawLeg?.provider || null,
        providerCode: edge.providerCode,
        departureTime: edge.departureTime,
        arrivalTime: edge.arrivalTime,
        duration: edge.duration,
        distance: edge.distance,
        price: edge.price,
        currency: edge.currency || 'INR',
        vehicle: edge.vehicle || {},
        service: edge.service || {
          name: edge.service?.name || `${edge.mode.toUpperCase()} Transit`,
          operator: edge.provider,
        },
        booking: edge.booking || {
          status: edge.isEstimatedPrice ? 'not_bookable' : 'available',
        },
        metadata: {
          ...edge.metadata,
          isEstimatedPrice: edge.isEstimatedPrice,
          fromStation: edge.fromNodeName,
          toStation: edge.toNodeName,
        },
      };
    });

    // Resolve journey root origin & destination
    const extractOid = (loc) => {
      if (!loc) return null;
      if (typeof loc === 'string') return loc;
      if (loc._id) return loc._id;
      if (loc.id && typeof loc.id === 'string') return loc.id;
      return loc;
    };

    const journeyOrigin =
      extractOid(context.originLocation) ||
      extractOid(legs[0]?.origin);

    const journeyDest =
      extractOid(context.destLocation) ||
      extractOid(legs[legs.length - 1]?.destination);

    const transferPoints = isMultiModal
      ? edgePath.slice(0, -1).map((e) => e.toNodeName)
      : [];

    const providerNames = isMultiModal
      ? [...new Set(edgePath.map((e) => e.service?.name || e.provider))].join(' + ')
      : firstEdge.service?.name || firstEdge.provider;

    return {
      type: isMultiModal ? 'MULTI_MODAL' : 'DIRECT',
      origin: journeyOrigin,
      destination: journeyDest,
      departureTime,
      arrivalTime,
      duration: durationMinutes,
      totalDistance,
      totalPrice,
      currency: 'INR',
      numberOfTransfers: transfers,
      transportModes,
      status: 'scheduled',
      source: isMultiModal ? 'multimodal' : firstEdge.source || 'provider',
      providerCode: isMultiModal ? 'MULTI' : firstEdge.providerCode,
      pricing: {
        amount: totalPrice,
        currency: 'INR',
        containsEstimatedComponents: containsEstimated,
        type: containsEstimated && edgePath.every((e) => e.isEstimatedPrice) ? 'estimated' : 'actual',
      },
      metadata: {
        isMultiModal,
        isEstimatedPrice: containsEstimated,
        transfers,
        transferPoints,
        provider: isMultiModal ? `Multi-Modal (${providerNames})` : providerNames,
        legsCount: legs.length,
        trainName: edgePath.find((e) => e.mode === 'rail')?.service?.name,
        trainNumber: edgePath.find((e) => e.mode === 'rail')?.vehicle?.identifier,
      },
      legs,
    };
  }
}

export const journeyBuilder = new JourneyBuilder();
export default journeyBuilder;
