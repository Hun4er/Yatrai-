import dotenv from 'dotenv';
dotenv.config({ path: './server/.env' });

import { railTransportProvider } from './server/src/providers/transport/rail/rail.provider.js';

async function checkSchedules() {
  const leg1 = await railTransportProvider.search({
    origin: { stationCode: 'NDLS', name: 'New Delhi' },
    destination: { stationCode: 'BSB', name: 'Varanasi' },
    departureDate: '2026-10-01'
  });

  const leg2 = await railTransportProvider.search({
    origin: { stationCode: 'BSB', name: 'Varanasi' },
    destination: { stationCode: 'PNBE', name: 'Patna' },
    departureDate: '2026-10-01'
  });

  console.log(`NDLS -> BSB trains: ${leg1.candidates.length}`);
  leg1.candidates.slice(0, 5).forEach(c => {
    console.log(`  Train ${c.train_number} (${c.train_name}): dep ${c.departure_time} -> arr ${c.arrival_time}`);
  });

  console.log(`\nBSB -> PNBE trains: ${leg2.candidates.length}`);
  leg2.candidates.slice(0, 5).forEach(c => {
    console.log(`  Train ${c.train_number} (${c.train_name}): dep ${c.departure_time} -> arr ${c.arrival_time}`);
  });
}

checkSchedules().catch(console.error);
