import dotenv from 'dotenv';
dotenv.config({ path: './server/.env' });
import mongoose from 'mongoose';
import config from '../server/src/config/index.js';
import journeyOrchestrator from '../server/src/orchestration/journeyOrchestrator.js';
import railKitAdapter from '../server/src/providers/rail/railKit.adapter.js';

const MAX_LIVE_LIMIT = parseInt(process.env.MAX_LIVE_LIMIT || '5', 10);

async function testVaranasiPrayagraj() {
  await mongoose.connect(config.mongoUri || process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const before = railKitAdapter.getStats();

  try {
    const result = await journeyOrchestrator.orchestrateSearch(
      {
        origin: 'Varanasi Junction',
        destination: 'Prayagraj Junction',
        departureDate: '2026-10-10',
        passengers: 1,
        requestedModes: ['rail'],
      },
      { railwayOnly: true }
    );

    const after = railKitAdapter.getStats();
    const liveCalls = Math.max(0, after.monthlyRequests - before.monthlyRequests);

    console.log('Search SUCCESS!');
    console.log('Total journeys found:', result.journeys?.length);
    console.log(`Live RailKit requests consumed: ${liveCalls} (hard limit: ${MAX_LIVE_LIMIT})`);

    if (liveCalls > MAX_LIVE_LIMIT) {
      console.error(`🚨 Exceeded hard live-request limit: ${liveCalls} > ${MAX_LIVE_LIMIT}`);
      process.exit(1);
    }

    console.log('Journeys:');
    result.journeys?.forEach((j, i) => {
      const leg = j.legs?.[0];
      const name = leg?.service?.name || j.title || 'Train';
      const num = leg?.vehicle?.identifier || '';
      console.log(`  [${i + 1}] ${name} (${num}) | dep ${j.departureTimeFormatted || j.departureTime} -> arr ${j.arrivalTimeFormatted || j.arrivalTime} | duration: ${j.duration}m | price: Rs ${j.totalPrice || j.pricing?.totalFare}`);
    });
  } catch (err) {
    console.error('Search FAILED:', err);
  } finally {
    await mongoose.disconnect();
  }
}

testVaranasiPrayagraj();
