import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { User } from '../../models/User.js';
import { Location } from '../../models/Location.js';
import { TransportProvider } from '../../models/TransportProvider.js';
import { Journey } from '../../models/Journey.js';
import { JourneyLeg } from '../../models/JourneyLeg.js';
import { SearchRequest } from '../../models/SearchRequest.js';
import { SearchResult } from '../../models/SearchResult.js';
import { SavedJourney } from '../../models/SavedJourney.js';
import { Notification } from '../../models/Notification.js';

import { seedUsers } from './data/users.js';
import { seedLocations } from './data/locations.js';
import { seedProviders } from './data/providers.js';

/**
 * Seed Database with Development Data
 *
 * @param {Object} options
 * @param {boolean} [options.shouldReset=false] - If true, clears existing collections before seeding
 * @param {boolean} [options.disconnectOnFinish=true] - If true, disconnects after seeding
 * @param {string} [options.uri=null] - Optional MongoDB URI
 */
export async function seedDatabase(options = {}) {
  const { shouldReset = false, disconnectOnFinish = true, uri = null } = options;

  if (config.isProduction) {
    throw new Error('FATAL: Database seeding is strictly forbidden in production mode.');
  }

  logger.info(`Starting Yatrai database seeding (reset=${shouldReset})...`);
  await connectDatabase(uri);

  const report = {
    users: 0,
    locations: 0,
    providers: 0,
    journeys: 0,
    legs: 0,
    searchRequests: 0,
    searchResults: 0,
    savedJourneys: 0,
    notifications: 0,
  };

  try {
    if (shouldReset) {
      logger.warn('Reset flag detected: clearing existing development records...');
      await Promise.all([
        Notification.deleteMany({}),
        SavedJourney.deleteMany({}),
        SearchResult.deleteMany({}),
        SearchRequest.deleteMany({}),
        JourneyLeg.deleteMany({}),
        Journey.deleteMany({}),
        TransportProvider.deleteMany({}),
        Location.deleteMany({}),
        User.deleteMany({}),
      ]);
      logger.info('Existing development records cleared.');
    }

    // 1. Seed Users (Upsert by email)
    const userDocs = [];
    for (const u of seedUsers) {
      let user = await User.findOne({ email: u.email });
      if (!user) {
        user = await User.create(u);
        report.users++;
      }
      userDocs.push(user);
    }

    // 2. Seed Locations (Upsert by placeId / name)
    const locationMap = new Map();
    for (const loc of seedLocations) {
      let doc = await Location.findOne({ placeId: loc.placeId });
      if (!doc) {
        doc = await Location.create(loc);
        report.locations++;
      }
      locationMap.set(loc.name, doc);
      if (loc.placeId) locationMap.set(loc.placeId, doc);
    }

    // 3. Seed Transport Providers (Upsert by code)
    const providerMap = new Map();
    for (const prov of seedProviders) {
      let doc = await TransportProvider.findOne({ code: prov.code });
      if (!doc) {
        doc = await TransportProvider.create(prov);
        report.providers++;
      }
      providerMap.set(prov.code, doc);
    }

    // Key location references for journey construction
    const ndls = locationMap.get('New Delhi Railway Station') || locationMap.get('New Delhi');
    const bsb = locationMap.get('Varanasi Junction Railway Station') || locationMap.get('Varanasi');
    const snp = locationMap.get('Sonipat Junction Railway Station') || locationMap.get('Sonipat');
    const delAirport = locationMap.get('Indira Gandhi International Airport');
    const patAirport = locationMap.get('Jay Prakash Narayan International Airport') || locationMap.get('Patna');
    const irctc = providerMap.get('IRCTC');
    const indigo = providerMap.get('INDIGO');

    // 4. Seed Representative Journeys & Legs
    // Journey 1: Delhi -> Varanasi (Direct train leg)
    const journey1Dep = new Date('2026-09-25T06:00:00.000Z');
    const journey1Arr = new Date('2026-09-25T14:00:00.000Z');

    let journey1 = await Journey.findOne({
      origin: ndls._id,
      destination: bsb._id,
      departureTime: journey1Dep,
    });

    if (!journey1) {
      journey1 = await Journey.create({
        origin: ndls._id,
        destination: bsb._id,
        departureTime: journey1Dep,
        arrivalTime: journey1Arr,
        duration: 480, // 8h
        totalDistance: 780,
        totalPrice: 1750,
        currency: 'INR',
        numberOfTransfers: 0,
        transportModes: ['rail'],
        status: 'scheduled',
        metadata: {
          recommendedCategory: 'fastest',
          trainName: 'Vande Bharat Express',
        },
      });
      report.journeys++;

      await JourneyLeg.create({
        journey: journey1._id,
        sequence: 1,
        origin: ndls._id,
        destination: bsb._id,
        mode: 'rail',
        provider: irctc?._id,
        departureTime: journey1Dep,
        arrivalTime: journey1Arr,
        duration: 480,
        distance: 780,
        price: 1750,
        currency: 'INR',
        vehicle: { type: 'Train', identifier: '22436' },
        service: { name: 'Vande Bharat Express', class: 'CC' },
        booking: { status: 'available' },
      });
      report.legs++;
    }

    // Journey 2: Multi-Modal (Sonipat -> Train -> Delhi Airport -> Flight -> Patna)
    const journey2Dep = new Date('2026-09-26T04:30:00.000Z');
    const journey2Arr = new Date('2026-09-26T11:45:00.000Z');

    let journey2 = await Journey.findOne({
      origin: snp._id,
      destination: patAirport._id,
      departureTime: journey2Dep,
    });

    if (!journey2) {
      journey2 = await Journey.create({
        origin: snp._id,
        destination: patAirport._id,
        departureTime: journey2Dep,
        arrivalTime: journey2Arr,
        duration: 435, // 7h 15m
        totalDistance: 1045,
        totalPrice: 4850,
        currency: 'INR',
        numberOfTransfers: 1,
        transportModes: ['rail', 'flight'],
        status: 'scheduled',
        metadata: {
          recommendedCategory: 'best_overall',
          type: 'multimodal',
        },
      });
      report.journeys++;

      // Leg 1: Sonipat -> Delhi
      const leg1Dep = new Date('2026-09-26T04:30:00.000Z');
      const leg1Arr = new Date('2026-09-26T05:45:00.000Z');
      await JourneyLeg.create({
        journey: journey2._id,
        sequence: 1,
        origin: snp._id,
        destination: ndls._id,
        mode: 'rail',
        provider: irctc?._id,
        departureTime: leg1Dep,
        arrivalTime: leg1Arr,
        duration: 75,
        distance: 45,
        price: 150,
        currency: 'INR',
        vehicle: { type: 'Train', identifier: '14218' },
        service: { name: 'Unchahar Express', class: 'SL' },
        booking: { status: 'available' },
      });
      report.legs++;

      // Leg 2: Delhi Airport -> Patna Airport
      const leg2Dep = new Date('2026-09-26T09:30:00.000Z');
      const leg2Arr = new Date('2026-09-26T11:45:00.000Z');
      await JourneyLeg.create({
        journey: journey2._id,
        sequence: 2,
        origin: delAirport._id,
        destination: patAirport._id,
        mode: 'flight',
        provider: indigo?._id,
        departureTime: leg2Dep,
        arrivalTime: leg2Arr,
        duration: 135,
        distance: 1000,
        price: 4700,
        currency: 'INR',
        vehicle: { type: 'Aircraft', identifier: '6E-2134' },
        service: { name: 'IndiGo Domestic', class: 'Economy' },
        booking: { status: 'available' },
      });
      report.legs++;
    }

    // 5. Seed Search Request & Result
    const primaryUser = userDocs[0];
    let searchReq = await SearchRequest.findOne({ origin: ndls._id, destination: bsb._id });
    if (!searchReq) {
      searchReq = await SearchRequest.create({
        user: primaryUser._id,
        origin: ndls._id,
        destination: bsb._id,
        departureDate: journey1Dep,
        passengers: 1,
        preferences: { priority: 'fastest', maxBudget: 2500, maxTransfers: 1 },
        requestedModes: ['rail', 'bus'],
        status: 'completed',
      });
      report.searchRequests++;

      await SearchResult.create({
        searchRequest: searchReq._id,
        journey: journey1._id,
        provider: irctc?._id,
        source: 'direct',
        externalId: 'res_sample_001',
        status: 'active',
        rawData: { source: 'irctc_mock', queryDate: '2026-09-24' },
        normalizedData: { travelClass: 'CC', seatAvailable: true },
      });
      report.searchResults++;
    }

    // 6. Seed Saved Journey
    const savedExists = await SavedJourney.findOne({ user: primaryUser._id, journey: journey1._id });
    if (!savedExists) {
      await SavedJourney.create({
        user: primaryUser._id,
        journey: journey1._id,
        name: 'Varanasi Diwali Visit',
        notes: 'Preferred morning train with CC seat',
      });
      report.savedJourneys++;
    }

    // 7. Seed Notification
    const notifExists = await Notification.findOne({ user: primaryUser._id, type: 'journey_update' });
    if (!notifExists) {
      await Notification.create({
        user: primaryUser._id,
        type: 'journey_update',
        title: 'Route Confirmation Available',
        message: 'Your route Delhi → Varanasi is available for booking.',
        data: { journeyId: journey1._id.toString() },
        read: false,
      });
      report.notifications++;
    }

    logger.info('Database seeding completed successfully.');
    logger.info('Inserted counts:', report);
    return report;
  } finally {
    if (disconnectOnFinish) {
      await disconnectDatabase();
    }
  }
}

// Auto-run if executed directly via CLI
const isDirectCli = process.argv[1] && process.argv[1].endsWith('seed.js');
if (isDirectCli) {
  const isReset = process.argv.includes('--reset');
  seedDatabase({ shouldReset: isReset, disconnectOnFinish: true })
    .then((report) => {
      console.log('\n[SEED SUCCESS] Yatrai database seeded with records:');
      console.table(report);
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n[SEED ERROR]', err.message);
      process.exit(1);
    });
}

export default seedDatabase;
