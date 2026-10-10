/**
 * Authoritative Indian Railways Station Registry
 * Maps canonical IRCTC station codes, full station names, metropolitan clusters,
 * cities, and states for high-accuracy IRCTC-style station autocomplete and search.
 */

export const INDIAN_RAILWAY_STATIONS = [
  // Delhi Hub (NDLS cluster)
  {
    stationCode: 'NDLS',
    name: 'NEW DELHI',
    displayName: 'NEW DELHI - NDLS',
    city: 'New Delhi',
    state: 'Delhi',
    aliases: ['delhi', 'new delhi', 'ndls', 'dilli', 'pahar ganj'],
    coordinates: [77.2195, 28.643],
    isMajorHub: true,
  },
  {
    stationCode: 'NZM',
    name: 'HAZRAT NIZAMUDDIN JN',
    displayName: 'HAZRAT NIZAMUDDIN JN - NZM',
    city: 'New Delhi',
    state: 'Delhi',
    aliases: ['nizamuddin', 'hazrat nizamuddin', 'nzm', 'delhi'],
    coordinates: [77.2536, 28.5888],
    isMajorHub: true,
  },
  {
    stationCode: 'ANVT',
    name: 'ANAND VIHAR TERMINAL',
    displayName: 'ANAND VIHAR TERMINAL - ANVT',
    city: 'New Delhi',
    state: 'Delhi',
    aliases: ['anand vihar', 'anvt', 'delhi'],
    coordinates: [77.3152, 28.6502],
    isMajorHub: true,
  },
  {
    stationCode: 'DLI',
    name: 'DELHI JN.',
    displayName: 'DELHI JN. - DLI',
    city: 'Delhi',
    state: 'Delhi',
    aliases: ['new delhi', 'old delhi', 'delhi jn', 'dli', 'purani dilli', 'delhi'],
    coordinates: [77.2307, 28.6617],
    isMajorHub: true,
  },
  {
    stationCode: 'DEE',
    name: 'DELHI SARAI ROHILLA',
    displayName: 'DELHI SARAI ROHILLA - DEE',
    city: 'Delhi',
    state: 'Delhi',
    aliases: ['new delhi', 'sarai rohilla', 'dee', 'delhi sarai rohilla', 'delhi'],
    coordinates: [77.1895, 28.6631],
    isMajorHub: false,
  },
  {
    stationCode: 'DEC',
    name: 'DELHI CANTT',
    displayName: 'DELHI CANTT - DEC',
    city: 'Delhi',
    state: 'Delhi',
    aliases: ['new delhi', 'delhi cantt', 'dec', 'cantonment', 'delhi'],
    coordinates: [77.1235, 28.5894],
    isMajorHub: false,
  },

  // Bengaluru Hub (SBC cluster)
  {
    stationCode: 'SBC',
    name: 'KSR BENGALURU',
    displayName: 'KSR BENGALURU - SBC',
    city: 'Bengaluru',
    state: 'Karnataka',
    aliases: ['bangalore', 'bengaluru', 'ksr bengaluru', 'bangalore city', 'sbc', 'majestic'],
    coordinates: [77.5701, 12.9781],
    isMajorHub: true,
  },
  {
    stationCode: 'BNC',
    name: 'BENGALURU CANT.',
    displayName: 'BENGALURU CANT. - BNC',
    city: 'Bengaluru',
    state: 'Karnataka',
    aliases: ['bangalore cantt', 'bengaluru cant', 'bnc', 'bangalore'],
    coordinates: [77.5962, 12.9937],
    isMajorHub: true,
  },
  {
    stationCode: 'BNCE',
    name: 'BENGALURU EAST',
    displayName: 'BENGALURU EAST - BNCE',
    city: 'Bengaluru',
    state: 'Karnataka',
    aliases: ['bangalore east', 'bengaluru east', 'bnce'],
    coordinates: [77.6186, 12.9983],
    isMajorHub: false,
  },
  {
    stationCode: 'SMVB',
    name: 'SMVT BENGALURU',
    displayName: 'SMVT BENGALURU - SMVB',
    city: 'Bengaluru',
    state: 'Karnataka',
    aliases: ['smvt', 'smvt bengaluru', 'visvesvaraya terminal', 'baiyappanahalli terminal', 'smvb'],
    coordinates: [77.6534, 13.0116],
    isMajorHub: true,
  },
  {
    stationCode: 'YPR',
    name: 'YESVANTPUR JN',
    displayName: 'YESVANTPUR JN - YPR',
    city: 'Bengaluru',
    state: 'Karnataka',
    aliases: ['yesvantpur', 'yeshwantpur', 'ypr', 'bangalore'],
    coordinates: [77.5501, 13.0234],
    isMajorHub: true,
  },

  // Varanasi Hub (BSB cluster)
  {
    stationCode: 'BSB',
    name: 'VARANASI JN',
    displayName: 'VARANASI JN - BSB',
    city: 'Varanasi',
    state: 'Uttar Pradesh',
    aliases: ['varanasi', 'varanasi junction', 'bsb', 'banaras', 'kashi'],
    coordinates: [82.9739, 25.3176],
    isMajorHub: true,
  },
  {
    stationCode: 'BSBS',
    name: 'BANARAS',
    displayName: 'BANARAS - BSBS',
    city: 'Varanasi',
    state: 'Uttar Pradesh',
    aliases: ['banaras', 'manduadih', 'bsbs', 'varanasi'],
    coordinates: [82.9644, 25.3101],
    isMajorHub: true,
  },
  {
    stationCode: 'DDU',
    name: 'PT DEEN DAYAL UPADHYAYA JN',
    displayName: 'PT DEEN DAYAL UPADHYAYA JN - DDU',
    city: 'Mughalsarai',
    state: 'Uttar Pradesh',
    aliases: ['mughalsarai', 'ddu', 'deen dayal upadhyaya', 'varanasi'],
    coordinates: [83.1167, 25.2833],
    isMajorHub: true,
  },

  // Prayagraj Hub (PRYJ cluster)
  {
    stationCode: 'PRYJ',
    name: 'PRAYAGRAJ JN',
    displayName: 'PRAYAGRAJ JN - PRYJ',
    city: 'Prayagraj',
    state: 'Uttar Pradesh',
    aliases: ['prayagraj', 'prayagraj junction', 'allahabad', 'pryj', 'ald'],
    coordinates: [81.8463, 25.4358],
    isMajorHub: true,
  },
  {
    stationCode: 'SFG',
    name: 'SUBEDARGANJ',
    displayName: 'SUBEDARGANJ - SFG',
    city: 'Prayagraj',
    state: 'Uttar Pradesh',
    aliases: ['subedarganj', 'sfg', 'prayagraj', 'allahabad'],
    coordinates: [81.7963, 25.4489],
    isMajorHub: false,
  },
  {
    stationCode: 'PCOI',
    name: 'PRAYAGRAJ CHHEOKI',
    displayName: 'PRAYAGRAJ CHHEOKI - PCOI',
    city: 'Prayagraj',
    state: 'Uttar Pradesh',
    aliases: ['chheoki', 'cheoki', 'pcoi', 'acoal', 'prayagraj', 'allahabad'],
    coordinates: [81.8842, 25.3905],
    isMajorHub: false,
  },

  // Patna Hub (PNBE cluster)
  {
    stationCode: 'PNBE',
    name: 'PATNA JN',
    displayName: 'PATNA JN - PNBE',
    city: 'Patna',
    state: 'Bihar',
    aliases: ['patna', 'patna junction', 'pnbe'],
    coordinates: [85.1376, 25.6022],
    isMajorHub: true,
  },
  {
    stationCode: 'DNR',
    name: 'DANAPUR',
    displayName: 'DANAPUR - DNR',
    city: 'Patna',
    state: 'Bihar',
    aliases: ['danapur', 'dnr', 'patna'],
    coordinates: [85.0441, 25.5898],
    isMajorHub: true,
  },
  {
    stationCode: 'PPTA',
    name: 'PATLIPUTRA',
    displayName: 'PATLIPUTRA - PPTA',
    city: 'Patna',
    state: 'Bihar',
    aliases: ['patliputra', 'ppta', 'patna'],
    coordinates: [85.0887, 25.6262],
    isMajorHub: true,
  },
  {
    stationCode: 'RJPB',
    name: 'RAJENDRA NAGAR TERMINAL',
    displayName: 'RAJENDRA NAGAR TERMINAL - RJPB',
    city: 'Patna',
    state: 'Bihar',
    aliases: ['rajendra nagar', 'rjpb', 'patna'],
    coordinates: [85.1672, 25.5968],
    isMajorHub: false,
  },

  // Mumbai Hub (CSMT cluster)
  {
    stationCode: 'CSMT',
    name: 'CHHATRAPATI SHIVAJI MAHARAJ TERMINUS',
    displayName: 'MUMBAI CSMT - CSMT',
    city: 'Mumbai',
    state: 'Maharashtra',
    aliases: ['mumbai csmt', 'csmt', 'vt', 'victoria terminus', 'mumbai'],
    coordinates: [72.8358, 18.9401],
    isMajorHub: true,
  },
  {
    stationCode: 'MMCT',
    name: 'MUMBAI CENTRAL',
    displayName: 'MUMBAI CENTRAL - MMCT',
    city: 'Mumbai',
    state: 'Maharashtra',
    aliases: ['mumbai central', 'mmct', 'bct', 'mumbai'],
    coordinates: [72.8193, 18.9696],
    isMajorHub: true,
  },
  {
    stationCode: 'BDTS',
    name: 'BANDRA TERMINUS',
    displayName: 'BANDRA TERMINUS - BDTS',
    city: 'Mumbai',
    state: 'Maharashtra',
    aliases: ['bandra terminus', 'bdts', 'bandra', 'mumbai'],
    coordinates: [72.8407, 19.0628],
    isMajorHub: true,
  },
  {
    stationCode: 'LTT',
    name: 'LOKMANYA TILAK TERMINUS',
    displayName: 'LOKMANYA TILAK TERMINUS - LTT',
    city: 'Mumbai',
    state: 'Maharashtra',
    aliases: ['ltt', 'kurla terminus', 'lokmanya tilak', 'mumbai'],
    coordinates: [72.8906, 19.0688],
    isMajorHub: true,
  },
  {
    stationCode: 'DR',
    name: 'DADAR',
    displayName: 'DADAR - DR',
    city: 'Mumbai',
    state: 'Maharashtra',
    aliases: ['dadar', 'dr', 'mumbai'],
    coordinates: [72.8436, 19.0182],
    isMajorHub: true,
  },
  {
    stationCode: 'TNA',
    name: 'THANE',
    displayName: 'THANE - TNA',
    city: 'Thane',
    state: 'Maharashtra',
    aliases: ['thane', 'tna', 'mumbai'],
    coordinates: [72.9781, 19.186],
    isMajorHub: false,
  },

  // Kolkata Hub (HWH cluster)
  {
    stationCode: 'HWH',
    name: 'HOWRAH JN',
    displayName: 'HOWRAH JN - HWH',
    city: 'Kolkata',
    state: 'West Bengal',
    aliases: ['howrah', 'howrah junction', 'hwh', 'kolkata', 'calcutta'],
    coordinates: [88.3426, 22.5839],
    isMajorHub: true,
  },
  {
    stationCode: 'SDAH',
    name: 'SEALDAH',
    displayName: 'SEALDAH - SDAH',
    city: 'Kolkata',
    state: 'West Bengal',
    aliases: ['sealdah', 'sdah', 'kolkata'],
    coordinates: [88.3713, 22.5671],
    isMajorHub: true,
  },
  {
    stationCode: 'SHM',
    name: 'SHALIMAR',
    displayName: 'SHALIMAR - SHM',
    city: 'Kolkata',
    state: 'West Bengal',
    aliases: ['shalimar', 'shm', 'howrah', 'kolkata'],
    coordinates: [88.3183, 22.5562],
    isMajorHub: false,
  },
  {
    stationCode: 'KOAA',
    name: 'KOLKATA TERMINAL',
    displayName: 'KOLKATA TERMINAL - KOAA',
    city: 'Kolkata',
    state: 'West Bengal',
    aliases: ['chitpur', 'kolkata', 'koaa'],
    coordinates: [88.3772, 22.6027],
    isMajorHub: false,
  },

  // Chennai Hub
  {
    stationCode: 'MAS',
    name: 'MGR CHENNAI CENTRAL',
    displayName: 'CHENNAI CENTRAL - MAS',
    city: 'Chennai',
    state: 'Tamil Nadu',
    aliases: ['chennai central', 'mas', 'madras central', 'chennai'],
    coordinates: [80.2757, 13.0827],
    isMajorHub: true,
  },
  {
    stationCode: 'MS',
    name: 'CHENNAI EGMORE',
    displayName: 'CHENNAI EGMORE - MS',
    city: 'Chennai',
    state: 'Tamil Nadu',
    aliases: ['chennai egmore', 'ms', 'egmore', 'chennai'],
    coordinates: [80.261, 13.0782],
    isMajorHub: true,
  },

  // Northern Trunk Line (Haryana / Punjab / UP)
  {
    stationCode: 'SNP',
    name: 'SONIPAT JN',
    displayName: 'SONIPAT JN - SNP',
    city: 'Sonipat',
    state: 'Haryana',
    aliases: ['sonipat', 'sonepat', 'snp'],
    coordinates: [77.0142, 28.9958],
    isMajorHub: true,
  },
  {
    stationCode: 'PNP',
    name: 'PANIPAT JN',
    displayName: 'PANIPAT JN - PNP',
    city: 'Panipat',
    state: 'Haryana',
    aliases: ['panipat', 'pnp'],
    coordinates: [76.9635, 29.3909],
    isMajorHub: false,
  },
  {
    stationCode: 'UMB',
    name: 'AMBALA CANTT JN',
    displayName: 'AMBALA CANTT - UMB',
    city: 'Ambala',
    state: 'Haryana',
    aliases: ['ambala', 'ambala cantt', 'umb'],
    coordinates: [76.8188, 30.3609],
    isMajorHub: true,
  },
  {
    stationCode: 'CDG',
    name: 'CHANDIGARH JN',
    displayName: 'CHANDIGARH - CDG',
    city: 'Chandigarh',
    state: 'Chandigarh',
    aliases: ['chandigarh', 'cdg'],
    coordinates: [76.8197, 30.7028],
    isMajorHub: true,
  },
  {
    stationCode: 'CNB',
    name: 'KANPUR CENTRAL',
    displayName: 'KANPUR CENTRAL - CNB',
    city: 'Kanpur',
    state: 'Uttar Pradesh',
    aliases: ['kanpur', 'kanpur central', 'cnb'],
    coordinates: [80.3319, 26.4499],
    isMajorHub: true,
  },
  {
    stationCode: 'LKO',
    name: 'LUCKNOW CHARBAGH',
    displayName: 'LUCKNOW CHARBAGH - LKO',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    aliases: ['lucknow', 'charbagh', 'lko'],
    coordinates: [80.9462, 26.8467],
    isMajorHub: true,
  },
  {
    stationCode: 'LJN',
    name: 'LUCKNOW JN',
    displayName: 'LUCKNOW JN - LJN',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    aliases: ['lucknow jn', 'ljn', 'lucknow'],
    coordinates: [80.9205, 26.8315],
    isMajorHub: false,
  },
  {
    stationCode: 'GKP',
    name: 'GORAKHPUR JN',
    displayName: 'GORAKHPUR JN - GKP',
    city: 'Gorakhpur',
    state: 'Uttar Pradesh',
    aliases: ['gorakhpur', 'gkp'],
    coordinates: [83.3732, 26.7606],
    isMajorHub: true,
  },
  {
    stationCode: 'AGC',
    name: 'AGRA CANTT',
    displayName: 'AGRA CANTT - AGC',
    city: 'Agra',
    state: 'Uttar Pradesh',
    aliases: ['agra', 'agra cantt', 'agc'],
    coordinates: [78.0081, 27.1591],
    isMajorHub: true,
  },
  {
    stationCode: 'JP',
    name: 'JAIPUR JN',
    displayName: 'JAIPUR JN - JP',
    city: 'Jaipur',
    state: 'Rajasthan',
    aliases: ['jaipur', 'jp', 'pink city'],
    coordinates: [75.7873, 26.9124],
    isMajorHub: true,
  },
  {
    stationCode: 'ADI',
    name: 'AHMEDABAD JN',
    displayName: 'AHMEDABAD JN - ADI',
    city: 'Ahmedabad',
    state: 'Gujarat',
    aliases: ['ahmedabad', 'adi', 'kalupur'],
    coordinates: [72.6006, 23.0233],
    isMajorHub: true,
  },
  {
    stationCode: 'PUNE',
    name: 'PUNE JN',
    displayName: 'PUNE JN - PUNE',
    city: 'Pune',
    state: 'Maharashtra',
    aliases: ['pune', 'pune junction'],
    coordinates: [73.8743, 18.5289],
    isMajorHub: true,
  },
  {
    stationCode: 'BPL',
    name: 'BHOPAL JN',
    displayName: 'BHOPAL JN - BPL',
    city: 'Bhopal',
    state: 'Madhya Pradesh',
    aliases: ['bhopal', 'bpl'],
    coordinates: [77.4126, 23.2599],
    isMajorHub: true,
  },
  {
    stationCode: 'RKMP',
    name: 'RANI KAMLAPATI',
    displayName: 'RANI KAMLAPATI - RKMP',
    city: 'Bhopal',
    state: 'Madhya Pradesh',
    aliases: ['habibganj', 'rkmp', 'rani kamlapati', 'bhopal'],
    coordinates: [77.4398, 23.2045],
    isMajorHub: false,
  },
  {
    stationCode: 'GAYA',
    name: 'GAYA JN',
    displayName: 'GAYA JN - GAYA',
    city: 'Gaya',
    state: 'Bihar',
    aliases: ['gaya', 'gaya jn'],
    coordinates: [84.9996, 24.7964],
    isMajorHub: true,
  },
];

/**
 * Searches the authoritative Indian Railways station registry.
 * Supports:
 * - Direct station code matching (e.g. "NDLS", "SBC", "BSB", "PRYJ")
 * - Case-insensitive station name prefix & substring matching
 * - City name cluster matching (e.g. "bengaluru" -> SBC, BNC, BNCE, SMVB, YPR)
 * - Alias matching
 *
 * @param {string} query
 * @param {number} [limit=8]
 * @returns {Array<Object>}
 */
export function searchRailwayStations(query = '', limit = 8) {
  const clean = String(query || '').trim().toLowerCase();
  if (!clean || clean.length < 1) return [];

  const upperQuery = clean.toUpperCase();

  // Scoring weights:
  // 1. Exact Station Code match = 1000
  // 2. Station Code starts with query = 800
  // 3. Exact Station Name match = 600
  // 4. Station Name starts with query = 500
  // 5. City Name equals query = 450
  // 6. City Name starts with query = 400
  // 7. Aliases match = 300
  // 8. Station Name contains query = 200

  const scored = [];

  for (const stn of INDIAN_RAILWAY_STATIONS) {
    let score = 0;
    const stnCode = stn.stationCode;
    const stnNameLower = stn.name.toLowerCase();
    const cityLower = stn.city.toLowerCase();

    if (stnCode === upperQuery) {
      score += 1000;
    } else if (stnCode.startsWith(upperQuery)) {
      score += 800;
    } else if (stnNameLower === clean) {
      score += 600;
    } else if (stnNameLower.startsWith(clean)) {
      score += 500;
    } else if (cityLower === clean) {
      score += 450;
      if (stn.isMajorHub) score += 50;
    } else if (cityLower.startsWith(clean)) {
      score += 400;
      if (stn.isMajorHub) score += 30;
    } else if (stn.aliases && stn.aliases.some((a) => a === clean)) {
      score += 350;
    } else if (stn.aliases && stn.aliases.some((a) => a.startsWith(clean))) {
      score += 250;
    } else if (stnNameLower.includes(clean)) {
      score += 200;
    } else if (cityLower.includes(clean)) {
      score += 150;
    }

    if (score > 0) {
      scored.push({
        station: stn,
        score,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => ({
    id: `station_${s.station.stationCode.toLowerCase()}`,
    name: s.station.name,
    stationCode: s.station.stationCode,
    displayName: s.station.displayName,
    city: s.station.city,
    state: s.station.state,
    type: 'railway_station',
    country: 'India',
    location: {
      type: 'Point',
      coordinates: s.station.coordinates,
    },
    coordinates: s.station.coordinates,
    latitude: s.station.coordinates[1],
    longitude: s.station.coordinates[0],
    source: 'railway_registry',
  }));
}

export default {
  INDIAN_RAILWAY_STATIONS,
  searchRailwayStations,
};
