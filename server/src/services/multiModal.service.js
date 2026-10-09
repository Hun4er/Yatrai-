import roadTransportProvider from '../providers/transport/road/road.provider.js';
import railTransportProvider from '../providers/transport/rail/rail.provider.js';
import locationService from './locationService.js';
import logger from '../utils/logger.js';

export const SATELLITE_HUBS = {
  // Delhi NCR satellites -> New Delhi
  sonipat: 'New Delhi',
  panipat: 'New Delhi',
  gurgaon: 'New Delhi',
  gurugram: 'New Delhi',
  noida: 'New Delhi',
  faridabad: 'New Delhi',
  ghaziabad: 'New Delhi',
  meerut: 'New Delhi',
  rohtak: 'New Delhi',

  // Mumbai satellites -> Mumbai
  thane: 'Mumbai',
  'navi mumbai': 'Mumbai',
  kalyan: 'Mumbai',
  panvel: 'Mumbai',

  // Kolkata satellites -> Kolkata
  howrah: 'Kolkata',
  hooghly: 'Kolkata',
  kalyani: 'Kolkata',

  // Chennai satellites -> Chennai
  tambaram: 'Chennai',
  avadi: 'Chennai',
  chengalpattu: 'Chennai',
  sriperumbudur: 'Chennai',

  // Bengaluru satellites -> Bengaluru
  yelahanka: 'Bengaluru',
  whitefield: 'Bengaluru',
  'electronic city': 'Bengaluru',
  hosur: 'Bengaluru',
};

export class MultiModalService {
  /**
   * Generates multi-modal journey candidates when direct options are limited or when origin is a satellite town.
   *
   * @param {Object} searchContext
   * @param {Array<Object>} existingCandidates
   * @returns {Promise<Array<Object>>}
   */
  async generateMultiModalJourneys(searchContext, existingCandidates = []) {
    try {
      const origin = searchContext.originLocation || searchContext.origin;
      const destination = searchContext.destLocation || searchContext.destination;

      if (!origin || !destination) return [];

      const originName = (origin.name || origin.city || '').toLowerCase().trim();
      const destName = (destination.name || destination.city || '').toLowerCase().trim();

      // Check if origin maps to a known major transit hub
      let hubName = null;
      for (const [satellite, targetHub] of Object.entries(SATELLITE_HUBS)) {
        if (originName === satellite || originName.includes(satellite)) {
          hubName = targetHub;
          break;
        }
      }

      if (!hubName || hubName.toLowerCase() === destName) {
        return [];
      }

      // Resolve hub location
      const hubLocation =
        (await locationService.resolveSingle(hubName)) ||
        (await locationService.search(hubName, { limit: 1 }))?.[0];
      if (!hubLocation || hubLocation._id?.equals?.(origin._id) || hubLocation.id === origin.id) {
        return [];
      }

      logger.info(
        `[MultiModalService] Generating multi-modal route for ${origin.name} via ${hubLocation.name} to ${destination.name}`
      );

      // 1. Query road route from origin to hub
      const roadResult = await roadTransportProvider.search({
        origin,
        destination: hubLocation,
        departureDate: searchContext.departureDate,
      });

      const roadCandidate = roadResult.candidates?.[0];
      const roadDuration = Math.max(30, roadCandidate?.duration || 60);
      const roadDistance = Math.max(15, roadCandidate?.totalDistance || 45);
      const roadPrice = roadCandidate?.totalPrice || Math.round(roadDistance * 12);

      // 2. Query rail route from hub to destination
      const railResult = await railTransportProvider.search({
        origin: hubLocation,
        destination,
        departureDate: searchContext.departureDate,
        passengers: searchContext.passengers || 1,
      });

      if (!railResult.candidates || railResult.candidates.length === 0) {
        return [];
      }

      const multiModalJourneys = [];
      const topTrains = railResult.candidates.slice(0, 4);

      for (const train of topTrains) {
        const trainDepTime = new Date(train.departureTime);
        const trainArrTime = new Date(train.arrivalTime);

        // Enforce strict chronological transfer buffer: 60 minutes >= 45m required buffer
        const transferMinutes = 60;
        const roadArrival = new Date(trainDepTime.getTime() - transferMinutes * 60 * 1000);
        const roadDeparture = new Date(roadArrival.getTime() - roadDuration * 60 * 1000);

        const leg1 = {
          sequence: 1,
          origin: origin._id || origin.id,
          destination: hubLocation._id || hubLocation.id,
          mode: 'road',
          provider: null,
          departureTime: roadDeparture,
          arrivalTime: roadArrival,
          duration: roadDuration,
          distance: roadDistance,
          price: roadPrice,
          currency: 'INR',
          vehicle: {
            type: 'Car / Cab',
            identifier: 'Road Transit',
          },
          service: {
            name: `Road Transfer to ${hubLocation.name}`,
            operator: 'Road Feeder Service',
            class: 'Standard',
          },
          booking: {
            reference: 'ROAD-FEEDER',
            status: 'not_bookable',
          },
          metadata: {
            isEstimatedPrice: true,
            pricingType: 'estimated',
            fromStation: origin.name,
            toStation: hubLocation.name,
          },
        };

        const leg2 = {
          sequence: 2,
          origin: hubLocation._id || hubLocation.id,
          destination: destination._id || destination.id,
          mode: 'rail',
          provider: null,
          departureTime: trainDepTime,
          arrivalTime: trainArrTime,
          duration: train.duration,
          distance: train.totalDistance,
          price: train.totalPrice,
          currency: train.currency || 'INR',
          vehicle: train.legs?.[0]?.vehicle || {
            type: 'Train',
            identifier: train.metadata?.trainNumber,
          },
          service: train.legs?.[0]?.service || {
            name: train.metadata?.trainName || 'Express Train',
            operator: 'Indian Railways',
          },
          booking: train.legs?.[0]?.booking || {
            status: 'available',
          },
          metadata: {
            ...train.metadata,
            fromStation: hubLocation.name,
            toStation: destination.name,
          },
        };

        const totalDurationMinutes = Math.round(
          (trainArrTime.getTime() - roadDeparture.getTime()) / 60000
        );

        multiModalJourneys.push({
          origin: origin._id || origin.id,
          destination: destination._id || destination.id,
          departureTime: roadDeparture,
          arrivalTime: trainArrTime,
          duration: totalDurationMinutes,
          totalDistance: roadDistance + (train.totalDistance || 0),
          totalPrice: roadPrice + (train.totalPrice || 0),
          currency: 'INR',
          numberOfTransfers: 1,
          transportModes: ['road', 'rail'],
          status: 'scheduled',
          source: 'multimodal',
          metadata: {
            source: 'multimodal',
            provider: 'Multi-Modal (Road + Rail)',
            isMultiModal: true,
            transferHub: hubLocation.name,
            transferMinutes,
            trainNumber: train.metadata?.trainNumber,
            trainName: train.metadata?.trainName,
          },
          legs: [leg1, leg2],
        });
      }

      return multiModalJourneys;
    } catch (err) {
      logger.warn(`[MultiModalService] Failed to generate multi-modal journeys: ${err.message}`);
      return [];
    }
  }
}

export const multiModalService = new MultiModalService();
export default multiModalService;
