import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup.js';

import { User } from '../src/models/User.js';
import { Location } from '../src/models/Location.js';
import { TransportProvider } from '../src/models/TransportProvider.js';
import { Journey } from '../src/models/Journey.js';
import { JourneyLeg } from '../src/models/JourneyLeg.js';
import { SearchRequest } from '../src/models/SearchRequest.js';
import { SearchResult } from '../src/models/SearchResult.js';
import { SavedJourney } from '../src/models/SavedJourney.js';
import { Notification } from '../src/models/Notification.js';

import { userService } from '../src/services/userService.js';
import { locationService } from '../src/services/locationService.js';
import { providerService } from '../src/services/providerService.js';
import { journeyService } from '../src/services/journeyService.js';
import { journeyLegService } from '../src/services/journeyLegService.js';
import { searchRequestService } from '../src/services/searchRequestService.js';
import { searchResultService } from '../src/services/searchResultService.js';
import { savedJourneyService } from '../src/services/savedJourneyService.js';
import { notificationService } from '../src/services/notificationService.js';

describe('Yatrai Phase 1 — Database Models & Services Suite', () => {
  before(async () => {
    await setupTestDb();
    // Ensure all indexes are built
    await Promise.all([
      User.init(),
      Location.init(),
      TransportProvider.init(),
      Journey.init(),
      JourneyLeg.init(),
      SearchRequest.init(),
      SearchResult.init(),
      SavedJourney.init(),
      Notification.init(),
    ]);
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  // ============================================================================
  // 1. USER MODEL TESTS
  // ============================================================================
  describe('User Model & Service', () => {
    it('creates, reads, updates, and deletes a user (CRUD)', async () => {
      const created = await userService.create({
        name: 'Rohan Mehra',
        email: 'rohan.mehra@example.com',
        phone: '+91-9876543210',
      });

      assert.ok(created._id);
      assert.equal(created.email, 'rohan.mehra@example.com');
      assert.equal(created.status, 'active');
      assert.ok(created.createdAt);
      assert.ok(created.updatedAt);

      // Read
      const found = await userService.findById(created._id);
      assert.equal(found.name, 'Rohan Mehra');

      // Update
      const updated = await userService.update(created._id, { name: 'Rohan M.' });
      assert.equal(updated.name, 'Rohan M.');
      assert.ok(updated.updatedAt >= created.updatedAt);

      // Delete
      await userService.delete(created._id);
      const deleted = await userService.findById(created._id);
      assert.equal(deleted, null);
    });

    it('rejects invalid email formats', async () => {
      await assert.rejects(async () => {
        await userService.create({
          name: 'Bad Email User',
          email: 'not-an-email',
        });
      }, /valid email/i);
    });

    it('enforces unique email constraint', async () => {
      await userService.create({
        name: 'First User',
        email: 'duplicate@example.com',
      });

      await assert.rejects(async () => {
        await userService.create({
          name: 'Second User',
          email: 'duplicate@example.com',
        });
      }, /E11000|duplicate/i);
    });
  });

  // ============================================================================
  // 2. LOCATION MODEL TESTS
  // ============================================================================
  describe('Location Model & Service', () => {
    it('creates and reads location with valid GeoJSON coordinates', async () => {
      const location = await locationService.create({
        name: 'New Delhi Railway Station',
        type: 'railway_station',
        city: 'New Delhi',
        state: 'Delhi',
        country: 'India',
        location: {
          type: 'Point',
          coordinates: [77.2195, 28.643],
        },
        placeId: 'loc_ndls_test',
        timezone: 'Asia/Kolkata',
      });

      assert.ok(location._id);
      assert.equal(location.type, 'railway_station');
      assert.equal(location.location.coordinates[0], 77.2195);
      assert.equal(location.location.coordinates[1], 28.643);

      // Read & Query
      const found = await locationService.findById(location._id);
      assert.equal(found.name, 'New Delhi Railway Station');

      // Update
      const updated = await locationService.update(location._id, { displayName: 'NDLS Delhi' });
      assert.equal(updated.displayName, 'NDLS Delhi');

      // Delete
      await locationService.delete(location._id);
      assert.equal(await locationService.findById(location._id), null);
    });

    it('rejects invalid coordinates outside bounds', async () => {
      await assert.rejects(async () => {
        await locationService.create({
          name: 'Invalid Latitude Location',
          type: 'city',
          location: {
            type: 'Point',
            coordinates: [77.2, 95.0], // Latitude > 90
          },
        });
      }, /Invalid coordinates/i);

      await assert.rejects(async () => {
        await locationService.create({
          name: 'Invalid Longitude Location',
          type: 'city',
          location: {
            type: 'Point',
            coordinates: [-190.0, 28.0], // Longitude < -180
          },
        });
      }, /Invalid coordinates/i);
    });

    it('rejects unsupported location types', async () => {
      await assert.rejects(async () => {
        await locationService.create({
          name: 'Alien Base',
          type: 'space_station',
          location: {
            type: 'Point',
            coordinates: [0, 0],
          },
        });
      }, /not a supported location type/i);
    });
  });

  // ============================================================================
  // 3. TRANSPORT PROVIDER MODEL TESTS
  // ============================================================================
  describe('TransportProvider Model & Service', () => {
    it('creates, reads, updates, and deletes provider with unique code', async () => {
      const provider = await providerService.create({
        name: 'Indian Railway Catering and Tourism Corporation',
        code: 'IRCTC_TEST',
        type: 'rail',
        supportedModes: ['rail'],
        status: 'active',
      });

      assert.ok(provider._id);
      assert.equal(provider.code, 'IRCTC_TEST');

      // Read by code
      const found = await providerService.findByCode('irctc_test');
      assert.equal(found.name, provider.name);

      // Rejects duplicate code
      await assert.rejects(async () => {
        await providerService.create({
          name: 'Duplicate Provider',
          code: 'IRCTC_TEST',
          type: 'rail',
        });
      }, /E11000|duplicate/i);

      // Delete
      await providerService.delete(provider._id);
      assert.equal(await providerService.findById(provider._id), null);
    });
  });

  // ============================================================================
  // 4. JOURNEY & REFERENTIAL INTEGRITY TESTS
  // ============================================================================
  describe('Journey Model & Referential Integrity', () => {
    let locOrigin;
    let locDest;

    beforeEach(async () => {
      locOrigin = await locationService.create({
        name: 'Origin City',
        type: 'city',
        location: { type: 'Point', coordinates: [77.0, 28.0] },
      });
      locDest = await locationService.create({
        name: 'Destination City',
        type: 'city',
        location: { type: 'Point', coordinates: [82.0, 25.0] },
      });
    });

    it('creates journey with valid Location references', async () => {
      const dep = new Date('2026-10-01T08:00:00Z');
      const arr = new Date('2026-10-01T16:00:00Z');

      const journey = await journeyService.create({
        origin: locOrigin._id,
        destination: locDest._id,
        departureTime: dep,
        arrivalTime: arr,
        duration: 480,
        totalPrice: 1500,
        transportModes: ['rail'],
      });

      assert.ok(journey._id);
      assert.equal(journey.schemaVersion, 1);
      assert.equal(journey.totalPrice, 1500);

      // Read populated
      const found = await journeyService.findById(journey._id);
      assert.equal(found.origin.name, 'Origin City');
      assert.equal(found.destination.name, 'Destination City');
    });

    it('rejects journey with non-existent origin reference', async () => {
      const fakeId = new Location()._id;
      await assert.rejects(async () => {
        await journeyService.create({
          origin: fakeId,
          destination: locDest._id,
          departureTime: new Date(),
          arrivalTime: new Date(Date.now() + 3600000),
          duration: 60,
          totalPrice: 500,
        });
      }, /Referenced origin Location/i);
    });

    it('rejects journey where arrivalTime < departureTime', async () => {
      const dep = new Date('2026-10-01T12:00:00Z');
      const arr = new Date('2026-10-01T08:00:00Z'); // Earlier than dep

      await assert.rejects(async () => {
        await journeyService.create({
          origin: locOrigin._id,
          destination: locDest._id,
          departureTime: dep,
          arrivalTime: arr,
          duration: 60,
          totalPrice: 500,
        });
      }, /Arrival time cannot be earlier than departure time/i);
    });
  });

  // ============================================================================
  // 5. JOURNEY LEG & SEQUENCE RELATIONSHIP TESTS
  // ============================================================================
  describe('JourneyLeg Model — Single Source of Truth & Sequence', () => {
    let loc1;
    let loc2;
    let loc3;
    let testJourney;
    let testProvider;

    beforeEach(async () => {
      loc1 = await locationService.create({
        name: 'Station A',
        type: 'railway_station',
        location: { type: 'Point', coordinates: [77.0, 28.0] },
      });
      loc2 = await locationService.create({
        name: 'Station B',
        type: 'railway_station',
        location: { type: 'Point', coordinates: [79.0, 26.5] },
      });
      loc3 = await locationService.create({
        name: 'Station C',
        type: 'railway_station',
        location: { type: 'Point', coordinates: [82.0, 25.0] },
      });
      testProvider = await providerService.create({
        name: 'Rail Corp',
        code: 'RAIL_CORP',
        type: 'rail',
      });
      testJourney = await journeyService.create({
        origin: loc1._id,
        destination: loc3._id,
        departureTime: new Date('2026-10-01T06:00:00Z'),
        arrivalTime: new Date('2026-10-01T14:00:00Z'),
        duration: 480,
        totalPrice: 1200,
      });
    });

    it('creates sequential legs and retrieves ordered segments via journey service', async () => {
      const leg1 = await journeyLegService.create({
        journey: testJourney._id,
        sequence: 1,
        origin: loc1._id,
        destination: loc2._id,
        mode: 'rail',
        provider: testProvider._id,
        departureTime: new Date('2026-10-01T06:00:00Z'),
        arrivalTime: new Date('2026-10-01T09:30:00Z'),
        duration: 210,
        price: 600,
      });

      const leg2 = await journeyLegService.create({
        journey: testJourney._id,
        sequence: 2,
        origin: loc2._id,
        destination: loc3._id,
        mode: 'rail',
        provider: testProvider._id,
        departureTime: new Date('2026-10-01T10:15:00Z'),
        arrivalTime: new Date('2026-10-01T14:00:00Z'),
        duration: 225,
        price: 600,
      });

      assert.ok(leg1._id);
      assert.ok(leg2._id);

      const journeyWithLegs = await journeyService.getJourneyWithLegs(testJourney._id);
      assert.equal(journeyWithLegs.legs.length, 2);
      assert.equal(journeyWithLegs.legs[0].sequence, 1);
      assert.equal(journeyWithLegs.legs[1].sequence, 2);
    });

    it('prevents duplicate sequence number for the same journey', async () => {
      await journeyLegService.create({
        journey: testJourney._id,
        sequence: 1,
        origin: loc1._id,
        destination: loc2._id,
        mode: 'rail',
        departureTime: new Date('2026-10-01T06:00:00Z'),
        arrivalTime: new Date('2026-10-01T09:30:00Z'),
        duration: 210,
      });

      await assert.rejects(async () => {
        await journeyLegService.create({
          journey: testJourney._id,
          sequence: 1, // Duplicate sequence!
          origin: loc2._id,
          destination: loc3._id,
          mode: 'rail',
          departureTime: new Date('2026-10-01T10:00:00Z'),
          arrivalTime: new Date('2026-10-01T14:00:00Z'),
          duration: 240,
        });
      }, /E11000|duplicate/i);
    });

    it('cascade-deletes legs when parent journey is deleted', async () => {
      await journeyLegService.create({
        journey: testJourney._id,
        sequence: 1,
        origin: loc1._id,
        destination: loc2._id,
        mode: 'rail',
        departureTime: new Date('2026-10-01T06:00:00Z'),
        arrivalTime: new Date('2026-10-01T09:30:00Z'),
        duration: 210,
      });

      // Delete parent journey
      await journeyService.delete(testJourney._id);

      // Verify legs are cleaned up
      const legsRemaining = await journeyLegService.findByJourney(testJourney._id);
      assert.equal(legsRemaining.length, 0);
    });
  });

  // ============================================================================
  // 6. SEARCH REQUEST & RESULT TESTS
  // ============================================================================
  describe('SearchRequest & SearchResult Models', () => {
    it('creates search request and sanitizes rawData in search result', async () => {
      const user = await userService.create({
        name: 'Searcher',
        email: 'searcher@example.com',
      });
      const locA = await locationService.create({
        name: 'Loc A',
        type: 'city',
        location: { type: 'Point', coordinates: [77.0, 28.0] },
      });
      const locB = await locationService.create({
        name: 'Loc B',
        type: 'city',
        location: { type: 'Point', coordinates: [85.0, 25.0] },
      });
      const journey = await journeyService.create({
        origin: locA._id,
        destination: locB._id,
        departureTime: new Date(),
        arrivalTime: new Date(Date.now() + 7200000),
        duration: 120,
        totalPrice: 800,
      });

      const searchReq = await searchRequestService.create({
        user: user._id,
        origin: locA._id,
        destination: locB._id,
        departureDate: new Date(),
        passengers: 2,
        preferences: { priority: 'cheapest' },
      });

      assert.ok(searchReq._id);
      assert.equal(searchReq.passengers, 2);

      // Create search result with raw data containing sensitive token
      const result = await searchResultService.create({
        searchRequest: searchReq._id,
        journey: journey._id,
        rawData: {
          providerName: 'ExternalApi',
          apiKey: 'super-secret-key-12345',
          authToken: 'bearer-xyz',
          publicInfo: 'Express 123',
        },
      });

      assert.ok(result._id);
      // Verify sanitization
      assert.equal(result.rawData.apiKey, '[REDACTED]');
      assert.equal(result.rawData.authToken, '[REDACTED]');
      assert.equal(result.rawData.publicInfo, 'Express 123');
    });
  });

  // ============================================================================
  // 7. SAVED JOURNEY TESTS
  // ============================================================================
  describe('SavedJourney Model', () => {
    it('saves a journey and enforces unique user+journey constraint', async () => {
      const user = await userService.create({
        name: 'Saver',
        email: 'saver@example.com',
      });
      const locA = await locationService.create({
        name: 'Loc 1',
        type: 'city',
        location: { type: 'Point', coordinates: [77.0, 28.0] },
      });
      const locB = await locationService.create({
        name: 'Loc 2',
        type: 'city',
        location: { type: 'Point', coordinates: [78.0, 27.0] },
      });
      const journey = await journeyService.create({
        origin: locA._id,
        destination: locB._id,
        departureTime: new Date(),
        arrivalTime: new Date(Date.now() + 3600000),
        duration: 60,
        totalPrice: 300,
      });

      const saved = await savedJourneyService.saveJourney(
        user._id,
        journey._id,
        'Home to Work',
        'Daily commute'
      );
      assert.ok(saved._id);

      // Rejects saving duplicate
      await assert.rejects(async () => {
        await savedJourneyService.saveJourney(user._id, journey._id);
      }, /E11000|duplicate/i);
    });
  });

  // ============================================================================
  // 8. NOTIFICATION TESTS
  // ============================================================================
  describe('Notification Model', () => {
    it('creates notification with default unread state and marks as read', async () => {
      const user = await userService.create({
        name: 'Notifier',
        email: 'notifier@example.com',
      });

      const notif = await notificationService.create({
        user: user._id,
        type: 'price_change',
        title: 'Price Drop Alert',
        message: 'Your route price dropped by ₹200.',
      });

      assert.ok(notif._id);
      assert.equal(notif.read, false);
      assert.equal(notif.readAt, null);

      // Mark as read
      const updated = await notificationService.markAsRead(notif._id);
      assert.equal(updated.read, true);
      assert.ok(updated.readAt);
    });
  });
});
