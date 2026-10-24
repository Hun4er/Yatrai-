import {
  formatDuration,
  formatPrice,
  formatTime,
  formatDateDisplay,
  getDayOffset,
} from './formatters.js';

/**
 * Canonical dictionary of major stations & cluster partners
 * to ensure pristine names, codes, and cities without fabricating details.
 */
export const KNOWN_STATIONS = {
  HWH: { code: 'HWH', name: 'Howrah Junction', city: 'Kolkata' },
  SDAH: { code: 'SDAH', name: 'Sealdah', city: 'Kolkata' },
  KOAA: { code: 'KOAA', name: 'Kolkata Chitpur', city: 'Kolkata' },
  SHM: { code: 'SHM', name: 'Shalimar', city: 'Kolkata' },
  SRC: { code: 'SRC', name: 'Santragachi', city: 'Kolkata' },
  BSB: { code: 'BSB', name: 'Varanasi Junction', city: 'Varanasi' },
  DDU: { code: 'DDU', name: 'Pt. Deen Dayal Upadhyaya Junction', city: 'Mughalsarai / Varanasi' },
  MUV: { code: 'MUV', name: 'Banaras', city: 'Varanasi' },
  BCY: { code: 'BCY', name: 'Varanasi City', city: 'Varanasi' },
  NDLS: { code: 'NDLS', name: 'New Delhi', city: 'Delhi' },
  DLI: { code: 'DLI', name: 'Old Delhi', city: 'Delhi' },
  NZM: { code: 'NZM', name: 'Hazrat Nizamuddin', city: 'Delhi' },
  ANVT: { code: 'ANVT', name: 'Anand Vihar Terminal', city: 'Delhi' },
  PNBE: { code: 'PNBE', name: 'Patna Junction', city: 'Patna' },
  DNR: { code: 'DNR', name: 'Danapur', city: 'Patna' },
  PPTA: { code: 'PPTA', name: 'Patliputra', city: 'Patna' },
  RJPB: { code: 'RJPB', name: 'Rajendra Nagar Terminal', city: 'Patna' },
  CSMT: { code: 'CSMT', name: 'Chhatrapati Shivaji Maharaj Terminus', city: 'Mumbai' },
  MMCT: { code: 'MMCT', name: 'Mumbai Central', city: 'Mumbai' },
  BCT: { code: 'BCT', name: 'Mumbai Central', city: 'Mumbai' },
  LTT: { code: 'LTT', name: 'Lokmanya Tilak Terminus', city: 'Mumbai' },
  BDTS: { code: 'BDTS', name: 'Bandra Terminus', city: 'Mumbai' },
  MAS: { code: 'MAS', name: 'MGR Chennai Central', city: 'Chennai' },
  MS: { code: 'MS', name: 'Chennai Egmore', city: 'Chennai' },
  SBC: { code: 'SBC', name: 'KSR Bengaluru', city: 'Bengaluru' },
  YPR: { code: 'YPR', name: 'Yesvantpur', city: 'Bengaluru' },
  SMVB: { code: 'SMVB', name: 'Sir M. Visvesvaraya Terminal', city: 'Bengaluru' },
  CNB: { code: 'CNB', name: 'Kanpur Central', city: 'Kanpur' },
  LKO: { code: 'LKO', name: 'Lucknow Charbagh', city: 'Lucknow' },
  LJN: { code: 'LJN', name: 'Lucknow Junction', city: 'Lucknow' },
  GKP: { code: 'GKP', name: 'Gorakhpur Junction', city: 'Gorakhpur' },
  PRYJ: { code: 'PRYJ', name: 'Prayagraj Junction', city: 'Prayagraj' },
};

/**
 * Resolves station details (code, name, city) from varied backend payloads
 * (Location documents, station metadata, string codes, or displayName).
 */
export function resolveStation(locationObj, explicitCode, explicitName) {
  let code = '';
  let name = '';
  let city = '';

  if (explicitCode && typeof explicitCode === 'string') {
    code = explicitCode.toUpperCase().trim();
  }

  if (locationObj && typeof locationObj === 'object') {
    if (!code) {
      code = String(
        locationObj.stationCode ||
          locationObj.code ||
          locationObj.metadata?.stationCode ||
          locationObj.metadata?.code ||
          ''
      ).toUpperCase().trim();
    }

    if (!code && locationObj.displayName) {
      const match =
        locationObj.displayName.match(/-\s*([A-Z0-9]{2,6})$/i) ||
        locationObj.displayName.match(/\(([A-Z0-9]{2,6})\)/i);
      if (match) code = match[1].toUpperCase();
    }

    if (!code && locationObj.name) {
      const match = locationObj.name.match(/\(([A-Z0-9]{2,6})\)/i);
      if (match) code = match[1].toUpperCase();
    }

    name = locationObj.name || locationObj.displayName || '';
    city = locationObj.city || '';
  }

  if (!name && explicitName) {
    name = explicitName;
  }

  if (!code && name) {
    const upper = name.toUpperCase();
    if (upper.includes('HOWRAH')) code = 'HWH';
    else if (upper.includes('SEALDAH')) code = 'SDAH';
    else if (upper.includes('VARANASI') || upper.includes('BANARAS') || upper.includes('KASHI')) code = 'BSB';
    else if (upper.includes('DEEN DAYAL') || upper.includes('MUGHALSARAI') || upper.includes('DDU')) code = 'DDU';
    else if (upper.includes('PATNA')) code = 'PNBE';
    else if (upper.includes('DANAPUR')) code = 'DNR';
    else if (upper.includes('NEW DELHI')) code = 'NDLS';
    else if (upper.includes('ANAND VIHAR')) code = 'ANVT';
    else if (upper.includes('KANPUR')) code = 'CNB';
  }

  // Canonical name and city replacement if known
  if (code && KNOWN_STATIONS[code]) {
    const known = KNOWN_STATIONS[code];
    if (
      !name ||
      (code === 'SDAH' && name.toUpperCase().includes('HOWRAH')) ||
      (code === 'DDU' && name.toUpperCase().includes('VARANASI')) ||
      (code === 'HWH' && name.toUpperCase().includes('SEALDAH')) ||
      (code === 'BSB' && name.toUpperCase().includes('DEEN DAYAL'))
    ) {
      name = known.name;
    }
    if (!city) city = known.city;
  }

  // Clean trailing (CODE) or - CODE from name to avoid duplicate suffixes
  if (name && code) {
    name = name.replace(new RegExp(`\\s*\\(${code}\\)`, 'gi'), '');
    name = name.replace(new RegExp(`\\s*-\\s*${code}$`, 'gi'), '');
    name = name.trim();
  }

  return { code, name: name || code, city };
}

/**
 * Parses journey data into structured journey stages:
 * - Stage 1 (Access Journey): Requested Origin -> Actual Train Boarding Station
 * - Stage 2 (Actual Train Journey): Actual Boarding Station -> Actual Arrival Station
 * - Stage 3 (Onward Journey): Actual Arrival Station -> Requested Destination
 *
 * Handles connected journeys (with expanded legs), unarranged station shifts,
 * and pure direct trains.
 */
export function parseJourneyStages(journey) {
  if (!journey) return null;

  const legs = Array.isArray(journey.legs) ? journey.legs : [];

  // 1. Identify main train leg
  let mainTrainLeg = null;
  if (legs.length > 0) {
    mainTrainLeg =
      legs.find((l) => l.metadata?.isMainTrain === true) ||
      legs.find((l) => l.mode === 'rail' && !l.metadata?.isFeeder) ||
      legs.find((l) => l.mode === 'rail') ||
      legs[0];
  }

  // 2. Resolve Requested Origin & Destination
  const reqOrigin = resolveStation(
    journey.origin,
    journey.stationDifference?.originShift?.requestedCode || journey.metadata?.requestedOriginCode,
    journey.stationDifference?.originShift?.requestedName
  );

  const reqDest = resolveStation(
    journey.destination,
    journey.stationDifference?.destinationShift?.requestedCode || journey.metadata?.requestedDestCode,
    journey.stationDifference?.destinationShift?.requestedName
  );

  // 3. Resolve Actual Train Boarding & Arrival Stations
  const trainFromCodeCandidate =
    journey.metadata?.fromStationCode ||
    mainTrainLeg?.metadata?.fromStationCode ||
    mainTrainLeg?.originStation?.stationCode ||
    mainTrainLeg?.originStation?.code ||
    journey.stationDifference?.originShift?.actualCode;

  const trainFromNameCandidate =
    journey.metadata?.fromStation ||
    mainTrainLeg?.metadata?.fromStationName ||
    mainTrainLeg?.originStation?.name ||
    journey.stationDifference?.originShift?.actualName;

  const trainFrom = resolveStation(
    mainTrainLeg?.originStation || (trainFromCodeCandidate ? null : journey.origin),
    trainFromCodeCandidate || reqOrigin.code,
    trainFromNameCandidate || reqOrigin.name
  );

  const trainToCodeCandidate =
    journey.metadata?.toStationCode ||
    mainTrainLeg?.metadata?.toStationCode ||
    mainTrainLeg?.destinationStation?.stationCode ||
    mainTrainLeg?.destinationStation?.code ||
    journey.stationDifference?.destinationShift?.actualCode;

  const trainToNameCandidate =
    journey.metadata?.toStation ||
    mainTrainLeg?.metadata?.toStationName ||
    mainTrainLeg?.destinationStation?.name ||
    journey.stationDifference?.destinationShift?.actualName;

  const trainTo = resolveStation(
    mainTrainLeg?.destinationStation || (trainToCodeCandidate ? null : journey.destination),
    trainToCodeCandidate || reqDest.code,
    trainToNameCandidate || reqDest.name
  );

  // 4. Shift evaluation
  const isDirect = Boolean(
    journey.isDirectTrain ||
      (journey.numberOfTransfers === 0 && (!legs || legs.length <= 1))
  );

  let hasOriginShift = false;
  let hasDestShift = false;

  if (journey.stationDifference && typeof journey.stationDifference.hasDifference === 'boolean') {
    hasOriginShift = Boolean(journey.stationDifference.originShift?.isShift);
    hasDestShift = Boolean(journey.stationDifference.destinationShift?.isShift);
  } else if (journey.metadata?.stationDifference && typeof journey.metadata.stationDifference.hasDifference === 'boolean') {
    hasOriginShift = Boolean(journey.metadata.stationDifference.originShift?.isShift);
    hasDestShift = Boolean(journey.metadata.stationDifference.destinationShift?.isShift);
  } else {
    // Only infer shift if station names are genuinely different
    const namesMatchOrigin =
      reqOrigin.name &&
      trainFrom.name &&
      (reqOrigin.name.toLowerCase() === trainFrom.name.toLowerCase() ||
        reqOrigin.name.toLowerCase().includes(trainFrom.name.toLowerCase()) ||
        trainFrom.name.toLowerCase().includes(reqOrigin.name.toLowerCase()));
    const codesMatchOrigin = reqOrigin.code && trainFrom.code && reqOrigin.code === trainFrom.code;
    hasOriginShift = !namesMatchOrigin && !codesMatchOrigin && Boolean(reqOrigin.code && trainFrom.code);

    const namesMatchDest =
      reqDest.name &&
      trainTo.name &&
      (reqDest.name.toLowerCase() === trainTo.name.toLowerCase() ||
        reqDest.name.toLowerCase().includes(trainTo.name.toLowerCase()) ||
        trainTo.name.toLowerCase().includes(reqDest.name.toLowerCase()));
    const codesMatchDest = reqDest.code && trainTo.code && reqDest.code === trainTo.code;
    hasDestShift = !namesMatchDest && !codesMatchDest && Boolean(reqDest.code && trainTo.code);
  }

  // If pure direct train with 0 transfers and no explicit station shift, ensure no shift flags
  if (isDirect && !journey.stationDifference?.hasDifference && !journey.isClusterShift) {
    hasOriginShift = false;
    hasDestShift = false;
  }

  const hasStationDifference = hasOriginShift || hasDestShift;

  // 5. Stage 1 — Access Journey (only when genuine origin shift exists)
  let accessStage = null;
  if (hasOriginShift) {
    const connectedAccessLeg = legs.find(
      (l) =>
        l !== mainTrainLeg &&
        (l.metadata?.transferRole === 'origin' ||
          l.metadata?.isStationTransfer ||
          l.metadata?.isFeeder ||
          String(l.originStation?.stationCode || l.origin?.stationCode || l.origin || '').toUpperCase() === reqOrigin.code ||
          String(l.destinationStation?.stationCode || l.destination?.stationCode || l.destination || '').toUpperCase() === trainFrom.code)
    );

    if (connectedAccessLeg) {
      accessStage = {
        type: 'connected',
        stageNumber: 1,
        title: 'STAGE 1 — ACCESS JOURNEY',
        role: 'access',
        originName: reqOrigin.name,
        originCode: reqOrigin.code,
        originCity: reqOrigin.city,
        destinationName: trainFrom.name,
        destinationCode: trainFrom.code,
        destinationCity: trainFrom.city,
        leg: connectedAccessLeg,
        mode: connectedAccessLeg.mode || 'road',
        isTransfer: Boolean(connectedAccessLeg.metadata?.isStationTransfer || connectedAccessLeg.mode === 'road'),
        isFeeder: Boolean(connectedAccessLeg.metadata?.isFeeder),
        departureTime: connectedAccessLeg.departureTimeFormatted || formatTime(connectedAccessLeg.departureTime),
        arrivalTime: connectedAccessLeg.arrivalTimeFormatted || formatTime(connectedAccessLeg.arrivalTime),
        departureDate: connectedAccessLeg.departureDateFormatted || formatDateDisplay(connectedAccessLeg.departureTime),
        arrivalDate: connectedAccessLeg.arrivalDateFormatted || formatDateDisplay(connectedAccessLeg.arrivalTime),
        dayOffset: connectedAccessLeg.dayOffset ?? getDayOffset(connectedAccessLeg.departureTime, connectedAccessLeg.arrivalTime),
        duration: connectedAccessLeg.duration,
        distance: connectedAccessLeg.distance,
        fare: connectedAccessLeg.price != null && connectedAccessLeg.price > 0 ? connectedAccessLeg.price : null,
        fareNote: connectedAccessLeg.metadata?.fareNote || (connectedAccessLeg.mode === 'road' ? 'Local transport fare not included' : null),
        isEstimatedFare: Boolean(connectedAccessLeg.isEstimated),
        provider:
          connectedAccessLeg.service?.operator ||
          connectedAccessLeg.service?.name ||
          (connectedAccessLeg.mode === 'road' ? 'Metro / Cab / Auto' : 'Indian Railways'),
        serviceName: connectedAccessLeg.service?.name || (connectedAccessLeg.mode === 'road' ? 'Local transfer (metro / cab)' : 'Connecting Train'),
        trainNumber: connectedAccessLeg.service?.number || connectedAccessLeg.vehicle?.identifier,
        connectionStatus: connectedAccessLeg.metadata?.isFeeder
          ? 'Connecting feeder train (check availability on IRCTC)'
          : 'Arranged road transfer · Check boarding buffer',
      };
    } else {
      // Unarranged Access stage (do not invent transport mode or fake fares)
      accessStage = {
        type: 'unarranged',
        stageNumber: 1,
        title: 'STAGE 1 — ACCESS JOURNEY',
        role: 'access',
        originName: reqOrigin.name,
        originCode: reqOrigin.code,
        originCity: reqOrigin.city,
        destinationName: trainFrom.name,
        destinationCode: trainFrom.code,
        destinationCity: trainFrom.city,
        connectionStatus: 'Access journey not yet arranged',
        noticeText: `Your train departs from ${trainFrom.name}${trainFrom.code ? ` (${trainFrom.code})` : ''}. Check available transport from ${reqOrigin.name} to the boarding station.`,
      };
    }
  }

/**
 * Helper to extract minutes from ISO timestamp or HH:mm time string.
 */
function parseTimeMinutes(val) {
  if (!val) return null;
  const str = String(val).trim();
  const d = new Date(str);
  if (!isNaN(d.getTime()) && str.length > 8) {
    return Math.round(d.getTime() / 60000);
  }
  const match = /(\d{1,2}):(\d{2})/.exec(str);
  if (match) {
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }
  return null;
}

  // 6. Stage 2 (and subsequent) — Actual Train Journey(s)
  const railLegs = legs.filter((l) => l.mode === 'rail' && !l.metadata?.isFeeder && !l.metadata?.isStationTransfer);
  const effectiveRailLegs =
    railLegs.length > 0
      ? [...railLegs]
      : legs.filter((l) => l.mode === 'rail').length > 0
      ? [...legs.filter((l) => l.mode === 'rail')]
      : mainTrainLeg
      ? [mainTrainLeg]
      : [];

  if (
    effectiveRailLegs.length === 0 &&
    (journey.trainNumber || journey.isDirectTrain || journey.from || journey.origin || journey.title || journey.metadata?.trainNumber)
  ) {
    const rawPrice =
      journey.totalPrice ??
      journey.pricing?.totalFare ??
      journey.pricing?.mainTrainFare ??
      journey.fare ??
      journey.price ??
      null;
    const syntheticLeg = {
      id: journey.id || 'direct-leg-1',
      sequence: 1,
      mode: 'rail',
      origin: journey.origin || { code: journey.from || trainFrom.code, name: journey.fromName || trainFrom.name },
      destination: journey.destination || { code: journey.to || trainTo.code, name: journey.toName || trainTo.name },
      departureTime: journey.departureTime,
      arrivalTime: journey.arrivalTime,
      departureTimeFormatted: journey.departureTimeFormatted,
      arrivalTimeFormatted: journey.arrivalTimeFormatted,
      departureDateFormatted: journey.departureDateFormatted,
      arrivalDateFormatted: journey.arrivalDateFormatted,
      duration: journey.duration || journey.durationMinutes,
      distance: journey.totalDistance,
      price: rawPrice,
      isEstimated: Boolean(journey.pricing?.isEstimated || journey.metadata?.isEstimatedPrice || journey.isEstimated),
      service: {
        number: journey.trainNumber || journey.metadata?.trainNumber || journey.vehicle?.identifier || '',
        name: journey.trainName || journey.metadata?.trainName || journey.service?.name || journey.title || 'Direct Train',
        class: journey.travelClass || journey.service?.class || journey.classes?.[0]?.class || '3A',
        operator: journey.provider || 'Indian Railways',
      },
      availability: journey.availability || {
        status: journey.tier || journey.availabilityStatus || 'AVAILABLE',
        normalizedStatus: journey.tier || journey.availabilityStatus || 'AVAILABLE',
        rawStatus: '',
      },
    };
    effectiveRailLegs.push(syntheticLeg);
  }

  const trainStages = effectiveRailLegs.map((leg, idx) => {
    const rawAvail = leg.availability || (idx === 0 ? journey.availability : {}) || {};
    const normStatus =
      rawAvail.normalizedStatus ||
      rawAvail.status ||
      (idx === 0 ? journey.availabilityStatus : null) ||
      'UNKNOWN';
    const rawStatus = rawAvail.rawStatus || rawAvail.originalStatus || '';
    const seats = rawAvail.seatsAvailable;

    const legFare =
      leg.price != null && leg.price > 0
        ? leg.price
        : effectiveRailLegs.length === 1
        ? journey.pricing?.mainTrainFare || journey.pricing?.totalFare || journey.totalPrice || journey.fare || journey.price || null
        : null;
    const isEstimatedFare = Boolean(
      leg.isEstimated ||
        (effectiveRailLegs.length === 1 && (journey.pricing?.isEstimated || journey.metadata?.isEstimatedPrice))
    );

    const legFromCandidate =
      leg.metadata?.fromStationCode ||
      leg.originStation?.stationCode ||
      leg.originStation?.code ||
      leg.origin?.stationCode ||
      leg.origin?.code;
    const legFromName = leg.metadata?.fromStationName || leg.originStation?.name || leg.origin?.name;
    const legFrom = resolveStation(
      leg.originStation || leg.origin,
      legFromCandidate || (idx === 0 ? trainFrom.code : ''),
      legFromName || (idx === 0 ? trainFrom.name : '')
    );

    const legToCandidate =
      leg.metadata?.toStationCode ||
      leg.destinationStation?.stationCode ||
      leg.destinationStation?.code ||
      leg.destination?.stationCode ||
      leg.destination?.code;
    const legToName = leg.metadata?.toStationName || leg.destinationStation?.name || leg.destination?.name;
    const legTo = resolveStation(
      leg.destinationStation || leg.destination,
      legToCandidate || (idx === effectiveRailLegs.length - 1 ? trainTo.code : ''),
      legToName || (idx === effectiveRailLegs.length - 1 ? trainTo.name : '')
    );

    let transferBuffer = null;
    if (idx < effectiveRailLegs.length - 1) {
      const nextLeg = effectiveRailLegs[idx + 1];
      const nextFromCode =
        nextLeg.metadata?.fromStationCode ||
        nextLeg.originStation?.stationCode ||
        nextLeg.originStation?.code ||
        nextLeg.origin?.stationCode ||
        nextLeg.origin?.code ||
        legTo.code;
      const nextFromName =
        nextLeg.metadata?.fromStationName ||
        nextLeg.originStation?.name ||
        nextLeg.origin?.name ||
        legTo.name;
      let bufferMinutes = null;
      const legArrMins = parseTimeMinutes(leg.arrivalTime);
      const nextDepMins = parseTimeMinutes(nextLeg.departureTime);
      if (legArrMins !== null && nextDepMins !== null) {
        const diff = nextDepMins >= legArrMins ? nextDepMins - legArrMins : (nextDepMins + 1440) - legArrMins;
        if (diff >= 0 && diff < 2880) {
          bufferMinutes = diff;
        }
      }
      transferBuffer = {
        transferStationName: nextFromName,
        transferStationCode: nextFromCode,
        bufferMinutes,
        nextTrainNumber: nextLeg.service?.number || nextLeg.vehicle?.identifier || nextLeg.trainNumber || '',
        nextTrainName: nextLeg.service?.name || nextLeg.trainName || 'Connecting Train',
      };
    }

    const stageNumber = (accessStage ? 1 : 0) + idx + 1;
    const stageTitle =
      effectiveRailLegs.length === 1
        ? accessStage
          ? 'STAGE 2 — ACTUAL TRAIN JOURNEY'
          : 'ACTUAL TRAIN JOURNEY'
        : `STAGE ${stageNumber} — TRAIN ${idx + 1} OF ${effectiveRailLegs.length}`;

    return {
      type: 'train',
      stageNumber,
      title: stageTitle,
      role: idx === 0 && effectiveRailLegs.length === 1 ? 'main_train' : `train_leg_${idx + 1}`,
      originName: legFrom.name,
      originCode: legFrom.code,
      originCity: legFrom.city,
      destinationName: legTo.name,
      destinationCode: legTo.code,
      destinationCity: legTo.city,
      leg,
      mode: 'rail',
      trainName:
        leg.service?.name ||
        leg.trainName ||
        (idx === 0 ? journey.metadata?.trainName : null) ||
        journey.trainName ||
        'Express Train',
      trainNumber:
        leg.service?.number ||
        leg.vehicle?.identifier ||
        leg.trainNumber ||
        (idx === 0 ? journey.metadata?.trainNumber : '') ||
        journey.trainNumber ||
        '',
      travelClass:
        leg.service?.class ||
        journey.service?.class ||
        journey.travelClass ||
        '3A',
      departureTime:
        leg.departureTimeFormatted || formatTime(leg.departureTime),
      arrivalTime:
        leg.arrivalTimeFormatted || formatTime(leg.arrivalTime),
      departureDate:
        leg.departureDateFormatted || formatDateDisplay(leg.departureTime),
      arrivalDate:
        leg.arrivalDateFormatted || formatDateDisplay(leg.arrivalTime),
      dayOffset:
        leg.dayOffset ?? getDayOffset(leg.departureTime, leg.arrivalTime, leg.duration),
      duration: leg.duration || (idx === 0 ? (journey.duration || journey.durationMinutes) : null),
      distance: leg.distance || (idx === 0 ? journey.totalDistance : null),
      fare: legFare,
      isEstimatedFare,
      availability: {
        status: normStatus,
        rawStatus,
        seats,
      },
      provider:
        leg.service?.operator ||
        journey.metadata?.provider ||
        'Indian Railways (IRCTC)',
      transferBuffer,
    };
  });

  const trainStage = trainStages[0] || null;

  // 7. Stage 3 — Onward Journey
  let onwardStage = null;
  if (hasDestShift) {
    const connectedOnwardLeg = legs.find(
      (l) =>
        !effectiveRailLegs.includes(l) &&
        l !== accessStage?.leg &&
        (l.metadata?.transferRole === 'destination' ||
          l.metadata?.isStationTransfer ||
          l.metadata?.isFeeder ||
          String(l.originStation?.stationCode || l.origin?.stationCode || l.origin || '').toUpperCase() === trainTo.code ||
          String(l.destinationStation?.stationCode || l.destination?.stationCode || l.destination || '').toUpperCase() === reqDest.code)
    );

    if (connectedOnwardLeg) {
      onwardStage = {
        type: 'connected',
        stageNumber: (accessStage ? 1 : 0) + trainStages.length + 1,
        title: accessStage ? 'STAGE 3 — ONWARD JOURNEY' : 'STAGE 2 — ONWARD JOURNEY',
        role: 'onward',
        originName: trainTo.name,
        originCode: trainTo.code,
        originCity: trainTo.city,
        destinationName: reqDest.name,
        destinationCode: reqDest.code,
        destinationCity: reqDest.city,
        leg: connectedOnwardLeg,
        mode: connectedOnwardLeg.mode || 'road',
        isTransfer: Boolean(connectedOnwardLeg.metadata?.isStationTransfer || connectedOnwardLeg.mode === 'road'),
        isFeeder: Boolean(connectedOnwardLeg.metadata?.isFeeder),
        departureTime: connectedOnwardLeg.departureTimeFormatted || formatTime(connectedOnwardLeg.departureTime),
        arrivalTime: connectedOnwardLeg.arrivalTimeFormatted || formatTime(connectedOnwardLeg.arrivalTime),
        departureDate: connectedOnwardLeg.departureDateFormatted || formatDateDisplay(connectedOnwardLeg.departureTime),
        arrivalDate: connectedOnwardLeg.arrivalDateFormatted || formatDateDisplay(connectedOnwardLeg.arrivalTime),
        dayOffset: connectedOnwardLeg.dayOffset ?? getDayOffset(connectedOnwardLeg.departureTime, connectedOnwardLeg.arrivalTime),
        duration: connectedOnwardLeg.duration,
        distance: connectedOnwardLeg.distance,
        fare: connectedOnwardLeg.price != null && connectedOnwardLeg.price > 0 ? connectedOnwardLeg.price : null,
        fareNote: connectedOnwardLeg.metadata?.fareNote || (connectedOnwardLeg.mode === 'road' ? 'Local transport fare not included' : null),
        isEstimatedFare: Boolean(connectedOnwardLeg.isEstimated),
        provider:
          connectedOnwardLeg.service?.operator ||
          connectedOnwardLeg.service?.name ||
          (connectedOnwardLeg.mode === 'road' ? 'Metro / Cab / Auto' : 'Indian Railways'),
        serviceName: connectedOnwardLeg.service?.name || (connectedOnwardLeg.mode === 'road' ? 'Local transfer (metro / cab)' : 'Connecting Train'),
        trainNumber: connectedOnwardLeg.service?.number || connectedOnwardLeg.vehicle?.identifier,
        connectionStatus: connectedOnwardLeg.metadata?.isFeeder
          ? 'Connecting train (check availability on IRCTC)'
          : 'Arranged road link · Self-arranged local transfer',
      };
    } else {
      // Unarranged Onward stage
      onwardStage = {
        type: 'unarranged',
        stageNumber: (accessStage ? 1 : 0) + trainStages.length + 1,
        title: accessStage ? 'STAGE 3 — ONWARD JOURNEY' : 'STAGE 2 — ONWARD JOURNEY',
        role: 'onward',
        originName: trainTo.name,
        originCode: trainTo.code,
        originCity: trainTo.city,
        destinationName: reqDest.name,
        destinationCode: reqDest.code,
        destinationCity: reqDest.city,
        connectionStatus: 'Final connection not yet arranged',
        noticeText: `Your train arrives at ${trainTo.name}${trainTo.code ? ` (${trainTo.code})` : ''}. Check available transport from ${trainTo.name} to ${reqDest.name}.`,
      };
    }
  }

  // 8. Connection buffers between connected stages
  let accessToTrainBuffer = null;
  if (accessStage?.type === 'connected' && trainStages[0]?.leg) {
    const accArr = parseTimeMinutes(accessStage.leg.arrivalTime);
    const trnDep = parseTimeMinutes(trainStages[0].leg.departureTime);
    if (accArr !== null && trnDep !== null) {
      const diff = trnDep >= accArr ? trnDep - accArr : (trnDep + 1440) - accArr;
      if (diff > 0 && diff < 1440) {
        accessToTrainBuffer = diff;
      }
    }
  }

  let trainToOnwardBuffer = null;
  const lastTrainStage = trainStages[trainStages.length - 1];
  if (onwardStage?.type === 'connected' && lastTrainStage?.leg) {
    const trnArr = parseTimeMinutes(lastTrainStage.leg.arrivalTime);
    const onwDep = parseTimeMinutes(onwardStage.leg.departureTime);
    if (trnArr !== null && onwDep !== null) {
      const diff = onwDep >= trnArr ? onwDep - trnArr : (onwDep + 1440) - trnArr;
      if (diff > 0 && diff < 1440) {
        trainToOnwardBuffer = diff;
      }
    }
  }

  // 9. Cost breakdown
  const accessFare = accessStage?.fare ?? null;
  const trainFare =
    (trainStages.reduce((sum, s) => (s.fare != null ? sum + s.fare : sum), 0)) ||
    trainStage?.fare ||
    journey.totalPrice ||
    journey.pricing?.totalFare ||
    journey.pricing?.mainTrainFare ||
    journey.fare ||
    journey.price ||
    null;
  const onwardFare = onwardStage?.fare ?? null;

  const hasMissingCosts =
    (accessStage && accessFare === null) ||
    (onwardStage && onwardFare === null) ||
    trainFare === null;

  const knownCostSum = (accessFare || 0) + (trainFare || 0) + (onwardFare || 0);
  const totalTransfers = journey.numberOfTransfers ?? (effectiveRailLegs.length > 1 ? effectiveRailLegs.length - 1 : 0);
  const stagesList = [accessStage, ...trainStages, onwardStage].filter(Boolean);

  return {
    reqOriginCode: reqOrigin.code,
    reqOriginName: reqOrigin.name,
    reqOriginCity: reqOrigin.city,
    reqDestCode: reqDest.code,
    reqDestName: reqDest.name,
    reqDestCity: reqDest.city,
    trainFromCode: trainFrom.code,
    trainFromName: trainFrom.name,
    trainFromCity: trainFrom.city,
    trainToCode: trainTo.code,
    trainToName: trainTo.name,
    trainToCity: trainTo.city,
    hasOriginShift,
    hasDestShift,
    hasStationDifference,
    totalTransfers,
    accessStage,
    trainStage,
    trainStages,
    onwardStage,
    stagesList,
    accessToTrainBuffer,
    trainToOnwardBuffer,
    costs: {
      accessFare,
      accessFareEstimated: accessStage?.isEstimatedFare,
      accessFareNote: accessStage?.fareNote,
      trainFare,
      trainFareEstimated: trainStage?.isEstimatedFare,
      onwardFare,
      onwardFareEstimated: onwardStage?.isEstimatedFare,
      onwardFareNote: onwardStage?.fareNote,
      knownCostSum,
      hasMissingCosts,
    },
  };
}

export default {
  KNOWN_STATIONS,
  resolveStation,
  parseJourneyStages,
};
