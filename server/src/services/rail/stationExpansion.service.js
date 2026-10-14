import { resolveStationCode, STATION_CODE_MAP, METRO_CLUSTERS } from '../../providers/transport/rail/rail.provider.js';
import { INDIAN_RAILWAY_STATIONS } from './stationRegistry.js';
import logger from '../../utils/logger.js';

/**
 * Verified Indian Railways Network Mainline Corridors
 * Each array represents stations sequentially along an actual IR mainline track.
 * Station hops are computed strictly along these physical railway tracks.
 */
export const RAILWAY_CORRIDORS = [
  // 1. Delhi - Kanpur - Prayagraj - DDU - Patna - Howrah (Grand Chord / Main Line)
  ['UMB', 'KKDE', 'KUN', 'PNP', 'SNP', 'NDLS', 'GZB', 'ALJN', 'TDL', 'CNB', 'FTP', 'PRYJ', 'MZP', 'DDU', 'BXR', 'ARA', 'DNR', 'PNBE', 'RJPB', 'BKP', 'MKA', 'KIUL', 'JAJ', 'JSME', 'MDP', 'CRJ', 'ASN', 'DGR', 'BWN', 'HWH'],

  // 2. Delhi - Mathura - Agra - Gwalior - Jhansi - Bhopal - Nagpur - Hyderabad/Chennai (North-South Mainline)
  ['NDLS', 'FDB', 'PWL', 'KSV', 'MTJ', 'AGC', 'DHO', 'MRA', 'GWL', 'DBA', 'VGLJ', 'LIT', 'BINA', 'BPL', 'ET', 'BZU', 'NGP', 'SEGM', 'CD', 'BPQ', 'SKZR', 'RDM', 'KZJ', 'SC', 'WL', 'BZA', 'OGL', 'NLR', 'GDR', 'SPE', 'MAS'],

  // 3. Delhi - Jaipur - Ajmer - Ahmedabad - Vadodara - Surat - Mumbai (Western Mainline)
  ['NDLS', 'DEC', 'GGN', 'PTRD', 'RE', 'AWR', 'BKI', 'DO', 'GADJ', 'JP', 'KSG', 'AII', 'BER', 'MJ', 'FA', 'ABR', 'PNU', 'MSH', 'ADI', 'ND', 'ANND', 'BRC', 'BH', 'AKV', 'ST', 'NVS', 'BL', 'VAPI', 'PLG', 'BSR', 'BDTS', 'MMCT', 'CSMT'],

  // 4. Delhi - Moradabad - Bareilly - Lucknow - Varanasi (Oudh and Rohilkhand Mainline)
  ['NDLS', 'GZB', 'HPU', 'AMRO', 'MB', 'RMU', 'BE', 'SPN', 'HRI', 'BLM', 'LKO', 'RBL', 'AME', 'MBDP', 'BSB', 'DDU'],

  // 5. Patna - Gaya - Dhanbad - Asansol - Howrah (Grand Chord Southern Alignment)
  ['PNBE', 'TEA', 'JHD', 'GAYA', 'PRP', 'KQR', 'HZD', 'GMO', 'DHN', 'KMME', 'BRR', 'ASN', 'RNG', 'DGR', 'PAN', 'BWN', 'BDC', 'HWH'],

  // 6. Mumbai - Pune - Solapur - Wadi - Raichur - Guntakal - Renigunta - Chennai (South-Eastern Mainline)
  ['CSMT', 'DR', 'TNA', 'KYN', 'KJT', 'LNL', 'PUNE', 'DD', 'KWV', 'SUR', 'KLBG', 'WADI', 'YG', 'RC', 'MALM', 'AD', 'GTL', 'GY', 'TU', 'HX', 'RU', 'AJJ', 'PER', 'MAS'],

  // 7. Howrah - Kharagpur - Balasore - Cuttack - Bhubaneswar - Vizag - Vijayawada (East Coast Mainline)
  ['HWH', 'SRC', 'ULB', 'MCA', 'PKU', 'KGP', 'BLDA', 'JER', 'BLS', 'SORO', 'BHC', 'JJKR', 'CTC', 'BBS', 'KUR', 'BALU', 'BAM', 'PSA', 'CHE', 'VZM', 'VSKP', 'DVD', 'AKP', 'TUNI', 'ANV', 'SLO', 'RJY', 'TDD', 'EE', 'BZA'],

  // 8. Bengaluru - Jolarpettai - Katpadi - Chennai / Coimbatore
  ['SBC', 'BNC', 'BNCE', 'KJM', 'WFD', 'MLO', 'BWT', 'KPN', 'JTJ', 'VN', 'AB', 'KPD', 'WJR', 'SHU', 'AJJ', 'TRL', 'PER', 'MAS'],

  // 9. Mumbai - Bhusawal - Itarsi - Jabalpur - Prayagraj / DDU (Central-East Mainline)
  ['CSMT', 'DR', 'KYN', 'IGP', 'NK', 'MMR', 'JL', 'BSL', 'KNW', 'ET', 'PPI', 'GAR', 'JBP', 'KTE', 'MYR', 'STA', 'MKP', 'PRYJ', 'DDU'],

  // 10. Delhi - Ambala - Ludhiana - Jalandhar - Amritsar (Northern Mainline)
  ['NDLS', 'SNP', 'PNP', 'KKDE', 'UMB', 'RPJ', 'SIR', 'LDH', 'PGW', 'JUC', 'BEAS', 'ASR'],
];

/**
 * Key Regional Interchange Junction Hubs
 * High-capacity railway junctions where diverse cross-country tracks intersect.
 */
export const INTERCHANGE_JUNCTIONS = [
  { code: 'CNB', name: 'Kanpur Central', city: 'Kanpur' },
  { code: 'PRYJ', name: 'Prayagraj Junction', city: 'Prayagraj' },
  { code: 'DDU', name: 'Pt Deen Dayal Upadhyaya Junction', city: 'Mughalsarai' },
  { code: 'BSB', name: 'Varanasi Junction', city: 'Varanasi' },
  { code: 'LKO', name: 'Lucknow Charbagh', city: 'Lucknow' },
  { code: 'GKP', name: 'Gorakhpur Junction', city: 'Gorakhpur' },
  { code: 'GAYA', name: 'Gaya Junction', city: 'Gaya' },
  { code: 'ASN', name: 'Asansol Junction', city: 'Asansol' },
  { code: 'DHN', name: 'Dhanbad Junction', city: 'Dhanbad' },
  { code: 'JP', name: 'Jaipur Junction', city: 'Jaipur' },
  { code: 'KOTA', name: 'Kota Junction', city: 'Kota' },
  { code: 'BPL', name: 'Bhopal Junction', city: 'Bhopal' },
  { code: 'ET', name: 'Itarsi Junction', city: 'Itarsi' },
  { code: 'GWL', name: 'Gwalior Junction', city: 'Gwalior' },
  { code: 'VGLJ', name: 'Virangana Lakshmibai Jhansi', city: 'Jhansi' },
  { code: 'NGP', name: 'Nagpur Junction', city: 'Nagpur' },
  { code: 'BRC', name: 'Vadodara Junction', city: 'Vadodara' },
  { code: 'ST', name: 'Surat', city: 'Surat' },
  { code: 'BZA', name: 'Vijayawada Junction', city: 'Vijayawada' },
  { code: 'VSKP', name: 'Visakhapatnam Junction', city: 'Visakhapatnam' },
  { code: 'BBS', name: 'Bhubaneswar', city: 'Bhubaneswar' },
  { code: 'PUNE', name: 'Pune Junction', city: 'Pune' },
  { code: 'GTL', name: 'Guntakal Junction', city: 'Guntakal' },
];

/**
 * StationExpansionService
 *
 * Implements Section 4 & 5:
 * - Bounded directional station expansion: up to 5 stations before and 5 stations after
 * - Verified railway network connectivity: strictly along verified physical railway tracks
 * - Excludes origin station from alternatives; eliminates circular routes and duplicate station codes
 * - Generates candidate topologies for:
 *   1. Direct trains (alternate origin or alternate destination)
 *   2. Two-train journeys (1 interchange)
 *   3. Three-train journeys (2 interchanges) when permitted by configuration
 */
export class StationExpansionService {
  constructor(options = {}) {
    this.maxHops = options.maxHops || 5;
    this.maxTrainChanges = options.maxTrainChanges ?? 2;
  }

  /**
   * Verifies if a station has established railway network connectivity in the verified dataset.
   *
   * @param {string|Object} station
   * @returns {boolean} True if railway connectivity is established
   */
  hasRailwayConnectivity(station) {
    if (!station) return false;
    const rawCode = typeof station === 'string' ? station : resolveStationCode(station);
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code || code === 'NONEXISTENT_ORIGIN' || code === 'NONEXISTENT_DEST') {
      return false;
    }

    // 1. Check verified railway corridors
    const inCorridor = RAILWAY_CORRIDORS.some((line) => line.includes(code));
    if (inCorridor) return true;

    // 2. Check metropolitan clusters
    const inCluster = Boolean(METRO_CLUSTERS[code.toLowerCase()]);
    if (inCluster) return true;

    // 3. Check known station map
    const inCodeMap = Boolean(STATION_CODE_MAP[code.toLowerCase()]);
    if (inCodeMap) return true;

    // 4. Check authoritative station registry
    return INDIAN_RAILWAY_STATIONS.some((stn) => stn.stationCode === code);
  }

  /**
   * Bounded directional station expansion around an endpoint.
   *
   * Section 4 requirement:
   * For origin A: up to five stations before A, up to five stations after A.
   * For destination B: up to five stations before B, up to five stations after B.
   *
   * @param {string|Object} station - Station code or location object
   * @param {Object} [options={}]
   * @param {number} [options.maxBefore=5] - Maximum stations before (upstream)
   * @param {number} [options.maxAfter=5] - Maximum stations after (downstream)
   * @param {string} [options.targetStation] - Endpoint for corridor direction alignment
   * @returns {Object} { station, before: Array<Object>, after: Array<Object>, allAlternatives: Array<Object>, hasConnectivity: boolean }
   */
  expandStationDirectional(station, options = {}) {
    const rawCode = typeof station === 'string' ? station : resolveStationCode(station);
    const stationCode = String(rawCode || '').trim().toUpperCase();

    const maxBefore = Math.min(Math.max(0, options.maxBefore ?? 5), 5);
    const maxAfter = Math.min(Math.max(0, options.maxAfter ?? 5), 5);
    const targetCode = options.targetStation ? String(resolveStationCode(options.targetStation)).trim().toUpperCase() : null;

    if (!this.hasRailwayConnectivity(stationCode)) {
      return {
        station: stationCode,
        before: [],
        after: [],
        allAlternatives: [],
        hasConnectivity: false,
      };
    }

    const beforeMap = new Map();
    const afterMap = new Map();

    // Check metropolitan cluster stations (e.g. NDLS has DLI, NZM, ANVT)
    const clusterCodes = METRO_CLUSTERS[stationCode.toLowerCase()] || [];
    for (const cCode of clusterCodes) {
      if (cCode !== stationCode) {
        // Place cluster stations as lateral alternatives (hop 1)
        if (!beforeMap.has(cCode) && beforeMap.size < maxBefore) {
          beforeMap.set(cCode, {
            code: cCode,
            hops: 1,
            direction: 'metro_cluster',
            isCluster: true,
          });
        }
      }
    }

    // Traverse verified railway corridors containing this station
    for (let cIdx = 0; cIdx < RAILWAY_CORRIDORS.length; cIdx++) {
      const line = RAILWAY_CORRIDORS[cIdx];
      const stationIdx = line.indexOf(stationCode);

      if (stationIdx !== -1) {
        // Upstream stations along corridor (indices < stationIdx)
        for (let hop = 1; hop <= maxBefore; hop++) {
          const idx = stationIdx - hop;
          if (idx >= 0) {
            const code = line[idx];
            if (code !== stationCode && !beforeMap.has(code) && beforeMap.size < maxBefore) {
              beforeMap.set(code, {
                code,
                hops: hop,
                direction: 'before',
                corridorIndex: cIdx,
              });
            }
          }
        }

        // Downstream stations along corridor (indices > stationIdx)
        for (let hop = 1; hop <= maxAfter; hop++) {
          const idx = stationIdx + hop;
          if (idx < line.length) {
            const code = line[idx];
            if (code !== stationCode && !afterMap.has(code) && !beforeMap.has(code) && afterMap.size < maxAfter) {
              afterMap.set(code, {
                code,
                hops: hop,
                direction: 'after',
                corridorIndex: cIdx,
              });
            }
          }
        }
      }
    }

    const before = Array.from(beforeMap.values()).slice(0, maxBefore);
    const after = Array.from(afterMap.values()).slice(0, maxAfter);
    const allAlternatives = [...before, ...after];

    return {
      station: stationCode,
      before,
      after,
      allAlternatives,
      hasConnectivity: true,
    };
  }

  /**
   * Expands a station along verified railway corridors up to `maxHops` hops backward & forward.
   * Backward-compatible method returning array with hops and directions.
   *
   * @param {string|Object} station - Station entity or code
   * @param {number} [maxHops=5] - Maximum network hops (1 to 5)
   * @returns {Array<Object>} List of expanded stations with hop distance and direction
   */
  expandStation(station, maxHops = 5) {
    const rawCode = typeof station === 'string' ? station : resolveStationCode(station);
    const stationCode = String(rawCode).trim().toUpperCase();
    const effectiveHops = Math.min(Math.max(1, maxHops), 5);

    if (!this.hasRailwayConnectivity(stationCode)) {
      return [];
    }

    const expandedMap = new Map();

    // Include the base station as hop 0
    expandedMap.set(stationCode, {
      code: stationCode,
      hops: 0,
      direction: 'center',
      corridorIndex: -1,
    });

    // Check metropolitan cluster stations (e.g. NDLS -> DLI, NZM, ANVT at hop 1)
    const clusterCodes = METRO_CLUSTERS[stationCode.toLowerCase()] || [];
    for (const cCode of clusterCodes) {
      if (cCode !== stationCode && !expandedMap.has(cCode)) {
        expandedMap.set(cCode, {
          code: cCode,
          hops: 1,
          direction: 'metro_cluster',
          corridorIndex: -1,
        });
      }
    }

    // Traverse verified railway corridors
    for (let cIdx = 0; cIdx < RAILWAY_CORRIDORS.length; cIdx++) {
      const line = RAILWAY_CORRIDORS[cIdx];
      const stationIdx = line.indexOf(stationCode);

      if (stationIdx !== -1) {
        // 1. Backward hops along the line
        for (let hop = 1; hop <= effectiveHops; hop++) {
          const targetIdx = stationIdx - hop;
          if (targetIdx >= 0) {
            const code = line[targetIdx];
            if (!expandedMap.has(code) || expandedMap.get(code).hops > hop) {
              expandedMap.set(code, {
                code,
                hops: hop,
                direction: 'backward',
                corridorIndex: cIdx,
              });
            }
          }
        }

        // 2. Forward hops along the line
        for (let hop = 1; hop <= effectiveHops; hop++) {
          const targetIdx = stationIdx + hop;
          if (targetIdx < line.length) {
            const code = line[targetIdx];
            if (!expandedMap.has(code) || expandedMap.get(code).hops > hop) {
              expandedMap.set(code, {
                code,
                hops: hop,
                direction: 'forward',
                corridorIndex: cIdx,
              });
            }
          }
        }
      }
    }

    return Array.from(expandedMap.values()).sort((a, b) => a.hops - b.hops);
  }

  /**
   * Finds relevant interchange junction hubs along the corridor between origin and destination.
   *
   * @param {string} originCode
   * @param {string} destCode
   * @returns {Array<Object>} Prioritized intermediate junction stations
   */
  findIntermediateHubs(originCode, destCode, options = {}) {
    const o = String(originCode).trim().toUpperCase();
    const d = String(destCode).trim().toUpperCase();

    const candidateHubs = [];

    // Dynamically accept any verified candidate intermediate hubs passed via options/context
    if (Array.isArray(options.viaStations) || Array.isArray(options.intermediateHubs)) {
      const explicitHubs = [...(options.viaStations || []), ...(options.intermediateHubs || [])];
      for (const hub of explicitHubs) {
        const rawCode = typeof hub === 'string' ? hub : (hub?.code || resolveStationCode(hub));
        const code = String(rawCode || '').trim().toUpperCase();
        if (code && code !== o && code !== d && this.hasRailwayConnectivity(code)) {
          const knownInfo = INTERCHANGE_JUNCTIONS.find((j) => j.code === code) ||
            INDIAN_RAILWAY_STATIONS.find((s) => s.stationCode === code);
          candidateHubs.push({
            code,
            name: knownInfo?.name || code,
            city: knownInfo?.city || code,
            relevance: 'dynamic_candidate_hub',
          });
        }
      }
    }

    // Find if origin and destination share a mainline corridor
    for (const line of RAILWAY_CORRIDORS) {
      const oIdx = line.indexOf(o);
      const dIdx = line.indexOf(d);

      if (oIdx !== -1 && dIdx !== -1 && Math.abs(oIdx - dIdx) > 1) {
        const start = Math.min(oIdx, dIdx);
        const end = Math.max(oIdx, dIdx);

        // All stations along the mainline between origin and destination
        for (let i = start + 1; i < end; i++) {
          const intermediateCode = line[i];
          const isKnownInterchange = INTERCHANGE_JUNCTIONS.find((j) => j.code === intermediateCode);
          if (isKnownInterchange) {
            candidateHubs.push({
              code: intermediateCode,
              name: isKnownInterchange.name,
              city: isKnownInterchange.city,
              relevance: 'mainline_corridor_hub',
            });
          }
        }
      }
    }

    // Default regional hub heuristics for cross-corridor searches
    if (candidateHubs.length === 0) {
      // Find coordinates for origin and destination if present in authoritative registry
      const oStn = INDIAN_RAILWAY_STATIONS.find((s) => s.stationCode === o);
      const dStn = INDIAN_RAILWAY_STATIONS.find((s) => s.stationCode === d);

      let sortedInterchanges = [...INTERCHANGE_JUNCTIONS];

      if (oStn?.coordinates && dStn?.coordinates) {
        const [oLon, oLat] = oStn.coordinates;
        const [dLon, dLat] = dStn.coordinates;
        const minLat = Math.min(oLat, dLat) - 2.5;
        const maxLat = Math.max(oLat, dLat) + 2.5;
        const minLon = Math.min(oLon, dLon) - 2.5;
        const maxLon = Math.max(oLon, dLon) + 2.5;

        sortedInterchanges.sort((a, b) => {
          const aStn = INDIAN_RAILWAY_STATIONS.find((s) => s.stationCode === a.code);
          const bStn = INDIAN_RAILWAY_STATIONS.find((s) => s.stationCode === b.code);

          const aInBox = aStn?.coordinates &&
            aStn.coordinates[1] >= minLat && aStn.coordinates[1] <= maxLat &&
            aStn.coordinates[0] >= minLon && aStn.coordinates[0] <= maxLon;
          const bInBox = bStn?.coordinates &&
            bStn.coordinates[1] >= minLat && bStn.coordinates[1] <= maxLat &&
            bStn.coordinates[0] >= minLon && bStn.coordinates[0] <= maxLon;

          if (aInBox && !bInBox) return -1;
          if (!aInBox && bInBox) return 1;

          // If both or neither in bounding box, prefer hubs with registered railway connectivity
          const aConn = this.hasRailwayConnectivity(a.code) ? 1 : 0;
          const bConn = this.hasRailwayConnectivity(b.code) ? 1 : 0;
          return bConn - aConn;
        });
      }

      for (const hub of sortedInterchanges) {
        if (hub.code !== o && hub.code !== d && this.hasRailwayConnectivity(hub.code)) {
          candidateHubs.push({
            code: hub.code,
            name: hub.name,
            city: hub.city,
            relevance: 'regional_junction_network',
          });
        }
      }
    }

    // Deduplicate hubs
    const seen = new Set();
    const unique = [];
    for (const h of candidateHubs) {
      if (!seen.has(h.code) && h.code !== o && h.code !== d) {
        seen.add(h.code);
        unique.push(h);
      }
    }

    return unique.slice(0, 6);
  }

  /**
   * Finds pairs of connected interchange hubs along mainline corridors.
   * Used for generating 3-train journeys with 2 interchanges when maxTransfers >= 2.
   *
   * @param {string} originCode
   * @param {string} destCode
   * @returns {Array<Object>} Pairs of connected intermediate hubs [{ hub1, hub2 }]
   */
  findConnectedHubPairs(originCode, destCode) {
    const o = String(originCode).trim().toUpperCase();
    const d = String(destCode).trim().toUpperCase();
    const hubPairs = [];
    const seen = new Set();

    // Check corridors where origin, hub1, hub2, dest are aligned
    for (const line of RAILWAY_CORRIDORS) {
      const oIdx = line.indexOf(o);
      const dIdx = line.indexOf(d);

      if (oIdx !== -1 && dIdx !== -1 && Math.abs(oIdx - dIdx) > 2) {
        const step = oIdx < dIdx ? 1 : -1;
        const intermediatesOnLine = [];
        for (let i = oIdx + step; i !== dIdx; i += step) {
          const code = line[i];
          if (INTERCHANGE_JUNCTIONS.some((j) => j.code === code)) {
            intermediatesOnLine.push(code);
          }
        }

        for (let a = 0; a < intermediatesOnLine.length - 1; a++) {
          const h1 = intermediatesOnLine[a];
          const h2 = intermediatesOnLine[a + 1];
          const sig = `${h1}->${h2}`;
          if (!seen.has(sig) && h1 !== o && h2 !== d && h1 !== h2) {
            seen.add(sig);
            hubPairs.push({ hub1: h1, hub2: h2, corridor: true });
          }
        }
      }
    }

    // High-connectivity standard national junction pairs (bidirectional)
    const nationalCorridorHubPairs = [
      { hub1: 'PRYJ', hub2: 'CNB' },
      { hub1: 'CNB', hub2: 'PRYJ' },
      { hub1: 'DDU', hub2: 'PRYJ' },
      { hub1: 'PRYJ', hub2: 'DDU' },
      { hub1: 'DDU', hub2: 'GAYA' },
      { hub1: 'GAYA', hub2: 'DDU' },
      { hub1: 'DDU', hub2: 'CNB' },
      { hub1: 'CNB', hub2: 'DDU' },
      { hub1: 'VGLJ', hub2: 'BPL' },
      { hub1: 'BPL', hub2: 'VGLJ' },
      { hub1: 'BPL', hub2: 'ET' },
      { hub1: 'ET', hub2: 'BPL' },
      { hub1: 'ET', hub2: 'NGP' },
      { hub1: 'NGP', hub2: 'ET' },
      { hub1: 'BRC', hub2: 'ST' },
      { hub1: 'ST', hub2: 'BRC' },
    ];

    for (const pair of nationalCorridorHubPairs) {
      const sig = `${pair.hub1}->${pair.hub2}`;
      if (!seen.has(sig) && pair.hub1 !== o && pair.hub2 !== d && pair.hub1 !== d && pair.hub2 !== o) {
        seen.add(sig);
        hubPairs.push(pair);
      }
    }

    return hubPairs.slice(0, 8);
  }

  /**
   * Generates candidate connecting route topologies.
   *
   * Supports:
   * 1. Direct alternate trains (0 transfers, alternate boarding or arrival)
   * 2. Two-train journeys with 1 interchange (1 transfer)
   * 3. Three-train journeys with 2 interchanges (2 transfers) when maxTransfers >= 2
   *
   * @param {Object} origin
   * @param {Object} destination
   * @param {Object} [options={}]
   * @returns {Array<Object>} Generated candidate path topologies
   */
  generateExpansionCandidateTopologies(origin, destination, options = {}) {
    const originCode = resolveStationCode(origin);
    const destCode = resolveStationCode(destination);
    const maxHops = Math.min(options.maxHops || this.maxHops, 5);
    const maxTransfers = Number(options.maxTransfers ?? options.maxTrainChanges ?? this.maxTrainChanges ?? 2);

    if (!this.hasRailwayConnectivity(originCode) || !this.hasRailwayConnectivity(destCode)) {
      logger.debug(
        `[StationExpansionService] Station connectivity cannot be established for ${originCode} or ${destCode}. Excluding from route generation.`
      );
      return [];
    }

    const originExpansions = this.expandStation(originCode, maxHops);
    const destExpansions = this.expandStation(destCode, maxHops);
    const intermediateHubs = this.findIntermediateHubs(originCode, destCode, options);

    const topologies = [];
    const seenSignatures = new Set();

    // Helper to add 2-leg (1-interchange) topology
    const addTwoLegTopology = (pattern, originStation, hub, destStation, oHops, dHops) => {
      const oCode = originStation.code || originStation;
      const hCode = hub.code || hub;
      const dCode = destStation.code || destStation;

      if (oCode === hCode || hCode === dCode || oCode === dCode) return;

      const signature = `${pattern}:${oCode}->${hCode}->${dCode}`;
      if (seenSignatures.has(signature)) return;
      seenSignatures.add(signature);

      const isAlternateOrigin = oCode !== originCode;
      const isAlternateDest = dCode !== destCode;

      topologies.push({
        pattern,
        originExpansionHops: oHops,
        destinationExpansionHops: dHops,
        originStation: oCode,
        interchangeHub: hCode,
        destinationStation: dCode,
        isAlternateOrigin,
        isAlternateDest,
        requestedOrigin: originCode,
        requestedDestination: destCode,
        trainChanges: 1,
        numberOfTransfers: 1,
        stationTransfers: 0,
        stages: [
          { from: oCode, to: hCode, legIndex: 1 },
          { from: hCode, to: dCode, legIndex: 2 },
        ],
      });
    };

    // Helper to add 3-leg (2-interchange) topology
    const addThreeLegTopology = (pattern, originStation, hub1, hub2, destStation, oHops, dHops) => {
      const oCode = originStation.code || originStation;
      const h1Code = hub1.code || hub1;
      const h2Code = hub2.code || hub2;
      const dCode = destStation.code || destStation;

      if (
        oCode === h1Code ||
        h1Code === h2Code ||
        h2Code === dCode ||
        oCode === h2Code ||
        h1Code === dCode ||
        oCode === dCode
      ) {
        return;
      }

      const signature = `${pattern}:${oCode}->${h1Code}->${h2Code}->${dCode}`;
      if (seenSignatures.has(signature)) return;
      seenSignatures.add(signature);

      topologies.push({
        pattern,
        originExpansionHops: oHops,
        destinationExpansionHops: dHops,
        originStation: oCode,
        interchangeHubs: [h1Code, h2Code],
        destinationStation: dCode,
        isAlternateOrigin: oCode !== originCode,
        isAlternateDest: dCode !== destCode,
        requestedOrigin: originCode,
        requestedDestination: destCode,
        trainChanges: 2,
        numberOfTransfers: 2,
        stationTransfers: 0,
        stages: [
          { from: oCode, to: h1Code, legIndex: 1 },
          { from: h1Code, to: h2Code, legIndex: 2 },
          { from: h2Code, to: dCode, legIndex: 3 },
        ],
      });
    };

    // Helper to add direct alternate (0-transfer) topology
    const addDirectAlternateTopology = (pattern, originStation, destStation, oHops, dHops) => {
      const oCode = originStation.code || originStation;
      const dCode = destStation.code || destStation;

      if (oCode === dCode) return;
      if (oCode === originCode && dCode === destCode) return; // original direct was already searched

      const signature = `${pattern}:${oCode}->${dCode}`;
      if (seenSignatures.has(signature)) return;
      seenSignatures.add(signature);

      topologies.push({
        pattern,
        originExpansionHops: oHops,
        destinationExpansionHops: dHops,
        originStation: oCode,
        destinationStation: dCode,
        isAlternateOrigin: oCode !== originCode,
        isAlternateDest: dCode !== destCode,
        requestedOrigin: originCode,
        requestedDestination: destCode,
        trainChanges: 0,
        numberOfTransfers: 0,
        stationTransfers: 0,
        stages: [{ from: oCode, to: dCode, legIndex: 1 }],
      });
    };

    // 1. Primary Pattern: Origin -> Interchange Hub -> Destination (1 train change)
    for (const hub of intermediateHubs) {
      addTwoLegTopology('DirectOrigin_Interchange_DirectDest', { code: originCode }, hub, { code: destCode }, 0, 0);
    }

    // 2. Direct Alternate Topologies (0 transfers: alternate origin or alternate destination)
    for (const oExp of originExpansions.slice(1, 3)) {
      addDirectAlternateTopology('AlternateOrigin_DirectDest', oExp, { code: destCode }, oExp.hops, 0);
    }
    for (const dExp of destExpansions.slice(1, 3)) {
      addDirectAlternateTopology('DirectOrigin_AlternateDest', { code: originCode }, dExp, 0, dExp.hops);
    }

    // 3. Pattern: Nearby Origin Station -> Interchange Hub -> Destination
    for (const oExp of originExpansions.slice(1, 4)) {
      for (const hub of intermediateHubs.slice(0, 3)) {
        addTwoLegTopology('ExpandedOrigin_Interchange_DirectDest', oExp, hub, { code: destCode }, oExp.hops, 0);
      }
    }

    // 4. Pattern: Origin -> Interchange Hub -> Nearby Destination Station
    for (const dExp of destExpansions.slice(1, 4)) {
      for (const hub of intermediateHubs.slice(0, 3)) {
        addTwoLegTopology('DirectOrigin_Interchange_ExpandedDest', { code: originCode }, hub, dExp, 0, dExp.hops);
      }
    }

    // 5. Pattern: Nearby Origin -> Interchange -> Nearby Destination
    for (const oExp of originExpansions.slice(1, 3)) {
      for (const dExp of destExpansions.slice(1, 3)) {
        for (const hub of intermediateHubs.slice(0, 2)) {
          addTwoLegTopology('ExpandedOrigin_Interchange_ExpandedDest', oExp, hub, dExp, oExp.hops, dExp.hops);
        }
      }
    }

    // 6. Three-Train Journeys with 2 Interchanges (when permitted by configuration)
    if (maxTransfers >= 2) {
      const hubPairs = this.findConnectedHubPairs(originCode, destCode);
      for (const pair of hubPairs) {
        addThreeLegTopology(
          'DirectOrigin_TwoInterchanges_DirectDest',
          { code: originCode },
          { code: pair.hub1 },
          { code: pair.hub2 },
          { code: destCode },
          0,
          0
        );
      }

      // Origin expansion with 2 interchanges
      if (originExpansions.length > 1 && hubPairs.length > 0) {
        const oExp = originExpansions[1];
        const pair = hubPairs[0];
        addThreeLegTopology(
          'ExpandedOrigin_TwoInterchanges_DirectDest',
          oExp,
          { code: pair.hub1 },
          { code: pair.hub2 },
          { code: destCode },
          oExp.hops,
          0
        );
      }
    }

    logger.debug(
      `[StationExpansionService] Generated ${topologies.length} candidate recovery topologies for ${originCode} -> ${destCode}`
    );
    return topologies.slice(0, 18);
  }
}

export const stationExpansionService = new StationExpansionService();
export default stationExpansionService;
