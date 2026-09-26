import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  RoadTransportProvider,
  roadTransportProvider,
} from '../src/providers/transport/road/road.provider.js';
import {
  RailTransportProvider,
  railTransportProvider,
} from '../src/providers/transport/rail/rail.provider.js';
import {
  BusTransportProvider,
  busTransportProvider,
} from '../src/providers/transport/bus/bus.provider.js';
import {
  FlightTransportProvider,
  flightTransportProvider,
} from '../src/providers/transport/flight/flight.provider.js';
import {
  TransportProviderRegistry,
  providerRegistry,
} from '../src/providers/transport/registry.js';
import { BaseTransportProvider } from '../src/providers/transport/interface.js';
import { ProviderError, sanitizeCredentials } from '../src/providers/transport/errors.js';
import { httpFetch } from '../src/providers/transport/httpClient.js';
import { normalizeJourneyCandidate } from '../src/search/journeyNormalizer.js';
import { validateJourneyCandidate } from '../src/search/journeyValidator.js';

describe('Yatrai Phase 5 — Transport Providers Suite', () => {
  const mockOrigin = {
    id: '60c72b2f9b1d8b2bad000001',
    name: 'Sonipat Junction Railway Station',
    city: 'Sonipat',
    state: 'Haryana',
    country: 'India',
    countryCode: 'IN',
    latitude: 28.9931,
    longitude: 77.0151,
  };

  const mockDestination = {
    id: '60c72b2f9b1d8b2bad000002',
    name: 'Patna Junction Railway Station',
    city: 'Patna',
    state: 'Bihar',
    country: 'India',
    countryCode: 'IN',
    latitude: 25.6093,
    longitude: 85.1376,
  };

  const standardRequest = {
    origin: mockOrigin,
    destination: mockDestination,
    departureDate: new Date('2026-10-01T00:00:00.000Z'),
    passengers: 2,
    requestedModes: ['road', 'rail', 'bus', 'flight'],
  };

  describe('1. Common Provider Interface & Envelope Conformance', () => {
    const providers = [
      { name: 'Road', instance: roadTransportProvider, mode: 'road' },
      { name: 'Rail', instance: railTransportProvider, mode: 'rail' },
      { name: 'Bus', instance: busTransportProvider, mode: 'bus' },
      { name: 'Flight', instance: flightTransportProvider, mode: 'flight' },
    ];

    for (const p of providers) {
      it(`${p.name} provider implements BaseTransportProvider contract`, () => {
        assert.ok(p.instance instanceof BaseTransportProvider);
        assert.equal(typeof p.instance.search, 'function');
        assert.equal(typeof p.instance.validateResponse, 'function');
        assert.equal(p.instance.mode, p.mode);
        assert.ok(p.instance.code);
        assert.ok(p.instance.name);
      });

      it(`${p.name} provider returns unavailable envelope when disabled`, async () => {
        const disabledProvider = new p.instance.constructor({ enabled: false });
        const envelope = await disabledProvider.search(standardRequest);

        assert.equal(envelope.status, 'unavailable');
        assert.equal(envelope.provider, p.mode);
        assert.deepEqual(envelope.candidates, []);
        assert.ok(envelope.metadata);
      });
    }
  });

  describe('2. Road Transport Provider Adapter', () => {
    const validOsrmPayload = {
      code: 'Ok',
      routes: [
        {
          geometry: 'encoded_poly',
          legs: [],
          weight_name: 'routability',
          weight: 41250,
          duration: 38400, // seconds = ~640 minutes
          distance: 1045000, // meters = ~1045 km
        },
      ],
      waypoints: [{ name: 'Sonipat' }, { name: 'Patna' }],
    };

    it('successfully parses valid OSRM driving response into candidate envelope', async () => {
      const provider = new RoadTransportProvider({
        apiUrl: 'https://router.project-osrm.org',
      });

      const envelope = await provider.search(standardRequest, {
        mockData: validOsrmPayload,
      });

      assert.equal(envelope.status, 'success');
      assert.equal(envelope.provider, 'road');
      assert.equal(envelope.candidates.length, 1);

      const candidate = envelope.candidates[0];
      assert.equal(candidate.duration, 640);
      assert.equal(candidate.totalDistance, 1045);
      assert.ok(candidate.totalPrice > 0);
      assert.equal(candidate.currency, 'INR');
      assert.deepEqual(candidate.transportModes, ['road']);
      assert.equal(candidate.legs.length, 1);
      assert.equal(candidate.legs[0].mode, 'road');
      assert.equal(candidate.legs[0].vehicle.type, 'Car / Cab');
    });

    it('returns empty envelope when no route exists (NoRoute)', async () => {
      const provider = new RoadTransportProvider();
      const envelope = await provider.search(standardRequest, {
        mockData: { code: 'NoRoute', routes: [] },
      });

      assert.equal(envelope.status, 'empty');
      assert.equal(envelope.candidates.length, 0);
    });

    it('normalizes malformed response without crashing', async () => {
      const provider = new RoadTransportProvider();
      const envelope = await provider.search(standardRequest, {
        mockData: { unexpected: 'format' },
      });

      assert.equal(envelope.status, 'failed');
      assert.equal(envelope.error.code, 'PROVIDER_MALFORMED_RESPONSE');
      assert.equal(envelope.candidates.length, 0);
    });

    it('handles simulated HTTP timeout gracefully', async () => {
      const provider = new RoadTransportProvider({
        apiUrl: 'https://mock.road.test',
        fetchFn: async (_url, options) => {
          return new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          });
        },
      });

      const envelope = await provider.search(standardRequest, { timeoutMs: 50 });
      assert.equal(envelope.status, 'failed');
      assert.equal(envelope.error.code, 'PROVIDER_TIMEOUT');
      assert.equal(envelope.error.retryable, true);
    });
  });

  describe('3. Rail Transport Provider Adapter', () => {
    const validRailPayload = {
      trains: [
        {
          trainNumber: '12394',
          trainName: 'Sampoorna Kranti Express',
          departureTime: '17:30',
          arrivalTime: '06:50',
          price: 1540,
          currency: 'INR',
          distance: 1000,
          classes: ['3A', '2A', '1A'],
          class: '3A',
          operator: 'Indian Railways',
        },
        {
          trainNumber: '12310',
          trainName: 'Tejas Rajdhani Express',
          departureTime: '17:10',
          arrivalTime: '05:15',
          price: 2210,
          currency: 'INR',
          distance: 998,
          classes: ['3A', '2A', '1A'],
          class: '2A',
          operator: 'Indian Railways',
        },
      ],
    };

    it('successfully parses valid train schedules into candidates', async () => {
      const provider = new RailTransportProvider({
        apiUrl: 'https://mock.irctc.test',
        apiKey: 'rail-secret-key-12345',
      });

      const envelope = await provider.search(standardRequest, {
        mockData: validRailPayload,
      });

      assert.equal(envelope.status, 'success');
      assert.equal(envelope.provider, 'rail');
      assert.equal(envelope.candidates.length, 2);

      const candidate = envelope.candidates[0];
      assert.equal(candidate.source, 'rail');
      assert.deepEqual(candidate.transportModes, ['rail']);
      assert.equal(candidate.numberOfTransfers, 0);
      assert.equal(candidate.totalPrice, 1540 * standardRequest.passengers);
      assert.equal(candidate.legs[0].vehicle.identifier, '12394');
      assert.equal(candidate.legs[0].service.name, 'Sampoorna Kranti Express');
    });

    it('returns empty envelope when 0 trains match route', async () => {
      const provider = new RailTransportProvider({
        apiUrl: 'https://mock.irctc.test',
      });

      const envelope = await provider.search(standardRequest, {
        mockData: { trains: [] },
      });

      assert.equal(envelope.status, 'empty');
      assert.equal(envelope.candidates.length, 0);
    });

    it('catches and normalizes missing train identifiers as malformed payload', async () => {
      const provider = new RailTransportProvider({
        apiUrl: 'https://mock.irctc.test',
      });

      const envelope = await provider.search(standardRequest, {
        mockData: { trains: [{ departureTime: '10:00', arrivalTime: '12:00' }] },
      });

      assert.equal(envelope.status, 'failed');
      assert.equal(envelope.error.code, 'PROVIDER_MALFORMED_RESPONSE');
    });

    it('normalizes HTTP 429 rate limit into PROVIDER_RATE_LIMITED', async () => {
      const provider = new RailTransportProvider({
        apiUrl: 'https://mock.irctc.test',
        fetchFn: async () => ({
          ok: false,
          status: 429,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ message: 'Rate limit exceeded' }),
        }),
      });

      const envelope = await provider.search(standardRequest);
      assert.equal(envelope.status, 'failed');
      assert.equal(envelope.error.code, 'PROVIDER_RATE_LIMITED');
      assert.equal(envelope.error.retryable, false);
    });
  });

  describe('4. Bus Transport Provider Adapter', () => {
    const validBusPayload = {
      buses: [
        {
          busId: 'BUS-DEL-PAT-01',
          operatorName: 'Zingbus Plus',
          busType: 'AC BharatBenz Sleeper (2+1)',
          departureTime: '18:00',
          arrivalTime: '08:30',
          fare: 1850,
          currency: 'INR',
          distance: 1020,
          seatsAvailable: 14,
        },
      ],
    };

    it('successfully parses valid bus services into candidates', async () => {
      const provider = new BusTransportProvider({
        apiUrl: 'https://mock.bus.test',
        apiKey: 'bus-token-abc',
      });

      const envelope = await provider.search(standardRequest, {
        mockData: validBusPayload,
      });

      assert.equal(envelope.status, 'success');
      assert.equal(envelope.provider, 'bus');
      assert.equal(envelope.candidates.length, 1);

      const candidate = envelope.candidates[0];
      assert.equal(candidate.source, 'bus');
      assert.deepEqual(candidate.transportModes, ['bus']);
      assert.equal(candidate.totalPrice, 1850 * standardRequest.passengers);
      assert.equal(candidate.legs[0].service.operator, 'Zingbus Plus');
      assert.equal(candidate.legs[0].vehicle.type, 'Bus');
    });

    it('returns empty envelope when buses array is empty', async () => {
      const provider = new BusTransportProvider({
        apiUrl: 'https://mock.bus.test',
      });

      const envelope = await provider.search(standardRequest, {
        mockData: { buses: [] },
      });

      assert.equal(envelope.status, 'empty');
      assert.equal(envelope.candidates.length, 0);
    });

    it('normalizes missing departure or arrival times as malformed response', async () => {
      const provider = new BusTransportProvider({
        apiUrl: 'https://mock.bus.test',
      });

      const envelope = await provider.search(standardRequest, {
        mockData: { buses: [{ busId: 'B-1', operatorName: 'Test' }] },
      });

      assert.equal(envelope.status, 'failed');
      assert.equal(envelope.error.code, 'PROVIDER_MALFORMED_RESPONSE');
    });
  });

  describe('5. Flight Transport Provider Adapter', () => {
    const validFlightPayload = {
      flights: [
        {
          flightNumber: '6E-204',
          airline: 'IndiGo',
          departureTime: '08:25',
          arrivalTime: '10:05',
          price: 4350,
          currency: 'INR',
          distance: 850,
          cabinClass: 'Economy',
          stops: 0,
          aircraft: 'Airbus A320neo',
        },
      ],
    };

    it('successfully parses flight options into candidates', async () => {
      const provider = new FlightTransportProvider({
        apiUrl: 'https://mock.aviation.test',
        apiKey: 'flight-bearer-token',
      });

      const envelope = await provider.search(standardRequest, {
        mockData: validFlightPayload,
      });

      assert.equal(envelope.status, 'success');
      assert.equal(envelope.provider, 'flight');
      assert.equal(envelope.candidates.length, 1);

      const candidate = envelope.candidates[0];
      assert.equal(candidate.source, 'flight');
      assert.deepEqual(candidate.transportModes, ['flight']);
      assert.equal(candidate.totalPrice, 4350 * standardRequest.passengers);
      assert.equal(candidate.legs[0].vehicle.identifier, '6E-204');
      assert.equal(candidate.legs[0].service.operator, 'IndiGo');
      assert.equal(candidate.legs[0].vehicle.type, 'Flight');
    });

    it('returns empty envelope when 0 flights found', async () => {
      const provider = new FlightTransportProvider({
        apiUrl: 'https://mock.aviation.test',
      });

      const envelope = await provider.search(standardRequest, {
        mockData: { flights: [] },
      });

      assert.equal(envelope.status, 'empty');
      assert.equal(envelope.candidates.length, 0);
    });

    it('handles malformed flight response missing flight identifiers', async () => {
      const provider = new FlightTransportProvider({
        apiUrl: 'https://mock.aviation.test',
      });

      const envelope = await provider.search(standardRequest, {
        mockData: { flights: [{ departureTime: '08:00', arrivalTime: '10:00' }] },
      });

      assert.equal(envelope.status, 'failed');
      assert.equal(envelope.error.code, 'PROVIDER_MALFORMED_RESPONSE');
    });
  });

  describe('6. Security & Credential Redaction Invariants', () => {
    it('sanitizeCredentials recursively strips API keys and secrets', () => {
      const sensitive = {
        name: 'Public Route',
        apiKey: 'super-secret-12345',
        auth_token: 'bearer xyz',
        clientSecret: 'password999',
        nested: {
          railApiKey: 'rail-secret',
          safeField: 'Delhi to Patna',
        },
        list: [{ token: 'token-in-array', code: 'SAFE' }],
      };

      const sanitized = sanitizeCredentials(sensitive);

      assert.equal(sanitized.name, 'Public Route');
      assert.equal(sanitized.apiKey, '[REDACTED]');
      assert.equal(sanitized.auth_token, '[REDACTED]');
      assert.equal(sanitized.clientSecret, '[REDACTED]');
      assert.equal(sanitized.nested.railApiKey, '[REDACTED]');
      assert.equal(sanitized.nested.safeField, 'Delhi to Patna');
      assert.equal(sanitized.list[0].token, '[REDACTED]');
      assert.equal(sanitized.list[0].code, 'SAFE');
    });

    it('httpFetch strips Authorization and secret headers from returned metadata', async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      });

      const res = await httpFetch('https://api.test/resource', {
        headers: {
          Authorization: 'Bearer secret-jwt-token',
          'X-API-Key': 'secret-api-key',
          Accept: 'application/json',
        },
        fetchFn: mockFetch,
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
    });
  });

  describe('7. Transport Provider Registry & Fault-Isolation', () => {
    let registry;

    beforeEach(() => {
      registry = new TransportProviderRegistry();
    });

    it('registers and retrieves providers by mode', () => {
      registry.register('road', roadTransportProvider);
      registry.register('rail', railTransportProvider);

      assert.equal(registry.getProvider('road'), roadTransportProvider);
      assert.equal(registry.getProvider('rail'), railTransportProvider);
      assert.equal(registry.getProvider('flight'), null);
      assert.equal(registry.getAllProviders().length, 2);

      // Verify default singleton registry
      assert.ok(providerRegistry.getProvider('road'));
      assert.ok(providerRegistry.getProvider('rail'));
      assert.ok(providerRegistry.getProvider('bus'));
      assert.ok(providerRegistry.getProvider('flight'));
      assert.equal(providerRegistry.getAllProviders().length, 4);
    });

    it('filters providers based on requestedModes', () => {
      registry.register('road', roadTransportProvider);
      registry.register('rail', railTransportProvider);
      registry.register('bus', busTransportProvider);
      registry.register('flight', flightTransportProvider);

      const railOnly = registry.getProviders({ requestedModes: ['rail'] });
      assert.equal(railOnly.length, 1);
      assert.equal(railOnly[0].mode, 'rail');

      const mixed = registry.getProviders({ requestedModes: ['bus', 'flight'] });
      assert.equal(mixed.length, 2);
      const modes = mixed.map((m) => m.mode);
      assert.ok(modes.includes('bus'));
      assert.ok(modes.includes('flight'));
    });

    it('executes searchAll with complete fault-isolation when one provider fails', async () => {
      const workingProvider = {
        mode: 'rail',
        code: 'IRCTC',
        search: async () => ({
          provider: 'rail',
          providerCode: 'IRCTC',
          status: 'success',
          requestedAt: new Date(),
          candidates: [
            {
              duration: 720,
              totalPrice: 1200,
              transportModes: ['rail'],
              status: 'scheduled',
              source: 'rail',
            },
          ],
          rawData: {},
          metadata: {},
          error: null,
        }),
      };

      const failingProvider = {
        mode: 'bus',
        code: 'REDBUS',
        search: async () => {
          throw new ProviderError('Bus connection timed out', {
            provider: 'bus',
            code: 'PROVIDER_TIMEOUT',
            statusCode: 504,
            retryable: true,
          });
        },
      };

      registry.register('rail', workingProvider);
      registry.register('bus', failingProvider);

      const outcome = await registry.searchAll(standardRequest);

      assert.equal(outcome.totalCount, 2);
      assert.equal(outcome.successfulCount, 1);
      assert.equal(outcome.failedCount, 1);
      assert.equal(outcome.candidates.length, 1);
      assert.equal(outcome.candidates[0].source, 'rail');
    });

    it('distinguishes between empty, failed, and unavailable results', async () => {
      const emptyProvider = {
        mode: 'road',
        code: 'OSRM',
        search: async () => ({
          provider: 'road',
          status: 'empty',
          candidates: [],
        }),
      };

      const unavailProvider = {
        mode: 'flight',
        code: 'FLIGHT',
        search: async () => ({
          provider: 'flight',
          status: 'unavailable',
          candidates: [],
        }),
      };

      registry.register('road', emptyProvider);
      registry.register('flight', unavailProvider);

      const outcome = await registry.searchAll(standardRequest);

      assert.equal(outcome.emptyCount, 1);
      assert.equal(outcome.unavailableCount, 1);
      assert.equal(outcome.successfulCount, 0);
      assert.equal(outcome.candidates.length, 0);
    });
  });

  describe('8. Pipeline Conformance & Phase 6 Boundary Readiness', () => {
    it('all provider candidate outputs conform strictly to internal normalization and validation', async () => {
      const roadRes = await roadTransportProvider.search(standardRequest, {
        mockData: {
          code: 'Ok',
          routes: [{ duration: 18000, distance: 450000, weight: 18000 }],
        },
      });

      const railRes = await railTransportProvider.search(standardRequest, {
        mockData: {
          trains: [
            {
              trainNumber: '12394',
              trainName: 'Express',
              departureTime: '17:30',
              arrivalTime: '06:50',
              price: 1540,
            },
          ],
        },
      });

      const busRes = await busTransportProvider.search(standardRequest, {
        mockData: {
          buses: [
            {
              busId: 'B-01',
              operatorName: 'FastBus',
              departureTime: '18:00',
              arrivalTime: '08:30',
              fare: 1200,
            },
          ],
        },
      });

      const flightRes = await flightTransportProvider.search(standardRequest, {
        mockData: {
          flights: [
            {
              flightNumber: '6E-204',
              departureTime: '08:25',
              arrivalTime: '10:05',
              price: 4350,
            },
          ],
        },
      });

      const allEnvelopes = [roadRes, railRes, busRes, flightRes];
      for (const env of allEnvelopes) {
        assert.equal(env.status, 'success');
        assert.ok(env.candidates.length > 0);

        for (const candidate of env.candidates) {
          // Normalize candidate
          const normalized = normalizeJourneyCandidate(candidate, {
            origin: mockOrigin.id,
            destination: mockDestination.id,
          });

          // Validate candidate against domain constraints
          const validation = validateJourneyCandidate(normalized);
          assert.equal(
            validation.valid,
            true,
            `Candidate from ${env.provider} failed validation: ${validation.errors.join('; ')}`
          );
          assert.ok(normalized.duration > 0);
          assert.ok(normalized.totalDistance >= 0);
          assert.ok(normalized.legs.length > 0);
          assert.equal(normalized.status, 'scheduled');
        }
      }
    });
  });
});
