import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { setupTestDb, teardownTestDb } from '../server/tests/setup.js';
import { bookingService } from '../server/src/services/bookingService.js';
import { Booking } from '../server/src/models/Booking.js';
import { User } from '../server/src/models/User.js';

console.log('--- TESTING PNR STATUS LOGIC ---');

await setupTestDb();

// 1. Test Real IRCTC PNR from real ticket (2846526889)
console.log('\n--- 1. Testing Real IRCTC PNR: 2846526889 ---');
const realPnrRes = await bookingService.getPnrStatus('2846526889');
assert.equal(realPnrRes.pnr, '2846526889');
assert.equal(realPnrRes.source, 'REAL_IRCTC');
assert.equal(realPnrRes.train.number, '22362');
assert.equal(realPnrRes.train.name, 'AMRIT BHARAT EXP');
assert.equal(realPnrRes.journey.origin.code, 'NDLS');
assert.equal(realPnrRes.journey.destination.code, 'PNBE');
assert.equal(realPnrRes.passengers[0].name, 'HARSH MISHRA');
assert.equal(realPnrRes.passengers[0].coach, 'S7');
assert.equal(realPnrRes.passengers[0].berth, '78');
console.log('✓ Real IRCTC ticket retrieved successfully with authentic details:', {
  pnr: realPnrRes.pnr,
  source: realPnrRes.source,
  train: `${realPnrRes.train.number} - ${realPnrRes.train.name}`,
  passenger: `${realPnrRes.passengers[0].name} (${realPnrRes.passengers[0].coach}/${realPnrRes.passengers[0].berth})`,
  totalFare: realPnrRes.fare.totalFare,
});

// 2. Test Yatrai Multi-Leg Sample PNR (2489102849)
console.log('\n--- 2. Testing Yatrai Multi-Leg Sample PNR: 2489102849 ---');
const yatraiPnrRes = await bookingService.getPnrStatus('2489102849');
assert.equal(yatraiPnrRes.pnr, '2489102849');
assert.equal(yatraiPnrRes.source, 'YATRAI_BOOKING');
assert.equal(yatraiPnrRes.isMultiLeg, true);
assert.equal(yatraiPnrRes.legs.length, 2);
assert.equal(yatraiPnrRes.transfers[0].transferStationCode, 'DDU');
console.log('✓ Yatrai multi-leg journey retrieved successfully:', {
  pnr: yatraiPnrRes.pnr,
  source: yatraiPnrRes.source,
  isMultiLeg: yatraiPnrRes.isMultiLeg,
  leg1: `${yatraiPnrRes.legs[0].trainNumber} (${yatraiPnrRes.legs[0].fromCode}->${yatraiPnrRes.legs[0].toCode})`,
  transfer: `Transfer at ${yatraiPnrRes.transfers[0].transferStationCode} (${yatraiPnrRes.transfers[0].waitingTimeMinutes} min)`,
  leg2: `${yatraiPnrRes.legs[1].trainNumber} (${yatraiPnrRes.legs[1].fromCode}->${yatraiPnrRes.legs[1].toCode})`,
});

// 3. Test actual Yatrai booking persisted in DB
console.log('\n--- 3. Testing database Yatrai booking record lookup ---');
const testUser = await User.create({
  name: 'Test Booker',
  email: `pnr_test_${Date.now()}@yatrai.in`,
  passwordHash: 'dummyhash',
});

const dummyJourneyId = new mongoose.Types.ObjectId();
const dbBooking = await Booking.create({
  user: testUser._id,
  journey: dummyJourneyId,
  bookingReference: 'YTR-BK-TESTPNR-9999',
  pnr: '9988776655',
  status: 'confirmed',
  isConfirmed: true,
  contactInfo: {
    email: 'traveler@yatrai.in',
    phone: '9876543210',
  },
  journeySnapshot: {
    origin: { code: 'NDLS', name: 'New Delhi' },
    destination: { code: 'PNBE', name: 'Patna Jn' },
    departureTime: new Date('2026-11-30T17:10:00+05:30'),
    arrivalTime: new Date('2026-12-01T04:40:00+05:30'),
  },
  legs: [
    {
      sequence: 1,
      trainNumber: '12310',
      trainName: 'TEJAS RAJ',
      origin: { code: 'NDLS', name: 'New Delhi' },
      destination: { code: 'CNB', name: 'Kanpur Central' },
      departureTime: new Date('2026-11-30T17:10:00+05:30'),
      arrivalTime: new Date('2026-11-30T21:50:00+05:30'),
      travelClass: '3A',
      quota: 'GN',
      fare: 1120,
      bookingStatus: 'confirmed',
      pnr: '9988776655',
    },
    {
      sequence: 2,
      trainNumber: '12310',
      trainName: 'TEJAS RAJ',
      origin: { code: 'CNB', name: 'Kanpur Central' },
      destination: { code: 'PNBE', name: 'Patna Jn' },
      departureTime: new Date('2026-11-30T21:55:00+05:30'),
      arrivalTime: new Date('2026-12-01T04:40:00+05:30'),
      travelClass: '3A',
      quota: 'GN',
      fare: 560,
      bookingStatus: 'confirmed',
      pnr: '9988776655',
    },
  ],
  transfers: [
    {
      transferStationCode: 'CNB',
      transferStationName: 'Kanpur Central',
      waitingTimeMinutes: 5,
      connectionStatus: 'validated',
    },
  ],
  passengerDetails: [
    { name: 'Nihar Sharma', age: 24, gender: 'male', berthPreference: 'lower' },
  ],
  fare: {
    baseFare: 1680,
    taxesAndFees: 0,
    totalFare: 1680,
    currency: 'INR',
  },
});

const foundDbBooking = await bookingService.getPnrStatus('9988776655');
assert.equal(foundDbBooking.pnr, '9988776655');
assert.equal(foundDbBooking.source, 'YATRAI_BOOKING');
assert.equal(foundDbBooking.isMultiLeg, true);
assert.equal(foundDbBooking.legs.length, 2);
assert.equal(foundDbBooking.legs[0].trainNumber, '12310');
assert.equal(foundDbBooking.legs[1].trainNumber, '12310');
console.log('✓ Yatrai database booking retrieved by PNR with 2-leg split details:', {
  pnr: foundDbBooking.pnr,
  ref: foundDbBooking.bookingReference,
  source: foundDbBooking.source,
  legsCount: foundDbBooking.legs.length,
});

// Also test lookup by bookingReference
const foundByRef = await bookingService.getPnrStatus('YTR-BK-TESTPNR-9999');
assert.equal(foundByRef.pnr, '9988776655');
console.log('✓ Yatrai database booking retrieved by booking reference: YTR-BK-TESTPNR-9999');

await teardownTestDb();
console.log('\n========================================');
console.log('ALL PNR STATUS BACKEND CHECKS PASSED!');
console.log('========================================');
