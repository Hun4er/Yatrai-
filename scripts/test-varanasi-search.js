import dotenv from 'dotenv';
dotenv.config({ path: './server/.env' });
import mongoose from 'mongoose';
import config from '../server/src/config/index.js';
import journeyOrchestrator from '../server/src/orchestration/journeyOrchestrator.js';

async function testVaranasiPrayagraj() {
  await mongoose.connect(config.mongoUri || process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

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

    console.log('Search SUCCESS!');
    console.log('Total journeys found:', result.journeys?.length);
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
