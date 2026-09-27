import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup.js';
import config from '../src/config/index.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Location } from '../src/models/Location.js';
import { Journey } from '../src/models/Journey.js';
import { SavedJourney } from '../src/models/SavedJourney.js';
import { Notification } from '../src/models/Notification.js';
import { NOTIFICATION_TYPES } from '../src/constants/notificationTypes.js';
import notificationService from '../src/services/notificationService.js';
import reminderService from '../src/services/notifications/reminderService.js';
import changeDetectionService from '../src/services/notifications/changeDetectionService.js';

describe('Phase 14 — Notifications & Idempotent Event Delivery Suite', () => {
  let app;
  let server;
  let baseUrl;
  let userA, userB, tokenA, tokenB;
  let locA, locB, canonicalJourney, savedJourneyA;

  function createAuthToken(user) {
    return jwt.sign(
      { sub: user._id.toString(), email: user.email },
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

    await Promise.all([
      User.init(),
      Location.init(),
      Journey.init(),
      SavedJourney.init(),
      Notification.init(),
    ]);
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // Create test user A
    userA = await User.create({
      name: 'Aarav Sharma',
      email: 'aarav@example.com',
      passwordHash: 'dummy_hash_a',
      role: 'user',
    });
    tokenA = createAuthToken(userA);

    // Create test user B (for IDOR isolation testing)
    userB = await User.create({
      name: 'Diya Patel',
      email: 'diya@example.com',
      passwordHash: 'dummy_hash_b',
      role: 'user',
    });
    tokenB = createAuthToken(userB);

    // Create test locations
    locA = await Location.create({
      name: 'Sonipat Junction',
      city: 'Sonipat',
      state: 'Haryana',
      type: 'railway_station',
      location: { type: 'Point', coordinates: [77.0178, 28.9931] },
    });

    locB = await Location.create({
      name: 'Patna Junction',
      city: 'Patna',
      state: 'Bihar',
      type: 'railway_station',
      location: { type: 'Point', coordinates: [85.1376, 25.6022] },
    });

    // Create canonical journey departing tomorrow
    const departure = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours from now
    const arrival = new Date(departure.getTime() + 10 * 60 * 60 * 1000);

    canonicalJourney = await Journey.create({
      origin: locA._id,
      destination: locB._id,
      departureTime: departure,
      arrivalTime: arrival,
      duration: 600,
      totalPrice: 850,
      currency: 'INR',
      transportModes: ['rail'],
    });

    // Save journey for user A
    savedJourneyA = await SavedJourney.create({
      user: userA._id,
      journey: canonicalJourney._id,
      name: 'Diwali Trip',
    });
  });

  // ============================================================================
  // 1. NOTIFICATION MODEL & CRUD INTEGRATION
  // ============================================================================
  describe('1. Notification Model & Core Service', () => {
    it('creates notification with valid type and default unread state', async () => {
      const notif = await notificationService.createNotification({
        userId: userA._id,
        type: NOTIFICATION_TYPES.JOURNEY_REMINDER,
        title: 'Journey Reminder',
        message: 'Your journey from Sonipat to Patna departs in 12 hours.',
        journeyId: canonicalJourney._id,
        savedJourneyId: savedJourneyA._id,
        metadata: { origin: 'Sonipat', destination: 'Patna' },
      });

      assert.ok(notif._id);
      assert.equal(notif.read, false);
      assert.equal(notif.readAt, null);
      assert.equal(notif.type, 'journey_reminder');
      assert.equal(notif.user.toString(), userA._id.toString());
      assert.equal(notif.journey.toString(), canonicalJourney._id.toString());
    });

    it('rejects notification with invalid user identifier', async () => {
      await assert.rejects(async () => {
        await notificationService.createNotification({
          userId: 'invalid-id',
          type: NOTIFICATION_TYPES.PRICE_CHANGE,
          title: 'Test',
          message: 'Test message',
        });
      }, /Invalid user identifier/i);
    });

    it('enforces idempotency: identical idempotencyKey returns existing record without error', async () => {
      const key = `test:idempotency:${userA._id}:12345`;

      const notif1 = await notificationService.createNotification({
        userId: userA._id,
        type: NOTIFICATION_TYPES.PRICE_CHANGE,
        title: 'Price Drop 1',
        message: 'Price dropped to ₹720',
        idempotencyKey: key,
      });

      const notif2 = await notificationService.createNotification({
        userId: userA._id,
        type: NOTIFICATION_TYPES.PRICE_CHANGE,
        title: 'Price Drop 2',
        message: 'Price dropped to ₹720 again',
        idempotencyKey: key,
      });

      assert.equal(notif1._id.toString(), notif2._id.toString());
      const count = await Notification.countDocuments({ user: userA._id });
      assert.equal(count, 1);
    });
  });

  // ============================================================================
  // 2. JOURNEY REMINDERS & SCHEDULER IDEMPOTENCY
  // ============================================================================
  describe('2. Journey Reminders & Scheduler (PRD Section 10–13)', () => {
    it('generates reminder notification for upcoming saved journey within lead time', async () => {
      const result = await reminderService.sweepReminders({
        userId: userA._id,
        leadTimeHours: 24,
      });

      assert.equal(result.checked, 1);
      assert.equal(result.created, 1);

      const notifs = await notificationService.listUserNotifications(userA._id);
      assert.equal(notifs.total, 1);
      assert.equal(notifs.notifications[0].type, 'journey_reminder');
      assert.ok(notifs.notifications[0].title.includes('Reminder'));
      assert.ok(notifs.notifications[0].message.includes('Sonipat'));
      assert.ok(notifs.notifications[0].message.includes('Patna'));
    });

    it('scheduler execution is strictly idempotent (running twice yields 0 duplicates)', async () => {
      // First run
      const sweep1 = await reminderService.sweepReminders({ userId: userA._id, leadTimeHours: 24 });
      assert.equal(sweep1.created, 1);

      // Immediate second run
      const sweep2 = await reminderService.sweepReminders({ userId: userA._id, leadTimeHours: 24 });
      assert.equal(sweep2.created, 0);

      const notifs = await notificationService.listUserNotifications(userA._id);
      assert.equal(notifs.total, 1);
    });

    it('does NOT create reminder for journeys far outside lead time window', async () => {
      // Create journey 5 days from now
      const farDeparture = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const farJourney = await Journey.create({
        origin: locA._id,
        destination: locB._id,
        departureTime: farDeparture,
        arrivalTime: new Date(farDeparture.getTime() + 5 * 60 * 60 * 1000),
        duration: 300,
        totalPrice: 900,
        currency: 'INR',
      });

      await SavedJourney.create({
        user: userA._id,
        journey: farJourney._id,
      });

      // Sweep with 24-hour lead time (farJourney should be ignored)
      const sweep = await reminderService.sweepReminders({
        userId: userA._id,
        leadTimeHours: 24,
      });

      // Only canonicalJourney (12 hours away) is created, farJourney is skipped
      assert.equal(sweep.created, 1);
    });
  });

  // ============================================================================
  // 3. PRICE CHANGE DETECTION
  // ============================================================================
  describe('3. Price Change Detection (PRD Section 14–17)', () => {
    it('creates PRICE_CHANGE notification when price drops', async () => {
      const notif = await changeDetectionService.handlePriceChange({
        userId: userA._id,
        savedJourneyId: savedJourneyA._id,
        journeyId: canonicalJourney._id,
        origin: 'Sonipat',
        destination: 'Patna',
        oldPrice: 850,
        newPrice: 720,
        currency: 'INR',
      });

      assert.ok(notif);
      assert.equal(notif.type, 'price_change');
      assert.ok(notif.message.includes('₹850'));
      assert.ok(notif.message.includes('₹720'));
      assert.ok(notif.message.includes('dropped'));
    });

    it('creates PRICE_CHANGE notification when price increases', async () => {
      const notif = await changeDetectionService.handlePriceChange({
        userId: userA._id,
        savedJourneyId: savedJourneyA._id,
        origin: 'Sonipat',
        destination: 'Patna',
        oldPrice: 850,
        newPrice: 1050,
        currency: 'INR',
      });

      assert.ok(notif);
      assert.ok(notif.message.includes('increased'));
      assert.ok(notif.message.includes('₹1050'));
    });

    it('suppresses notification when price has not changed', async () => {
      const notif = await changeDetectionService.handlePriceChange({
        userId: userA._id,
        savedJourneyId: savedJourneyA._id,
        origin: 'Sonipat',
        destination: 'Patna',
        oldPrice: 850,
        newPrice: 850,
        currency: 'INR',
      });

      assert.equal(notif, null);
    });

    it('suppresses notification when currencies mismatch (Currency Safety Rule)', async () => {
      const notif = await changeDetectionService.handlePriceChange({
        userId: userA._id,
        savedJourneyId: savedJourneyA._id,
        origin: 'Sonipat',
        destination: 'Patna',
        oldPrice: 850,
        newPrice: 12,
        currency: 'USD',
        oldCurrency: 'INR',
      });

      assert.equal(notif, null);
    });
  });

  // ============================================================================
  // 4. SCHEDULE CHANGE & SAVED JOURNEY UPDATES
  // ============================================================================
  describe('4. Schedule Changes & Saved Journey Updates (PRD Section 18–19)', () => {
    it('creates SCHEDULE_CHANGE notification when departure time shifts', async () => {
      const oldTime = '2026-10-01T06:30:00.000Z';
      const newTime = '2026-10-01T07:15:00.000Z';

      const notif = await changeDetectionService.handleScheduleChange({
        userId: userA._id,
        savedJourneyId: savedJourneyA._id,
        journeyId: canonicalJourney._id,
        origin: 'Sonipat',
        destination: 'Patna',
        oldDepartureTime: oldTime,
        newDepartureTime: newTime,
      });

      assert.ok(notif);
      assert.equal(notif.type, 'schedule_change');
      assert.ok(notif.message.includes('new departure time'));
    });

    it('suppresses SCHEDULE_CHANGE notification if times are identical', async () => {
      const time = '2026-10-01T06:30:00.000Z';
      const notif = await changeDetectionService.handleScheduleChange({
        userId: userA._id,
        savedJourneyId: savedJourneyA._id,
        origin: 'Sonipat',
        destination: 'Patna',
        oldDepartureTime: time,
        newDepartureTime: time,
      });

      assert.equal(notif, null);
    });

    it('creates SAVED_JOURNEY_UPDATE notification for general updates', async () => {
      const notif = await changeDetectionService.handleSavedJourneyUpdate({
        userId: userA._id,
        savedJourneyId: savedJourneyA._id,
        origin: 'Sonipat',
        destination: 'Patna',
        reason: 'Platform assigned at New Delhi',
      });

      assert.ok(notif);
      assert.equal(notif.type, 'saved_journey_update');
      assert.ok(notif.message.includes('Platform assigned at New Delhi'));
    });
  });

  // ============================================================================
  // 5. READ STATE & UNREAD COUNT APIS
  // ============================================================================
  describe('5. Read State & Unread Count (PRD Section 23–27)', () => {
    it('tracks unread count and marks single notification as read', async () => {
      const notif = await notificationService.createNotification({
        userId: userA._id,
        type: NOTIFICATION_TYPES.PRICE_CHANGE,
        title: 'Price Changed',
        message: 'Price dropped to ₹720',
      });

      // Check unread count
      const resCount = await fetch(`${baseUrl}/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const dataCount = await resCount.json();

      assert.equal(resCount.status, 200);
      assert.equal(dataCount.data.count, 1);

      // Mark single notification as read
      const resRead = await fetch(`${baseUrl}/notifications/${notif._id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const dataRead = await resRead.json();

      assert.equal(resRead.status, 200);
      assert.equal(dataRead.data.notification.read, true);
      assert.ok(dataRead.data.notification.readAt);

      // Verify unread count is now 0
      const resCount2 = await fetch(`${baseUrl}/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const dataCount2 = await resCount2.json();

      assert.equal(resCount2.status, 200);
      assert.equal(dataCount2.data.count, 0);
    });

    it('marks all notifications as read in bulk', async () => {
      await notificationService.createNotification({
        userId: userA._id,
        type: NOTIFICATION_TYPES.PRICE_CHANGE,
        title: '1',
        message: 'M1',
      });
      await notificationService.createNotification({
        userId: userA._id,
        type: NOTIFICATION_TYPES.SCHEDULE_CHANGE,
        title: '2',
        message: 'M2',
      });

      const resBulk = await fetch(`${baseUrl}/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const dataBulk = await resBulk.json();

      assert.equal(resBulk.status, 200);
      assert.equal(dataBulk.data.updatedCount, 2);

      const unreadCount = await notificationService.getUnreadCount(userA._id);
      assert.equal(unreadCount, 0);
    });
  });

  // ============================================================================
  // 6. SECURITY & IDOR AUTHORIZATION DEFENSE (PRD Section 25 & 51)
  // ============================================================================
  describe('6. Security & IDOR Authorization Defense', () => {
    let notifA;

    beforeEach(async () => {
      notifA = await notificationService.createNotification({
        userId: userA._id,
        type: NOTIFICATION_TYPES.JOURNEY_REMINDER,
        title: 'Private Alert A',
        message: 'Sensitive travel reminder for User A',
      });
    });

    it('User B CANNOT see User A notifications', async () => {
      const res = await fetch(`${baseUrl}/notifications`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.data.notifications.length, 0);
    });

    it('User B CANNOT mark User A notification as read (IDOR Protection)', async () => {
      const res = await fetch(`${baseUrl}/notifications/${notifA._id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      const data = await res.json();

      assert.equal(res.status, 404);
      const msg = data.error?.message || data.message;
      assert.match(msg, /not found or not owned/i);

      // Verify notification remains unread for User A
      const fresh = await Notification.findById(notifA._id);
      assert.equal(fresh.read, false);
    });

    it('User B CANNOT delete User A notification (IDOR Protection)', async () => {
      const res = await fetch(`${baseUrl}/notifications/${notifA._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      const data = await res.json();

      assert.equal(res.status, 404);
      const msg = data.error?.message || data.message;
      assert.match(msg, /not found or not owned/i);

      // Verify notification still exists in database
      const fresh = await Notification.findById(notifA._id);
      assert.ok(fresh);
    });

    it('rejects unauthenticated notification requests with 401', async () => {
      const res = await fetch(`${baseUrl}/notifications`);
      assert.equal(res.status, 401);
    });
  });
});
