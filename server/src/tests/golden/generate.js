import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DirectPassService } from '../../services/rail/directPass.service.js';
import { AlternativesEngineService } from '../../services/rail/alternativesEngine.service.js';
import { ActionBudgetService } from '../../services/rail/actionBudget.service.js';
import { AVAILABILITY_STATUS } from '../../services/rail/availabilityNorm.js';
const DELHI_PATNA_22_TRAINS = [
  { trainNumber: '12302', trainName: 'Kolkata Rajdhani', from: 'NDLS', to: 'PNBE', departureTime: '16:50', arrivalTime: '04:40', duration: 710, classes: ['1A', '2A', '3A'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Sat', 'Sun'] },
  { trainNumber: '12304', trainName: 'Poorva Express', from: 'NDLS', to: 'PNBE', departureTime: '17:40', arrivalTime: '06:50', duration: 790, classes: ['1A', '2A', '3A', 'SL'], runsOnDays: ['Wed', 'Thu', 'Sat', 'Sun'] },
  { trainNumber: '12310', trainName: 'Patna Rajdhani', from: 'NDLS', to: 'PNBE', departureTime: '17:10', arrivalTime: '05:15', duration: 725, classes: ['1A', '2A', '3A'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '12392', trainName: 'Shramjeevi Express', from: 'NDLS', to: 'PNBE', departureTime: '13:10', arrivalTime: '07:05', duration: 1075, classes: ['1A', '2A', '3A', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '12394', trainName: 'Sampoorna Kranti Express', from: 'NDLS', to: 'PNBE', departureTime: '17:30', arrivalTime: '06:35', duration: 785, classes: ['1A', '2A', '3A', '3E', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '12424', trainName: 'DBRT Rajdhani', from: 'NDLS', to: 'PNBE', departureTime: '16:10', arrivalTime: '04:15', duration: 725, classes: ['1A', '2A', '3A'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '12488', trainName: 'Seemanchal Express', from: 'ANVT', to: 'DNR', departureTime: '08:10', arrivalTime: '23:15', duration: 905, classes: ['2A', '3A', '3E', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '12506', trainName: 'North East Express', from: 'ANVT', to: 'DNR', departureTime: '07:40', arrivalTime: '21:45', duration: 845, classes: ['2A', '3A', '3E', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '12562', trainName: 'Swatantrata Senani Exp', from: 'NDLS', to: 'PNBE', departureTime: '21:15', arrivalTime: '13:50', duration: 995, classes: ['1A', '2A', '3A', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '12802', trainName: 'Purushottam Express', from: 'NDLS', to: 'PNBE', departureTime: '22:40', arrivalTime: '13:40', duration: 900, classes: ['1A', '2A', '3A', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '12876', trainName: 'Neelachal Express', from: 'NDLS', to: 'PNBE', departureTime: '07:30', arrivalTime: '02:40', duration: 1150, classes: ['1A', '2A', '3A', 'SL'], runsOnDays: ['Tue', 'Fri', 'Sun'] },
  { trainNumber: '13008', trainName: 'Toofan Express', from: 'DLI', to: 'PNBE', departureTime: '07:10', arrivalTime: '06:30', duration: 1400, classes: ['2A', '3A', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '13240', trainName: 'Kota Patna Express', from: 'NDLS', to: 'PNBE', departureTime: '18:10', arrivalTime: '15:10', duration: 1260, classes: ['2A', '3A', 'SL'], runsOnDays: ['Mon', 'Wed', 'Thu', 'Sat'] },
  { trainNumber: '13258', trainName: 'Jan Sadharan Exp', from: 'ANVT', to: 'DNR', departureTime: '13:35', arrivalTime: '07:15', duration: 1060, classes: ['2S'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '13414', trainName: 'Farakka Express', from: 'DLI', to: 'PNBE', departureTime: '21:40', arrivalTime: '20:55', duration: 1395, classes: ['2A', '3A', 'SL'], runsOnDays: ['Mon', 'Wed', 'Sat'] },
  { trainNumber: '13484', trainName: 'Farakka Express (via Sultanpur)', from: 'DLI', to: 'PNBE', departureTime: '21:40', arrivalTime: '21:10', duration: 1410, classes: ['2A', '3A', 'SL'], runsOnDays: ['Tue', 'Thu', 'Fri', 'Sun'] },
  { trainNumber: '14006', trainName: 'Lichchavi Express', from: 'ANVT', to: 'PNBE', departureTime: '18:00', arrivalTime: '15:40', duration: 1300, classes: ['1A', '2A', '3A', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '14056', trainName: 'Brahmaputra Mail', from: 'DLI', to: 'PNBE', departureTime: '23:40', arrivalTime: '14:20', duration: 880, classes: ['2A', '3A', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '15484', trainName: 'Mahananda Express', from: 'DLI', to: 'PNBE', departureTime: '07:35', arrivalTime: '00:40', duration: 1025, classes: ['2A', '3A', 'SL'], runsOnDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { trainNumber: '22406', trainName: 'Bhagalpur Garib Rath', from: 'ANVT', to: 'PNBE', departureTime: '17:20', arrivalTime: '08:45', duration: 925, classes: ['3A'], runsOnDays: ['Mon', 'Wed', 'Fri'] },
  { trainNumber: '22466', trainName: 'Deoghar SF Express', from: 'ANVT', to: 'PNBE', departureTime: '12:45', arrivalTime: '05:35', duration: 1010, classes: ['2A', '3A', '3E', 'SL'], runsOnDays: ['Wed'] },
  { trainNumber: '02394', trainName: 'Patna Special', from: 'NDLS', to: 'PNBE', departureTime: '23:55', arrivalTime: '16:00', duration: 965, classes: ['3A', 'SL'], runsOnDays: ['Thu'] },
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GOLDEN_DIR = __dirname;

export function createGoldenMockEnvironment({
  confirmedOnTrain = null,
  confirmedClass = '3A',
} = {}) {
  let searchCalls = 0;
  let cancelledCalls = 0;
  let availCalls = 0;
  let scheduleCalls = 0;

  const _searchCache = new Set();
  const _availCache = new Set();
  const _infoCache = new Set();
  let _cancelledCached = false;

  const trains = DELHI_PATNA_22_TRAINS;
  const cancelledTrains = ['12562'];

  const mockRailKit = {
    hasCachedSearch(from, to) {
      return _searchCache.has(`${from}:${to}`);
    },
    hasCachedInfo(num) {
      return _infoCache.has(String(num));
    },
    async getCancelledTrains() {
      _cancelledCached = true;
      cancelledCalls++;
      return { success: true, data: cancelledTrains };
    },
    async searchTrainBetweenStations(from, to) {
      _searchCache.add(`${from}:${to}`);
      searchCalls++;
      return {
        success: true,
        data: trains.map((t) => ({
          train_number: t.trainNumber,
          trainNumber: t.trainNumber,
          number: t.trainNumber,
          train_name: t.trainName,
          trainName: t.trainName,
          from_station_code: from || t.from,
          to_station_code: to || t.to,
          departure_time: t.departureTime,
          departureTime: t.departureTime,
          arrival_time: t.arrivalTime,
          arrivalTime: t.arrivalTime,
          travel_time: t.duration,
          duration: t.duration,
          classes: t.classes,
          run_days: t.runsOnDays,
          runsOnDays: t.runsOnDays,
          runDays: t.runsOnDays,
          _from: from || t.from,
          _to: to || t.to,
        })),
      };
    },
    async trainSchedule(trainNo) {
      _infoCache.add(String(trainNo));
      scheduleCalls++;
      return {
        success: true,
        data: {
          train_number: trainNo,
          route: [
            { station_code: 'NDLS', distance: 0 },
            { station_code: 'CNB', distance: 440 },
            { station_code: 'PRYJ', distance: 635 },
            { station_code: 'DDU', distance: 785 },
            { station_code: 'PNBE', distance: 998 },
            { station_code: 'RJPB', distance: 1003 },
            { station_code: 'BKP', distance: 1043 },
            { station_code: 'MKA', distance: 1087 },
          ],
        },
      };
    },
  };

  const mockAvailabilityService = {
    hasCached(num, from, to, date, cls) {
      return _availCache.has(`${num}:${from}:${to}:${cls}`);
    },
    async checkLegAvailability({ trainNumber, fromCode, toCode, date, travelClass }) {
      _availCache.add(`${trainNumber}:${fromCode}:${toCode}:${travelClass}`);
      availCalls++;
      const isConfirmed = trainNumber === confirmedOnTrain && (!confirmedClass || travelClass === confirmedClass);
      return {
        normalizedStatus: isConfirmed ? AVAILABILITY_STATUS.AVAILABLE : AVAILABILITY_STATUS.WAITLIST,
        statusText: isConfirmed ? 'AVAILABLE 12' : 'GNWL 15',
        predictionPercentage: isConfirmed ? 100 : 45,
        fare: 1450,
        totalFare: 1450,
        dates: [
          { date, status: isConfirmed ? 'AVAILABLE' : 'WL' },
          { date: '2026-11-16', status: 'WL' },
          { date: '2026-11-17', status: 'AVAILABLE' },
          { date: '2026-11-18', status: 'WL' },
        ],
      };
    },
  };

  const inMemoryCorridorHubs = {
    _store: new Map(),
    async getStoredHubs(origin, dest) {
      return this._store.get(`${origin}:${dest}`) || null;
    },
    async storeHubs(origin, dest, hubs) {
      this._store.set(`${origin}:${dest}`, hubs);
    },
  };

  const actionBudgetService = new ActionBudgetService();

  return {
    mockRailKit,
    mockAvailabilityService,
    inMemoryCorridorHubs,
    actionBudgetService,
    getCounters: () => ({ searchCalls, cancelledCalls, availCalls, scheduleCalls, total: searchCalls + cancelledCalls + availCalls + scheduleCalls }),
  };
}

export async function executeSearch({
  mode = 'default',
  confirmedOnTrain = null,
  env,
  actionId = 'golden_act',
  date = '2026-11-19', // Thursday in future
}) {
  const normalizedMode = String(mode || 'default').toLowerCase().trim();
  const isAlternativesMode = normalizedMode === 'alternatives';
  const isDeepMode = normalizedMode === 'deep';
  const isAutoOrDefault = normalizedMode === 'default' || normalizedMode === 'auto' || normalizedMode === 'direct';

  const budget = env.actionBudgetService;
  const actionType = isDeepMode ? 'deep' : (isAlternativesMode ? 'alternatives_button' : 'default');
  await budget.getOrCreate(actionId, actionType);

  const directPass = new DirectPassService({
    railKit: env.mockRailKit,
    availabilityService: env.mockAvailabilityService,
    actionBudgetService: env.actionBudgetService,
  });

  const altEngine = new AlternativesEngineService({
    railKit: env.mockRailKit,
    availabilityService: env.mockAvailabilityService,
    corridorHubsService: env.inMemoryCorridorHubs,
    actionBudgetService: env.actionBudgetService,
  });

  let directResult = null;
  let alternativesResult = null;

  if (isAutoOrDefault) {
    directResult = await directPass.run({
      origins: ['NDLS'],
      destinations: ['PNBE'],
      date,
      travelClass: 'ANY',
      quota: 'GN',
      actionId,
      actionType,
    });
  }

  const shouldRunAlternatives =
    isAlternativesMode ||
    isDeepMode ||
    (isAutoOrDefault && directResult && !directResult.confirmedFound);

  if (shouldRunAlternatives) {
    const altActionType = isDeepMode ? 'deep' : 'alternatives_button';
    let refTrains = directResult?.direct || [];
    if (!refTrains || refTrains.length === 0) {
      const searchRes = await env.mockRailKit.searchTrainBetweenStations('NDLS', 'PNBE');
      refTrains = searchRes?.data || [];
    }
    alternativesResult = await altEngine.run({
      originCode: 'NDLS',
      destCode: 'PNBE',
      date,
      travelClass: 'ANY',
      quota: 'GN',
      actionId,
      actionType: altActionType,
      referenceTrains: refTrains,
      isDegraded: false,
    });
  }

  const budgetSummary = await budget.getBudgetSummary(actionId);
  const isPartial = budgetSummary.partial || Boolean(directResult?.partial) || Boolean(alternativesResult?.partial);

  return {
    direct: directResult?.direct || [],
    waitingTrains: directResult?.waitingTrains || [],
    uncheckedClasses: directResult?.uncheckedClasses || [],
    alternatives: alternativesResult?.alternatives || [],
    dateStrip: directResult?.dateStrip || [],
    partial: isPartial,
    degraded: false,
    providerNotice: null,
    allCancelled: directResult?.allCancelled || false,
    noTrainsFound: directResult?.noTrainsFound || false,
    message: directResult?.message || null,
    cancelledFilter: directResult?.cancelledFilter || null,
    budget: budgetSummary,
    cache: {
      hits: budgetSummary.cacheHits,
      misses: budgetSummary.cacheMisses,
    },
  };
}

async function run() {
  if (!fs.existsSync(GOLDEN_DIR)) {
    fs.mkdirSync(GOLDEN_DIR, { recursive: true });
  }

  const callCounts = {};

  const scenarios = [
    { name: 'default_confirmed', mode: 'default', confirmedOnTrain: '12310' },
    { name: 'alternatives_confirmed', mode: 'alternatives', confirmedOnTrain: '12310' },
    { name: 'deep_confirmed', mode: 'deep', confirmedOnTrain: '12310' },
    { name: 'default_all_wl', mode: 'default', confirmedOnTrain: null },
    { name: 'alternatives_all_wl', mode: 'alternatives', confirmedOnTrain: null },
    { name: 'deep_all_wl', mode: 'deep', confirmedOnTrain: null },
  ];

  for (const sc of scenarios) {
    // Cold run
    const envCold = createGoldenMockEnvironment({ confirmedOnTrain: sc.confirmedOnTrain });
    const coldRes = await executeSearch({
      mode: sc.mode,
      confirmedOnTrain: sc.confirmedOnTrain,
      env: envCold,
      actionId: `cold_${sc.name}`,
    });
    const coldCounters = envCold.getCounters();

    // Warm run on same env
    const warmRes = await executeSearch({
      mode: sc.mode,
      confirmedOnTrain: sc.confirmedOnTrain,
      env: envCold,
      actionId: `warm_${sc.name}`,
    });
    const warmCounters = envCold.getCounters();
    const warmDelta = {
      searchCalls: warmCounters.searchCalls - coldCounters.searchCalls,
      cancelledCalls: warmCounters.cancelledCalls - coldCounters.cancelledCalls,
      availCalls: warmCounters.availCalls - coldCounters.availCalls,
      scheduleCalls: warmCounters.scheduleCalls - coldCounters.scheduleCalls,
      total: warmCounters.total - coldCounters.total,
    };

    callCounts[sc.name] = {
      cold: coldCounters,
      warm: warmDelta,
    };

    // Save golden json (cold response)
    const filePath = path.join(GOLDEN_DIR, `${sc.name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(coldRes, null, 2), 'utf8');
    console.log(`Saved golden: ${filePath} (cold calls: ${coldCounters.total}, warm calls: ${warmDelta.total})`);
  }

  const countsPath = path.join(GOLDEN_DIR, 'call_counts.json');
  fs.writeFileSync(countsPath, JSON.stringify(callCounts, null, 2), 'utf8');
  console.log(`Saved call counts: ${countsPath}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
