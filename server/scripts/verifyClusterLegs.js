import { DirectJourneyService } from '../src/services/rail/directJourney.service.js';
import { ClusterLegExpander } from '../src/services/rail/clusterLegExpander.service.js';

async function main() {
  const mockRailKit = {
    searchTrainBetweenStations: async (from, to) => {
      if (from === 'SDAH' && to === 'BSB') {
        return {
          success: true,
          data: [
            {
              train_no: '12313',
              train_name: 'SEALDAH RAJDHANI',
              from_stn_code: 'SDAH',
              to_stn_code: 'DDU',
              from_time: '16:50',
              to_time: '01:13',
              travel_time: '08:23',
              running_days: '1111111',
              distance: '675',
            },
          ],
        };
      }
      return { success: true, data: [] };
    },
  };

  const mockAvailability = {
    checkLegAvailability: async ({ trainNumber }) => ({
      normalizedStatus: 'AVAILABLE',
      seatsAvailable: 42,
      rawStatus: 'AVAILABLE 42',
      trainNumber,
    }),
  };

  const mockFare = {
    getLegFare: async () => ({
      totalFare: 2100,
      baseFare: 2100,
      currency: 'INR',
      isEstimated: false,
    }),
    calculateTelescopicTariff: () => 50,
  };

  const expander = new ClusterLegExpander({
    railKit: mockRailKit,
    fareService: mockFare,
  });

  const service = new DirectJourneyService({
    railKit: mockRailKit,
    availabilityService: mockAvailability,
    fareService: mockFare,
    clusterLegExpander: expander,
  });

  const result = await service.searchDirectTrains(
    {
      origin: 'HWH',
      destination: 'BSB',
      departureDate: '2026-10-19',
      preferences: { class: '3A', quota: 'GN' },
    },
    { exploreAlternatives: true }
  );

  const journey = (result.directJourneys || []).find(
    (j) =>
      j.metadata?.trainNumber === '12313' ||
      j.metadata?.mainTrainNumber === '12313' ||
      j.legs?.some((l) => l.service?.number === '12313' || l.vehicle?.identifier === '12313')
  );

  if (!journey) {
    console.error('No matching Rajdhani journey found in result');
    process.exit(1);
  }

  const legs = journey.legs || [];
  const expanded = Boolean(journey.hasExpandedLegs || journey.metadata?.hasExpandedLegs);
  const legChain = legs
    .map((l) => `${l.originStation?.code || l.origin}>${l.destinationStation?.code || l.destination}`)
    .join(' | ');

  console.log(`legs ${legs.length} | expanded ${expanded} | ${legChain}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
