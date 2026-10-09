import dotenv from 'dotenv';
dotenv.config({ path: './server/.env' });

import { railTransportProvider } from './server/src/providers/transport/rail/rail.provider.js';

async function check() {
  const leg1 = await railTransportProvider.search({
    origin: { stationCode: 'NDLS', name: 'New Delhi' },
    destination: { stationCode: 'BSB', name: 'Varanasi' },
    departureDate: '2026-10-01'
  });

  console.log('Sample candidate:', JSON.stringify(leg1.candidates[0], null, 2));
}

check().catch(console.error);
