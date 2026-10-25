/**
 * Canonical toJourneyViewModel Adapter (Phase 4)
 *
 * Reconciles the new P0 v2 backend search response with the UI shell components:
 * - Feeds ranking, filters, counts, and price slider.
 * - Extracts price (min fare of checked classes, or null if unverified).
 * - Excludes null fares from slider range calculation while displaying 'Fare after check'.
 * - Normalizes tier: CONFIRMED (100) > RAC (75) > WAITLIST (50) > UNCHECKED (0).
 */

export function toJourneyViewModel(newResponse) {
  if (!newResponse) return [];
  const list = [];
  const direct = Array.isArray(newResponse.direct) ? newResponse.direct : [];
  const alternatives = Array.isArray(newResponse.alternatives) ? newResponse.alternatives : [];

  for (const t of direct) {
    const checkedClasses = (t.classes || []).filter(
      (c) => c.state === 'CHECKED' && typeof c.fare === 'number' && c.fare > 0
    );
    const minFare = checkedClasses.length > 0
      ? Math.min(...checkedClasses.map((c) => c.fare))
      : (typeof t.fare === 'number' && t.fare > 0 ? t.fare : null);

    const hasConfirmed = (t.classes || []).some(
      (c) => c.state === 'CHECKED' && (c.tier === 'AVAILABLE' || c.isAvailable)
    );
    const hasRAC = (t.classes || []).some(
      (c) => c.state === 'CHECKED' && c.tier === 'RAC'
    );
    const hasWaitlist = (t.classes || []).some(
      (c) => c.state === 'CHECKED' && c.tier === 'WAITLIST'
    );
    const tier = hasConfirmed ? 'CONFIRMED' : (hasRAC ? 'RAC' : (hasWaitlist ? 'WAITLIST' : 'UNCHECKED'));

    const depTime = t.departureTime || t.departure || '06:00';
    const arrTime = t.arrivalTime || t.arrival || '18:00';
    const duration = t.durationMinutes || t.duration || 720;

    const directLeg = {
      id: `${t.trainNumber}-leg-1`,
      sequence: 1,
      mode: 'rail',
      origin: { code: t.from, name: t.fromName || t.from },
      destination: { code: t.to, name: t.toName || t.to },
      departureTime: depTime,
      arrivalTime: arrTime,
      duration,
      price: minFare,
      service: {
        number: t.trainNumber,
        name: t.trainName,
        class: checkedClasses[0]?.class || t.classes?.[0]?.class || '3A',
        operator: 'Indian Railways',
      },
      availability: {
        status: tier,
        normalizedStatus: tier,
      },
    };

    list.push({
      id: String(t.trainNumber),
      trainNumber: t.trainNumber,
      trainName: t.trainName,
      title: `${t.trainNumber} ${t.trainName}`,
      departureTime: depTime,
      arrivalTime: arrTime,
      duration,
      numberOfTransfers: 0,
      transferCount: 0,
      totalPrice: minFare,
      fare: minFare,
      price: minFare,
      priceFormatted: minFare !== null ? `₹${minFare.toLocaleString('en-IN')}` : 'Fare after check',
      currency: 'INR',
      tier,
      tierScore: hasConfirmed ? 100 : (hasRAC ? 75 : (hasWaitlist ? 50 : 0)),
      isDirectTrain: true,
      transportModes: ['rail'],
      from: t.from,
      to: t.to,
      fromName: t.fromName || t.from,
      toName: t.toName || t.to,
      classes: t.classes || [],
      legs: [directLeg],
      raw: t,
    });
  }

  for (let i = 0; i < alternatives.length; i++) {
    const alt = alternatives[i];
    const rawLegs = Array.isArray(alt.legs) ? alt.legs : [];
    const isSameTrain = Boolean(alt.sameTrain || alt.type === 'same_train');
    const transfers = isSameTrain ? 0 : Math.max(0, rawLegs.filter((l) => l.mode === 'rail').length - 1);
    const fare = typeof alt.totalFare === 'number' && alt.totalFare > 0
      ? alt.totalFare
      : (typeof alt.fare === 'number' && alt.fare > 0 ? alt.fare : null);

    const depTime = alt.departureTime || rawLegs[0]?.departureTime || '06:00';
    const arrTime = alt.arrivalTime || rawLegs[rawLegs.length - 1]?.arrivalTime || '18:00';
    const duration = alt.duration || alt.totalDurationMinutes || 720;
    const tier = alt.tier || 'CONFIRMED';

    const normalizedLegs = rawLegs.map((leg, lIdx) => {
      const fromCode = String(leg.fromCode || leg.from?.code || leg.from || '').toUpperCase();
      const toCode = String(leg.toCode || leg.to?.code || leg.to || '').toUpperCase();
      const fromName = leg.fromName || leg.from?.name || fromCode;
      const toName = leg.toName || leg.to?.name || toCode;
      const trainNo = String(leg.trainNo || leg.trainNumber || leg.number || '');
      const trainName = leg.trainName || leg.service?.name || (leg.isTransfer ? 'Transfer' : 'Express');
      const legFare = typeof leg.fare === 'number' && leg.fare > 0
        ? leg.fare
        : (typeof leg.totalFare === 'number' && leg.totalFare > 0 ? leg.totalFare : (typeof leg.price === 'number' && leg.price > 0 ? leg.price : null));

      return {
        id: leg.id || `alt-${i}-leg-${lIdx}`,
        sequence: lIdx + 1,
        mode: leg.mode || (leg.isTransfer ? 'road' : 'rail'),
        isTransfer: Boolean(leg.isTransfer || leg.type === 'transfer'),
        type: leg.type,
        from: fromCode,
        to: toCode,
        fromCode,
        toCode,
        fromName,
        toName,
        origin: { code: fromCode, name: fromName },
        destination: { code: toCode, name: toName },
        originStation: { code: fromCode, name: fromName, stationCode: fromCode },
        destinationStation: { code: toCode, name: toName, stationCode: toCode },
        departureTime: leg.departureTime || leg.departure || '--:--',
        arrivalTime: leg.arrivalTime || leg.arrival || '--:--',
        departureTimeFormatted: leg.departureTimeFormatted || leg.departureTime,
        arrivalTimeFormatted: leg.arrivalTimeFormatted || leg.arrivalTime,
        departureDate: leg.departureDate,
        arrivalDate: leg.arrivalDate,
        departureDateFormatted: leg.departureDateFormatted || leg.departureDate,
        arrivalDateFormatted: leg.arrivalDateFormatted || leg.arrivalDate,
        duration: leg.duration || leg.durationMinutes,
        durationMinutes: leg.durationMinutes || leg.duration,
        distance: leg.distance,
        price: legFare,
        fare: legFare,
        totalFare: legFare,
        travelClass: leg.class || leg.travelClass || alt.laneClass || '3A',
        service: {
          number: trainNo,
          name: trainName,
          class: leg.class || leg.travelClass || alt.laneClass || '3A',
          operator: leg.operator || 'Indian Railways',
        },
        trainNo,
        trainNumber: trainNo,
        trainName,
        availability: leg.availability || {
          status: alt.tier || 'CONFIRMED',
          normalizedStatus: alt.tier || 'CONFIRMED',
        },
        metadata: leg.metadata || {},
      };
    });

    const firstRailLeg = normalizedLegs.find((l) => l.mode === 'rail') || normalizedLegs[0];
    const lastRailLeg = [...normalizedLegs].reverse().find((l) => l.mode === 'rail') || normalizedLegs[normalizedLegs.length - 1];

    const requestedOrigin = alt.requestedOrigin || alt.origin?.code || firstRailLeg?.fromCode;
    const requestedDestination = alt.requestedDestination || alt.destination?.code || lastRailLeg?.toCode;
    const actualDeparture = firstRailLeg?.fromCode;
    const actualArrival = lastRailLeg?.toCode;

    const hasOriginShift = Boolean(requestedOrigin && actualDeparture && requestedOrigin !== actualDeparture);
    const hasDestShift = Boolean(requestedDestination && actualArrival && requestedDestination !== actualArrival);

    list.push({
      id: `alt-${i}-${alt.laneClass || 'any'}`,
      title: `Alternative via ${alt.hubCode || 'Hub'}`,
      departureTime: depTime,
      arrivalTime: arrTime,
      duration,
      durationMinutes: duration,
      numberOfTransfers: transfers,
      transferCount: transfers,
      totalPrice: fare,
      fare,
      price: fare,
      priceFormatted: fare !== null ? `₹${fare.toLocaleString('en-IN')}` : 'Fare after check',
      currency: 'INR',
      tier,
      tierScore: tier === 'CONFIRMED' ? 100 : (tier === 'RAC' ? 75 : (tier === 'WAITLIST' || tier === 'RISKY' ? 50 : 0)),
      isDirectTrain: false,
      isAlternative: true,
      sameTrain: isSameTrain,
      transportModes: ['rail'],
      from: actualDeparture,
      to: actualArrival,
      requestedOrigin,
      requestedDestination,
      origin: {
        code: requestedOrigin,
        name: alt.origin?.name || requestedOrigin,
      },
      destination: {
        code: requestedDestination,
        name: alt.destination?.name || requestedDestination,
      },
      stationDifference: alt.stationDifference || {
        hasDifference: hasOriginShift || hasDestShift,
        originShift: {
          isShift: hasOriginShift,
          requestedCode: requestedOrigin,
          actualCode: actualDeparture,
        },
        destinationShift: {
          isShift: hasDestShift,
          requestedCode: requestedDestination,
          actualCode: actualArrival,
        },
      },
      laneClass: alt.laneClass,
      hubCode: alt.hubCode,
      layoverMinutes: alt.layoverMinutes,
      totalWaitingMinutes: alt.totalWaitingMinutes || alt.layoverMinutes || 0,
      badge: alt.badge,
      notice: alt.notice,
      legs: normalizedLegs,
      raw: alt,
    });
  }

  return list;
}

/**
 * Rank journeys using the new fields:
 * - Best Overall: tier desc, duration asc, fare asc
 * - Fastest: duration asc
 * - Cheapest: fare asc (nulls/Fare after check last)
 * - Fewest Transfers: numberOfTransfers asc, duration asc
 */
export function rankJourneys(journeys = [], strategy = 'overall') {
  const sorted = [...journeys];
  switch (strategy) {
    case 'fastest':
      return sorted.sort((a, b) => (a.duration || 0) - (b.duration || 0));

    case 'cheapest':
      return sorted.sort((a, b) => {
        if (a.totalPrice === null && b.totalPrice === null) return 0;
        if (a.totalPrice === null) return 1;
        if (b.totalPrice === null) return -1;
        return a.totalPrice - b.totalPrice;
      });

    case 'fewest_transfers':
      return sorted.sort((a, b) => {
        const diff = (a.numberOfTransfers ?? 0) - (b.numberOfTransfers ?? 0);
        if (diff !== 0) return diff;
        return (a.duration || 0) - (b.duration || 0);
      });

    case 'overall':
    default:
      return sorted.sort((a, b) => {
        // 1. Tier score descending (CONFIRMED > RAC > WAITLIST > UNCHECKED)
        const tierDiff = (b.tierScore || 0) - (a.tierScore || 0);
        if (tierDiff !== 0) return tierDiff;
        // 2. Duration ascending
        const durDiff = (a.duration || 0) - (b.duration || 0);
        if (durDiff !== 0) return durDiff;
        // 3. Price ascending
        if (a.totalPrice === null && b.totalPrice === null) return 0;
        if (a.totalPrice === null) return 1;
        if (b.totalPrice === null) return -1;
        return a.totalPrice - b.totalPrice;
      });
  }
}

/**
 * Phase 5 Selector: hasConfirmedDirect
 * Returns true if any direct train has at least one CONFIRMED (AVAILABLE) class.
 */
export function hasConfirmedDirect(directTrains = []) {
  if (!Array.isArray(directTrains)) return false;
  return directTrains.some((t) =>
    (t.classes || []).some((c) => {
      const isChecked = c.state === 'CHECKED' || c.checked;
      const tier = String(c.tier || c.normalizedStatus || '').toUpperCase();
      const txt = String(c.availabilityText || '').toUpperCase();
      const isAvailable =
        tier === 'AVAILABLE' ||
        tier === 'CONFIRMED' ||
        txt.startsWith('AVL') ||
        txt.startsWith('AVAILABLE') ||
        txt.startsWith('CURR_AVBL');
      const isUnavailable =
        tier === 'UNAVAILABLE' ||
        txt.includes('NOT AVAILABLE') ||
        txt.includes('REGRET') ||
        txt.includes('TRAIN DEPARTED');
      return (isChecked || isAvailable) && isAvailable && !isUnavailable;
    })
  );
}

/**
 * Phase 5 Ordering Selector for all four cases:
 * 1. 'confirmed direct' -> Direct trains first, alternatives behind button/below
 * 2. 'no confirmed direct with alternatives' -> Alternatives first, then direct trains
 * 3. 'nothing confirmed' -> Empty state / closest risky alternatives
 * 4. 'loading' -> Skeleton shown in alternatives section
 */
export function determineDisplayOrder({
  hasConfirmed = null,
  hasConfirmedDirect: hasConfirmedDirectArg = null,
  direct = [],
  alternatives = [],
  isLoadingAlternatives = false,
} = {}) {
  const confirmedDirect =
    hasConfirmedDirectArg !== null
      ? Boolean(hasConfirmedDirectArg)
      : (hasConfirmed !== null ? Boolean(hasConfirmed) : hasConfirmedDirect(direct));

  if (confirmedDirect) {
    return 'confirmed direct';
  }
  if (isLoadingAlternatives) {
    return 'loading';
  }
  if (Array.isArray(alternatives) && alternatives.length > 0) {
    return 'no confirmed direct with alternatives';
  }
  return 'nothing confirmed';
}

/**
 * Extended display order object for rendering logic
 */
export function selectDisplayOrder(params = {}) {
  const mode = determineDisplayOrder(params);
  return {
    mode,
    isConfirmedDirect: mode === 'confirmed direct',
    isAlternativesFirst: mode === 'no confirmed direct with alternatives' || mode === 'loading' || mode === 'nothing confirmed',
    isLoading: mode === 'loading',
    isNothingConfirmed: mode === 'nothing confirmed',
    primarySection: mode === 'confirmed direct' ? 'direct' : 'alternatives',
    secondarySection: mode === 'confirmed direct' ? 'alternatives' : 'direct',
  };
}

/**
 * Phase 5 Empty State Facts:
 * Computes exact factual counts across checked direct trains:
 * "Checked X segments on Y trains. Z waitlisted, W unavailable, E could not be checked. Closest: <train> <from>-><to> <class> WL 4 (91%)."
 */
export function computeEmptyStateFacts({ direct = [] } = {}) {
  let totalSegments = 0;
  let trainsCount = Array.isArray(direct) ? direct.length : 0;
  let waitlistedCount = 0;
  let unavailableCount = 0;
  let errorCount = 0;
  let closestCandidate = null;

  if (Array.isArray(direct)) {
    for (const train of direct) {
      const classes = Array.isArray(train.classes) ? train.classes : [];
      for (const cls of classes) {
        if (cls.state !== 'CHECKED' && !cls.checked) continue;
        totalSegments++;
        const tier = String(cls.tier || cls.normalizedStatus || '').toUpperCase();
        const txt = String(cls.availabilityText || '').toUpperCase();

        if (tier === 'ERROR' || tier === 'UNKNOWN' || tier === 'SCHEDULE_FOUND' || txt.includes("COULDN'T CHECK")) {
          errorCount++;
        } else if (tier === 'UNAVAILABLE' || txt.includes('NOT AVAILABLE') || txt.includes('REGRET')) {
          unavailableCount++;
        } else if (tier === 'WAITLIST' || tier === 'RAC' || txt.includes('WL') || txt.includes('RAC')) {
          waitlistedCount++;
          const predPct = typeof cls.predictionPercentage === 'number' ? cls.predictionPercentage : 0;
          const wlPos = typeof cls.waitlistPosition === 'number' ? cls.waitlistPosition : 999;

          // Closest candidate: highest predictionPercentage or lowest waitlist position
          if (
            !closestCandidate ||
            predPct > closestCandidate.predictionPercentage ||
            (predPct === closestCandidate.predictionPercentage && wlPos < closestCandidate.waitlistPosition)
          ) {
            closestCandidate = {
              trainNumber: train.trainNumber || train.train_number,
              trainName: train.trainName,
              from: train.from,
              to: train.to,
              class: cls.class,
              availabilityText: cls.availabilityText || `WL ${wlPos}`,
              predictionPercentage: predPct,
              waitlistPosition: wlPos,
            };
          }
        }
      }
    }
  }

  const allInError = totalSegments > 0 && errorCount === totalSegments;

  let closestText = '';
  if (closestCandidate) {
    const pctStr = closestCandidate.predictionPercentage > 0 ? ` (${closestCandidate.predictionPercentage}%)` : '';
    closestText = `Closest: ${closestCandidate.trainNumber} ${closestCandidate.from}->${closestCandidate.to} ${closestCandidate.class} ${closestCandidate.availabilityText}${pctStr}.`;
  }

  const summaryText = `Checked ${totalSegments} segments on ${trainsCount} trains. ${waitlistedCount} waitlisted, ${unavailableCount} unavailable, ${errorCount} could not be checked.${closestText ? ' ' + closestText : ''}`;

  return {
    totalSegments,
    trainsCount,
    waitlistedCount,
    unavailableCount,
    errorCount,
    allInError,
    closestCandidate,
    summaryText,
  };
}

export default {
  toJourneyViewModel,
  rankJourneys,
  hasConfirmedDirect,
  determineDisplayOrder,
  selectDisplayOrder,
  computeEmptyStateFacts,
};

