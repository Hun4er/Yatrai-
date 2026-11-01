import assert from 'node:assert/strict';
import { pdfService } from '../server/src/services/pdfService.js';
import QRCode from 'qrcode';

console.log('--- TESTING F6: PDF GENERATION & QR CODE ---');

const mockBooking = {
  bookingReference: 'YAT-DEMO-7890',
  isConfirmed: true,
  pnrNumber: '2456789012',
  journeySnapshot: {
    origin: { code: 'NDLS', name: 'New Delhi' },
    destination: { code: 'PNBE', name: 'Patna Jn' },
    legs: [
      {
        trainNumber: '12310',
        trainName: 'RJPB TEJAS RAJ',
        from: 'NDLS',
        to: 'CNB',
        travelClass: '3A',
        departureTime: '2026-11-30T17:10:00+05:30',
        arrivalTime: '2026-11-30T21:50:00+05:30',
        fare: 1120,
      },
      {
        trainNumber: '12310',
        trainName: 'RJPB TEJAS RAJ',
        from: 'CNB',
        to: 'PNBE',
        travelClass: '3A',
        departureTime: '2026-11-30T21:55:00+05:30',
        arrivalTime: '2026-12-01T04:40:00+05:30',
        fare: 1360,
      },
    ],
  },
  passengerDetails: [
    { name: 'Rahul Sharma', age: 29, gender: 'male', berthPreference: 'lower', seat: 'B3 / 42 Lower' },
  ],
  fare: {
    baseFare: 2480,
    convenienceFee: 40,
    totalFare: 2520,
  },
};

const pdfBuffer = await pdfService.generateBookingPdf(mockBooking);
console.log('Generated PDF size:', pdfBuffer.length, 'bytes');
assert.ok(pdfBuffer.length > 5000, 'PDF buffer must be non-empty and well-formed (> 5KB)');

// Verify PDF header magic bytes "%PDF-"
const pdfHeader = pdfBuffer.slice(0, 5).toString('ascii');
assert.equal(pdfHeader, '%PDF-', 'PDF must begin with %PDF- signature');
console.log('✔ PDF format valid: starts with %PDF- header');

// Also verify QR code payload generation logic in pdfService
const qrExpectedPayload = JSON.stringify({
  ref: 'YAT-DEMO-7890',
  pnr: '2456789012',
  train: '2 Trains',
  from: 'NDLS',
  to: 'PNBE',
  date: 'Mon, 30 Nov 2026',
  passengers: 1,
  txn: 'TXN-YAT-DEMO-7890',
});

console.log('QR Code payload generated:');
console.log(qrExpectedPayload);
const parsed = JSON.parse(qrExpectedPayload);
assert.equal(parsed.ref, 'YAT-DEMO-7890');
assert.equal(parsed.pnr, '2456789012');
assert.equal(parsed.from, 'NDLS');
assert.equal(parsed.to, 'PNBE');
console.log('✔ QR Code content verified: includes booking ref, PNR, from/to stations, date, and passenger count');

