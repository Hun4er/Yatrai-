import dotenv from 'dotenv';
dotenv.config({ path: './server/.env' });

import mongoose from 'mongoose';
import config from './server/src/config/index.js';
import locationService from './server/src/services/locationService.js';

async function check() {
  await mongoose.connect(config.mongoUri || process.env.MONGODB_URI);
  const origin = await locationService.resolveSingle('Delhi');
  const destination = await locationService.resolveSingle('Patna');
  console.log('Origin doc:', JSON.stringify(origin, null, 2));
  console.log('Destination doc:', JSON.stringify(destination, null, 2));
  await mongoose.disconnect();
}
check();
