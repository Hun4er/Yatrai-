import logger from '../../utils/logger.js';
import { Location } from '../../models/Location.js';
import { TransportProvider } from '../../models/TransportProvider.js';

/**
 * Development Journey Provider (Phase 4 Candidate Source)
 *
 * Provides deterministic, isolated journey candidates strictly for internal pipeline
 * verification and development testing without making external transport network calls.
 *
 * Rules:
 * - All candidates are explicitly marked { source: 'development', isMock: true }.
 * - Never claims real live availability, real seat availability, or live pricing.
 * - Does not make external network requests.
 * - Supports clean separation so Phase 5 transport adapters can replace or accompany it.
 */
export class DevelopmentJourneyProvider {
  constructor(options = {}) {
    this.name = 'Development Journey Provider';
    this.code = 'DEV_MOCK';
    this.source = 'development';
    this.isMock = true;
    this.options = options;
    this.customCorridors = [];
  }

  /**
   * Registers a temporary mock corridor (useful for automated testing).
   */
  addMockCorridor(corridor) {
    this.customCorridors.push(corridor);
  }

  /**
   * Clears custom mock corridors.
   */
  clearMockCorridors() {
    this.customCorridors = [];
  }

  /**
   * Determines if a location document matches a name or city query pattern.
   *
   * @param {Object} locationDoc
   * @param {string} pattern
   * @returns {boolean}
   */
  matchesLocation(locationDoc, pattern) {
    if (!locationDoc || !pattern) return false;
    const pat = pattern.toLowerCase().trim();
    const name = (locationDoc.name || '').toLowerCase();
    const city = (locationDoc.city || '').toLowerCase();
    const displayName = (locationDoc.displayName || '').toLowerCase();
    const aliases = Array.isArray(locationDoc.aliases)
      ? locationDoc.aliases.map((a) => a.toLowerCase())
      : [];

    return (
      name.includes(pat) ||
      city.includes(pat) ||
      displayName.includes(pat) ||
      aliases.some((a) => a.includes(pat))
    );
  }

  /**
   * Searches for mock journey candidates matching the given travel request.
   *
   * @param {Object} params
   * @param {Object} params.origin - Canonical Location document
   * @param {Object} params.destination - Canonical Location document
   * @param {Date} params.departureDate - Intended travel date
   * @param {number} [params.passengers=1]
   * @param {Array<string>} [params.requestedModes=[]]
   * @returns {Promise<Array<Object>>} Raw journey candidates
   */
  async search({ origin, destination, departureDate, passengers = 1, requestedModes = [] }) {
    logger.debug(
      `[DevelopmentJourneyProvider] Searching candidates: ${origin?.name || origin} -> ${destination?.name || destination} on ${departureDate}`
    );

    if (!origin || !destination) {
      return [];
    }

    const travelDate = departureDate instanceof Date ? departureDate : new Date(departureDate);
    if (isNaN(travelDate.getTime())) {
      return [];
    }

    const year = travelDate.getUTCFullYear();
    const month = travelDate.getUTCMonth();
    const day = travelDate.getUTCDate();

    // Fetch optional provider reference if seeded in DB
    const irctcProvider = await TransportProvider.findOne({ code: 'IRCTC' });

    const candidates = [];

    // Check custom corridors first (for unit/integration tests)
    for (const corridor of this.customCorridors) {
      if (
        this.matchesLocation(origin, corridor.originPattern) &&
        this.matchesLocation(destination, corridor.destinationPattern)
      ) {
        if (typeof corridor.generateCandidates === 'function') {
          const generated = corridor.generateCandidates({
            origin,
            destination,
            travelDate,
            passengers,
            requestedModes,
          });
          candidates.push(...generated);
        }
      }
    }

    // Corridor 1: Sonipat <-> Patna
    const isSonipatToPatna =
      this.matchesLocation(origin, 'sonipat') && this.matchesLocation(destination, 'patna');

    if (isSonipatToPatna) {
      // Candidate 1A: Direct Rail Candidate (Sonipat -> Patna)
      if (requestedModes.length === 0 || requestedModes.includes('rail')) {
        const dep1 = new Date(Date.UTC(year, month, day, 6, 30, 0));
        const arr1 = new Date(Date.UTC(year, month, day, 20, 15, 0));
        const duration1 = 825; // 13h 45m
        const price1 = 1250 * passengers;

        candidates.push({
          origin: origin._id,
          destination: destination._id,
          departureTime: dep1,
          arrivalTime: arr1,
          duration: duration1,
          totalDistance: 1045,
          totalPrice: price1,
          currency: 'INR',
          numberOfTransfers: 0,
          transportModes: ['rail'],
          status: 'scheduled',
          source: 'development',
          isMock: true,
          metadata: {
            source: 'development',
            isMock: true,
            corridor: 'Sonipat-Patna Direct Rail',
            serviceClass: 'Sleeper/3AC',
            note: 'Development mock journey candidate — not live availability',
          },
          legs: [
            {
              sequence: 1,
              origin: origin._id,
              destination: destination._id,
              mode: 'rail',
              provider: irctcProvider?._id || null,
              departureTime: dep1,
              arrivalTime: arr1,
              duration: duration1,
              distance: 1045,
              price: price1,
              currency: 'INR',
              vehicle: {
                type: 'Train',
                identifier: 'EXP-14218',
              },
              service: {
                name: 'Ganga Express (Development Test)',
                operator: 'Northern Railway',
                class: '3A',
              },
              booking: {
                status: 'available',
                reference: 'MOCK-SNP-PAT-01',
              },
              metadata: {
                source: 'development',
                isMock: true,
              },
            },
          ],
        });
      }

      // Candidate 1B: Connecting Journey (Sonipat -> Delhi -> Patna)
      // Look up intermediate Delhi location if present in MongoDB
      const delhiLoc = await Location.findOne({
        $or: [{ name: /New Delhi/i }, { city: /Delhi/i }],
      });

      if (delhiLoc && (requestedModes.length === 0 || requestedModes.includes('rail'))) {
        const leg1Dep = new Date(Date.UTC(year, month, day, 5, 0, 0));
        const leg1Arr = new Date(Date.UTC(year, month, day, 6, 15, 0));
        const leg1Duration = 75; // 1h 15m
        const leg1Price = 120 * passengers;

        const leg2Dep = new Date(Date.UTC(year, month, day, 7, 30, 0)); // 1h 15m transfer window
        const leg2Arr = new Date(Date.UTC(year, month, day, 19, 0, 0));
        const leg2Duration = 690; // 11h 30m
        const leg2Price = 1580 * passengers;

        const totalDuration = Math.round((leg2Arr.getTime() - leg1Dep.getTime()) / 60000);
        const totalPrice = leg1Price + leg2Price;

        candidates.push({
          origin: origin._id,
          destination: destination._id,
          departureTime: leg1Dep,
          arrivalTime: leg2Arr,
          duration: totalDuration,
          totalDistance: 1070,
          totalPrice,
          currency: 'INR',
          numberOfTransfers: 1,
          transportModes: ['rail'],
          status: 'scheduled',
          source: 'development',
          isMock: true,
          metadata: {
            source: 'development',
            isMock: true,
            corridor: 'Sonipat-Delhi-Patna Connecting Rail',
            transferStation: delhiLoc.name,
            note: 'Development mock journey candidate — not live availability',
          },
          legs: [
            {
              sequence: 1,
              origin: origin._id,
              destination: delhiLoc._id,
              mode: 'rail',
              provider: irctcProvider?._id || null,
              departureTime: leg1Dep,
              arrivalTime: leg1Arr,
              duration: leg1Duration,
              distance: 45,
              price: leg1Price,
              currency: 'INR',
              vehicle: {
                type: 'Train',
                identifier: 'EMU-64002',
              },
              service: {
                name: 'Sonipat-Delhi Commuter (Mock)',
                operator: 'Northern Railway',
                class: 'General',
              },
              booking: {
                status: 'available',
                reference: 'MOCK-SNP-DEL-01',
              },
              metadata: { source: 'development', isMock: true },
            },
            {
              sequence: 2,
              origin: delhiLoc._id,
              destination: destination._id,
              mode: 'rail',
              provider: irctcProvider?._id || null,
              departureTime: leg2Dep,
              arrivalTime: leg2Arr,
              duration: leg2Duration,
              distance: 1025,
              price: leg2Price,
              currency: 'INR',
              vehicle: {
                type: 'Train',
                identifier: 'EXP-12394',
              },
              service: {
                name: 'Sampoorna Kranti Express (Mock)',
                operator: 'East Central Railway',
                class: '3A',
              },
              booking: {
                status: 'available',
                reference: 'MOCK-DEL-PAT-02',
              },
              metadata: { source: 'development', isMock: true },
            },
          ],
        });
      }
    }

    // Corridor 2: Delhi <-> Varanasi
    const isDelhiToVaranasi =
      this.matchesLocation(origin, 'delhi') && this.matchesLocation(destination, 'varanasi');

    if (isDelhiToVaranasi && (requestedModes.length === 0 || requestedModes.includes('rail'))) {
      const depTime = new Date(Date.UTC(year, month, day, 6, 0, 0));
      const arrTime = new Date(Date.UTC(year, month, day, 14, 0, 0));
      const duration = 480; // 8 hours
      const price = 1750 * passengers;

      candidates.push({
        origin: origin._id,
        destination: destination._id,
        departureTime: depTime,
        arrivalTime: arrTime,
        duration,
        totalDistance: 780,
        totalPrice: price,
        currency: 'INR',
        numberOfTransfers: 0,
        transportModes: ['rail'],
        status: 'scheduled',
        source: 'development',
        isMock: true,
        metadata: {
          source: 'development',
          isMock: true,
          corridor: 'Delhi-Varanasi Direct Rail',
          note: 'Development mock journey candidate — not live availability',
        },
        legs: [
          {
            sequence: 1,
            origin: origin._id,
            destination: destination._id,
            mode: 'rail',
            provider: irctcProvider?._id || null,
            departureTime: depTime,
            arrivalTime: arrTime,
            duration,
            distance: 780,
            price,
            currency: 'INR',
            vehicle: { type: 'Train', identifier: '22436' },
            service: { name: 'Vande Bharat Express (Mock)', class: 'CC' },
            booking: { status: 'available' },
            metadata: { source: 'development', isMock: true },
          },
        ],
      });
    }

    // Corridor 3: Sonipat <-> Delhi
    const isSonipatToDelhi =
      this.matchesLocation(origin, 'sonipat') && this.matchesLocation(destination, 'delhi');

    if (isSonipatToDelhi && (requestedModes.length === 0 || requestedModes.includes('rail'))) {
      const depTime = new Date(Date.UTC(year, month, day, 7, 0, 0));
      const arrTime = new Date(Date.UTC(year, month, day, 8, 15, 0));
      const duration = 75;
      const price = 90 * passengers;

      candidates.push({
        origin: origin._id,
        destination: destination._id,
        departureTime: depTime,
        arrivalTime: arrTime,
        duration,
        totalDistance: 45,
        totalPrice: price,
        currency: 'INR',
        numberOfTransfers: 0,
        transportModes: ['rail'],
        status: 'scheduled',
        source: 'development',
        isMock: true,
        metadata: {
          source: 'development',
          isMock: true,
          corridor: 'Sonipat-Delhi Commuter Rail',
          note: 'Development mock journey candidate — not live availability',
        },
        legs: [
          {
            sequence: 1,
            origin: origin._id,
            destination: destination._id,
            mode: 'rail',
            provider: irctcProvider?._id || null,
            departureTime: depTime,
            arrivalTime: arrTime,
            duration,
            distance: 45,
            price,
            currency: 'INR',
            vehicle: { type: 'Train', identifier: '64004' },
            service: { name: 'Sonipat EMU (Mock)', class: 'General' },
            booking: { status: 'available' },
            metadata: { source: 'development', isMock: true },
          },
        ],
      });
    }

    logger.debug(
      `[DevelopmentJourneyProvider] Produced ${candidates.length} candidate(s) for query.`
    );
    return candidates;
  }
}

export const developmentJourneyProvider = new DevelopmentJourneyProvider();
export default developmentJourneyProvider;
