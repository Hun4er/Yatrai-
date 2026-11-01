import fs from 'fs';
import path from 'path';

console.log('Applying booking, fare, and API efficiency fixes...');

// -------------------------------------------------------------
// 1. server/src/services/bookingService.js
// -------------------------------------------------------------
{
  const filePath = path.resolve('server/src/services/bookingService.js');
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace lines 276-292 (journey datetime and total price reconstruction)
  const targetReconstruct = `  const depTime = new Date(clientSnapshot.departureTime || legs[0].departureTime || Date.now());
  let arrTime = new Date(clientSnapshot.arrivalTime || legs[legs.length - 1].arrivalTime || depTime);
  if (arrTime < depTime) {
    arrTime = new Date(depTime.getTime() + (Number(clientSnapshot.duration) || 60) * 60000);
  }

  const durationMins = Number(clientSnapshot.duration) || Math.max(0, Math.round((arrTime.getTime() - depTime.getTime()) / 60000));
  const numTransfers = clientSnapshot.numberOfTransfers !== undefined
    ? Number(clientSnapshot.numberOfTransfers)
    : (legs.length > 1 ? legs.length - 1 : 0);

  // Compute canonical total price
  let totalPrice = Number(clientSnapshot.totalPrice || clientSnapshot.totalFare || clientSnapshot.fare || 0);
  if (totalPrice <= 0) {
    const legPricesSum = legs.reduce((sum, l) => sum + (Number(l.price || l.fare) || 0), 0);
    totalPrice = legPricesSum > 0 ? legPricesSum : 380;
  }`;

  const replaceReconstruct = `  const depDateVal = clientSnapshot.departureDate || (legs[0] && legs[0].departureDate);
  const depTimeVal = clientSnapshot.departureTime || (legs[0] && legs[0].departureTime);
  const depTime = parseSafeDate(depTimeVal, depDateVal, new Date());

  const arrDateVal = clientSnapshot.arrivalDate || (legs[legs.length - 1] && legs[legs.length - 1].arrivalDate) || depDateVal;
  const arrTimeVal = clientSnapshot.arrivalTime || (legs[legs.length - 1] && legs[legs.length - 1].arrivalTime);
  let arrTime = parseSafeDate(arrTimeVal, arrDateVal, new Date(depTime.getTime() + (Number(clientSnapshot.duration) || 60) * 60000));
  if (arrTime <= depTime) {
    arrTime = new Date(depTime.getTime() + (Number(clientSnapshot.duration) || 60) * 60000);
  }

  const durationMins = Number(clientSnapshot.duration) || Math.max(0, Math.round((arrTime.getTime() - depTime.getTime()) / 60000));
  const numTransfers = clientSnapshot.numberOfTransfers !== undefined
    ? Number(clientSnapshot.numberOfTransfers)
    : (legs.length > 1 ? legs.length - 1 : 0);

  // Compute canonical total price
  let totalPrice = Number(clientSnapshot.totalPrice || clientSnapshot.totalFare || clientSnapshot.fare || 0);
  if (totalPrice <= 0) {
    const legPricesSum = legs.reduce((sum, l) => sum + (Number(l.price || l.fare || l.totalFare) || 0), 0);
    totalPrice = legPricesSum > 0 ? legPricesSum : 380;
  }`;

  // Replace leg datetime and pricing in _reconstructJourneyFromSnapshot
  const targetLegReconstruct = `    const legDepTime = new Date(l.departureTime || depTime);
    let legArrTime = new Date(l.arrivalTime || arrTime);
    if (legArrTime < legDepTime) {
      legArrTime = new Date(legDepTime.getTime() + (Number(l.duration) || 60) * 60000);
    }

    const legOriginLocId = await resolveStationLocationId(legFromCode);
    const legDestLocId = await resolveStationLocationId(legToCode);

    const legPrice = Number(l.price || l.fare || (legs.length === 1 ? totalPrice : Math.round(totalPrice / legs.length)));`;

  const replaceLegReconstruct = `    const legDepDate = l.departureDate || depDateVal;
    const legDepTimeVal = l.departureTime || depTimeVal;
    const legDepTime = parseSafeDate(legDepTimeVal, legDepDate, depTime);

    const legArrDate = l.arrivalDate || arrDateVal || legDepDate;
    const legArrTimeVal = l.arrivalTime || arrTimeVal;
    let legArrTime = parseSafeDate(legArrTimeVal, legArrDate, new Date(legDepTime.getTime() + (Number(l.duration) || 60) * 60000));
    if (legArrTime <= legDepTime) {
      legArrTime = new Date(legDepTime.getTime() + (Number(l.duration) || 60) * 60000);
    }

    const legOriginLocId = await resolveStationLocationId(legFromCode);
    const legDestLocId = await resolveStationLocationId(legToCode);

    let legPrice = Number(l.price || l.fare || l.totalFare || 0);
    if (legPrice <= 0) {
      if (legs.length === 1 && totalPrice > 0) {
        legPrice = totalPrice;
      } else if (totalPrice > 0) {
        legPrice = Math.round(totalPrice / legs.length);
      } else {
        const legDist = Number(l.distance) || clusterService.calculateStationDistanceKm(legFromCode, legToCode) || 450;
        legPrice = fareService.calculateTelescopicTariff(legDist, legClass);
      }
    }`;

  // Replace legBookings and transfers mapping in createBooking
  const targetLegBookings = `    // 7. Multi-leg independent segment tracking
    const legBookings = snapshotLegs.map((l, lIdx) => ({
      sequence: l.sequence || lIdx + 1,
      trainNumber: l.trainNumber || l.service?.number || '',
      trainName: l.trainName || l.service?.name || 'Express Train',
      origin: {
        code: l.origin?.code || l.fromCode || l.from || '',
        name: l.origin?.name || l.fromName || '',
      },
      destination: {
        code: l.destination?.code || l.toCode || l.to || '',
        name: l.destination?.name || l.toName || '',
      },
      departureTime: l.departureTime,
      arrivalTime: l.arrivalTime,
      duration: l.duration,
      distance: l.distance || 0,
      travelClass: l.class || l.service?.class || 'SL',
      quota: l.quota || 'GN',
      fare: Number(l.price || l.fare || 0) * passengerCount,
      availabilityStatus: l.availability || 'VERIFIED',
      bookingStatus: isConfirmed ? 'confirmed' : 'unconfirmed',
      pnr: isConfirmed ? generatePnrNumber() : null,
      providerBookingReference: providerBookingRef,
      seat: null,
      coach: null,
      ticketDocumentReference: null,
    }));

    // Transfers calculation between sequential legs
    const transfers = [];
    for (let i = 0; i < legBookings.length - 1; i++) {
      const l1 = legBookings[i];
      const l2 = legBookings[i + 1];
      const l1Arr = new Date(l1.arrivalTime).getTime();
      const l2Dep = new Date(l2.departureTime).getTime();
      const waitMins = (!isNaN(l1Arr) && !isNaN(l2Dep) && l2Dep >= l1Arr)
        ? Math.round((l2Dep - l1Arr) / 60000)
        : 0;

      transfers.push({
        transferStationCode: l1.destination.code,
        transferStationName: l1.destination.name,
        arrivalStationCode: l1.destination.code,
        departureStationCode: l2.origin.code,
        arrivalTimestamp: l1.arrivalTime,
        nextDepartureTimestamp: l2.departureTime,
        waitingTimeMinutes: waitMins,
        isSameStation: String(l1.destination.code).toUpperCase() === String(l2.origin.code).toUpperCase(),
        connectionStatus: 'validated',
      });
    }`;

  const replaceLegBookings = `    // 7. Multi-leg independent segment tracking
    const legBookings = snapshotLegs.map((l, lIdx) => {
      const legDep = parseSafeDate(l.departureTime, l.departureDate || snapshot.departureDate, snapshot.departureTime || new Date());
      const legArr = parseSafeDate(l.arrivalTime, l.arrivalDate || snapshot.arrivalDate, new Date(legDep.getTime() + (Number(l.duration) || 60) * 60000));
      return {
        sequence: l.sequence || lIdx + 1,
        trainNumber: l.trainNumber || l.service?.number || '',
        trainName: l.trainName || l.service?.name || 'Express Train',
        origin: {
          code: l.origin?.code || l.fromCode || l.from || '',
          name: l.origin?.name || l.fromName || '',
        },
        destination: {
          code: l.destination?.code || l.toCode || l.to || '',
          name: l.destination?.name || l.toName || '',
        },
        departureTime: legDep,
        arrivalTime: legArr,
        duration: l.duration,
        distance: l.distance || 0,
        travelClass: l.class || l.service?.class || 'SL',
        quota: l.quota || 'GN',
        fare: Number(l.price || l.fare || l.totalFare || (snapshot.totalPrice ? Math.round(snapshot.totalPrice / snapshotLegs.length) : 190)) * passengerCount,
        availabilityStatus: l.availability || 'VERIFIED',
        bookingStatus: isConfirmed ? 'confirmed' : 'unconfirmed',
        pnr: isConfirmed ? generatePnrNumber() : null,
        providerBookingReference: providerBookingRef,
        seat: null,
        coach: null,
        ticketDocumentReference: null,
      };
    });

    // Transfers calculation between sequential legs
    const transfers = [];
    for (let i = 0; i < legBookings.length - 1; i++) {
      const l1 = legBookings[i];
      const l2 = legBookings[i + 1];
      const l1Arr = l1.arrivalTime instanceof Date ? l1.arrivalTime.getTime() : new Date(l1.arrivalTime).getTime();
      const l2Dep = l2.departureTime instanceof Date ? l2.departureTime.getTime() : new Date(l2.departureTime).getTime();
      const waitMins = (!isNaN(l1Arr) && !isNaN(l2Dep) && l2Dep >= l1Arr)
        ? Math.round((l2Dep - l1Arr) / 60000)
        : 0;

      transfers.push({
        transferStationCode: l1.destination.code,
        transferStationName: l1.destination.name,
        arrivalStationCode: l1.destination.code,
        departureStationCode: l2.origin.code,
        arrivalTimestamp: l1.arrivalTime,
        nextDepartureTimestamp: l2.departureTime,
        waitingTimeMinutes: waitMins,
        isSameStation: String(l1.destination.code).toUpperCase() === String(l2.origin.code).toUpperCase(),
        connectionStatus: 'validated',
      });
    }`;

  // Normalize line endings for replacement
  const normalizeLf = (s) => s.replace(/\r\n/g, '\n');
  content = normalizeLf(content);

  if (content.includes(normalizeLf(targetReconstruct))) {
    content = content.replace(normalizeLf(targetReconstruct), normalizeLf(replaceReconstruct));
    console.log('✓ bookingService: Updated journey datetime & price reconstruction');
  } else {
    console.error('✗ bookingService: Could not find targetReconstruct');
  }

  if (content.includes(normalizeLf(targetLegReconstruct))) {
    content = content.replace(normalizeLf(targetLegReconstruct), normalizeLf(replaceLegReconstruct));
    console.log('✓ bookingService: Updated leg datetime & price reconstruction');
  } else {
    console.error('✗ bookingService: Could not find targetLegReconstruct');
  }

  if (content.includes(normalizeLf(targetLegBookings))) {
    content = content.replace(normalizeLf(targetLegBookings), normalizeLf(replaceLegBookings));
    console.log('✓ bookingService: Updated legBookings & transfers');
  } else {
    console.error('✗ bookingService: Could not find targetLegBookings');
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

// -------------------------------------------------------------
// 2. server/src/services/rail/alternativesEngine.service.js
// -------------------------------------------------------------
{
  const filePath = path.resolve('server/src/services/rail/alternativesEngine.service.js');
  let content = fs.readFileSync(filePath, 'utf8');
  const normalizeLf = (s) => s.replace(/\r\n/g, '\n');
  content = normalizeLf(content);

  // Add imports for fareService and VERIFIED_TRAIN_SCHEDULES
  if (!content.includes("import fareService from './fare.service.js';")) {
    content = content.replace(
      "import { INDIAN_RAILWAY_STATIONS } from './stationRegistry.js';",
      `import { INDIAN_RAILWAY_STATIONS } from './stationRegistry.js';\nimport fareService from './fare.service.js';\nimport { VERIFIED_TRAIN_SCHEDULES } from './verifiedTrainData.js';`
    );
    console.log('✓ alternativesEngine: Added fareService and VERIFIED_TRAIN_SCHEDULES imports');
  }

  // Fix maxDetour and maxTrains
  const targetLimits = `    const layoverTight = p0v2.layoverTightMinutes;
    const maxDetour = Math.max(p0v2.maxDetourRatio || 1.15, 1.45);
    const maxTrains = Math.max(p0v2.maxLegTrains || 2, 8);`;

  const replaceLimits = `    const layoverTight = p0v2.layoverTightMinutes;
    const maxDetour = p0v2.maxDetourRatio || 1.15;
    const maxTrains = Math.min(Math.max(p0v2.maxLegTrains || 2, 2), 4);`;

  if (content.includes(normalizeLf(targetLimits))) {
    content = content.replace(normalizeLf(targetLimits), normalizeLf(replaceLimits));
    console.log('✓ alternativesEngine: Fixed maxDetour (1.15) and maxTrains (2-4)');
  } else {
    console.error('✗ alternativesEngine: Could not find targetLimits');
  }

  // Fix same-train plan enrichment (lines ~548-562)
  const targetSameTrain = `    const availB = await this._checkAvailMemo(trainNo, Ha.code, destCode, laneClass, dateStr, quota, actionId, 'sameTrain', budget);
    if (availB?.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE) {
      logger.info(\`[AltEngine] Same-train 2-leg plan: \${originCode}→\${Ha.code}→\${destCode} on train \${trainNo} (\${laneClass})\`);
      return {
        type: 'same_train',
        sameTrain: true,
        legs: [
          { trainNo, from: originCode, to: Ha.code, class: laneClass },
          { trainNo, from: Ha.code, to: destCode, class: laneClass },
        ],
        hubCode: Ha.code,
        laneClass,
        tier: 'CONFIRMED',
        weakestTier: 'CONFIRMED',
        isRisky: false,
        badge: \`Stay on this train — two tickets, berth may change at \${Ha.code}\`,
        notice: 'Separate tickets. A missed connection is not protected.',
      };
    }`;

  const replaceSameTrain = `    const availB = await this._checkAvailMemo(trainNo, Ha.code, destCode, laneClass, dateStr, quota, actionId, 'sameTrain', budget);
    if (availB?.normalizedStatus === AVAILABILITY_STATUS.AVAILABLE) {
      logger.info(\`[AltEngine] Same-train 2-leg plan: \${originCode}→\${Ha.code}→\${destCode} on train \${trainNo} (\${laneClass})\`);

      const availA = this._getAvailMemoOnly(trainNo, originCode, Ha.code, laneClass, dateStr, quota);
      const dist1 = clusterService.calculateStationDistanceKm(originCode, Ha.code) || 450;
      const dist2 = clusterService.calculateStationDistanceKm(Ha.code, destCode) || 450;

      let fare1 = availA?.fare?.totalFare || availA?.totalFare || null;
      if (typeof fare1 !== 'number' || fare1 <= 0) {
        const v1 = VERIFIED_TRAIN_SCHEDULES.find((v) => v.trainNumber === trainNo);
        const vf1 = v1?.fares?.[laneClass] || v1?.fares?.['3A'] || v1?.fares?.['SL'];
        fare1 = (typeof vf1 === 'number' && vf1 > 0) ? vf1 : fareService.calculateTelescopicTariff(dist1, laneClass);
      }

      let fare2 = availB?.fare?.totalFare || availB?.totalFare || null;
      if (typeof fare2 !== 'number' || fare2 <= 0) {
        const v2 = VERIFIED_TRAIN_SCHEDULES.find((v) => v.trainNumber === trainNo);
        const vf2 = v2?.fares?.[laneClass] || v2?.fares?.['3A'] || v2?.fares?.['SL'];
        fare2 = (typeof vf2 === 'number' && vf2 > 0) ? vf2 : fareService.calculateTelescopicTariff(dist2, laneClass);
      }

      const sameTotalFare = fare1 + fare2;
      const vSchedule = VERIFIED_TRAIN_SCHEDULES.find((v) => v.trainNumber === trainNo);
      const depTimeStr = vSchedule?.departureTime || '06:00';
      const arrTimeStr = vSchedule?.arrivalTime || '22:00';
      const leg1DepIso = this._toIso(depTimeStr, dateStr);
      const leg2ArrIso = this._toIso(arrTimeStr, vSchedule?.dayOffset ? addDays(dateStr, vSchedule.dayOffset) : dateStr);

      return {
        type: 'same_train',
        sameTrain: true,
        departureTime: leg1DepIso || depTimeStr,
        arrivalTime: leg2ArrIso || arrTimeStr,
        departureDate: dateStr,
        arrivalDate: vSchedule?.dayOffset ? addDays(dateStr, vSchedule.dayOffset) : dateStr,
        duration: vSchedule?.durationMinutes || 960,
        totalDuration: vSchedule?.durationMinutes || 960,
        totalFare: sameTotalFare,
        totalPrice: sameTotalFare,
        fare: sameTotalFare,
        legs: [
          {
            sequence: 1,
            trainNo,
            trainNumber: trainNo,
            trainName: vSchedule?.trainName || \`Train \${trainNo}\`,
            mode: 'rail',
            from: originCode,
            to: Ha.code,
            origin: { code: originCode, name: originCode },
            destination: { code: Ha.code, name: Ha.code },
            class: laneClass,
            travelClass: laneClass,
            departureTime: leg1DepIso || depTimeStr,
            arrivalTime: leg1DepIso || depTimeStr,
            departureTimeFormatted: depTimeStr,
            arrivalTimeFormatted: depTimeStr,
            duration: Math.round((vSchedule?.durationMinutes || 960) / 2),
            distance: dist1,
            price: fare1,
            fare: fare1,
            totalFare: fare1,
            availability: availA || { normalizedStatus: 'AVAILABLE', isAvailable: true },
          },
          {
            sequence: 2,
            trainNo,
            trainNumber: trainNo,
            trainName: vSchedule?.trainName || \`Train \${trainNo}\`,
            mode: 'rail',
            from: Ha.code,
            to: destCode,
            origin: { code: Ha.code, name: Ha.code },
            destination: { code: destCode, name: destCode },
            class: laneClass,
            travelClass: laneClass,
            departureTime: leg1DepIso || depTimeStr,
            arrivalTime: leg2ArrIso || arrTimeStr,
            departureTimeFormatted: depTimeStr,
            arrivalTimeFormatted: arrTimeStr,
            duration: Math.round((vSchedule?.durationMinutes || 960) / 2),
            distance: dist2,
            price: fare2,
            fare: fare2,
            totalFare: fare2,
            availability: availB || { normalizedStatus: 'AVAILABLE', isAvailable: true },
          },
        ],
        hubCode: Ha.code,
        laneClass,
        tier: 'CONFIRMED',
        weakestTier: 'CONFIRMED',
        isRisky: false,
        badge: \`Stay on this train — two tickets, berth may change at \${Ha.code}\`,
        notice: 'Separate tickets. A missed connection is not protected.',
      };
    }`;

  if (content.includes(normalizeLf(targetSameTrain))) {
    content = content.replace(normalizeLf(targetSameTrain), normalizeLf(replaceSameTrain));
    console.log('✓ alternativesEngine: Enriched same-train plan with full fares & timings');
  } else {
    console.error('✗ alternativesEngine: Could not find targetSameTrain');
  }

  // Fix cross-train fare calculation (lines ~912-915)
  const targetCrossFares = `        const leg1Fare = leg1Avail?.fare?.totalFare || leg1Avail?.totalFare || null;
        const leg2Fare = leg2Avail?.fare?.totalFare || leg2Avail?.totalFare || null;
        const totalFare = (typeof leg1Fare === 'number' && typeof leg2Fare === 'number') ? (leg1Fare + leg2Fare) : null;`;

  const replaceCrossFares = `        const leg1Dist = Number(t1.distance || t1.distanceKm || t1.travel_distance || 0) || clusterService.calculateStationDistanceKm(t1Boarding, hubA) || 450;
        const leg2Dist = Number(t2.distance || t2.distanceKm || t2.travel_distance || 0) || clusterService.calculateStationDistanceKm(hubB, t2Alighting) || 450;

        let leg1Fare = leg1Avail?.fare?.totalFare || leg1Avail?.totalFare || null;
        if (typeof leg1Fare !== 'number' || leg1Fare <= 0) {
          const verified1 = VERIFIED_TRAIN_SCHEDULES.find((v) => v.trainNumber === t1No);
          const vFare1 = verified1?.fares?.[laneClass] || verified1?.fares?.['3A'] || verified1?.fares?.['SL'];
          leg1Fare = (typeof vFare1 === 'number' && vFare1 > 0) ? vFare1 : fareService.calculateTelescopicTariff(leg1Dist, laneClass);
        }

        let leg2Fare = leg2Avail?.fare?.totalFare || leg2Avail?.totalFare || null;
        if (typeof leg2Fare !== 'number' || leg2Fare <= 0) {
          const verified2 = VERIFIED_TRAIN_SCHEDULES.find((v) => v.trainNumber === t2No);
          const vFare2 = verified2?.fares?.[laneClass] || verified2?.fares?.['3A'] || verified2?.fares?.['SL'];
          leg2Fare = (typeof vFare2 === 'number' && vFare2 > 0) ? vFare2 : fareService.calculateTelescopicTariff(leg2Dist, laneClass);
        }

        const totalFare = leg1Fare + leg2Fare;`;

  if (content.includes(normalizeLf(targetCrossFares))) {
    content = content.replace(normalizeLf(targetCrossFares), normalizeLf(replaceCrossFares));
    console.log('✓ alternativesEngine: Guaranteed both leg fares and totalFare in crossTrainSearch');
  } else {
    console.error('✗ alternativesEngine: Could not find targetCrossFares');
  }

  // Fix ISO dates in leg 1, leg 2, and plan
  const targetLeg1Dates = `            departureTime: t1Dep,
            arrivalTime: t1Arr,
            departureTimeFormatted: t1Dep,
            arrivalTimeFormatted: t1Arr,`;

  const replaceLeg1Dates = `            departureTime: this._toIso(t1Dep, dateStr) || t1Dep,
            arrivalTime: this._toIso(t1Arr, timing1.arrivalLocalDate || dateStr) || t1Arr,
            departureTimeFormatted: t1Dep,
            arrivalTimeFormatted: t1Arr,`;

  if (content.includes(normalizeLf(targetLeg1Dates))) {
    content = content.replace(normalizeLf(targetLeg1Dates), normalizeLf(replaceLeg1Dates));
    console.log('✓ alternativesEngine: Formatted Leg 1 departureTime/arrivalTime as ISO');
  } else {
    console.error('✗ alternativesEngine: Could not find targetLeg1Dates');
  }

  const targetLeg2Dates = `            departureTime: t2Dep,
            arrivalTime: t2Arr,
            departureTimeFormatted: t2Dep,
            arrivalTimeFormatted: t2Arr,`;

  const replaceLeg2Dates = `            departureTime: this._toIso(t2Dep, t2DateStr) || t2Dep,
            arrivalTime: this._toIso(t2Arr, timing2.arrivalLocalDate || t2DateStr) || t2Arr,
            departureTimeFormatted: t2Dep,
            arrivalTimeFormatted: t2Arr,`;

  if (content.includes(normalizeLf(targetLeg2Dates))) {
    content = content.replace(normalizeLf(targetLeg2Dates), normalizeLf(replaceLeg2Dates));
    console.log('✓ alternativesEngine: Formatted Leg 2 departureTime/arrivalTime as ISO');
  } else {
    console.error('✗ alternativesEngine: Could not find targetLeg2Dates');
  }

  const targetPlanDates = `          departureTime: t1Dep,
          arrivalTime: t2Arr,
          departureDate: dateStr,
          arrivalDate: timing2.arrivalLocalDate || t2DateStr,
          duration: totalJourneyMinutes,
          totalDuration: totalJourneyMinutes,
          totalWaitingMinutes: layover,
          totalFare,
          fare: totalFare,`;

  const replacePlanDates = `          departureTime: this._toIso(t1Dep, dateStr) || t1Dep,
          arrivalTime: this._toIso(t2Arr, timing2.arrivalLocalDate || t2DateStr) || t2Arr,
          departureTimeFormatted: t1Dep,
          arrivalTimeFormatted: t2Arr,
          departureDate: dateStr,
          arrivalDate: timing2.arrivalLocalDate || t2DateStr,
          duration: totalJourneyMinutes,
          totalDuration: totalJourneyMinutes,
          totalWaitingMinutes: layover,
          totalFare,
          totalPrice: totalFare,
          fare: totalFare,`;

  if (content.includes(normalizeLf(targetPlanDates))) {
    content = content.replace(normalizeLf(targetPlanDates), normalizeLf(replacePlanDates));
    console.log('✓ alternativesEngine: Formatted Plan departureTime/arrivalTime as ISO & totalPrice');
  } else {
    console.error('✗ alternativesEngine: Could not find targetPlanDates');
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

// -------------------------------------------------------------
// 3. client/src/pages/BookingPage.jsx
// -------------------------------------------------------------
{
  const filePath = path.resolve('client/src/pages/BookingPage.jsx');
  let content = fs.readFileSync(filePath, 'utf8');
  const normalizeLf = (s) => s.replace(/\r\n/g, '\n');
  content = normalizeLf(content);

  const targetClientFare = `        const calculatedFare =
          Number(activeJourney.totalPrice) > 0
            ? Number(activeJourney.totalPrice)
            : Number(activeJourney.totalFare) > 0
            ? Number(activeJourney.totalFare)
            : Number(activeJourney.fare) > 0
            ? Number(activeJourney.fare)
            : 380;`;

  const replaceClientFare = `        const legPricesSum = legs.reduce((sum, l) => sum + (Number(l.price || l.fare || l.totalFare) || 0), 0);
        const calculatedFare =
          Number(activeJourney.totalPrice) > 0
            ? Number(activeJourney.totalPrice)
            : Number(activeJourney.totalFare) > 0
            ? Number(activeJourney.totalFare)
            : Number(activeJourney.fare) > 0
            ? Number(activeJourney.fare)
            : legPricesSum > 0
            ? legPricesSum
            : 380;`;

  if (content.includes(normalizeLf(targetClientFare))) {
    content = content.replace(normalizeLf(targetClientFare), normalizeLf(replaceClientFare));
    console.log('✓ BookingPage: Updated calculatedFare to sum legs before 380 fallback');
  } else {
    console.error('✗ BookingPage: Could not find targetClientFare');
  }

  const targetLegFareRow = `const lFare = Number(leg.fare || leg.price || (basePricePerPerson / legs.length)) * passengers.length;`;
  const replaceLegFareRow = `const lFare = Number(leg.fare || leg.price || leg.totalFare || (basePricePerPerson / legs.length)) * passengers.length;`;

  if (content.includes(targetLegFareRow)) {
    content = content.replace(targetLegFareRow, replaceLegFareRow);
    console.log('✓ BookingPage: Included totalFare check in leg fare breakdown');
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

// -------------------------------------------------------------
// 4. client/src/pages/ResultsPage.jsx
// -------------------------------------------------------------
{
  const filePath = path.resolve('client/src/pages/ResultsPage.jsx');
  let content = fs.readFileSync(filePath, 'utf8');
  const normalizeLf = (s) => s.replace(/\r\n/g, '\n');
  content = normalizeLf(content);

  const targetResultsFare = `    const totalPrice =
      Number(journey.totalPrice) > 0
        ? Number(journey.totalPrice)
        : Number(journey.totalFare) > 0
        ? Number(journey.totalFare)
        : Number(journey.fare) > 0
        ? Number(journey.fare)
        : 0;`;

  const replaceResultsFare = `    const legPricesSum = legs.reduce((sum, l) => sum + (Number(l.price || l.fare || l.totalFare) || 0), 0);
    const totalPrice =
      Number(journey.totalPrice) > 0
        ? Number(journey.totalPrice)
        : Number(journey.totalFare) > 0
        ? Number(journey.totalFare)
        : Number(journey.fare) > 0
        ? Number(journey.fare)
        : legPricesSum > 0
        ? legPricesSum
        : 0;`;

  if (content.includes(normalizeLf(targetResultsFare))) {
    content = content.replace(normalizeLf(targetResultsFare), normalizeLf(replaceResultsFare));
    console.log('✓ ResultsPage: Updated bookingSnapshot totalPrice with leg sum');
  } else {
    console.error('✗ ResultsPage: Could not find targetResultsFare');
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

console.log('All patches completed.');

