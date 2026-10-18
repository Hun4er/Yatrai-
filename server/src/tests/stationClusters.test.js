import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import clusterService from '../services/rail/cluster.service.js';
import { DirectJourneyService } from '../services/rail/directJourney.service.js';
import RequestBudgetTracker from '../services/rail/requestBudget.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLUSTERS_CONFIG_PATH = path.resolve(__dirname, '../config/clusters.json');

test('1. Station Clusters Config: JSON file exists and contains valid required metro clusters', () => {
  assert.ok(fs.existsSync(CLUSTERS_CONFIG_PATH), 'clusters.json must exist');
  const raw = fs.readFileSync(CLUSTERS_CONFIG_PATH, 'utf8');
  const clusters = JSON.parse(raw);

  const requiredCities = ['delhi', 'patna', 'varanasi', 'surat', 'mumbai', 'kolkata', 'lucknow', 'gaya'];
  for (const city of requiredCities) {
    assert.ok(clusters[city], `Cluster config must contain ${city}`);
    assert.ok(Array.isArray(clusters[city].stations), `${city} must contain stations array`);
    assert.ok(clusters[city].stations.length > 0, `${city} stations must not be empty`);
  }

  // Ensure every station has code, name, and valid coordinates
  for (const [cityName, cluster] of Object.entries(clusters)) {
    for (const stn of cluster.stations) {
      assert.ok(stn.code, `Station in ${cityName} must have code`);
      assert.ok(stn.name, `Station in ${cityName} must have name`);
      assert.equal(typeof stn.lat, 'number', `Station ${stn.code} must have numeric lat`);
      assert.equal(typeof stn.lon, 'number', `Station ${stn.code} must have numeric lon`);
    }
  }

  // Ensure BCT is NOT present (dropped because 404 in RailKit)
  const mumbaiCodes = clusters.mumbai.stations.map((s) => s.code);
  assert.ok(!mumbaiCodes.includes('BCT'), 'BCT must be dropped from Mumbai cluster');
  assert.ok(mumbaiCodes.includes('MMCT'), 'MMCT must be in Mumbai cluster');
});

test('2. ClusterService: Cluster lookup, codes expansion, and distance calculation', () => {
  // Cluster lookup
  const delhiCluster = clusterService.getClusterForStation('NDLS');
  assert.ok(delhiCluster, 'NDLS must resolve to Delhi cluster');
  assert.equal(delhiCluster.primaryCode, 'NDLS');

  // Cluster codes expansion: requested code is first
  const delhiCodes = clusterService.getClusterStationCodes('ANVT');
  assert.equal(delhiCodes[0], 'ANVT', 'Requested station code must be first in list');
  assert.ok(delhiCodes.includes('NDLS'), 'Must include NDLS');
  assert.ok(delhiCodes.includes('DLI'), 'Must include DLI');

  const suratCodes = clusterService.getClusterStationCodes('ST');
  assert.ok(suratCodes.includes('UDN'), 'Surat must include UDN');
  assert.ok(suratCodes.includes('BHET'), 'Surat must include BHET');

  // Inter-station distance calculation
  const distNdlsAnvt = clusterService.calculateStationDistanceKm('NDLS', 'ANVT');
  assert.ok(distNdlsAnvt > 8 && distNdlsAnvt < 20, `NDLS to ANVT distance should be ~12-15km (got ${distNdlsAnvt})`);

  const sameDist = clusterService.calculateStationDistanceKm('NDLS', 'NDLS');
  assert.equal(sameDist, 0, 'Same station distance must be 0');
});

test('3. ClusterService: Station difference and labeling', () => {
  // No difference when requested == actual
  const noDiff = clusterService.getStationDifference('NDLS', 'NDLS', 'origin');
  assert.equal(noDiff, null, 'Exact station match should return null difference');

  // Origin shift
  const originDiff = clusterService.getStationDifference('NDLS', 'ANVT', 'origin');
  assert.ok(originDiff, 'Should return origin difference');
  assert.equal(originDiff.isShift, true);
  assert.equal(originDiff.role, 'origin');
  assert.equal(originDiff.requestedCode, 'NDLS');
  assert.equal(originDiff.actualCode, 'ANVT');
  assert.ok(originDiff.distanceKm > 0);
  assert.ok(originDiff.label.includes('Departing from nearby'));
  assert.ok(originDiff.label.includes('ANAND VIHAR TERMINAL (ANVT)'));
  assert.ok(originDiff.label.includes('from NEW DELHI (NDLS)'));

  // Destination shift
  const destDiff = clusterService.getStationDifference('PNBE', 'DNR', 'destination');
  assert.ok(destDiff, 'Should return destination difference');
  assert.equal(destDiff.role, 'destination');
  assert.ok(destDiff.label.includes('Arriving at nearby'));
  assert.ok(destDiff.label.includes('DANAPUR (DNR)'));
});

test('4. DirectJourneyService: Cluster search, timetable ranking, and availability cap', async () => {
  // Mock RailKit timetable response returning trains from different cluster stations
  const mockRailKit = {
    searchTrainBetweenStations: async (from, to) => {
      if (from === 'NDLS' && to === 'PNBE') {
        return {
          success: true,
          data: [
            {
              train_no: '12310',
              train_name: 'RJPB TEJAS RAJ',
              from_time: '17:10',
              to_time: '05:15',
              running_days: '1111111',
              distance: '1000',
              travel_time: '12:05',
              from_stn_code: 'NDLS',
              to_stn_code: 'PNBE',
            },
          ],
        };
      }
      if (from === 'ANVT' && to === 'PNBE') {
        return {
          success: true,
          data: [
            {
              train_no: '20508',
              train_name: 'SANG RAJDHANI',
              from_time: '19:50',
              to_time: '08:03',
              running_days: '1111111',
              distance: '990',
              travel_time: '12:13',
              from_stn_code: 'ANVT',
              to_stn_code: 'PNBE',
            },
          ],
        };
      }
      return { success: true, data: [] };
    },
  };

  let availabilityCalls = 0;
  const mockAvailability = {
    checkLegAvailability: async ({ trainNumber, fromCode, toCode }) => {
      availabilityCalls++;
      return {
        normalizedStatus: 'AVAILABLE',
        seatsAvailable: 42,
        rawStatus: 'AVAILABLE 42',
        trainNumber,
      };
    },
  };

  const mockFare = {
    getLegFare: async () => ({
      totalFare: 1850,
      baseFare: 1850,
      currency: 'INR',
      isEstimated: false,
    }),
  };

  const service = new DirectJourneyService({
    railKit: mockRailKit,
    availabilityService: mockAvailability,
    fareService: mockFare,
  });

  const budgetTracker = new RequestBudgetTracker({ maxDirectRequests: 4 });
  const result = await service.searchDirectTrains(
    {
      origin: 'NDLS',
      destination: 'PNBE',
      departureDate: '2026-10-25',
      preferences: { class: '3A', quota: 'GN' },
    },
    { budgetTracker, exploreAlternatives: true }
  );

  assert.equal(result.status, 'DIRECT_AVAILABLE');
  assert.ok(result.directJourneys.length >= 2, 'Should return candidates from both NDLS and ANVT cluster pairs');

  // Verify timetable score ordering: exact NDLS train should rank higher than ANVT train (station penalty)
  assert.equal(result.directJourneys[0].metadata.trainNumber, '12310');
  assert.equal(result.directJourneys[1].metadata.trainNumber, '20508');

  // Verify ANVT journey carries cluster shift labeling
  const anvtJourney = result.directJourneys.find((j) => j.metadata.trainNumber === '20508');
  assert.ok(anvtJourney, 'ANVT journey must exist');
  assert.equal(anvtJourney.isClusterShift, true);
  assert.ok(anvtJourney.clusterNote.includes('ANAND VIHAR TERMINAL (ANVT)'));
  assert.ok(anvtJourney.stationDifference.hasDifference);
  assert.equal(anvtJourney.stationDifference.originShift.actualCode, 'ANVT');

  // Verify availability calls count did not exceed cap
  assert.ok(availabilityCalls <= 4, `Availability calls (${availabilityCalls}) must not exceed direct cap (4)`);
});
