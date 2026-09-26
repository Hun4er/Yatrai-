import mongoose from 'mongoose';
import {
  journeyNormalizer,
  normalizeProviderResult,
  validateJourneyCandidate,
  railNormalizerStrategy,
  busNormalizerStrategy,
  flightNormalizerStrategy,
  roadNormalizerStrategy,
} from '../src/normalization/index.js';
import { createSuccessEnvelope } from '../src/providers/transport/envelope.js';

console.log('='.repeat(70));
console.log('  YATRAI PHASE 6 — JOURNEY NORMALIZER VERIFICATION');
console.log('='.repeat(70));

const mockOriginId = new mongoose.Types.ObjectId();
const mockDestId = new mongoose.Types.ObjectId();
const mockIntermediateId = new mongoose.Types.ObjectId();

const context = {
  origin: mockOriginId,
  destination: mockDestId,
  departureDate: new Date('2026-10-01T00:00:00Z'),
};

let passed = 0;
let total = 0;

function assertCheck(desc, condition) {
  total++;
  if (condition) {
    passed++;
    console.log(`  [PASS] ${desc}`);
  } else {
    console.error(`  [FAIL] ${desc}`);
  }
}

// 1. Rail Normalization
console.log('\n1. Verifying Rail Transport Normalization (PRD Section 45)...');
const railPayload = {
  departure_time: '2026-10-01T06:00:00+05:30',
  arrival_time: '2026-10-01T18:00:00+05:30',
  train_number: '12301',
  train_name: 'Rajdhani Express',
  price: 850,
  currency: 'INR',
};

const normRail = railNormalizerStrategy.normalize(railPayload, context);
assertCheck('Rail departureTime is valid UTC Date', normRail.departureTime instanceof Date);
assertCheck('Rail arrivalTime is valid UTC Date', normRail.arrivalTime instanceof Date);
assertCheck('Rail duration is 720 minutes', normRail.duration === 720);
assertCheck('Rail price is numeric 850', normRail.totalPrice === 850);
assertCheck('Rail currency is INR', normRail.currency === 'INR');
assertCheck('Rail mode is rail', normRail.transportModes[0] === 'rail');
assertCheck('Rail service.number is 12301', normRail.legs[0].service.number === '12301');
assertCheck('Rail vehicle.identifier is 12301', normRail.legs[0].vehicle.identifier === '12301');
assertCheck('Rail passes canonical validation', validateJourneyCandidate(normRail).valid);

// 2. Flight Normalization
console.log('\n2. Verifying Flight Transport Normalization (PRD Section 46)...');
const flightPayload = {
  departure: '2026-10-01T10:30:00+05:30',
  arrival: '2026-10-01T12:40:00+05:30',
  flight_number: 'AI123',
  airline: 'Air India',
  price: 5200,
  currency: 'INR',
};

const normFlight = flightNormalizerStrategy.normalize(flightPayload, context);
assertCheck('Flight departureTime is valid UTC Date', normFlight.departureTime instanceof Date);
assertCheck('Flight arrivalTime is valid UTC Date', normFlight.arrivalTime instanceof Date);
assertCheck('Flight duration is 130 minutes', normFlight.duration === 130);
assertCheck('Flight price is numeric 5200', normFlight.totalPrice === 5200);
assertCheck('Flight mode is flight', normFlight.transportModes[0] === 'flight');
assertCheck('Flight service.number is AI123', normFlight.legs[0].service.number === 'AI123');
assertCheck('Flight passes canonical validation', validateJourneyCandidate(normFlight).valid);

// 3. Bus Normalization
console.log('\n3. Verifying Bus Transport Normalization (PRD Section 47)...');
const busPayload = {
  departureTime: '2026-10-01T20:00:00+05:30',
  arrivalTime: '2026-10-02T05:30:00+05:30',
  busNumber: 'DL-01-B-9988',
  operator: 'RedBus Express',
  busType: 'AC Sleeper',
  price: 950,
  currency: 'INR',
};

const normBus = busNormalizerStrategy.normalize(busPayload, context);
assertCheck('Bus mode is bus', normBus.transportModes[0] === 'bus');
assertCheck('Bus price is 950', normBus.totalPrice === 950);
assertCheck('Bus service.operator is RedBus Express', normBus.legs[0].service.operator === 'RedBus Express');
assertCheck('Bus passes canonical validation', validateJourneyCandidate(normBus).valid);

// 4. Road Normalization
console.log('\n4. Verifying Road Transport Normalization (PRD Section 48)...');
const roadPayload = {
  mode: 'road',
  departureTime: '2026-10-01T08:00:00+05:30',
  arrivalTime: '2026-10-01T14:00:00+05:30',
  duration: 360,
  distance: 310,
};

const normRoad = roadNormalizerStrategy.normalize(roadPayload, context);
assertCheck('Road mode is road', normRoad.transportModes[0] === 'road');
assertCheck('Road does not invent unprovided price', normRoad.totalPrice === 0);
assertCheck('Road duration is 360 minutes', normRoad.duration === 360);
assertCheck('Road passes canonical validation', validateJourneyCandidate(normRoad).valid);

// 5. Multi-Leg Journeys
console.log('\n5. Verifying Multi-Leg Journey & Transfers (PRD Section 50)...');
const multiLegPayload = {
  legs: [
    {
      sequence: 1,
      origin: mockOriginId,
      destination: mockIntermediateId,
      mode: 'road',
      departureTime: '2026-10-01T06:00:00+05:30',
      arrivalTime: '2026-10-01T07:30:00+05:30',
      duration: 90,
      distance: 60,
      price: 500,
    },
    {
      sequence: 2,
      origin: mockIntermediateId,
      destination: mockDestId,
      mode: 'rail',
      departureTime: '2026-10-01T08:15:00+05:30',
      arrivalTime: '2026-10-01T20:30:00+05:30',
      duration: 735,
      distance: 980,
      price: 1350,
      train_number: '12301',
    },
  ],
};

const normMulti = journeyNormalizer.normalizeCandidate(multiLegPayload, context);
assertCheck('Multi-leg numberOfTransfers is 1', normMulti.numberOfTransfers === 1);
assertCheck('Multi-leg transportModes has [road, rail]', JSON.stringify(normMulti.transportModes) === JSON.stringify(['road', 'rail']));
assertCheck('Multi-leg totalPrice is 1850', normMulti.totalPrice === 1850);
assertCheck('Multi-leg passes canonical validation', validateJourneyCandidate(normMulti).valid);

// 6. Invalid Data Rejection
console.log('\n6. Verifying Invalid Data Rejection (PRD Section 49)...');
const brokenContinuity = {
  origin: mockOriginId,
  destination: mockDestId,
  departureTime: new Date('2026-10-01T06:00:00Z'),
  arrivalTime: new Date('2026-10-01T18:00:00Z'),
  duration: 720,
  legs: [
    { sequence: 1, origin: mockOriginId, destination: mockIntermediateId, mode: 'rail', departureTime: new Date('2026-10-01T06:00:00Z'), arrivalTime: new Date('2026-10-01T12:00:00Z'), duration: 360 },
    { sequence: 2, origin: new mongoose.Types.ObjectId(), destination: mockDestId, mode: 'rail', departureTime: new Date('2026-10-01T13:00:00Z'), arrivalTime: new Date('2026-10-01T18:00:00Z'), duration: 300 },
  ],
};
assertCheck('Rejects broken leg spatial continuity', !validateJourneyCandidate(brokenContinuity).valid);

const negativePrice = {
  origin: mockOriginId,
  destination: mockDestId,
  departureTime: new Date('2026-10-01T06:00:00Z'),
  arrivalTime: new Date('2026-10-01T18:00:00Z'),
  duration: 720,
  totalPrice: -100,
  legs: [{ sequence: 1, origin: mockOriginId, destination: mockDestId, mode: 'rail', departureTime: new Date('2026-10-01T06:00:00Z'), arrivalTime: new Date('2026-10-01T18:00:00Z'), duration: 720, price: -100 }],
};
assertCheck('Rejects negative price', !validateJourneyCandidate(negativePrice).valid);

// 7. Envelope Resilience
console.log('\n7. Verifying Provider Envelope Resilience (PRD Section 37)...');
const envelope = createSuccessEnvelope({
  provider: 'rail',
  candidates: [
    { departure_time: '2026-10-01T06:00:00+05:30', arrival_time: '2026-10-01T18:00:00+05:30', train_number: '12301', price: 850 },
    { departure_time: '2026-10-01T18:00:00+05:30', arrival_time: '2026-10-01T06:00:00+05:30', train_number: 'INVALID' }, // Corrupt!
    { departure_time: '2026-10-01T12:00:00+05:30', arrival_time: '2026-10-01T22:00:00+05:30', train_number: '12303', price: 920 },
  ],
});
const normalizedEnvelope = normalizeProviderResult(envelope, context, { validate: true });
assertCheck('Valid candidates survive corrupt candidate in envelope', normalizedEnvelope.length === 2);

console.log('\n' + '='.repeat(70));
console.log(`  VERIFICATION RESULT: ${passed}/${total} checks passed (${Math.round((passed / total) * 100)}%)`);
console.log('='.repeat(70));

if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
