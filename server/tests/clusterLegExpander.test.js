import test from 'node:test';
import assert from 'node:assert/strict';
import { ClusterLegExpander, estimateRoadMinutes } from '../src/services/rail/clusterLegExpander.service.js';
import fareService from '../src/services/rail/fare.service.js';
import RequestBudgetTracker from '../src/services/rail/requestBudget.js';

function createMockJourney({
  fromCode = 'DNR',
  toCode = 'ANVT',
  depTime = '2026-10-25T14:30:00.000Z', // 20:00 IST
  arrTime = '2026-10-25T19:43:00.000Z', // 01:13 IST next day (+1)
  price = 1200,
  trainNumber = '12391',
  trainName = 'SHRAMJEEVI EXP',
  normalizedStatus = 'AVAILABLE',
  isClusterShift = true,
  summaryLabel = 'Departing from nearby DANAPUR (DNR)',
  duration = 313,
} = {}) {
  return {
    origin: fromCode,
    destination: toCode,
    departureTime: depTime,
    arrivalTime: arrTime,
    duration,
    totalDistance: 990,
    totalPrice: price,
    currency: 'INR',
    numberOfTransfers: 0,
    transportModes: ['rail'],
    isDirectTrain: true,
    isClusterShift,
    clusterNote: summaryLabel,
    availabilityStatus: normalizedStatus,
    availability: { normalizedStatus, seatsAvailable: 42 },
    pricing: { totalFare: price, currency: 'INR', isEstimated: false },
    metadata: {
      trainNumber,
      trainName,
      fromStationCode: fromCode,
      toStationCode: toCode,
      availabilityStatus: normalizedStatus,
    },
    legs: [
      {
        sequence: 1,
        origin: fromCode,
        destination: toCode,
        originStation: { code: fromCode, name: fromCode, stationCode: fromCode },
        destinationStation: { code: toCode, name: toCode, stationCode: toCode },
        mode: 'rail',
        providerCode: 'IRCTC',
        departureTime: depTime,
        arrivalTime: arrTime,
        duration,
        distance: 990,
        price,
        currency: 'INR',
        isEstimated: false,
        vehicle: { type: 'Train', identifier: trainNumber },
        service: { name: trainName, number: trainNumber, class: '3A' },
        booking: { status: 'available' },
        availability: { normalizedStatus, seatsAvailable: 42 },
        metadata: { fromStationCode: fromCode, toStationCode: toCode },
      },
    ],
  };
}

test('1. estimateRoadMinutes: correctly calculates distance-based transfer duration with bounds', () => {
  assert.equal(estimateRoadMinutes(0), 20, '0 km should return min duration 20 min');
  assert.equal(estimateRoadMinutes(10), 50, '10 km: (10/20)*60 + 20 = 50 min');
  assert.equal(estimateRoadMinutes(15), 65, '15 km: (15/20)*60 + 20 = 65 min');
  assert.equal(estimateRoadMinutes(null), 20, 'null km should fall back to min 20 min');
});

test('2. ClusterLegExpander: origin transfer + main train + real connecting train; connection searched on arrival date (overnight case)', async () => {
  const searchedDates = [];
  const mockRailKit = {
    searchTrainBetweenStations: async (from, to, date) => {
      searchedDates.push({ from, to, date });
      // PNBE -> DNR: return no train so it falls back to local transfer
      if (from === 'PNBE' && to === 'DNR') {
        return { success: true, data: [] };
      }
      // ANVT -> NDLS: return a connecting train that departs at 02:30 IST on arrival date (01:13 arrival)
      if (from === 'ANVT' && to === 'NDLS') {
        return {
          success: true,
          data: [
            {
              train_no: '04401',
              train_name: 'DELHI EMU',
              from_time: '02:30',
              to_time: '03:00',
              running_days: '1111111',
              distance: '15',
              travel_time: '00:30',
              from_stn_code: 'ANVT',
              to_stn_code: 'NDLS',
            },
          ],
        };
      }
      return { success: true, data: [] };
    },
  };

  const expander = new ClusterLegExpander({ railKit: mockRailKit, fareService });
  const journey = createMockJourney({
    fromCode: 'DNR',
    toCode: 'ANVT',
    depTime: '2026-10-25T14:30:00.000Z', // 20:00 IST on 2026-10-25
    arrTime: '2026-10-25T19:43:00.000Z', // 01:13 IST on 2026-10-26 (overnight!)
    price: 1200,
  });

  const expanded = await expander.expandJourney(journey, {
    requestedOriginCode: 'PNBE',
    requestedDestCode: 'NDLS',
    travelClass: '3A',
    passengers: 1,
  });

  assert.equal(expanded.hasExpandedLegs, true, 'hasExpandedLegs must be set');
  assert.equal(expanded.legs.length, 3, 'Must expand into 3 legs: transfer + main + connecting');

  // Verify connection was searched on the arrival date 2026-10-26 (overnight case)
  const destSearch = searchedDates.find((s) => s.from === 'ANVT' && s.to === 'NDLS');
  assert.ok(destSearch, 'Destination connection search must be invoked');
  assert.equal(destSearch.date, '2026-10-26', 'Overnight arrival at 01:13 IST must query connecting train on 2026-10-26');

  // Leg 1: PNBE -> DNR (road transfer)
  const leg1 = expanded.legs[0];
  assert.equal(leg1.mode, 'road');
  assert.equal(leg1.origin, 'PNBE');
  assert.equal(leg1.destination, 'DNR');
  assert.equal(leg1.metadata.isStationTransfer, true);
  assert.equal(leg1.price, 0, 'Road transfer fare should be 0');

  // Leg 2: DNR -> ANVT (main train)
  const leg2 = expanded.legs[1];
  assert.equal(leg2.mode, 'rail');
  assert.equal(leg2.origin, 'DNR');
  assert.equal(leg2.destination, 'ANVT');
  assert.equal(leg2.metadata.isMainTrain, true);
  assert.equal(leg2.price, 1200, 'Main train fare must remain unchanged');
  assert.equal(leg2.availability.normalizedStatus, 'AVAILABLE');

  // Leg 3: ANVT -> NDLS (real connecting rail leg)
  const leg3 = expanded.legs[2];
  assert.equal(leg3.mode, 'rail');
  assert.equal(leg3.origin, 'ANVT');
  assert.equal(leg3.destination, 'NDLS');
  assert.equal(leg3.metadata.isFeeder, true);
  assert.equal(leg3.service.number, '04401');
  assert.ok(leg3.price > 0, 'Feeder rail leg price should be computed');

  // Chain integrity
  assert.equal(leg1.destination, leg2.origin);
  assert.equal(leg2.destination, leg3.origin);
  assert.ok(new Date(leg1.arrivalTime).getTime() <= new Date(leg2.departureTime).getTime());
  assert.ok(new Date(leg2.arrivalTime).getTime() <= new Date(leg3.departureTime).getTime());

  // Total price: sum of rail legs (1200 + leg3.price), excluding road leg 0
  assert.equal(expanded.totalPrice, 1200 + leg3.price);
  assert.equal(expanded.numberOfTransfers, 2);
});

test('3. ClusterLegExpander: real feeder train used when it fits (a too-late train is rejected)', async () => {
  const mockRailKit = {
    searchTrainBetweenStations: async (from, to) => {
      if (from === 'PNBE' && to === 'DNR') {
        return {
          success: true,
          data: [
            // Train 1: Too late (departs 17:40, arrives 17:50, only 10m buffer before 18:00 departure -> rejected)
            {
              train_no: '03211',
              train_name: 'TOO LATE LOCAL',
              from_time: '17:40',
              to_time: '17:50',
              running_days: '1111111',
              distance: '10',
              travel_time: '00:10',
              from_stn_code: 'PNBE',
              to_stn_code: 'DNR',
            },
            // Train 2: Fits (departs 16:30, arrives 17:00, 60m buffer before 18:00 departure -> accepted)
            {
              train_no: '03201',
              train_name: 'PERFECT FEEDER',
              from_time: '16:30',
              to_time: '17:00',
              running_days: '1111111',
              distance: '10',
              travel_time: '00:30',
              from_stn_code: 'PNBE',
              to_stn_code: 'DNR',
            },
          ],
        };
      }
      return { success: true, data: [] };
    },
  };

  const expander = new ClusterLegExpander({ railKit: mockRailKit, fareService });
  // Main train DNR -> NDLS departing at 18:00 IST on 2026-10-25
  const journey = createMockJourney({
    fromCode: 'DNR',
    toCode: 'NDLS',
    depTime: '2026-10-25T12:30:00.000Z', // 18:00 IST
    arrTime: '2026-10-26T02:00:00.000Z',
    price: 1100,
  });

  const expanded = await expander.expandJourney(journey, {
    requestedOriginCode: 'PNBE',
    requestedDestCode: 'NDLS',
  });

  assert.equal(expanded.legs.length, 2, 'Should expand to 2 legs (feeder + main)');
  const feederLeg = expanded.legs[0];
  assert.equal(feederLeg.mode, 'rail', 'Should use real feeder train');
  assert.equal(feederLeg.service.number, '03201', 'Should select PERFECT FEEDER (not the too-late train)');
  assert.equal(feederLeg.metadata.isFeeder, true);
});

test('4. ClusterLegExpander: implausible long-distance feeder rejected', async () => {
  const mockRailKit = {
    searchTrainBetweenStations: async (from, to) => {
      if (from === 'PNBE' && to === 'DNR') {
        return {
          success: true,
          data: [
            // Long distance: 150 km > maxFeederDistanceKm (80)
            {
              train_no: '09999',
              train_name: 'CIRCUITOUS TRAIN',
              from_time: '15:00',
              to_time: '17:00',
              running_days: '1111111',
              distance: '150',
              travel_time: '02:00',
              from_stn_code: 'PNBE',
              to_stn_code: 'DNR',
            },
          ],
        };
      }
      return { success: true, data: [] };
    },
  };

  const expander = new ClusterLegExpander({ railKit: mockRailKit, fareService });
  const journey = createMockJourney({
    fromCode: 'DNR',
    toCode: 'NDLS',
    depTime: '2026-10-25T12:30:00.000Z', // 18:00 IST
    arrTime: '2026-10-26T02:00:00.000Z',
  });

  const expanded = await expander.expandJourney(journey, {
    requestedOriginCode: 'PNBE',
    requestedDestCode: 'NDLS',
  });

  assert.equal(expanded.legs.length, 2);
  const leg1 = expanded.legs[0];
  assert.equal(leg1.mode, 'road', 'Circuitous 150km feeder must be rejected in favor of local road transfer');
  assert.equal(leg1.metadata.isStationTransfer, true);
});

test('5. ClusterLegExpander: RailKit failure / STATIC_BUDGET_EXHAUSTED -> transfer legs, total fare unchanged', async () => {
  const mockRailKit = {
    searchTrainBetweenStations: async () => {
      return { success: false, reason: 'STATIC_BUDGET_EXHAUSTED' };
    },
  };

  const expander = new ClusterLegExpander({ railKit: mockRailKit, fareService });
  const initialFare = 1550;
  const journey = createMockJourney({
    fromCode: 'DNR',
    toCode: 'ANVT',
    price: initialFare,
  });

  const expanded = await expander.expandJourney(journey, {
    requestedOriginCode: 'PNBE',
    requestedDestCode: 'NDLS',
    budgetTracker: new RequestBudgetTracker(),
  });

  assert.equal(expanded.legs.length, 3, 'Must expand into 3 legs via local transfers');
  assert.equal(expanded.legs[0].mode, 'road', 'Origin leg is road transfer');
  assert.equal(expanded.legs[0].price, 0);
  assert.equal(expanded.legs[1].mode, 'rail', 'Main train is rail');
  assert.equal(expanded.legs[1].price, initialFare);
  assert.equal(expanded.legs[2].mode, 'road', 'Destination leg is road transfer');
  assert.equal(expanded.legs[2].price, 0);

  assert.equal(expanded.totalPrice, initialFare, 'Total fare must remain exactly unchanged (sum of rail legs only)');
  assert.equal(expanded.pricing.mainTrainFare, initialFare);
});

test('6. ClusterLegExpander: no-op when requested stations already match (no RailKit calls)', async () => {
  let railKitCalls = 0;
  const mockRailKit = {
    searchTrainBetweenStations: async () => {
      railKitCalls++;
      return { success: true, data: [] };
    },
  };

  const expander = new ClusterLegExpander({ railKit: mockRailKit, fareService });
  const journey = createMockJourney({
    fromCode: 'NDLS',
    toCode: 'PNBE',
  });

  const expanded = await expander.expandJourney(journey, {
    requestedOriginCode: 'NDLS',
    requestedDestCode: 'PNBE',
  });

  assert.equal(railKitCalls, 0, 'No RailKit calls should be made when stations match');
  assert.equal(expanded.legs.length, 1, 'Legs must remain untouched (length 1)');
  assert.equal(Boolean(expanded.hasExpandedLegs), false);
});

test('7. ClusterLegExpander: maxJourneysToExpand cap and prioritization', async () => {
  const mockRailKit = {
    searchTrainBetweenStations: async () => ({ success: true, data: [] }),
  };

  const expander = new ClusterLegExpander({
    railKit: mockRailKit,
    fareService,
    maxJourneysToExpand: 2,
  });

  // 3 candidates:
  // J1: UNCHECKED, duration 300
  // J2: AVAILABLE, duration 400
  // J3: AVAILABLE, duration 200
  const j1 = createMockJourney({ fromCode: 'DNR', toCode: 'NDLS', normalizedStatus: 'UNCHECKED', duration: 300, trainNumber: '111' });
  const j2 = createMockJourney({ fromCode: 'DNR', toCode: 'NDLS', normalizedStatus: 'AVAILABLE', duration: 400, trainNumber: '222' });
  const j3 = createMockJourney({ fromCode: 'DNR', toCode: 'NDLS', normalizedStatus: 'AVAILABLE', duration: 200, trainNumber: '333' });

  const journeys = [j1, j2, j3];

  await expander.expandJourneys(journeys, {
    requestedOriginCode: 'PNBE',
    requestedDestCode: 'NDLS',
  });

  // Priority should pick j3 (AVAILABLE, dur 200) and j2 (AVAILABLE, dur 400), skipping j1
  assert.equal(j3.hasExpandedLegs, true, 'j3 must be expanded (usable, shortest duration)');
  assert.equal(j2.hasExpandedLegs, true, 'j2 must be expanded (usable, second shortest duration)');
  assert.equal(Boolean(j1.hasExpandedLegs), false, 'j1 must NOT be expanded due to maxJourneysToExpand cap = 2');
  assert.equal(j1.legs.length, 1);
});

test('8. Regression: Mongoose JourneyLeg schema validation passes for every expanded leg', async () => {
  const { default: mongoose } = await import('mongoose');
  const { default: JourneyLeg } = await import('../src/models/JourneyLeg.js');

  const mockRailKit = {
    searchTrainBetweenStations: async () => ({ success: true, data: [] }),
  };

  const expander = new ClusterLegExpander({ railKit: mockRailKit, fareService });

  // Main train SDAH -> DDU (Rajdhani 12313)
  const journey = createMockJourney({
    fromCode: 'SDAH',
    toCode: 'DDU',
    depTime: '2026-10-19T11:20:00.000Z', // 16:50 IST
    arrTime: '2026-10-19T19:43:00.000Z', // 01:13 IST next day
    price: 2100,
    trainNumber: '12313',
    trainName: 'SEALDAH RAJDHANI',
  });

  const expanded = await expander.expandJourney(journey, {
    requestedOriginCode: 'HWH',
    requestedDestCode: 'BSB',
    travelClass: '3A',
    passengers: 1,
  });

  assert.equal(expanded.legs.length, 3, 'Must expand to 3 legs: HWH>SDAH, SDAH>DDU, DDU>BSB');

  const mockJourneyId = new mongoose.Types.ObjectId();

  for (const leg of expanded.legs) {
    const doc = new JourneyLeg({
      journey: mockJourneyId,
      sequence: leg.sequence,
      origin: new mongoose.Types.ObjectId(),
      destination: new mongoose.Types.ObjectId(),
      mode: leg.mode,
      departureTime: leg.departureTime,
      arrivalTime: leg.arrivalTime,
      duration: leg.duration,
      distance: leg.distance,
      price: leg.price,
      currency: leg.currency,
      vehicle: leg.vehicle,
      service: leg.service,
      booking: leg.booking,
      metadata: leg.metadata,
    });

    const validationError = doc.validateSync();
    assert.equal(
      validationError,
      undefined,
      `Leg ${leg.sequence} (${leg.origin}>${leg.destination}) failed JourneyLeg schema validation: ${validationError?.message}`
    );
  }
});
