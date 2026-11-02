/**
 * Validation Script: PNR Generation Authenticity, Uniqueness & Cross-Account Retrieval
 * Run with: node validation/test_pnr_generation_and_cross_account.mjs
 */

import mongoose from 'mongoose';
import { setupTestDb, teardownTestDb } from '../server/tests/setup.js';
import { generatePnrNumber, generateUniquePnr } from '../server/src/services/bookingService.js';
import bookingService from '../server/src/services/bookingService.js';
import Booking from '../server/src/models/Booking.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

async function runValidation() {
  console.log('\n==========================================================');
  console.log('🧪 VALIDATION: PNR Generation & Cross-Account Retrieval');
  console.log('==========================================================\n');

  // ── TEST 1: PRS Zone-Aware Prefix & 10-Digit Format ──
  console.log('--- Test 1: PRS Zone-Aware Prefix & 10-Digit Format ---');
  const ndlsPnr = generatePnrNumber('NDLS');
  assert(/^\d{10}$/.test(ndlsPnr), `NDLS PNR is 10 digits (${ndlsPnr})`);
  assert(/^[23]/.test(ndlsPnr), `NDLS (Northern PRS) starts with 2 or 3 (${ndlsPnr})`);

  const pnbePnr = generatePnrNumber('PNBE');
  assert(/^\d{10}$/.test(pnbePnr), `PNBE PNR is 10 digits (${pnbePnr})`);
  assert(/^[45]/.test(pnbePnr), `PNBE (Eastern PRS) starts with 4 or 5 (${pnbePnr})`);

  const masPnr = generatePnrNumber('MAS');
  assert(/^\d{10}$/.test(masPnr), `MAS PNR is 10 digits (${masPnr})`);
  assert(/^[67]/.test(masPnr), `MAS (Southern PRS) starts with 6 or 7 (${masPnr})`);

  const bctPnr = generatePnrNumber('BCT');
  assert(/^\d{10}$/.test(bctPnr), `BCT PNR is 10 digits (${bctPnr})`);
  assert(/^[89]/.test(bctPnr), `BCT (Western PRS) starts with 8 or 9 (${bctPnr})`);

  // ── TEST 2: Randomness & Uniqueness across 25 iterations ──
  console.log('\n--- Test 2: Uniqueness across 25 Generated PNRs ---');
  const samplePnrs = [];
  for (let i = 0; i < 25; i++) {
    samplePnrs.push(generatePnrNumber('NDLS'));
  }
  const uniqueCount = new Set(samplePnrs).size;
  assert(uniqueCount === 25, `All 25 generated PNRs are unique (unique count: ${uniqueCount}/25)`);
  console.log(`Sample PNRs: ${samplePnrs.slice(0, 4).join(', ')}...`);

  // Connect to DB via setupTestDb
  await setupTestDb();
  console.log('Connected to test database for transactional verification.');

  try {
    const userAId = new mongoose.Types.ObjectId();
    const userBId = new mongoose.Types.ObjectId();
    const dummyJourneyId = new mongoose.Types.ObjectId();

    // ── TEST 3: Create Booking as User A and Check Authentic PNR Assignment ──
    console.log('\n--- Test 3: Create Booking as User A & Verify Stored PNR ---');
    const depTime = new Date(Date.now() + 86400000 * 3);
    const arrTime = new Date(depTime.getTime() + 18 * 3600000);

    const bookingPayload1 = {
      userId: userAId,
      journeyId: dummyJourneyId,
      journeySnapshot: {
        origin: { code: 'NDLS', name: 'New Delhi' },
        destination: { code: 'PNBE', name: 'Patna Jn' },
        departureDate: depTime.toISOString().slice(0, 10),
        departureTime: depTime.toISOString(),
        arrivalDate: arrTime.toISOString().slice(0, 10),
        arrivalTime: arrTime.toISOString(),
        totalPrice: 1155,
        legs: [
          {
            trainNumber: '15484',
            trainName: 'MAHANANDA EXP',
            origin: { code: 'DLI', name: 'Delhi Jn' },
            destination: { code: 'DDU', name: 'Pt. Deen Dayal Upadhyaya Jn' },
            departureTime: depTime.toISOString(),
            arrivalTime: new Date(depTime.getTime() + 14 * 3600000).toISOString(),
            class: 'SL',
            fare: 435,
          },
          {
            trainNumber: '12141',
            trainName: 'PATLIPUTRA EXP',
            origin: { code: 'DDU', name: 'Pt. Deen Dayal Upadhyaya Jn' },
            destination: { code: 'PPTA', name: 'Patliputra Jn' },
            departureTime: new Date(depTime.getTime() + 15 * 3600000).toISOString(),
            arrivalTime: arrTime.toISOString(),
            class: 'SL',
            fare: 720,
          },
        ],
      },
      passengerDetails: [
        { name: 'Abhishek Mishra', age: 26, gender: 'male', berthPreference: 'lower' },
        { name: 'Pooja Mishra', age: 24, gender: 'female', berthPreference: 'upper' },
      ],
      contactInfo: { email: 'abhishek@yatrai.com', phone: '9876543210' },
    };

    const booking1 = await bookingService.createBooking(bookingPayload1);
    assert(booking1.pnr !== null && /^\d{10}$/.test(booking1.pnr), `Booking 1 assigned valid 10-digit PNR: ${booking1.pnr}`);
    assert(booking1.isConfirmed === true, `Booking 1 is marked confirmed: ${booking1.isConfirmed}`);
    assert(booking1.status === 'confirmed', `Booking 1 status is confirmed: ${booking1.status}`);
    assert(booking1.passengerDetails[0].coach !== null, `Passenger 1 has assigned coach: ${booking1.passengerDetails[0].coach}`);
    assert(booking1.passengerDetails[0].berth !== null, `Passenger 1 has assigned berth: ${booking1.passengerDetails[0].berth}`);
    assert(booking1.legs.length === 2, `Booking 1 tracked 2 distinct connecting legs`);
    assert(booking1.legs[0].pnr === booking1.pnr, `Leg 1 tracks master PNR: ${booking1.legs[0].pnr}`);
    assert(/^\d{10}$/.test(booking1.legs[1].pnr), `Leg 2 tracks realistic PNR: ${booking1.legs[1].pnr}`);

    // Create Booking 2 as User A and verify different PNR
    const booking2 = await bookingService.createBooking(bookingPayload1);
    assert(booking2.pnr !== null && /^\d{10}$/.test(booking2.pnr), `Booking 2 assigned valid 10-digit PNR: ${booking2.pnr}`);
    assert(booking1.pnr !== booking2.pnr, `PNRs are distinct every time: ${booking1.pnr} vs ${booking2.pnr}`);

    // ── TEST 4: Cross-Account PNR Inquiry by User B ──
    console.log('\n--- Test 4: Cross-Account PNR Retrieval by User B ---');
    const pnrLookupAsUserB = await bookingService.getPnrStatus(booking1.pnr, userBId);
    assert(pnrLookupAsUserB !== null, `User B successfully queried User A's PNR status`);
    assert(pnrLookupAsUserB.pnr === booking1.pnr, `PNR matches queried: ${pnrLookupAsUserB.pnr}`);
    assert(pnrLookupAsUserB.status === 'CONFIRMED', `Status is CONFIRMED`);
    assert(pnrLookupAsUserB.isMultiLeg === true, `Multi-leg journey detected correctly`);
    assert(pnrLookupAsUserB.legs.length === 2, `Returned 2 legs for multi-leg connection`);
    assert(pnrLookupAsUserB.passengers.length === 2, `Returned 2 passenger allocations`);

    // ── TEST 5: Guest (Unauthenticated) PNR Inquiry ──
    console.log('\n--- Test 5: Guest (Unauthenticated) PNR Inquiry ---');
    const guestPnrLookup = await bookingService.getPnrStatus(booking1.pnr, null);
    assert(guestPnrLookup !== null, `Guest successfully retrieved PNR status`);
    assert(guestPnrLookup.pnr === booking1.pnr, `Guest retrieved correct PNR details`);

    // ── TEST 6: Cross-Account PDF Generation for User A's Booking by User B ──
    console.log('\n--- Test 6: Cross-Account PDF Generation by User B & Guest ---');
    const pdfByUserB = await bookingService.getBookingPdf(booking1.pnr, userBId, 'user');
    assert(Buffer.isBuffer(pdfByUserB) && pdfByUserB.length > 1000, `User B downloaded PDF for User A's PNR (${pdfByUserB.length} bytes)`);
    assert(pdfByUserB.slice(0, 4).toString() === '%PDF', `Generated buffer is a valid %PDF file`);

    const pdfByGuest = await bookingService.getBookingPdf(booking1.pnr, null, 'guest');
    assert(Buffer.isBuffer(pdfByGuest) && pdfByGuest.length > 1000, `Guest downloaded PDF for PNR (${pdfByGuest.length} bytes)`);

    // ── TEST 7: Authentic Real IRCTC Ticket (2846526889) PDF Generation ──
    console.log('\n--- Test 7: Real IRCTC Ticket (2846526889) & Sample (2489102849) PDF ---');
    const realTicketPdf = await bookingService.getPdfByPnr('2846526889');
    assert(Buffer.isBuffer(realTicketPdf) && realTicketPdf.length > 1000, `Generated PDF for Real IRCTC 2846526889 (${realTicketPdf.length} bytes)`);

    const sampleMultiLegPdf = await bookingService.getPdfByPnr('2489102849');
    assert(Buffer.isBuffer(sampleMultiLegPdf) && sampleMultiLegPdf.length > 1000, `Generated PDF for Sample 2489102849 (${sampleMultiLegPdf.length} bytes)`);

    console.log('\n==========================================================');
    console.log('🎉 ALL PNR GENERATION & CROSS-ACCOUNT TESTS PASSED (7/7)!');
    console.log('==========================================================\n');
  } finally {
    await teardownTestDb();
  }
}

runValidation().catch((err) => {
  console.error('Validation test error:', err);
  process.exit(1);
});
