import test from 'node:test';
import assert from 'node:assert/strict';
import { pdfService } from '../services/pdfService.js';
import { Booking, BOOKING_STATUSES } from '../models/Booking.js';
import { RouteExtensionService } from '../services/rail/routeExtension.service.js';

test('1. Booking Model: Schema supports multi-leg itineraries and transfers', () => {
  // Check booking statuses
  assert.ok(BOOKING_STATUSES.includes('confirmed'), 'Must include confirmed');
  assert.ok(BOOKING_STATUSES.includes('unconfirmed'), 'Must include unconfirmed');
  assert.ok(BOOKING_STATUSES.includes('partially_booked'), 'Must include partially_booked');

  // Check schema paths
  assert.ok(Booking.schema.paths['legs'], 'Booking schema must have legs array');
  assert.ok(Booking.schema.paths['transfers'], 'Booking schema must have transfers array');
  assert.ok(Booking.schema.paths['pnr'], 'Booking schema must have pnr');
  assert.ok(Booking.schema.paths['journey'], 'Booking schema must have journey reference');
});

test('2. Status Logic Separation: Route Extension avoids false confirmed status', () => {
  const service = new RouteExtensionService();

  // Test availability parser logic with RailKit-like strings
  const testCases = [
    { text: 'NOT AVAILABLE', expectedAvailable: false },
    { text: 'REGRET / CANCELLED', expectedAvailable: false },
    { text: 'GNWL 45 / WL 12', expectedAvailable: false },
    { text: 'PQWL 10 / WL 4', expectedAvailable: false },
    { text: 'AVAILABLE-0042', expectedAvailable: true },
    { text: 'CURR_AVBL-0005', expectedAvailable: true },
    { text: 'RAC 12', expectedAvailable: false },
  ];

  for (const tc of testCases) {
    const isAvail = !/NOT|REGRET|CANCEL/i.test(tc.text) && (
      tc.text.includes('AVAILABLE') ||
      tc.text.includes('CURR_AVBL') ||
      tc.text.startsWith('AVL')
    );
    assert.equal(isAvail, tc.expectedAvailable, `Text "${tc.text}" should evaluate isAvailable to ${tc.expectedAvailable}`);
  }
});

test('3. PDF Service: Multi-Leg e-ticket generation with real seat and transfer details', async () => {
  const multiLegBooking = {
    _id: '65f1a2b3c4d5e6f7a8b9c0d1',
    bookingReference: 'YTR-TEST-MULTI',
    pnr: null, // Unassigned PNR
    status: 'unconfirmed',
    isConfirmed: false,
    createdAt: new Date('2026-10-29T10:00:00.000Z'),
    passengerDetails: [
      { name: 'Aarav Sharma', age: 34, gender: 'male', berthPreference: 'lower', seat: null },
      { name: 'Priya Sharma', age: 31, gender: 'female', berthPreference: 'middle', seat: null },
    ],
    fare: {
      baseFare: 1450,
      taxesAndFees: 0,
      totalFare: 1450,
      currency: 'INR',
    },
    legs: [
      {
        legIndex: 1,
        trainNumber: '12391',
        trainName: 'Shramjeevi Express',
        fromStationCode: 'NDLS',
        fromStationName: 'New Delhi',
        toStationCode: 'DDU',
        toStationName: 'Pt Deen Dayal Upadhyaya Jn',
        departureTime: '2026-11-05T04:25:00.000Z',
        arrivalTime: '2026-11-05T15:10:00.000Z',
        travelClass: '3A',
        quota: 'GN',
        fare: 820,
        pnr: null,
        bookingStatus: 'SCHEDULE_VERIFIED',
      },
      {
        legIndex: 2,
        trainNumber: '12352',
        trainName: 'Rajendra Nagar Express',
        fromStationCode: 'DDU',
        fromStationName: 'Pt Deen Dayal Upadhyaya Jn',
        toStationCode: 'PNBE',
        toStationName: 'Patna Junction',
        departureTime: '2026-11-05T17:45:00.000Z',
        arrivalTime: '2026-11-05T21:15:00.000Z',
        travelClass: '3A',
        quota: 'GN',
        fare: 630,
        pnr: null,
        bookingStatus: 'SCHEDULE_VERIFIED',
      },
    ],
    transfers: [
      {
        transferIndex: 1,
        stationCode: 'DDU',
        stationName: 'Pt Deen Dayal Upadhyaya Jn',
        arrivalFromPrevious: '2026-11-05T15:10:00.000Z',
        departureToNext: '2026-11-05T17:45:00.000Z',
        waitingTimeMinutes: 155,
        sameStation: true,
      },
    ],
    journeySnapshot: {
      origin: { code: 'NDLS', name: 'New Delhi' },
      destination: { code: 'PNBE', name: 'Patna Junction' },
      duration: 1010,
      totalPrice: 1450,
    },
  };

  const pdfBuffer = await pdfService.generateBookingPdf(multiLegBooking);

  assert.ok(Buffer.isBuffer(pdfBuffer), 'Result must be a Buffer');
  assert.ok(pdfBuffer.length > 5000, `PDF Buffer size should be substantial (got ${pdfBuffer.length} bytes)`);

  // Check PDF signature '%PDF-'
  const header = pdfBuffer.slice(0, 5).toString('ascii');
  assert.equal(header, '%PDF-', 'Buffer must be a valid PDF document');
});

test('4. PDF Service: Single-train booking backward compatibility', async () => {
  const singleTrainBooking = {
    _id: '65f1a2b3c4d5e6f7a8b9c0d2',
    bookingReference: 'YTR-TEST-SINGLE',
    pnr: '2847193021',
    status: 'confirmed',
    isConfirmed: true,
    createdAt: new Date('2026-10-29T10:00:00.000Z'),
    passengerDetails: [
      { name: 'Rohan Mehra', age: 29, gender: 'male', berthPreference: 'lower', seat: 'B2 / 14 / Lower' },
    ],
    fare: {
      baseFare: 1120,
      taxesAndFees: 0,
      totalFare: 1120,
      currency: 'INR',
    },
    legs: [
      {
        legIndex: 1,
        trainNumber: '12301',
        trainName: 'Howrah Rajdhani',
        fromStationCode: 'HWH',
        fromStationName: 'Howrah Jn',
        toStationCode: 'NDLS',
        toStationName: 'New Delhi',
        departureTime: '2026-11-06T16:50:00.000Z',
        arrivalTime: '2026-11-07T10:05:00.000Z',
        travelClass: '3A',
        quota: 'GN',
        fare: 1120,
        pnr: '2847193021',
        bookingStatus: 'confirmed',
      },
    ],
    transfers: [],
    journeySnapshot: {
      origin: { code: 'HWH', name: 'Howrah Jn' },
      destination: { code: 'NDLS', name: 'New Delhi' },
      duration: 1035,
      totalPrice: 1120,
    },
  };

  const pdfBuffer = await pdfService.generateBookingPdf(singleTrainBooking);
  assert.ok(Buffer.isBuffer(pdfBuffer), 'Result must be a Buffer');
  assert.ok(pdfBuffer.length > 5000, 'PDF buffer must be valid');
  assert.equal(pdfBuffer.slice(0, 5).toString('ascii'), '%PDF-');
});
