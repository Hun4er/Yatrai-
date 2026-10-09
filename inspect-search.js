import dotenv from 'dotenv';
dotenv.config({ path: './server/.env' });

import { journeyOrchestrator } from './server/src/orchestration/journeyOrchestrator.js';
import mongoose from 'mongoose';
import config from './server/src/config/index.js';

async function debugSearch() {
  await mongoose.connect(config.mongoUri || process.env.MONGODB_URI);
  console.log('Connected to mongo');

  const result = await journeyOrchestrator.searchJourneys({
    origin: 'Delhi',
    destination: 'Patna',
    departureDate: '2026-10-01'
  });

  console.log('Result totalJourneys:', result.totalJourneys);
  const sample = result.journeys[0];
  console.log('Sample journey keys:', Object.keys(sample));
  console.log('Sample journey type:', sample.type);
  console.log('Sample journey transfers:', sample.transfers);
  console.log('Sample journey pricing:', sample.pricing);
  console.log('Sample journey durationMinutes:', sample.durationMinutes);
  console.log('Sample journey leg[0]:', {
    origin: sample.legs[0]?.origin,
    dest: sample.legs[0]?.destination,
    metadata: sample.legs[0]?.metadata
  });

  await mongoose.disconnect();
}

debugSearch().catch(console.error);
