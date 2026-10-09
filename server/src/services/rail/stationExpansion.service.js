import { resolveStationCode, STATION_CODE_MAP, METRO_CLUSTERS } from '../../providers/transport/rail/rail.provider.js';
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
 * Implements Section 4:
 * - 1 to 5 railway-network hops backward and forward along physical tracks
 * - Separates network hops from train changes:
 *   tracks `originExpansionHops`, `destinationExpansionHops`, `intermediateStations`, `trainChanges`
 * - Prioritizes real railway connectivity and route orientation over geographic radius
 */
export class StationExpansionService {
  constructor(options = {}) {
    this.maxHops = options.maxHops || 5;
    this.maxTrainChanges = options.maxTrainChanges || 2;
  }

  /**
   * Expands a station along verified railway corridors up to `maxHops` hops backward & forward.
   *
   * @param {string|Object} station - Station entity or code
   * @param {number} [maxHops=5] - Maximum network hops (1 to 5)
   * @returns {Array<Object>} List of expanded stations with hop distance and direction
   */
  expandStation(station, maxHops = 5) {
    const rawCode = typeof station === 'string' ? station : resolveStationCode(station);
    const stationCode = String(rawCode).trim().toUpperCase();
    const effectiveHops = Math.min(Math.max(1, maxHops), 5);

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
  findIntermediateHubs(originCode, destCode) {
    const o = String(originCode).trim().toUpperCase();
    const d = String(destCode).trim().toUpperCase();

    const candidateHubs = [];

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
      const topInterchanges = INTERCHANGE_JUNCTIONS.slice(0, 8);
      for (const hub of topInterchanges) {
        if (hub.code !== o && hub.code !== d) {
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
      if (!seen.has(h.code)) {
        seen.add(h.code);
        unique.push(h);
      }
    }

    return unique.slice(0, 6); // Limit to top 6 most relevant intermediate junctions
  }

  /**
   * Generates candidate connecting route topologies.
   *
   * Supports:
   * 1. Origin -> Interchange Hub -> Destination (1 train change)
   * 2. Origin -> Nearby Origin Station -> Interchange -> Destination
   * 3. Origin -> Interchange -> Nearby Destination Station -> Destination
   * 4. Nearby Origin Station -> Interchange -> Nearby Destination Station
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

    const originExpansions = this.expandStation(originCode, maxHops);
    const destExpansions = this.expandStation(destCode, maxHops);
    const intermediateHubs = this.findIntermediateHubs(originCode, destCode);

    const topologies = [];
    const seenSignatures = new Set();

    const addTopology = (pattern, originStation, hub, destStation, oHops, dHops) => {
      const signature = `${pattern}:${originStation.code}->${hub.code}->${destStation.code}`;
      if (seenSignatures.has(signature)) return;
      seenSignatures.add(signature);

      // Total train changes for Origin -> Hub -> Destination is 1 train change (2 trains)
      const isOriginSuburbanHop = originStation.code !== originCode;
      const isDestSuburbanHop = destStation.code !== destCode;
      const trainChanges = 1 + (isOriginSuburbanHop ? 1 : 0) + (isDestSuburbanHop ? 1 : 0);

      // Enforce max train changes constraint (default 2)
      if (trainChanges > this.maxTrainChanges) return;

      topologies.push({
        pattern,
        originExpansionHops: oHops,
        destinationExpansionHops: dHops,
        originStation: originStation.code,
        interchangeHub: hub.code,
        destinationStation: destStation.code,
        trainChanges,
        stationTransfers: 0,
        stages: [
          { from: originStation.code, to: hub.code, legIndex: 1 },
          { from: hub.code, to: destStation.code, legIndex: 2 },
        ],
      });
    };

    // Pattern 1: Direct Origin -> Interchange Hub -> Destination (0 expansion hops, 1 train change)
    for (const hub of intermediateHubs) {
      if (hub.code !== originCode && hub.code !== destCode) {
        addTopology('DirectOrigin_Interchange_DirectDest', { code: originCode }, hub, { code: destCode }, 0, 0);
      }
    }

    // Pattern 2: Nearby Origin Station (up to 5 hops) -> Interchange Hub -> Destination
    for (const oExp of originExpansions.slice(1, 4)) {
      for (const hub of intermediateHubs.slice(0, 3)) {
        if (hub.code !== oExp.code && hub.code !== destCode) {
          addTopology('ExpandedOrigin_Interchange_DirectDest', oExp, hub, { code: destCode }, oExp.hops, 0);
        }
      }
    }

    // Pattern 3: Origin -> Interchange Hub -> Nearby Destination Station (up to 5 hops)
    for (const dExp of destExpansions.slice(1, 4)) {
      for (const hub of intermediateHubs.slice(0, 3)) {
        if (hub.code !== originCode && hub.code !== dExp.code) {
          addTopology('DirectOrigin_Interchange_ExpandedDest', { code: originCode }, hub, dExp, 0, dExp.hops);
        }
      }
    }

    // Pattern 4: Nearby Origin -> Interchange -> Nearby Destination
    for (const oExp of originExpansions.slice(1, 3)) {
      for (const dExp of destExpansions.slice(1, 3)) {
        for (const hub of intermediateHubs.slice(0, 2)) {
          if (hub.code !== oExp.code && hub.code !== dExp.code) {
            addTopology('ExpandedOrigin_Interchange_ExpandedDest', oExp, hub, dExp, oExp.hops, dExp.hops);
          }
        }
      }
    }

    logger.debug(
      `[StationExpansionService] Generated ${topologies.length} candidate recovery topologies for ${originCode} -> ${destCode}`
    );
    return topologies.slice(0, 15); // Bounded candidate pipeline
  }
}

export const stationExpansionService = new StationExpansionService();
export default stationExpansionService;
