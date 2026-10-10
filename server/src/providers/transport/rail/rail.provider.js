import config from '../../../config/index.js';
import { BaseTransportProvider } from '../interface.js';
import { httpFetch } from '../httpClient.js';
import { ProviderError } from '../errors.js';
import { calculateJourneyTiming } from '../../../utils/railwayTime.js';
import railRadarAdapter from '../../rail/railRadar.adapter.js';

/**
 * Built-in Station Code Mapping for major Indian cities and railway hubs.
 * Maps city names and common station variants to Indian Railways (IRCTC) alpha station codes.
 */
export const STATION_CODE_MAP = {
  // Delhi NCR
  delhi: 'NDLS',
  'new delhi': 'NDLS',
  'old delhi': 'DLI',
  'hazrat nizamuddin': 'NZM',
  nizamuddin: 'NZM',
  'anand vihar': 'ANVT',
  'anand vihar terminal': 'ANVT',
  'delhi cantt': 'DEC',
  'delhi sarai rohilla': 'DEE',
  sonipat: 'SNP',
  sonepat: 'SNP',
  panipat: 'PNP',
  karnal: 'KUN',
  kurukshetra: 'KKDE',
  ambala: 'UMB',
  'ambala cantt': 'UMB',
  chandigarh: 'CDG',
  faridabad: 'FDB',
  gurgaon: 'GGN',
  gurugram: 'GGN',
  ghaziabad: 'GZB',
  meerut: 'MTC',
  rohtak: 'ROK',

  // Bihar & Jharkhand
  patna: 'PNBE',
  'patna junction': 'PNBE',
  'patna jn': 'PNBE',
  patliputra: 'PPTA',
  danapur: 'DNR',
  'rajendra nagar': 'RJPB',
  'rajendranagar terminal': 'RJPB',
  gaya: 'GAYA',
  muzaffarpur: 'MFP',
  darbhanga: 'DBG',
  samastipur: 'SPJ',
  bhagalpur: 'BGP',
  ranchi: 'RNC',
  dhanbad: 'DHN',
  bokaro: 'BKSC',
  jamshedpur: 'TATA',
  tatanagar: 'TATA',

  // Maharashtra & Goa
  mumbai: 'CSMT',
  'mumbai csmt': 'CSMT',
  'chhatrapati shivaji': 'CSMT',
  'mumbai central': 'MMCT',
  bandra: 'BDTS',
  'bandra terminus': 'BDTS',
  'lokmanya tilak': 'LTT',
  'lokmanya tilak terminus': 'LTT',
  dadar: 'DR',
  thane: 'TNA',
  kalyan: 'KYN',
  pune: 'PUNE',
  nagpur: 'NGP',
  nashik: 'NK',
  aurangabad: 'AWB',
  solapur: 'SUR',
  kolhapur: 'KOP',
  goa: 'MAO',
  madgaon: 'MAO',
  'vasco da gama': 'VSG',

  // West Bengal & North East
  kolkata: 'HWH',
  howrah: 'HWH',
  'howrah junction': 'HWH',
  sealdah: 'SDAH',
  shalimar: 'SHM',
  'kolkata chitpur': 'KOAA',
  asansol: 'ASN',
  siliguri: 'NJP',
  'new jalpaiguri': 'NJP',
  guwahati: 'GHY',
  kamakhya: 'KYQ',

  // Uttar Pradesh & Uttarakhand
  lucknow: 'LKO',
  'lucknow charbagh': 'LKO',
  'lucknow junction': 'LJN',
  kanpur: 'CNB',
  'kanpur central': 'CNB',
  varanasi: 'BSB',
  'varanasi junction': 'BSB',
  banaras: 'BSBS',
  'pt deen dayal upadhyaya': 'DDU',
  mughalsarai: 'DDU',
  prayagraj: 'PRYJ',
  'prayagraj junction': 'PRYJ',
  allahabad: 'PRYJ',
  gorakhpur: 'GKP',
  agra: 'AGC',
  'agra cantt': 'AGC',
  'agra fort': 'AF',
  mathura: 'MTJ',
  aligarh: 'ALJN',
  moradabad: 'MB',
  bareilly: 'BE',
  jhansi: 'VGLJ',
  'virangana lakshmibai': 'VGLJ',
  dehradun: 'DDN',
  haridwar: 'HW',
  rishikesh: 'YNRK',

  // Rajasthan & Gujarat
  jaipur: 'JP',
  'jaipur junction': 'JP',
  jodhpur: 'JU',
  ajmer: 'AII',
  udaipur: 'UDZ',
  'udaipur city': 'UDZ',
  bikaner: 'BKN',
  kota: 'KOTA',
  ahmedabad: 'ADI',
  surat: 'ST',
  vadodara: 'BRC',
  rajkot: 'RJT',
  bhavnagar: 'BVC',

  // Punjab & Jammu
  ludhiana: 'LDH',
  jalandhar: 'JUC',
  amritsar: 'ASR',
  bathinda: 'BTI',
  jammu: 'JAT',
  'jammu tawi': 'JAT',
  katra: 'SVDK',
  'shri mata vaishno devi katra': 'SVDK',

  // Madhya Pradesh & Chhattisgarh
  bhopal: 'BPL',
  'rani kamlapati': 'RKMP',
  habibganj: 'RKMP',
  indore: 'INDB',
  ujjain: 'UJN',
  gwalior: 'GWL',
  jabalpur: 'JBP',
  raipur: 'R',
  bilaspur: 'BSP',

  // South India
  bengaluru: 'SBC',
  bangalore: 'SBC',
  'ksr bengaluru': 'SBC',
  yesvantpur: 'YPR',
  'sir m visvesvaraya terminal': 'SMVB',
  krishnarajapuram: 'KJM',
  mysore: 'MYS',
  mysuru: 'MYS',
  hubballi: 'UBL',
  hubli: 'UBL',
  mangalore: 'MAQ',
  mangaluru: 'MAQ',
  chennai: 'MAS',
  'chennai central': 'MAS',
  'chennai egmore': 'MS',
  tambaram: 'TBM',
  coimbatore: 'CBE',
  madurai: 'MDU',
  tiruchirappalli: 'TPJ',
  trichy: 'TPJ',
  salem: 'SA',
  hyderabad: 'HYB',
  secunderabad: 'SC',
  kacheguda: 'KCG',
  visakhapatnam: 'VSKP',
  vizag: 'VSKP',
  vijayawada: 'BZA',
  tirupati: 'TPTY',
  kochi: 'ERS',
  cochin: 'ERS',
  ernakulam: 'ERS',
  'ernakulam town': 'ERN',
  thiruvananthapuram: 'TVC',
  trivandrum: 'TVC',
  kozhikode: 'CLT',
  calicut: 'CLT',
  thrissur: 'TCR',
  kannur: 'CAN',

  // Odisha
  bhubaneswar: 'BBS',
  puri: 'PURI',
  cuttack: 'CTC',
  rourkela: 'ROU',
};

/**
 * Metropolitan railway cluster mappings.
 * Allows looking up secondary major passenger terminals when a metro city's primary station has 0 direct trains.
 */
export const METRO_CLUSTERS = {
  // Chennai
  chennai: ['MAS', 'PER', 'MS', 'TBM'],
  mas: ['MAS', 'PER', 'MS', 'TBM'],
  per: ['PER', 'MAS', 'MS', 'TBM'],
  ms: ['MS', 'MAS', 'PER', 'TBM'],
  tbm: ['TBM', 'MS', 'MAS', 'PER'],

  // Patna
  patna: ['PNBE', 'DNR', 'PPTA', 'RJPB'],
  'patna junction': ['PNBE', 'DNR', 'PPTA', 'RJPB'],
  pnbe: ['PNBE', 'DNR', 'PPTA', 'RJPB'],
  dnr: ['DNR', 'PNBE', 'PPTA', 'RJPB'],
  danapur: ['DNR', 'PNBE', 'PPTA', 'RJPB'],
  ppta: ['PPTA', 'PNBE', 'DNR', 'RJPB'],
  patliputra: ['PPTA', 'PNBE', 'DNR', 'RJPB'],
  rjpb: ['RJPB', 'PNBE', 'DNR', 'PPTA'],

  // Delhi NCR
  delhi: ['NDLS', 'DLI', 'NZM', 'ANVT', 'DEE'],
  'new delhi': ['NDLS', 'DLI', 'NZM', 'ANVT', 'DEE'],
  ndls: ['NDLS', 'DLI', 'NZM', 'ANVT', 'DEE'],
  dli: ['DLI', 'NDLS', 'NZM', 'ANVT', 'DEE'],
  nzm: ['NZM', 'NDLS', 'DLI', 'ANVT', 'DEE'],
  anvt: ['ANVT', 'NDLS', 'DLI', 'NZM', 'DEE'],
  sonipat: ['SNP'],
  snp: ['SNP'],

  // Mumbai
  mumbai: ['CSMT', 'MMCT', 'BDTS', 'LTT', 'DR'],
  csmt: ['CSMT', 'MMCT', 'BDTS', 'LTT', 'DR'],
  mmct: ['MMCT', 'CSMT', 'BDTS', 'LTT', 'DR'],
  bdts: ['BDTS', 'MMCT', 'CSMT', 'LTT', 'DR'],
  ltt: ['LTT', 'CSMT', 'MMCT', 'BDTS', 'DR'],

  // Kolkata
  kolkata: ['HWH', 'SDAH', 'KOAA', 'SHM'],
  howrah: ['HWH', 'SDAH', 'KOAA', 'SHM'],
  hwh: ['HWH', 'SDAH', 'KOAA', 'SHM'],
  sdah: ['SDAH', 'HWH', 'KOAA', 'SHM'],

  // Bengaluru
  bengaluru: ['SBC', 'YPR', 'SMVB', 'KJM'],
  bangalore: ['SBC', 'YPR', 'SMVB', 'KJM'],
  sbc: ['SBC', 'YPR', 'SMVB', 'KJM'],
  ypr: ['YPR', 'SBC', 'SMVB', 'KJM'],

  // Hyderabad
  hyderabad: ['SC', 'HYB', 'KCG'],
  secunderabad: ['SC', 'HYB', 'KCG'],
  sc: ['SC', 'HYB', 'KCG'],

  // Varanasi
  varanasi: ['BSB', 'BSBS', 'DDU'],
  bsb: ['BSB', 'BSBS', 'DDU'],
  ddu: ['DDU', 'BSB', 'BSBS'],
};

/**
 * Returns all potential station codes for a location in a metropolitan cluster.
 *
 * @param {Object} location
 * @param {string} defaultCode
 * @returns {Array<string>}
 */
export function getClusterStationCodes(location, defaultCode) {
  const codes = new Set();
  if (defaultCode) codes.add(defaultCode.toUpperCase());

  const nameClean = (location?.name || '').toLowerCase().trim();
  const cityClean = (location?.city || '').toLowerCase().trim();

  for (const [key, cluster] of Object.entries(METRO_CLUSTERS)) {
    if (
      nameClean.includes(key) ||
      cityClean.includes(key) ||
      (defaultCode && key === defaultCode.toLowerCase())
    ) {
      cluster.forEach((c) => codes.add(c));
    }
  }

  return Array.from(codes);
}

/**
 * Resolves a location entity into an Indian Railways station code.
 *
 * @param {Object} location - Location entity or search object
 * @returns {string} Indian Railways Station Code (e.g. 'NDLS', 'PNBE', 'SNP')
 */
export function resolveStationCode(location) {
  if (!location) return 'NDLS';

  // 1. Explicit station code properties
  const directCode = location.code || location.stationCode;
  if (directCode && /^[A-Za-z]{2,5}$/.test(directCode.trim())) {
    return directCode.trim().toUpperCase();
  }

  // 2. Metadata station code
  const metaCode = location.metadata?.code || location.metadata?.stationCode;
  if (metaCode && /^[A-Za-z]{2,5}$/.test(metaCode.trim())) {
    return metaCode.trim().toUpperCase();
  }

  // 3. Aliases containing an uppercase station code
  if (Array.isArray(location.aliases)) {
    const aliasCode = location.aliases.find(
      (a) => typeof a === 'string' && /^[A-Za-z]{2,5}$/.test(a.trim())
    );
    if (aliasCode) return aliasCode.trim().toUpperCase();
  }

  // 4. Parentheses in displayName or name (e.g. "New Delhi (NDLS)")
  const parenMatch = (location.displayName || location.name || '').match(/\b([A-Za-z]{2,5})\b/);

  // 5. Clean name & city match against STATION_CODE_MAP
  const nameClean = (location.name || '').toLowerCase().trim();
  const cityClean = (location.city || '').toLowerCase().trim();

  if (STATION_CODE_MAP[nameClean]) return STATION_CODE_MAP[nameClean];
  if (STATION_CODE_MAP[cityClean]) return STATION_CODE_MAP[cityClean];

  for (const [key, code] of Object.entries(STATION_CODE_MAP)) {
    if (nameClean.includes(key) || cityClean.includes(key)) {
      return code;
    }
  }

  // 6. Name directly matches 2-5 capital letters
  if (/^[A-Za-z]{2,5}$/.test(nameClean)) {
    return nameClean.toUpperCase();
  }

  if (parenMatch && /^[A-Z]{2,5}$/.test(parenMatch[1])) {
    return parenMatch[1].toUpperCase();
  }

  // Fallback: sanitized uppercase city or name
  const fallback = (location.city || location.name || 'NDLS')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4);
  return fallback || 'NDLS';
}

/**
 * Rail Transport Provider Adapter
 * Connects to RailRadar live API (https://api.railradar.in/v1) or configured external rail gateway.
 *
 * Owns:
 * - Rail API authentication & headers (Bearer token & X-API-Key)
 * - Station query parameter and path translation
 * - Response schema validation & timing verification
 * - Dynamic fare calculation and leg formatting
 */
export class RailTransportProvider extends BaseTransportProvider {
  constructor(options = {}) {
    super({
      name: 'Indian Railways Provider (RailRadar)',
      code: 'IRCTC',
      mode: 'rail',
      enabled: options.enabled ?? config.providers.rail.enabled,
      timeoutMs: options.timeoutMs ?? config.providers.rail.timeoutMs,
    });
    this.apiUrl = options.apiUrl || config.providers.rail.apiUrl || null;
    this.apiKey = options.apiKey || config.providers.rail.apiKey || null;
    this.fetchFn = options.fetchFn || globalThis.fetch;
  }

  /**
   * Safely extracts the array of train schedule items from various payload shapes:
   * - RailRadar: { data: { trains: [...] } } or { trains: [...] }
   * - Legacy/Mock: { trains: [...] } or { data: [...] } or direct array [...]
   *
   * @param {Object|Array} rawResponse
   * @returns {Array|null} Array of train records, or null if malformed
   */
  extractTrains(rawResponse) {
    if (!rawResponse) return null;
    if (Array.isArray(rawResponse)) return rawResponse;
    if (Array.isArray(rawResponse.trains)) return rawResponse.trains;
    if (Array.isArray(rawResponse.data)) return rawResponse.data;
    if (rawResponse.data && Array.isArray(rawResponse.data.trains)) return rawResponse.data.trains;
    if (rawResponse.success && rawResponse.data && Array.isArray(rawResponse.data.trains)) {
      return rawResponse.data.trains;
    }
    return null;
  }

  /**
   * Validates external rail API response structure.
   */
  validateResponse(rawResponse) {
    super.validateResponse(rawResponse);

    const trains = this.extractTrains(rawResponse);

    if (!trains) {
      throw new ProviderError('Rail provider returned payload missing train schedule records.', {
        provider: 'rail',
        code: 'PROVIDER_MALFORMED_RESPONSE',
        statusCode: 502,
        retryable: false,
        details: rawResponse,
      });
    }

    // Validate structure of individual train items
    for (let i = 0; i < trains.length; i++) {
      const train = trains[i];
      const trainNum = train.train?.number || train.trainNumber || train.number || train.id;
      if (!trainNum) {
        throw new ProviderError(`Rail item at index ${i} missing train identifier.`, {
          provider: 'rail',
          code: 'PROVIDER_MALFORMED_RESPONSE',
          statusCode: 502,
          retryable: false,
        });
      }

      const dep = train.from?.departure || train.departureTime || train.journeySegment?.departureTime;
      const arr = train.to?.arrival || train.arrivalTime || train.journeySegment?.arrivalTime;
      if (!dep || !arr) {
        throw new ProviderError(`Rail item at index ${i} missing schedule timestamps.`, {
          provider: 'rail',
          code: 'PROVIDER_MALFORMED_RESPONSE',
          statusCode: 502,
          retryable: false,
        });
      }
    }
  }

  /**
   * Searches for train routes matching the origin and destination.
   *
   * @param {Object} request
   * @param {Object} [options]
   * @returns {Promise<Object>} Common Provider Result Envelope
   */
  async search(request, options = {}) {
    if (!this.isEnabled()) {
      return this.unavailable('Rail provider is disabled in configuration');
    }

    const apiUrl = options.apiUrl || this.apiUrl || config.providers.rail.apiUrl;
    const apiKey = options.apiKey || this.apiKey || config.providers.rail.apiKey;
    const fetchFn = options.fetchFn || this.fetchFn;

    // Check if external API credentials exist
    if (!apiUrl && !options.mockData) {
      return this.unavailable(
        'Rail provider is not configured. Set RAIL_API_URL and RAIL_API_KEY environment variables.'
      );
    }

    const { origin, destination, departureDate, passengers = 1 } = request || {};
    const travelDateStr =
      departureDate instanceof Date
        ? departureDate.toISOString().slice(0, 10)
        : String(departureDate || '').slice(0, 10);

    const startTime = Date.now();
    let rawResponse = null;

    try {
      const fromCode = resolveStationCode(origin);
      const toCode = resolveStationCode(destination);
      const isRailRadar = apiUrl ? apiUrl.toLowerCase().includes('railradar.in') : false;

      if (options.mockData) {
        rawResponse = options.mockData;
      } else {
        const headers = { Accept: 'application/json' };

        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey.trim()}`;
          headers['X-API-Key'] = apiKey.trim();
        }

        let endpointUrl;
        if (isRailRadar && fetchFn === globalThis.fetch) {
          const directResult = await railRadarAdapter.searchDirectTrains(fromCode, toCode, {
            timeoutMs: options.timeoutMs || this.timeoutMs,
            departureDate: travelDateStr,
            date: travelDateStr,
          });
          if (!directResult.success && directResult.statusCode === 429) {
            throw new ProviderError(`Rate limit exceeded for provider "rail".`, {
              provider: 'rail',
              code: 'PROVIDER_RATE_LIMITED',
              statusCode: 429,
              retryable: false,
              details: {
                isMonthlyQuota: directResult.isMonthlyQuota,
              },
            });
          }
          rawResponse = directResult.rawResponse || { data: { trains: directResult.trains || [] } };
        } else if (isRailRadar) {
          endpointUrl = `${apiUrl.replace(/\/$/, '')}/trains/between/${encodeURIComponent(fromCode)}/${encodeURIComponent(toCode)}`;
          const res = await httpFetch(endpointUrl, {
            method: 'GET',
            headers,
            timeoutMs: options.timeoutMs || this.timeoutMs,
            provider: 'rail',
            fetchFn,
          });
          rawResponse = res.data;
        } else {
          const fromStation = origin.name || origin.city || 'ORIGIN';
          const toStation = destination.name || destination.city || 'DESTINATION';
          const queryParams = new URLSearchParams({
            from: fromStation,
            to: toStation,
            date: travelDateStr,
          });
          endpointUrl = `${apiUrl.replace(/\/$/, '')}/trains/between-stations?${queryParams.toString()}`;
          const res = await httpFetch(endpointUrl, {
            method: 'GET',
            headers,
            timeoutMs: options.timeoutMs || this.timeoutMs,
            provider: 'rail',
            fetchFn,
          });
          rawResponse = res.data;
        }
      }

      this.validateResponse(rawResponse);

      let trainList = this.extractTrains(rawResponse) || [];

      // If primary station pair yields 0 trains, attempt metropolitan cluster resolution
      if (trainList.length === 0 && !options.mockData && isRailRadar) {
        const fromClusters = getClusterStationCodes(origin, fromCode);
        const toClusters = getClusterStationCodes(destination, toCode);

        if (fromClusters.length > 1 || toClusters.length > 1) {
          const clusterPairs = [];
          const topFrom = fromClusters.slice(0, 3);
          const topTo = toClusters.slice(0, 3);

          for (const f of topFrom) {
            for (const t of topTo) {
              if (f === fromCode && t === toCode) continue;
              clusterPairs.push({ from: f, to: t });
            }
          }

          const headers = { Accept: 'application/json' };
          if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey.trim()}`;
            headers['X-API-Key'] = apiKey.trim();
          }

          // Query up to 6 most relevant cluster station pairs concurrently
          const queries = clusterPairs.slice(0, 6).map(async ({ from: f, to: t }) => {
            try {
              if (fetchFn === globalThis.fetch) {
                const cRes = await railRadarAdapter.searchDirectTrains(f, t, {
                  timeoutMs: Math.min(options.timeoutMs || this.timeoutMs, 4000),
                });
                return cRes.trains || [];
              }
              const cUrl = `${apiUrl.replace(/\/$/, '')}/trains/between/${encodeURIComponent(f)}/${encodeURIComponent(t)}`;
              const cRes = await httpFetch(cUrl, {
                method: 'GET',
                headers,
                timeoutMs: Math.min(options.timeoutMs || this.timeoutMs, 4000),
                provider: 'rail',
                fetchFn,
              });
              return this.extractTrains(cRes.data) || [];
            } catch {
              return [];
            }
          });

          const clusterResults = await Promise.allSettled(queries);
          const trainMap = new Map();

          for (const cr of clusterResults) {
            if (cr.status === 'fulfilled' && Array.isArray(cr.value)) {
              for (const tr of cr.value) {
                const num = String(tr.train?.number || tr.trainNumber || tr.number || '');
                if (num && !trainMap.has(num)) {
                  trainMap.set(num, tr);
                }
              }
            }
          }

          if (trainMap.size > 0) {
            trainList = Array.from(trainMap.values());
          }
        }
      }

      if (trainList.length === 0) {
        return this.empty(rawResponse, { durationMs: Date.now() - startTime });
      }

      // Convert valid train items into provider candidates
      const candidates = [];
      const parsedDepDate = departureDate instanceof Date ? departureDate : new Date(departureDate);
      const year = !isNaN(parsedDepDate.getTime()) ? parsedDepDate.getUTCFullYear() : 2026;
      const month = !isNaN(parsedDepDate.getTime()) ? parsedDepDate.getUTCMonth() : 9;
      const day = !isNaN(parsedDepDate.getTime()) ? parsedDepDate.getUTCDate() : 1;

      for (const item of trainList) {
        const trainNum = String(item.train?.number || item.trainNumber || item.number || '12001');
        const trainName = item.train?.name || item.trainName || item.name || 'Express Train';
        const trainType = item.train?.type || item.type || 'Express';

        const depStr = String(
          item.from?.departure || item.departureTime || item.journeySegment?.departureTime || '06:00'
        );
        const arrStr = String(
          item.to?.arrival || item.arrivalTime || item.journeySegment?.arrivalTime || '12:00'
        );

        let explicitDayOffset = null;
        if (item.to?.day && item.from?.day && item.to.day > item.from.day) {
          explicitDayOffset = item.to.day - item.from.day;
        }

        const timing = calculateJourneyTiming(
          depStr,
          arrStr,
          departureDate,
          explicitDayOffset,
          item.duration
        );

        const depTime = timing.departureTime;
        const arrTime = timing.arrivalTime;
        const durationMinutes = timing.durationMinutes;

        const distanceKm = Math.round(Number(item.distance) || 750);

        // Verified fare handling: never fabricate prices from distance/speed assumptions
        const classFare = item.fares ? (item.fares['3A'] || item.fares['CC'] || Object.values(item.fares)[0]) : undefined;
        const rawFare = classFare !== undefined ? classFare : (item.price !== undefined ? item.price : item.fare);
        const baseFare = Number(rawFare);
        const hasVerifiedFare = !isNaN(baseFare) && baseFare > 0;
        const totalFare = hasVerifiedFare ? baseFare * Number(passengers || 1) : null;

        const fromStationName =
          item.from?.name || item.from?.code || origin?.name || origin?.city || 'Station A';
        const toStationName =
          item.to?.name || item.to?.code || destination?.name || destination?.city || 'Station B';

        const resolvedOriginRef = origin?.id || origin?._id || origin?.name || origin?.city || fromStationName;
        const resolvedDestRef = destination?.id || destination?._id || destination?.name || destination?.city || toStationName;

        candidates.push({
          origin: resolvedOriginRef,
          destination: resolvedDestRef,
          departureTime: depTime,
          arrivalTime: arrTime,
          departureTimeFormatted: timing.departureLocalTime,
          arrivalTimeFormatted: timing.arrivalLocalTime,
          departureDateFormatted: timing.departureLocalDate,
          arrivalDateFormatted: timing.arrivalLocalDate,
          dayOffset: timing.dayOffset,
          duration: durationMinutes,
          totalDistance: distanceKm,
          totalPrice: totalFare,
          currency: (item.currency || 'INR').toUpperCase(),
          numberOfTransfers: 0,
          transportModes: ['rail'],
          status: 'scheduled',
          source: 'rail',
          providerCode: this.code,
          metadata: {
            source: 'rail',
            provider: this.name,
            trainNumber: trainNum,
            trainName: trainName,
            trainType: trainType,
            fromStation: fromStationName,
            toStation: toStationName,
            runDays: item.train?.runDays || item.runDays || [],
            isFareAvailable: hasVerifiedFare,
            isEstimatedPrice: false,
          },
          legs: [
            {
              sequence: 1,
              origin: resolvedOriginRef,
              destination: resolvedDestRef,
              mode: 'rail',
              providerCode: this.code,
              departureTime: depTime,
              arrivalTime: arrTime,
              departureTimeFormatted: timing.departureLocalTime,
              arrivalTimeFormatted: timing.arrivalLocalTime,
              departureDateFormatted: timing.departureLocalDate,
              arrivalDateFormatted: timing.arrivalLocalDate,
              dayOffset: timing.dayOffset,
              duration: durationMinutes,
              distance: distanceKm,
              price: totalFare,
              currency: (item.currency || 'INR').toUpperCase(),
              vehicle: {
                type: 'Train',
                identifier: trainNum,
              },
              service: {
                name: trainName,
                operator: item.operator || 'Indian Railways',
                class: item.class || '3A',
                type: trainType,
              },
              booking: {
                status: item.bookingStatus || 'available',
                reference: item.pnr || `IRCTC-${trainNum}`,
              },
              metadata: {
                classes: item.classes || ['SL', '3A', '2A', '1A'],
                halts: item.totalHaltsBetween ?? null,
                fromStation: fromStationName,
                toStation: toStationName,
              },
            },
          ],
        });
      }

      return this.success(candidates, rawResponse, {
        durationMs: Date.now() - startTime,
        trainCount: candidates.length,
      });
    } catch (err) {
      if (err instanceof ProviderError) {
        return this.failed(err, rawResponse, { durationMs: Date.now() - startTime });
      }
      return this.failed(
        new ProviderError(err.message, {
          provider: 'rail',
          code: 'PROVIDER_ERROR',
          statusCode: 500,
        }),
        rawResponse,
        { durationMs: Date.now() - startTime }
      );
    }
  }
}

export const railTransportProvider = new RailTransportProvider();
export default railTransportProvider;
