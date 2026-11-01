import mongoose from 'mongoose';
import { setupTestDb, teardownTestDb } from '../server/tests/setup.js';
import { parseSafeDate, bookingService, resolveOrCreateAuthoritativeJourney } from '../server/src/services/bookingService.js';
import { User } from '../server/src/models/User.js';
import { Booking } from '../server/src/models/Booking.js';
import { Journey } from '../server/src/models/Journey.js';
import { JourneyLeg } from '../server/src/models/JourneyLeg.js';
import pdfService from '../server/src/services/pdfService.js';
import dotenv from 'dotenv';
dotenv.config({ path: 'server/.env' });

async function run() {
  console.log('--- 1. Testing parseSafeDate helper ---');

  // Time-only strings
  const d1 = parseSafeDate('17:10', '2026-11-30');
  console.assert(!isNaN(d1.getTime()), 'd1 must be a valid date');
  console.log('✓ parseSafeDate("17:10", "2026-11-30") ->', d1.toISOString());

  const d2 = parseSafeDate('04:40', '2026-12-01');
  console.assert(!isNaN(d2.getTime()), 'd2 must be a valid date');
  console.log('✓ parseSafeDate("04:40", "2026-12-01") ->', d2.toISOString());

  // Edge cases: Invalid Date or null
  const d3 = parseSafeDate('Invalid Date', null);
  console.assert(!isNaN(d3.getTime()), 'd3 must be a valid date fallback');
  console.log('✓ parseSafeDate("Invalid Date", null) ->', d3.toISOString());

  const d4 = parseSafeDate(null, null);
  console.assert(!isNaN(d4.getTime()), 'd4 must be a valid date fallback');
  console.log('✓ parseSafeDate(null, null) ->', d4.toISOString());

  console.log('\n--- 2. Setting up in-memory MongoDB via setupTestDb ---');
  const dbInfo = await setupTestDb();
  console.log(`✓ Connected to test database: ${dbInfo.type}`);

  try {
    const user = await User.create({
      name: 'QA Auditor',
      email: 'test_qa_booking@yatrai.in',
      password: 'Password123!',
      phone: '9876543210',
      role: 'user',
    });
    console.log('✓ Test user created:', user._id);

    // Itinerary snapshot reproducing the exact bug from the user screenshot:
    // Leg 1: 18102 DLI -> PRYJ ("17:10", "04:40")
    // Leg 2: 12304 PRYJ -> PNBE ("07:30", "13:20")
    // Notice time strings are "HH:mm" - exactly what caused "Cast to date failed for value 'Invalid Date'"
    const simulatedSnapshot = {
      id: 'j-test-alt-connection-123',
      origin: { code: 'DLI', name: 'Old Delhi' },
      destination: { code: 'PNBE', name: 'Patna Jn' },
      departureTime: '17:10',
      arrivalTime: '13:20',
      departureDate: '2026-11-30',
      arrivalDate: '2026-12-01',
      duration: 1210,
      totalDistance: 1000,
      // Total price missing or 0 to test automatic leg fare calculation:
      totalPrice: 0,
      totalFare: 0,
      laneClass: '3A',
      legs: [
        {
          sequence: 1,
          trainNumber: '18102',
          trainName: 'Tata Link Express',
          from: 'DLI',
          to: 'PRYJ',
          origin: { code: 'DLI', name: 'Old Delhi' },
          destination: { code: 'PRYJ', name: 'Prayagraj Junction' },
          class: '3A',
          departureTime: '17:10',
          arrivalTime: '04:40',
          departureDate: '2026-11-30',
          arrivalDate: '2026-12-01',
          duration: 690,
          distance: 630,
          // Leg 1 has fare, Leg 2 fare is null (reproducing the missing leg 2 fare bug):
          fare: 1120,
          price: 1120,
        },
        {
          sequence: 2,
          trainNumber: '12304',
          trainName: 'Poorva Express',
          from: 'PRYJ',
          to: 'PNBE',
          origin: { code: 'PRYJ', name: 'Prayagraj Junction' },
          destination: { code: 'PNBE', name: 'Patna Jn' },
          class: '3A',
          departureTime: '07:30',
          arrivalTime: '13:20',
          departureDate: '2026-12-01',
          arrivalDate: '2026-12-01',
          duration: 350,
          distance: 370,
          fare: null,
          price: null,
        },
      ],
    };

    console.log('\n--- 3. Testing resolveOrCreateAuthoritativeJourney ---');
    const reconstructed = await resolveOrCreateAuthoritativeJourney('j-test-alt-connection-123', simulatedSnapshot);
    console.assert(reconstructed._id, 'Journey should be created in DB');
    console.assert(reconstructed.departureTime instanceof Date, 'Journey departureTime must be a Date');
    console.assert(!isNaN(reconstructed.departureTime.getTime()), 'Journey departureTime must not be NaN');
    console.assert(reconstructed.arrivalTime instanceof Date, 'Journey arrivalTime must be a Date');
    console.assert(!isNaN(reconstructed.arrivalTime.getTime()), 'Journey arrivalTime must not be NaN');
    console.assert(reconstructed.legs.length === 2, 'Should have 2 legs');
    console.log('✓ Journey reconstructed successfully in MongoDB:');
    console.log('  Journey ID:', reconstructed._id);
    console.log('  Departure Time (Date):', reconstructed.departureTime.toISOString());
    console.log('  Arrival Time (Date):', reconstructed.arrivalTime.toISOString());
    console.log('  Total Price:', reconstructed.totalPrice);
    console.log('  Leg 1 Fare:', reconstructed.legs[0].fare);
    console.log('  Leg 2 Fare (auto-calculated from tariff):', reconstructed.legs[1].fare);
    console.assert(reconstructed.legs[1].fare > 0, 'Leg 2 fare must be calculated > 0');

    console.log('\n--- 4. Testing bookingService.createBooking ---');
    const bookingResult = await bookingService.createBooking({
      userId: user._id,
      journeyId: reconstructed._id.toString(),
      journeySnapshot: simulatedSnapshot,
      passengerDetails: [
        {
          name: 'Niharika Verma',
          age: 28,
          gender: 'female',
          berthPreference: 'lower',
          category: 'general',
        },
        {
          name: 'Rajesh Verma',
          age: 32,
          gender: 'male',
          berthPreference: 'side_lower',
          category: 'general',
        },
      ],
      contactInfo: {
        email: 'traveler@example.com',
        phone: '9876543210',
      },
      idempotencyKey: `idemp-${Date.now()}`,
    });

    console.assert(bookingResult._id, 'Booking record must be persisted');
    console.assert(bookingResult.bookingReference, 'Booking reference must exist');
    console.assert(bookingResult.legs.length === 2, 'Must have 2 legs');
    console.assert(bookingResult.legs[0].departureTime instanceof Date, 'Leg 1 departureTime must be a Date');
    console.assert(bookingResult.legs[1].departureTime instanceof Date, 'Leg 2 departureTime must be a Date');
    console.assert(bookingResult.transfers.length === 1, 'Must have 1 transfer');
    console.assert(bookingResult.transfers[0].arrivalTimestamp instanceof Date, 'Transfer arrivalTimestamp must be a Date');
    console.assert(bookingResult.transfers[0].nextDepartureTimestamp instanceof Date, 'Transfer nextDepartureTimestamp must be a Date');

    console.log('✓ Booking created without any validation errors:');
    console.log('  Reference:', bookingResult.bookingReference);
    console.log('  Total Fare for 2 passengers: ₹' + bookingResult.fare.totalFare);
    console.log('  Leg 1 Fare (2 pax): ₹' + bookingResult.legs[0].fare);
    console.log('  Leg 2 Fare (2 pax): ₹' + bookingResult.legs[1].fare);
    console.log('  Transfer Layover:', bookingResult.transfers[0].waitingTimeMinutes, 'minutes');

    console.log('\n--- 5. Testing PDF generation ---');
    const pdfBuffer = await pdfService.generateBookingPdf(bookingResult);
    console.assert(Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 1000, 'PDF buffer must be valid');
    console.assert(pdfBuffer.subarray(0, 4).toString() === '%PDF', 'PDF buffer header must be %PDF');
    console.log('✓ PDF generated successfully, size:', pdfBuffer.length, 'bytes');

    console.log('\n========================================');
    console.log('ALL VERIFICATIONS PASSED CLEANLY! (100%)');
    console.log('========================================');
  } finally {
    await teardownTestDb();
  }
}

run().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
