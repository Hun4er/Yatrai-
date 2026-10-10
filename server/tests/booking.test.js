import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup.js';
import config from '../src/config/index.js';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import Journey from '../src/models/Journey.js';
import JourneyLeg from '../src/models/JourneyLeg.js';
import Location from '../src/models/Location.js';
import Booking from '../src/models/Booking.js';

describe('Booking & PDF E-Ticket Workflow Suite', () => {
  let app;
  let server;
  let baseUrl;
  let userA, tokenA;
  let userB, tokenB;
  let testOriginLoc, testDestLoc;
  let testJourney;

  function createAuthToken(user) {
    return jwt.sign(
      { sub: user._id.toString(), email: user.email, role: user.role || 'user' },
      config.auth.jwtAccessSecret,
      { expiresIn: '15m' }
    );
  }

  before(async () => {
    await setupTestDb();
    app = createApp();
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // 1. Create User A
    userA = await User.create({
      name: 'Rohan Sharma',
      email: 'rohan.sharma@example.com',
      passwordHash: 'hash123',
    });
    tokenA = createAuthToken(userA);

    // 2. Create User B (for IDOR attack tests)
    userB = await User.create({
      name: 'Priya Verma',
      email: 'priya.verma@example.com',
      passwordHash: 'hash456',
    });
    tokenB = createAuthToken(userB);

    // 3. Create Locations
    testOriginLoc = await Location.create({
      name: 'Varanasi Junction',
      code: 'BSB',
      city: 'Varanasi',
      state: 'Uttar Pradesh',
      country: 'India',
      location: { type: 'Point', coordinates: [82.9863, 25.3283] },
      type: 'railway_station',
    });

    testDestLoc = await Location.create({
      name: 'Prayagraj Junction',
      code: 'PRYJ',
      city: 'Prayagraj',
      state: 'Uttar Pradesh',
      country: 'India',
      location: { type: 'Point', coordinates: [81.8351, 25.4528] },
      type: 'railway_station',
    });

    // 4. Create Journey
    testJourney = await Journey.create({
      origin: testOriginLoc._id,
      destination: testDestLoc._id,
      departureTime: new Date('2026-10-15T06:00:00Z'),
      arrivalTime: new Date('2026-10-15T08:30:00Z'),
      duration: 150,
      totalDistance: 125,
      totalPrice: 420,
      currency: 'INR',
      numberOfTransfers: 0,
      transportModes: ['rail'],
      status: 'scheduled',
    });

    await JourneyLeg.create({
      journey: testJourney._id,
      sequence: 1,
      origin: testOriginLoc._id,
      destination: testDestLoc._id,
      mode: 'rail',
      departureTime: new Date('2026-10-15T06:00:00Z'),
      arrivalTime: new Date('2026-10-15T08:30:00Z'),
      duration: 150,
      distance: 125,
      price: 420,
      vehicle: { identifier: '12418', type: 'train' },
      service: { name: 'Prayagraj Express', class: '3A' },
    });
  });

  describe('1. Booking Preparation Endpoint (POST /api/booking/prepare)', () => {
    it('prepares single direct journey booking feasibility', async () => {
      const res = await fetch(`${baseUrl}/booking/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journeyId: testJourney._id.toString(), passengers: 2 }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.allowed === false, true); // Direct AOPAY sandbox reports unconfigured/disabled
      assert.ok(data.complianceNotice || data.message);
    });

    it('rejects prepare request without journeyId', async () => {
      const res = await fetch(`${baseUrl}/booking/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });
  });

  describe('2. Booking Creation & Validation (POST /api/booking)', () => {
    it('rejects unauthenticated booking creation with 401', async () => {
      const res = await fetch(`${baseUrl}/booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          journeyId: testJourney._id.toString(),
          passengerDetails: [{ name: 'Rohan Sharma', age: 29, gender: 'male' }],
          contactInfo: { email: 'rohan@example.com', phone: '9876543210' },
        }),
      });

      assert.equal(res.status, 401);
    });

    it('validates mandatory passenger details (name, age, gender)', async () => {
      const res = await fetch(`${baseUrl}/booking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          journeyId: testJourney._id.toString(),
          passengerDetails: [{ name: '', age: 0, gender: 'invalid' }],
          contactInfo: { email: 'rohan@example.com', phone: '9876543210' },
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
    });

    it('successfully creates an unconfirmed booking for logged-in user', async () => {
      const res = await fetch(`${baseUrl}/booking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          journeyId: testJourney._id.toString(),
          passengerDetails: [
            { name: 'Rohan Sharma', age: 29, gender: 'male', berthPreference: 'lower' },
            { name: 'Anita Sharma', age: 27, gender: 'female', berthPreference: 'upper' },
          ],
          contactInfo: { email: 'rohan@example.com', phone: '9876543210' },
          idempotencyKey: 'idemp-test-key-1',
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.data.booking.bookingReference.startsWith('YTR-BK-'));
      assert.equal(data.data.booking.status, 'unconfirmed');
      assert.equal(data.data.booking.isConfirmed, false);
      assert.equal(data.data.booking.pnr, null); // Strict Booking Integrity Rule: Never fabricate PNR
      assert.equal(data.data.booking.passengerDetails.length, 2);
      assert.equal(data.data.booking.fare.totalFare, 840); // 420 * 2
    });

    it('idempotency: prevents duplicate booking creation with same idempotency key', async () => {
      const payload = {
        journeyId: testJourney._id.toString(),
        passengerDetails: [{ name: 'Rohan Sharma', age: 29, gender: 'male' }],
        contactInfo: { email: 'rohan@example.com', phone: '9876543210' },
        idempotencyKey: 'unique-idempotency-key-abc',
      };

      const res1 = await fetch(`${baseUrl}/booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify(payload),
      });
      assert.equal(res1.status, 201);
      const data1 = await res1.json();
      const firstRef = data1.data.booking.bookingReference;

      // Duplicate call
      const res2 = await fetch(`${baseUrl}/booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify(payload),
      });
      assert.equal(res2.status, 201);
      const data2 = await res2.json();
      assert.equal(data2.data.booking.bookingReference, firstRef);

      // Verify only 1 record exists in DB for this key
      const count = await Booking.countDocuments({ idempotencyKey: 'unique-idempotency-key-abc' });
      assert.equal(count, 1);
    });
  });

  describe('3. My Bookings & IDOR Authorization Defense', () => {
    let bookingA;

    beforeEach(async () => {
      const res = await fetch(`${baseUrl}/booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          journeyId: testJourney._id.toString(),
          passengerDetails: [{ name: 'Rohan Sharma', age: 29, gender: 'male' }],
          contactInfo: { email: 'rohan@example.com', phone: '9876543210' },
        }),
      });
      const data = await res.json();
      bookingA = data.data.booking;
    });

    it('retrieves user bookings for User A', async () => {
      const res = await fetch(`${baseUrl}/booking/my-bookings`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.data.bookings.length, 1);
      assert.equal(data.data.bookings[0].bookingReference, bookingA.bookingReference);
    });

    it('IDOR Defense: User B CANNOT see User A bookings in list', async () => {
      const res = await fetch(`${baseUrl}/booking/my-bookings`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.data.bookings.length, 0); // User B has no bookings
    });

    it('retrieves single booking details by ID for owner (User A)', async () => {
      const res = await fetch(`${baseUrl}/booking/${bookingA._id}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.data.booking.bookingReference, bookingA.bookingReference);
    });

    it('IDOR Defense: User B CANNOT inspect User A booking details (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/booking/${bookingA._id}`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(res.status, 403);
    });
  });

  describe('4. PDF Generation & Download Security', () => {
    let bookingA;

    beforeEach(async () => {
      const res = await fetch(`${baseUrl}/booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          journeyId: testJourney._id.toString(),
          passengerDetails: [{ name: 'Rohan Sharma', age: 29, gender: 'male', berthPreference: 'lower' }],
          contactInfo: { email: 'rohan@example.com', phone: '9876543210' },
        }),
      });
      const data = await res.json();
      bookingA = data.data.booking;
    });

    it('generates and streams valid PDF document for owner (User A)', async () => {
      const res = await fetch(`${baseUrl}/booking/${bookingA._id}/pdf`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/pdf');
      assert.ok(res.headers.get('content-disposition').includes('Yatrai_Journey_Summary_'));

      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      assert.ok(buffer.length > 500);

      // Verify PDF magic header
      const magic = buffer.slice(0, 5).toString('ascii');
      assert.equal(magic, '%PDF-');
    });

    it('IDOR Defense: User B CANNOT download User A PDF document (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/booking/${bookingA._id}/pdf`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });

      assert.equal(res.status, 403);
    });

    it('unauthenticated download request is rejected with 401', async () => {
      const res = await fetch(`${baseUrl}/booking/${bookingA._id}/pdf`);
      assert.equal(res.status, 401);
    });
  });
});
