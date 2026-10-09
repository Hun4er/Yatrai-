import dotenv from 'dotenv';
dotenv.config({ path: './server/.env' });

import { railTransportProvider } from './server/src/providers/transport/rail/rail.provider.js';

async function checkAfternoonTrains() {
  const leg2 = await railTransportProvider.search({
    origin: { stationCode: 'BSB', name: 'Varanasi' },
    destination: { stationCode: 'PNBE', name: 'Patna' },
    departureDate: '2026-10-01'
  });

  console.log(`Total BSB -> PNBE trains: ${leg2.candidates.length}`);
  const after14 = leg2.candidates.filter(c => {
    const dep = new Date(c.departureTime);
    return dep.getUTCHours() >= 14;
  });
  console.log(`Trains departing at or after 14:00 UTC: ${after14.length}`);
  after14.forEach(c => {
    console.log(`  Train ${c.metadata?.trainNumber} (${c.metadata?.trainName}): dep ${c.departureTime} -> arr ${c.arrivalTime}`);
  });
}

checkAfternoonTrains().catch(console.error);
