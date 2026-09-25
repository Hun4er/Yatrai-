import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup.js';
import { seedDatabase } from '../src/database/seed/seed.js';

import { User } from '../src/models/User.js';
import { Location } from '../src/models/Location.js';
import { TransportProvider } from '../src/models/TransportProvider.js';
import { Journey } from '../src/models/Journey.js';
import { JourneyLeg } from '../src/models/JourneyLeg.js';
import { SearchRequest } from '../src/models/SearchRequest.js';
import { SearchResult } from '../src/models/SearchResult.js';
import { SavedJourney } from '../src/models/SavedJourney.js';
import { Notification } from '../src/models/Notification.js';

describe('Yatrai Phase 1 — Database Seed Suite', () => {
  before(async () => {
    await setupTestDb();
    await clearTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  it('executes development seed script and populates all 9 collections', async () => {
    const report = await seedDatabase({ shouldReset: false, disconnectOnFinish: false });

    assert.ok(report.users > 0, 'Users seeded');
    assert.ok(report.locations > 0, 'Locations seeded');
    assert.ok(report.providers > 0, 'Providers seeded');
    assert.ok(report.journeys > 0, 'Journeys seeded');
    assert.ok(report.legs > 0, 'Journey legs seeded');
    assert.ok(report.searchRequests > 0, 'Search requests seeded');
    assert.ok(report.searchResults > 0, 'Search results seeded');
    assert.ok(report.savedJourneys > 0, 'Saved journeys seeded');
    assert.ok(report.notifications > 0, 'Notifications seeded');

    // Verify document counts in database
    const [
      userCount,
      locCount,
      provCount,
      journeyCount,
      legCount,
      reqCount,
      resCount,
      savedCount,
      notifCount,
    ] = await Promise.all([
      User.countDocuments(),
      Location.countDocuments(),
      TransportProvider.countDocuments(),
      Journey.countDocuments(),
      JourneyLeg.countDocuments(),
      SearchRequest.countDocuments(),
      SearchResult.countDocuments(),
      SavedJourney.countDocuments(),
      Notification.countDocuments(),
    ]);

    assert.equal(userCount, report.users);
    assert.equal(locCount, report.locations);
    assert.equal(provCount, report.providers);
    assert.equal(journeyCount, report.journeys);
    assert.equal(legCount, report.legs);
    assert.equal(reqCount, report.searchRequests);
    assert.equal(resCount, report.searchResults);
    assert.equal(savedCount, report.savedJourneys);
    assert.equal(notifCount, report.notifications);

    // Verify multi-leg sequence integrity
    const multiLegJourneys = await Journey.find({ numberOfTransfers: { $gt: 0 } });
    assert.ok(multiLegJourneys.length > 0, 'At least one multi-modal journey exists');

    for (const journey of multiLegJourneys) {
      const legs = await JourneyLeg.find({ journey: journey._id }).sort({ sequence: 1 });
      assert.ok(legs.length > 1, 'Multi-leg journey has multiple legs');
      legs.forEach((leg, index) => {
        assert.equal(
          leg.sequence,
          index + 1,
          'Leg sequence is strictly sequential starting from 1'
        );
      });
    }
  });

  it('runs seed idempotently without creating duplicate users or providers', async () => {
    // Run seed a second time without reset
    const secondReport = await seedDatabase({ shouldReset: false, disconnectOnFinish: false });

    // Should insert 0 new duplicate users or providers
    assert.equal(secondReport.users, 0);
    assert.equal(secondReport.locations, 0);
    assert.equal(secondReport.providers, 0);
  });
});
