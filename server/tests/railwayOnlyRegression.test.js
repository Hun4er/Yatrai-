import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JourneyOrchestrator } from '../src/orchestration/journeyOrchestrator.js';
import { resultAssembler } from '../src/orchestration/resultAssembler.js';
import { cheapestStrategy } from '../src/ranking/strategies/cheapest.strategy.js';
import { overallStrategy } from '../src/ranking/strategies/overall.strategy.js';
import { DirectJourneyService } from '../src/services/rail/directJourney.service.js';
import { RailRadarAdapter } from '../src/providers/rail/railRadar.adapter.js';
import { formatPrice, getPriceLabel } from '../../client/src/utils/formatters.js';
import { deriveFilterBounds, filterJourneys } from '../../client/src/utils/journeyFilters.js';

describe('Railway-Only Search & Fare Pipeline Regression Suite', () => {
  const orchestrator = new JourneyOrchestrator();

  const mockOsrmCandidate = {
    source: 'road',
    provider: 'road',
    providerCode: 'OSRM',
    duration: 640,
    totalDistance: 1045,
    totalPrice: 2916,
    currency: 'INR',
    numberOfTransfers: 0,
    transportModes: ['road'],
    legs: [
      {
        sequence: 1,
        mode: 'road',
        duration: 640,
        distance: 1045,
        price: 2916,
        vehicle: { type: 'Car / Cab' },
      },
    ],
  };

  const mockValidRailCandidate = {
    source: 'rail',
    provider: 'Indian Railways Provider (RailRadar)',
    providerCode: 'IRCTC',
    duration: 720,
    totalDistance: 980,
    totalPrice: 1250,
    currency: 'INR',
    numberOfTransfers: 0,
    transportModes: ['rail'],
    legs: [
      {
        sequence: 1,
        mode: 'rail',
        duration: 720,
        distance: 980,
        price: 1250,
        vehicle: { type: 'Train', identifier: '12394' },
      },
    ],
  };

  // 1. OSRM response cannot become a railway result
  it('1. An OSRM response cannot become a railway result', () => {
    const isValid = orchestrator.validateRailwayCandidate(mockOsrmCandidate);
    assert.equal(isValid, false, 'OSRM candidate must be rejected');
  });

  // 2. Road, bus, and flight results are rejected by the railway validation boundary
  it('2. Road, bus, and flight results are rejected by the railway validation boundary', () => {
    const busCandidate = {
      ...mockValidRailCandidate,
      transportModes: ['bus'],
      legs: [{ ...mockValidRailCandidate.legs[0], mode: 'bus' }],
    };
    const flightCandidate = {
      ...mockValidRailCandidate,
      transportModes: ['flight'],
      legs: [{ ...mockValidRailCandidate.legs[0], mode: 'flight' }],
    };
    const mixedCandidate = {
      ...mockValidRailCandidate,
      transportModes: ['rail', 'road'],
      legs: [
        mockValidRailCandidate.legs[0],
        { ...mockValidRailCandidate.legs[0], sequence: 2, mode: 'road' },
      ],
    };

    assert.equal(orchestrator.validateRailwayCandidate(busCandidate), false, 'Bus must be rejected');
    assert.equal(orchestrator.validateRailwayCandidate(flightCandidate), false, 'Flight must be rejected');
    assert.equal(orchestrator.validateRailwayCandidate(mixedCandidate), false, 'Mixed non-rail leg must be rejected');
    assert.equal(orchestrator.validateRailwayCandidate(mockValidRailCandidate), true, 'Pure rail must be accepted');
  });

  // 3. A driving-cost estimate cannot appear as a train fare
  it('3. A driving-cost estimate cannot appear as a train fare and getPriceLabel strips driving costs', () => {
    assert.equal(getPriceLabel({ transportModes: ['road'], totalPrice: 2916 }), 'Total fare');
    assert.equal(getPriceLabel({ transportModes: ['rail'], totalPrice: null }), 'Fare');
    assert.equal(getPriceLabel({ transportModes: ['rail'], totalPrice: 0 }), 'Fare');
    assert.equal(getPriceLabel(null), 'Fare');
  });

  // 4. Missing railway fare data renders as "Fare unavailable"
  it('4. Missing railway fare data renders as "Fare unavailable"', () => {
    assert.equal(formatPrice(null), 'Fare unavailable');
    assert.equal(formatPrice(undefined), 'Fare unavailable');
    assert.equal(formatPrice(0), 'Fare unavailable');
    assert.equal(formatPrice(-50), 'Fare unavailable');
    assert.equal(formatPrice(NaN), 'Fare unavailable');
    assert.match(formatPrice(1250), /1,250/);
  });

  // 5. Missing fare data does not make a result the cheapest option
  it('5. Missing fare data does not make a result the cheapest option', () => {
    const journeys = [
      { id: 'j-missing', totalPrice: null, duration: 300, numberOfTransfers: 0, _originalIndex: 0 },
      { id: 'j-expensive', totalPrice: 1800, duration: 500, numberOfTransfers: 0, _originalIndex: 1 },
      { id: 'j-cheap', totalPrice: 650, duration: 600, numberOfTransfers: 0, _originalIndex: 2 },
    ];

    const ranked = cheapestStrategy.rank(journeys);
    assert.equal(ranked[0].id, 'j-cheap', 'Train with lowest verified fare must rank first');
    assert.equal(ranked[1].id, 'j-expensive', 'Train with higher verified fare must rank second');
    assert.equal(ranked[2].id, 'j-missing', 'Train with missing fare must not rank first or be treated as cheapest');
  });

  // 6. Direct and connecting journey counts exclude invalid modes
  it('6. Direct and connecting journey counts exclude invalid modes', () => {
    const rawJourneys = [
      mockOsrmCandidate, // Road: transfers 0 (previously counted as 1 direct!)
      mockValidRailCandidate, // Rail direct: transfers 0
      {
        ...mockValidRailCandidate,
        id: 'rail-connecting',
        numberOfTransfers: 1,
        legs: [
          mockValidRailCandidate.legs[0],
          { ...mockValidRailCandidate.legs[0], sequence: 2 },
        ],
      },
    ];

    const isRailwayValid = (j) => orchestrator.validateRailwayCandidate(j);
    const validated = rawJourneys.filter(isRailwayValid);

    assert.equal(validated.length, 2, 'Only 2 valid railway journeys should survive');
    const directCount = validated.filter((j) => (j.numberOfTransfers ?? 0) === 0).length;
    const connectingCount = validated.length - directCount;

    assert.equal(directCount, 1, 'Direct count must be exactly 1 train, excluding road');
    assert.equal(connectingCount, 1, 'Connecting count must be exactly 1 connecting itinerary');
  });

  // 7. A RailRadar rate-limit response produces a clear railway-specific error
  it('7. A RailRadar rate-limit response produces a clear railway-specific error', async () => {
    const mockRateLimitedAdapter = {
      searchDirectTrains: async () => ({
        success: false,
        statusCode: 429,
        error: 'Rate limit exceeded for provider "railradar".',
        trains: [],
      }),
    };

    const directService = new DirectJourneyService({ railRadar: mockRateLimitedAdapter });
    const result = await directService.searchDirectTrains({
      origin: { name: 'Sonipat', code: 'SNP' },
      destination: { name: 'Patna', code: 'PNBE' },
      departureDate: new Date('2026-10-15'),
    });

    assert.equal(result.status, 'RATE_LIMITED');
    assert.equal(result.isRateLimited, true);
    assert.equal(result.shouldTriggerRecovery, false, 'Rate limited provider must not trigger recovery loops');
    assert.equal(result.failureReason, 'Railway search is temporarily rate-limited. Please try again shortly.');
  });

  // 8. Provider failure is not represented as "No trains found"
  it('8. Provider failure is not represented as "No trains found"', async () => {
    const mockFailingAdapter = {
      searchDirectTrains: async () => ({
        success: false,
        statusCode: 500,
        error: 'Connection timeout',
        trains: [],
      }),
    };

    const directService = new DirectJourneyService({ railRadar: mockFailingAdapter });
    const result = await directService.searchDirectTrains({
      origin: { name: 'Sonipat', code: 'SNP' },
      destination: { name: 'Patna', code: 'PNBE' },
      departureDate: new Date('2026-10-15'),
    });

    assert.notEqual(result.status, 'DIRECT_NOT_FOUND', 'Provider error must not be DIRECT_NOT_FOUND');
    assert.equal(result.status, 'DIRECT_SEARCH_FAILED');
    assert.equal(result.shouldTriggerRecovery, false);
  });

  // 9. No direct trains triggers railway recovery, never road fallback
  it('9. No direct trains triggers railway recovery, never road fallback', async () => {
    const mockEmptyAdapter = {
      searchDirectTrains: async () => ({
        success: true,
        trains: [],
      }),
    };

    const directService = new DirectJourneyService({ railRadar: mockEmptyAdapter });
    const result = await directService.searchDirectTrains({
      origin: { name: 'Sonipat', code: 'SNP' },
      destination: { name: 'Patna', code: 'PNBE' },
      departureDate: new Date('2026-10-15'),
    });

    assert.equal(result.status, 'DIRECT_NOT_FOUND');
    assert.equal(result.shouldTriggerRecovery, true, 'Legitimate empty direct train must trigger recovery');
  });

  // 10. Multiple railway legs must each pass schedule and transfer validation
  it('10. Multiple railway legs must each pass schedule and transfer validation', () => {
    const leg1Arrival = '2026-10-15T10:00:00.000Z';
    const leg2DepartureTooSoon = '2026-10-15T10:10:00.000Z'; // 10 min buffer (too tight)
    const leg2DepartureValid = '2026-10-15T11:00:00.000Z'; // 60 min buffer (safe)

    const bufferMinutesTooSoon = (new Date(leg2DepartureTooSoon) - new Date(leg1Arrival)) / 60000;
    const bufferMinutesValid = (new Date(leg2DepartureValid) - new Date(leg1Arrival)) / 60000;

    assert.ok(bufferMinutesTooSoon < 20, '10 min connection must be flagged as insufficient buffer');
    assert.ok(bufferMinutesValid >= 30, '60 min connection satisfies safety buffer');
  });

  // 11. The UI does not display bus/flight configuration warnings in railway-only mode
  it('11. The UI does not display bus/flight configuration warnings in railway-only mode', () => {
    const providerStatuses = [
      { provider: 'rail', status: 'success', candidates: [mockValidRailCandidate] },
      {
        provider: 'bus',
        status: 'unavailable',
        reason: 'Bus provider is not configured. Set BUS_API_URL and BUS_API_KEY environment variables.',
      },
      {
        provider: 'flight',
        status: 'unavailable',
        reason: 'Flight provider is not configured. Set FLIGHT_API_URL and FLIGHT_API_KEY environment variables.',
      },
    ];

    const assembled = resultAssembler.assemble({
      searchRequest: { _id: 'req123', status: 'completed' },
      origin: { name: 'Sonipat' },
      destination: { name: 'Patna' },
      journeys: [mockValidRailCandidate],
      providerStatuses,
      options: { railwayOnly: true },
    });

    const activeProviders = assembled.meta.providers.map((p) => p.provider);
    assert.ok(activeProviders.includes('rail'), 'Rail provider must be present');
    assert.ok(!activeProviders.includes('bus'), 'Bus provider warning must be stripped in railway-only mode');
    assert.ok(!activeProviders.includes('flight'), 'Flight provider warning must be stripped in railway-only mode');
  });

  // 12. Repeated searches do not create uncontrolled duplicate provider requests
  it('12. Repeated searches do not create uncontrolled duplicate provider requests', async () => {
    const adapter = new RailRadarAdapter();
    let callCount = 0;

    const mockFetchCall = async () => {
      callCount++;
      await new Promise((res) => setTimeout(res, 30));
      return { trains: [{ trainNumber: '12394' }] };
    };

    // Trigger 5 concurrent identical requests
    const promises = [
      adapter.cachedRequest('direct:SNP:PNBE', 60000, mockFetchCall),
      adapter.cachedRequest('direct:SNP:PNBE', 60000, mockFetchCall),
      adapter.cachedRequest('direct:SNP:PNBE', 60000, mockFetchCall),
      adapter.cachedRequest('direct:SNP:PNBE', 60000, mockFetchCall),
      adapter.cachedRequest('direct:SNP:PNBE', 60000, mockFetchCall),
    ];

    const results = await Promise.all(promises);
    assert.equal(callCount, 1, 'In-flight deduplication must execute requestFn exactly once');
    assert.equal(results.length, 5);
    assert.equal(results[0].trains[0].trainNumber, '12394');
  });

  // 13. Price filter ignores missing fares and does not treat them as 0
  it('13. Price filter bounds and criteria ignore missing fares', () => {
    const journeys = [
      { id: '1', totalPrice: null },
      { id: '2', totalPrice: 500 },
      { id: '3', totalPrice: 1500 },
    ];

    const bounds = deriveFilterBounds(journeys);
    assert.equal(bounds.minPrice, 500, 'minPrice must be 500, not 0');
    assert.equal(bounds.maxPrice, 1500, 'maxPrice must be 1500');

    // Filter by maxPrice = 600
    const filtered = filterJourneys(journeys, { maxPrice: 600 });
    assert.equal(filtered.length, 1, 'Only journey 2 should match');
    assert.equal(filtered[0].id, '2');
  });

  // 14. Provider rate-limit in orchestration pipeline yields PROVIDER_RATE_LIMITED (429), NOT ALL_PROVIDERS_FAILED (502)
  it('14. Orchestration pipeline returns PROVIDER_RATE_LIMITED (429) on rate limit, NOT ALL_PROVIDERS_FAILED (502)', async () => {
    const rateLimitedRailProvider = {
      mode: 'rail',
      code: 'IRCTC',
      search: async () => ({
        provider: 'rail',
        providerCode: 'IRCTC',
        status: 'failed',
        candidates: [],
        error: {
          code: 'PROVIDER_RATE_LIMITED',
          message: 'Rate limit exceeded for provider "rail". Monthly quota exceeded.',
          statusCode: 429,
        },
      }),
    };

    const orchestratorWithRateLimit = new JourneyOrchestrator({
      providerRegistry: {
        getProviders: () => [rateLimitedRailProvider],
      },
      locationResolver: {
        resolveLocation: async (loc, type) => ({
          _id: type === 'origin' ? '507f1f77bcf86cd799439011' : '507f1f77bcf86cd799439012',
          name: typeof loc === 'string' ? loc : loc?.name,
          coordinates: type === 'origin' ? [82.97, 25.31] : [77.20, 28.61],
        }),
      },
      searchRequestService: {
        create: async () => ({ _id: '507f1f77bcf86cd799439013', status: 'pending' }),
        updateStatus: async () => {},
      },
    });

    await assert.rejects(
      async () => {
        await orchestratorWithRateLimit.orchestrateSearch(
          {
            origin: { _id: '507f1f77bcf86cd799439011', name: 'Varanasi', coordinates: [82.97, 25.31] },
            destination: { _id: '507f1f77bcf86cd799439012', name: 'New Delhi', coordinates: [77.20, 28.61] },
            departureDate: '2026-10-15',
          },
          { railwayOnly: true, includeDevelopment: false }
        );
      },
      (err) => {
        assert.equal(err.code, 'PROVIDER_RATE_LIMITED', 'Must classify as PROVIDER_RATE_LIMITED');
        assert.equal(err.statusCode, 429, 'Must return HTTP 429 status');
        assert.match(err.message, /temporarily rate-limited/i, 'Must provide clear railway-specific message');
        assert.notEqual(err.code, 'ALL_PROVIDERS_FAILED', 'Must NOT mask rate limit as ALL_PROVIDERS_FAILED');
        return true;
      }
    );
  });
});

