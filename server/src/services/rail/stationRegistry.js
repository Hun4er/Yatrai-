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

  // -------------------------------------------------------------
  // RAJASTHAN
  // -------------------------------------------------------------
  {
    stationCode: 'GADJ',
    name: 'GANDHINAGAR JAIPUR',
    displayName: 'GANDHINAGAR JAIPUR - GADJ',
    city: 'Jaipur',
    state: 'Rajasthan',
    aliases: ['gandhinagar jaipur', 'gandhi nagar jaipur', 'gadj', 'jaipur'],
    coordinates: [75.7986, 26.873387],
    isMajorHub: false,
  },
  {
    stationCode: 'AII',
    name: 'AJMER JN',
    displayName: 'AJMER JN - AII',
    city: 'Ajmer',
    state: 'Rajasthan',
    aliases: ['ajmer', 'ajmer jn', 'aii', 'pushkar'],
    coordinates: [74.6399, 26.4525],
    isMajorHub: true,
  },
  {
    stationCode: 'JU',
    name: 'JODHPUR JN',
    displayName: 'JODHPUR JN - JU',
    city: 'Jodhpur',
    state: 'Rajasthan',
    aliases: ['jodhpur', 'jodhpur jn', 'ju', 'blue city'],
    coordinates: [73.0243, 26.2868],
    isMajorHub: true,
  },
  {
    stationCode: 'KOTA',
    name: 'KOTA JN',
    displayName: 'KOTA JN - KOTA',
    city: 'Kota',
    state: 'Rajasthan',
    aliases: ['kota', 'kota jn'],
    coordinates: [75.8648, 25.2138],
    isMajorHub: true,
  },
  {
    stationCode: 'UDZ',
    name: 'UDAIPUR CITY',
    displayName: 'UDAIPUR CITY - UDZ',
    city: 'Udaipur',
    state: 'Rajasthan',
    aliases: ['udaipur', 'udaipur city', 'udz', 'lake city'],
    coordinates: [73.6983, 24.5713],
    isMajorHub: true,
  },
  {
    stationCode: 'BKN',
    name: 'BIKANER JN',
    displayName: 'BIKANER JN - BKN',
    city: 'Bikaner',
    state: 'Rajasthan',
    aliases: ['bikaner', 'bikaner jn', 'bkn'],
    coordinates: [73.3119, 28.0163],
    isMajorHub: true,
  },
  {
    stationCode: 'AWR',
    name: 'ALWAR JN',
    displayName: 'ALWAR JN - AWR',
    city: 'Alwar',
    state: 'Rajasthan',
    aliases: ['alwar', 'alwar jn', 'awr'],
    coordinates: [76.6253, 27.5647],
    isMajorHub: false,
  },
  {
    stationCode: 'BTE',
    name: 'BHARATPUR JN',
    displayName: 'BHARATPUR JN - BTE',
    city: 'Bharatpur',
    state: 'Rajasthan',
    aliases: ['bharatpur', 'bharatpur jn', 'bte'],
    coordinates: [77.4984, 27.2356],
    isMajorHub: false,
  },
  {
    stationCode: 'SWM',
    name: 'SAWAI MADHOPUR JN',
    displayName: 'SAWAI MADHOPUR JN - SWM',
    city: 'Sawai Madhopur',
    state: 'Rajasthan',
    aliases: ['sawai madhopur', 'ranthambore', 'swm'],
    coordinates: [76.3533, 25.9928],
    isMajorHub: false,
  },
  {
    stationCode: 'BME',
    name: 'BARMER',
    displayName: 'BARMER - BME',
    city: 'Barmer',
    state: 'Rajasthan',
    aliases: ['barmer', 'bme'],
    coordinates: [71.3967, 25.7521],
    isMajorHub: false,
  },
  {
    stationCode: 'ABR',
    name: 'ABU ROAD',
    displayName: 'ABU ROAD - ABR',
    city: 'Mount Abu',
    state: 'Rajasthan',
    aliases: ['abu road', 'mount abu', 'abr'],
    coordinates: [72.7819, 24.4828],
    isMajorHub: false,
  },

  // -------------------------------------------------------------
  // GUJARAT
  // -------------------------------------------------------------
  {
    stationCode: 'BRC',
    name: 'VADODARA JN',
    displayName: 'VADODARA JN - BRC',
    city: 'Vadodara',
    state: 'Gujarat',
    aliases: ['vadodara', 'baroda', 'brc', 'vadodara junction'],
    coordinates: [73.1812, 22.3107],
    isMajorHub: true,
  },
  {
    stationCode: 'ST',
    name: 'SURAT',
    displayName: 'SURAT - ST',
    city: 'Surat',
    state: 'Gujarat',
    aliases: ['surat', 'st', 'diamond city'],
    coordinates: [72.840643, 21.206418],
    isMajorHub: true,
  },
  {
    stationCode: 'RJT',
    name: 'RAJKOT JN',
    displayName: 'RAJKOT JN - RJT',
    city: 'Rajkot',
    state: 'Gujarat',
    aliases: ['rajkot', 'rajkot jn', 'rjt'],
    coordinates: [70.8022, 22.3117],
    isMajorHub: true,
  },
  {
    stationCode: 'BHUJ',
    name: 'BHUJ',
    displayName: 'BHUJ - BHUJ',
    city: 'Bhuj',
    state: 'Gujarat',
    aliases: ['bhuj', 'kutch'],
    coordinates: [69.6696, 23.2539],
    isMajorHub: false,
  },
  {
    stationCode: 'GIMB',
    name: 'GANDHIDHAM JN',
    displayName: 'GANDHIDHAM JN - GIMB',
    city: 'Gandhidham',
    state: 'Gujarat',
    aliases: ['gandhidham', 'kandla', 'gimb'],
    coordinates: [70.1337, 23.0753],
    isMajorHub: false,
  },
  {
    stationCode: 'ANND',
    name: 'ANAND JN',
    displayName: 'ANAND JN - ANND',
    city: 'Anand',
    state: 'Gujarat',
    aliases: ['anand', 'amul', 'annd'],
    coordinates: [72.9515, 22.5645],
    isMajorHub: false,
  },
  {
    stationCode: 'BH',
    name: 'BHARUCH JN',
    displayName: 'BHARUCH JN - BH',
    city: 'Bharuch',
    state: 'Gujarat',
    aliases: ['bharuch', 'bh'],
    coordinates: [72.9698, 21.7051],
    isMajorHub: false,
  },
  {
    stationCode: 'BL',
    name: 'VALSAD',
    displayName: 'VALSAD - BL',
    city: 'Valsad',
    state: 'Gujarat',
    aliases: ['valsad', 'bulsar', 'bl'],
    coordinates: [72.9342, 20.6103],
    isMajorHub: false,
  },
  {
    stationCode: 'VAPI',
    name: 'VAPI',
    displayName: 'VAPI - VAPI',
    city: 'Vapi',
    state: 'Gujarat',
    aliases: ['vapi', 'daman'],
    coordinates: [72.9106, 20.3718],
    isMajorHub: false,
  },
  {
    stationCode: 'JAM',
    name: 'JAMNAGAR',
    displayName: 'JAMNAGAR - JAM',
    city: 'Jamnagar',
    state: 'Gujarat',
    aliases: ['jamnagar', 'jam'],
    coordinates: [70.0637, 22.4707],
    isMajorHub: false,
  },
  {
    stationCode: 'PBR',
    name: 'PORBANDAR',
    displayName: 'PORBANDAR - PBR',
    city: 'Porbandar',
    state: 'Gujarat',
    aliases: ['porbandar', 'pbr'],
    coordinates: [69.6293, 21.6417],
    isMajorHub: false,
  },
  {
    stationCode: 'SBIB',
    name: 'SABARMATI BG',
    displayName: 'SABARMATI BG - SBIB',
    city: 'Ahmedabad',
    state: 'Gujarat',
    aliases: ['sabarmati', 'sbib', 'ahmedabad'],
    coordinates: [72.5831, 23.0805],
    isMajorHub: false,
  },

  // -------------------------------------------------------------
  // MAHARASHTRA & GOA
  // -------------------------------------------------------------
  {
    stationCode: 'NGP',
    name: 'NAGPUR JN',
    displayName: 'NAGPUR JN - NGP',
    city: 'Nagpur',
    state: 'Maharashtra',
    aliases: ['nagpur', 'nagpur junction', 'ngp', 'orange city'],
    coordinates: [79.0882, 21.1524],
    isMajorHub: true,
  },
  {
    stationCode: 'NK',
    name: 'NASHIK ROAD',
    displayName: 'NASHIK ROAD - NK',
    city: 'Nashik',
    state: 'Maharashtra',
    aliases: ['nashik', 'nasik', 'nashik road', 'nk', 'shirdi'],
    coordinates: [73.8447, 19.9542],
    isMajorHub: true,
  },
  {
    stationCode: 'BSL',
    name: 'BHUSAVAL JN',
    displayName: 'BHUSAVAL JN - BSL',
    city: 'Bhusawal',
    state: 'Maharashtra',
    aliases: ['bhusaval', 'bhusawal', 'bsl', 'jalgaon'],
    coordinates: [75.7873, 21.0455],
    isMajorHub: true,
  },
  {
    stationCode: 'SUR',
    name: 'SOLAPUR JN',
    displayName: 'SOLAPUR JN - SUR',
    city: 'Solapur',
    state: 'Maharashtra',
    aliases: ['solapur', 'sholapur', 'sur'],
    coordinates: [75.9064, 17.6599],
    isMajorHub: true,
  },
  {
    stationCode: 'KOP',
    name: 'CHHATRAPATI SHAHU MAHARAJ TERMINUS (KOLHAPUR)',
    displayName: 'KOLHAPUR - KOP',
    city: 'Kolhapur',
    state: 'Maharashtra',
    aliases: ['kolhapur', 'kop', 'cstmt kolhapur'],
    coordinates: [74.237795, 16.70267],
    isMajorHub: true,
  },
  {
    stationCode: 'AWB',
    name: 'AURANGABAD',
    displayName: 'AURANGABAD - AWB',
    city: 'Chhatrapati Sambhajinagar',
    state: 'Maharashtra',
    aliases: ['aurangabad', 'chhatrapati sambhajinagar', 'awb', 'ellora', 'ajanta'],
    coordinates: [75.3126, 19.8636],
    isMajorHub: true,
  },
  {
    stationCode: 'NED',
    name: 'HAZUR SAHIB NANDED',
    displayName: 'HAZUR SAHIB NANDED - NED',
    city: 'Nanded',
    state: 'Maharashtra',
    aliases: ['nanded', 'hazur sahib', 'ned'],
    coordinates: [77.3195, 19.1558],
    isMajorHub: true,
  },
  {
    stationCode: 'KYN',
    name: 'KALYAN JN',
    displayName: 'KALYAN JN - KYN',
    city: 'Mumbai',
    state: 'Maharashtra',
    aliases: ['kalyan', 'kalyan jn', 'kyn', 'mumbai'],
    coordinates: [73.1305, 19.2361],
    isMajorHub: true,
  },
  {
    stationCode: 'JL',
    name: 'JALGAON JN',
    displayName: 'JALGAON JN - JL',
    city: 'Jalgaon',
    state: 'Maharashtra',
    aliases: ['jalgaon', 'jl', 'ajanta'],
    coordinates: [75.5684, 21.0055],
    isMajorHub: false,
  },
  {
    stationCode: 'MMR',
    name: 'MANMAD JN',
    displayName: 'MANMAD JN - MMR',
    city: 'Manmad',
    state: 'Maharashtra',
    aliases: ['manmad', 'mmr', 'shirdi'],
    coordinates: [74.4395, 20.2525],
    isMajorHub: true,
  },
  {
    stationCode: 'DD',
    name: 'DAUND JN',
    displayName: 'DAUND JN - DD',
    city: 'Daund',
    state: 'Maharashtra',
    aliases: ['daund', 'dd', 'pune'],
    coordinates: [74.5772, 18.4673],
    isMajorHub: false,
  },
  {
    stationCode: 'AK',
    name: 'AKOLA JN',
    displayName: 'AKOLA JN - AK',
    city: 'Akola',
    state: 'Maharashtra',
    aliases: ['akola', 'ak'],
    coordinates: [77.0175, 20.7144],
    isMajorHub: false,
  },
  {
    stationCode: 'BD',
    name: 'BADNERA JN',
    displayName: 'BADNERA JN - BD',
    city: 'Amravati',
    state: 'Maharashtra',
    aliases: ['badnera', 'amravati', 'bd'],
    coordinates: [77.7283, 20.8583],
    isMajorHub: false,
  },
  {
    stationCode: 'MAO',
    name: 'MADGAON JN',
    displayName: 'MADGAON JN - MAO',
    city: 'Goa',
    state: 'Goa',
    aliases: ['goa', 'madgaon', 'margao', 'mao'],
    coordinates: [73.9798, 15.2736],
    isMajorHub: true,
  },
  {
    stationCode: 'VSG',
    name: 'VASCO DA GAMA',
    displayName: 'VASCO DA GAMA - VSG',
    city: 'Goa',
    state: 'Goa',
    aliases: ['vasco', 'vasco da gama', 'vsg', 'goa'],
    coordinates: [73.8123, 15.3982],
    isMajorHub: false,
  },

  // -------------------------------------------------------------
  // KARNATAKA
  // -------------------------------------------------------------
  {
    stationCode: 'MYS',
    name: 'MYSURU JN',
    displayName: 'MYSURU JN - MYS',
    city: 'Mysuru',
    state: 'Karnataka',
    aliases: ['mysore', 'mysuru', 'mys'],
    coordinates: [76.6433, 12.3168],
    isMajorHub: true,
  },
  {
    stationCode: 'UBL',
    name: 'SSS HUBBALLI JN',
    displayName: 'SSS HUBBALLI JN - UBL',
    city: 'Hubballi',
    state: 'Karnataka',
    aliases: ['hubli', 'hubballi', 'ubl'],
    coordinates: [75.1449, 15.3524],
    isMajorHub: true,
  },
  {
    stationCode: 'BGM',
    name: 'BELAGAVI',
    displayName: 'BELAGAVI - BGM',
    city: 'Belagavi',
    state: 'Karnataka',
    aliases: ['belgaum', 'belagavi', 'bgm'],
    coordinates: [74.5089, 15.8497],
    isMajorHub: false,
  },
  {
    stationCode: 'MAQ',
    name: 'MANGALURU CENTRAL',
    displayName: 'MANGALURU CENTRAL - MAQ',
    city: 'Mangaluru',
    state: 'Karnataka',
    aliases: ['mangalore', 'mangaluru', 'mangalore central', 'maq'],
    coordinates: [74.8431, 12.8654],
    isMajorHub: true,
  },
  {
    stationCode: 'MAJN',
    name: 'MANGALURU JN',
    displayName: 'MANGALURU JN - MAJN',
    city: 'Mangaluru',
    state: 'Karnataka',
    aliases: ['mangalore junction', 'mangaluru jn', 'majn'],
    coordinates: [74.8719, 12.8712],
    isMajorHub: true,
  },
  {
    stationCode: 'UD',
    name: 'UDUPI',
    displayName: 'UDUPI - UD',
    city: 'Udupi',
    state: 'Karnataka',
    aliases: ['udupi', 'ud', 'manipal'],
    coordinates: [74.7828, 13.3444],
    isMajorHub: false,
  },
  {
    stationCode: 'BAY',
    name: 'BALLARI JN',
    displayName: 'BALLARI JN - BAY',
    city: 'Ballari',
    state: 'Karnataka',
    aliases: ['bellary', 'ballari', 'bay'],
    coordinates: [76.9242, 15.1489],
    isMajorHub: false,
  },
  {
    stationCode: 'DVG',
    name: 'DAVANGERE',
    displayName: 'DAVANGERE - DVG',
    city: 'Davangere',
    state: 'Karnataka',
    aliases: ['davangere', 'dvg'],
    coordinates: [75.9218, 14.4644],
    isMajorHub: false,
  },

  // -------------------------------------------------------------
  // TAMIL NADU & KERALA
  // -------------------------------------------------------------
  {
    stationCode: 'CBE',
    name: 'COIMBATORE JN',
    displayName: 'COIMBATORE JN - CBE',
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    aliases: ['coimbatore', 'kovai', 'cbe'],
    coordinates: [76.9634, 10.9976],
    isMajorHub: true,
  },
  {
    stationCode: 'MDU',
    name: 'MADURAI JN',
    displayName: 'MADURAI JN - MDU',
    city: 'Madurai',
    state: 'Tamil Nadu',
    aliases: ['madurai', 'mdu', 'meenakshi'],
    coordinates: [78.1118, 9.9252],
    isMajorHub: true,
  },
  {
    stationCode: 'TPJ',
    name: 'TIRUCHCHIRAPPALLI JN',
    displayName: 'TIRUCHCHIRAPPALLI JN - TPJ',
    city: 'Tiruchirappalli',
    state: 'Tamil Nadu',
    aliases: ['trichy', 'tiruchirappalli', 'tpj'],
    coordinates: [78.6856, 10.7938],
    isMajorHub: true,
  },
  {
    stationCode: 'SA',
    name: 'SALEM JN',
    displayName: 'SALEM JN - SA',
    city: 'Salem',
    state: 'Tamil Nadu',
    aliases: ['salem', 'salem jn', 'sa'],
    coordinates: [78.1252, 11.6643],
    isMajorHub: false,
  },
  {
    stationCode: 'ED',
    name: 'ERODE JN',
    displayName: 'ERODE JN - ED',
    city: 'Erode',
    state: 'Tamil Nadu',
    aliases: ['erode', 'erode jn', 'ed'],
    coordinates: [77.7274, 11.341],
    isMajorHub: false,
  },
  {
    stationCode: 'TEN',
    name: 'TIRUNELVELI JN',
    displayName: 'TIRUNELVELI JN - TEN',
    city: 'Tirunelveli',
    state: 'Tamil Nadu',
    aliases: ['tirunelveli', 'nellai', 'ten'],
    coordinates: [77.7081, 8.7303],
    isMajorHub: false,
  },
  {
    stationCode: 'CAPE',
    name: 'KANYAKUMARI',
    displayName: 'KANYAKUMARI - CAPE',
    city: 'Kanyakumari',
    state: 'Tamil Nadu',
    aliases: ['kanyakumari', 'kanniyakumari', 'cape'],
    coordinates: [77.5498, 8.0883],
    isMajorHub: false,
  },
  {
    stationCode: 'KPD',
    name: 'KATPADI JN',
    displayName: 'KATPADI JN - KPD',
    city: 'Vellore',
    state: 'Tamil Nadu',
    aliases: ['katpadi', 'vellore', 'kpd'],
    coordinates: [79.1374, 12.9739],
    isMajorHub: true,
  },
  {
    stationCode: 'TVC',
    name: 'THIRUVANANTHAPURAM CENTRAL',
    displayName: 'THIRUVANANTHAPURAM CENTRAL - TVC',
    city: 'Thiruvananthapuram',
    state: 'Kerala',
    aliases: ['trivandrum', 'thiruvananthapuram', 'tvc'],
    coordinates: [76.9525, 8.4875],
    isMajorHub: true,
  },
  {
    stationCode: 'ERS',
    name: 'ERNAKULAM JN',
    displayName: 'ERNAKULAM JN - ERS',
    city: 'Kochi',
    state: 'Kerala',
    aliases: ['kochi', 'ernakulam', 'cochin', 'ers', 'ernakulam south'],
    coordinates: [76.2898, 9.9678],
    isMajorHub: true,
  },
  {
    stationCode: 'ERN',
    name: 'ERNAKULAM TOWN',
    displayName: 'ERNAKULAM TOWN - ERN',
    city: 'Kochi',
    state: 'Kerala',
    aliases: ['kochi', 'ernakulam north', 'ern'],
    coordinates: [76.2905, 9.9961],
    isMajorHub: false,
  },
  {
    stationCode: 'CLT',
    name: 'KOZHIKODE MAIN',
    displayName: 'KOZHIKODE - CLT',
    city: 'Kozhikode',
    state: 'Kerala',
    aliases: ['calicut', 'kozhikode', 'clt'],
    coordinates: [75.7804, 11.2467],
    isMajorHub: true,
  },
  {
    stationCode: 'TCR',
    name: 'THRISSUR',
    displayName: 'THRISSUR - TCR',
    city: 'Thrissur',
    state: 'Kerala',
    aliases: ['thrissur', 'trichur', 'tcr'],
    coordinates: [76.2144, 10.5186],
    isMajorHub: false,
  },
  {
    stationCode: 'CAN',
    name: 'KANNUR',
    displayName: 'KANNUR - CAN',
    city: 'Kannur',
    state: 'Kerala',
    aliases: ['cannanore', 'kannur', 'can'],
    coordinates: [75.3704, 11.8745],
    isMajorHub: false,
  },
  {
    stationCode: 'PGT',
    name: 'PALAKKAD JN',
    displayName: 'PALAKKAD JN - PGT',
    city: 'Palakkad',
    state: 'Kerala',
    aliases: ['palakkad', 'palghat', 'pgt'],
    coordinates: [76.6436, 10.8284],
    isMajorHub: false,
  },

  // -------------------------------------------------------------
  // TELANGANA & ANDHRA PRADESH
  // -------------------------------------------------------------
  {
    stationCode: 'SC',
    name: 'SECUNDERABAD JN',
    displayName: 'SECUNDERABAD JN - SC',
    city: 'Hyderabad',
    state: 'Telangana',
    aliases: ['secunderabad', 'hyderabad', 'sc'],
    coordinates: [78.5037, 17.4344],
    isMajorHub: true,
  },
  {
    stationCode: 'HYB',
    name: 'HYDERABAD DECCAN',
    displayName: 'HYDERABAD DECCAN - HYB',
    city: 'Hyderabad',
    state: 'Telangana',
    aliases: ['nampally', 'hyderabad', 'hyb', 'deccan'],
    coordinates: [78.4684, 17.3924],
    isMajorHub: true,
  },
  {
    stationCode: 'KCG',
    name: 'KACHEGUDA',
    displayName: 'KACHEGUDA - KCG',
    city: 'Hyderabad',
    state: 'Telangana',
    aliases: ['kacheguda', 'hyderabad', 'kcg'],
    coordinates: [78.4975, 17.3879],
    isMajorHub: true,
  },
  {
    stationCode: 'WL',
    name: 'WARANGAL',
    displayName: 'WARANGAL - WL',
    city: 'Warangal',
    state: 'Telangana',
    aliases: ['warangal', 'wl', 'kazipet'],
    coordinates: [79.6136, 17.9689],
    isMajorHub: false,
  },
  {
    stationCode: 'KZJ',
    name: 'KAZIPET JN',
    displayName: 'KAZIPET JN - KZJ',
    city: 'Warangal',
    state: 'Telangana',
    aliases: ['kazipet', 'kzj'],
    coordinates: [79.5089, 17.9782],
    isMajorHub: true,
  },
  {
    stationCode: 'BZA',
    name: 'VIJAYAWADA JN',
    displayName: 'VIJAYAWADA JN - BZA',
    city: 'Vijayawada',
    state: 'Andhra Pradesh',
    aliases: ['vijayawada', 'bza', 'bezawada'],
    coordinates: [80.6206, 16.5178],
    isMajorHub: true,
  },
  {
    stationCode: 'VSKP',
    name: 'VISAKHAPATNAM JN',
    displayName: 'VISAKHAPATNAM JN - VSKP',
    city: 'Visakhapatnam',
    state: 'Andhra Pradesh',
    aliases: ['vizag', 'visakhapatnam', 'vskp', 'waltair'],
    coordinates: [83.2986, 17.7215],
    isMajorHub: true,
  },
  {
    stationCode: 'TPTY',
    name: 'TIRUPATI',
    displayName: 'TIRUPATI - TPTY',
    city: 'Tirupati',
    state: 'Andhra Pradesh',
    aliases: ['tirupati', 'tpty', 'balaji'],
    coordinates: [79.4192, 13.6288],
    isMajorHub: true,
  },
  {
    stationCode: 'RU',
    name: 'RENIGUNTA JN',
    displayName: 'RENIGUNTA JN - RU',
    city: 'Tirupati',
    state: 'Andhra Pradesh',
    aliases: ['renigunta', 'tirupati', 'ru'],
    coordinates: [79.5165, 13.6496],
    isMajorHub: false,
  },
  {
    stationCode: 'GTL',
    name: 'GUNTAKAL JN',
    displayName: 'GUNTAKAL JN - GTL',
    city: 'Guntakal',
    state: 'Andhra Pradesh',
    aliases: ['guntakal', 'gtl'],
    coordinates: [77.3719, 15.1742],
    isMajorHub: true,
  },
  {
    stationCode: 'RJY',
    name: 'RAJAHMUNDRY',
    displayName: 'RAJAHMUNDRY - RJY',
    city: 'Rajahmundry',
    state: 'Andhra Pradesh',
    aliases: ['rajahmundry', 'rjy', 'godavari'],
    coordinates: [81.7774, 16.9891],
    isMajorHub: false,
  },

  // -------------------------------------------------------------
  // MADHYA PRADESH
  // -------------------------------------------------------------
  {
    stationCode: 'INDB',
    name: 'INDORE JN',
    displayName: 'INDORE JN - INDB',
    city: 'Indore',
    state: 'Madhya Pradesh',
    aliases: ['indore', 'indb', 'malwa'],
    coordinates: [75.8679, 22.7196],
    isMajorHub: true,
  },
  {
    stationCode: 'GWL',
    name: 'GWALIOR JN',
    displayName: 'GWALIOR JN - GWL',
    city: 'Gwalior',
    state: 'Madhya Pradesh',
    aliases: ['gwalior', 'gwl'],
    coordinates: [78.182402, 26.216593],
    isMajorHub: true,
  },
  {
    stationCode: 'JBP',
    name: 'JABALPUR JN',
    displayName: 'JABALPUR JN - JBP',
    city: 'Jabalpur',
    state: 'Madhya Pradesh',
    aliases: ['jabalpur', 'jbp', 'bhedaghat'],
    coordinates: [79.9539, 23.1608],
    isMajorHub: true,
  },
  {
    stationCode: 'UJN',
    name: 'UJJAIN JN',
    displayName: 'UJJAIN JN - UJN',
    city: 'Ujjain',
    state: 'Madhya Pradesh',
    aliases: ['ujjain', 'ujn', 'mahakaleshwar'],
    coordinates: [75.7828, 23.1765],
    isMajorHub: true,
  },
  {
    stationCode: 'ET',
    name: 'ITARSI JN',
    displayName: 'ITARSI JN - ET',
    city: 'Itarsi',
    state: 'Madhya Pradesh',
    aliases: ['itarsi', 'et'],
    coordinates: [77.7554, 21.6143],
    isMajorHub: true,
  },
  {
    stationCode: 'KTE',
    name: 'KATNI JN',
    displayName: 'KATNI JN - KTE',
    city: 'Katni',
    state: 'Madhya Pradesh',
    aliases: ['katni', 'kte'],
    coordinates: [80.3957, 23.8344],
    isMajorHub: false,
  },
  {
    stationCode: 'BINA',
    name: 'BINA JN',
    displayName: 'BINA JN - BINA',
    city: 'Bina',
    state: 'Madhya Pradesh',
    aliases: ['bina', 'bina jn'],
    coordinates: [78.1802, 24.1752],
    isMajorHub: false,
  },

  // -------------------------------------------------------------
  // UTTAR PRADESH & UTTARAKHAND
  // -------------------------------------------------------------
  {
    stationCode: 'JHS',
    name: 'VIRANGANA LAKSHMIBAI JHANSI',
    displayName: 'VGL JHANSI - JHS',
    city: 'Jhansi',
    state: 'Uttar Pradesh',
    aliases: ['jhansi', 'vglj', 'jhs', 'lakshmibai'],
    coordinates: [78.5583, 25.4484],
    isMajorHub: true,
  },
  {
    stationCode: 'MTJ',
    name: 'MATHURA JN',
    displayName: 'MATHURA JN - MTJ',
    city: 'Mathura',
    state: 'Uttar Pradesh',
    aliases: ['mathura', 'vrindavan', 'mtj'],
    coordinates: [77.6749, 27.4924],
    isMajorHub: true,
  },
  {
    stationCode: 'ALJN',
    name: 'ALIGARH JN',
    displayName: 'ALIGARH JN - ALJN',
    city: 'Aligarh',
    state: 'Uttar Pradesh',
    aliases: ['aligarh', 'aljn', 'amu'],
    coordinates: [78.0772, 27.8974],
    isMajorHub: false,
  },
  {
    stationCode: 'MB',
    name: 'MORADABAD JN',
    displayName: 'MORADABAD JN - MB',
    city: 'Moradabad',
    state: 'Uttar Pradesh',
    aliases: ['moradabad', 'mb', 'brass city'],
    coordinates: [78.7768, 28.8386],
    isMajorHub: true,
  },
  {
    stationCode: 'BE',
    name: 'BAREILLY JN',
    displayName: 'BAREILLY JN - BE',
    city: 'Bareilly',
    state: 'Uttar Pradesh',
    aliases: ['bareilly', 'be'],
    coordinates: [79.4192, 28.347],
    isMajorHub: true,
  },
  {
    stationCode: 'SRE',
    name: 'SAHARANPUR JN',
    displayName: 'SAHARANPUR JN - SRE',
    city: 'Saharanpur',
    state: 'Uttar Pradesh',
    aliases: ['saharanpur', 'sre'],
    coordinates: [77.5463, 29.9671],
    isMajorHub: false,
  },
  {
    stationCode: 'AY',
    name: 'AYODHYA DHAM JN',
    displayName: 'AYODHYA DHAM JN - AY',
    city: 'Ayodhya',
    state: 'Uttar Pradesh',
    aliases: ['ayodhya', 'ayodhya dham', 'ay', 'ram mandir', 'faizabad'],
    coordinates: [82.2016, 26.7922],
    isMajorHub: true,
  },
  {
    stationCode: 'AYC',
    name: 'AYODHYA CANTT',
    displayName: 'AYODHYA CANTT - AYC',
    city: 'Ayodhya',
    state: 'Uttar Pradesh',
    aliases: ['ayodhya cantt', 'faizabad', 'ayc'],
    coordinates: [82.1384, 26.7725],
    isMajorHub: true,
  },
  {
    stationCode: 'HW',
    name: 'HARIDWAR JN',
    displayName: 'HARIDWAR JN - HW',
    city: 'Haridwar',
    state: 'Uttarakhand',
    aliases: ['haridwar', 'hw', 'rishikesh', 'ganga'],
    coordinates: [78.1569, 29.9457],
    isMajorHub: true,
  },
  {
    stationCode: 'DDN',
    name: 'DEHRADUN',
    displayName: 'DEHRADUN - DDN',
    city: 'Dehradun',
    state: 'Uttarakhand',
    aliases: ['dehradun', 'ddn', 'mussoorie'],
    coordinates: [78.0322, 30.3165],
    isMajorHub: true,
  },
  {
    stationCode: 'KGM',
    name: 'KATHGODAM',
    displayName: 'KATHGODAM - KGM',
    city: 'Nainital',
    state: 'Uttarakhand',
    aliases: ['kathgodam', 'nainital', 'kgm', 'haldwani'],
    coordinates: [79.5428, 29.2736],
    isMajorHub: false,
  },

  // -------------------------------------------------------------
  // PUNJAB, HARYANA & J&K
  // -------------------------------------------------------------
  {
    stationCode: 'ASR',
    name: 'AMRITSAR JN',
    displayName: 'AMRITSAR JN - ASR',
    city: 'Amritsar',
    state: 'Punjab',
    aliases: ['amritsar', 'golden temple', 'asr'],
    coordinates: [74.8723, 31.634],
    isMajorHub: true,
  },
  {
    stationCode: 'LDH',
    name: 'LUDHIANA JN',
    displayName: 'LUDHIANA JN - LDH',
    city: 'Ludhiana',
    state: 'Punjab',
    aliases: ['ludhiana', 'ldh'],
    coordinates: [75.8573, 30.901],
    isMajorHub: true,
  },
  {
    stationCode: 'JUC',
    name: 'JALANDHAR CITY',
    displayName: 'JALANDHAR CITY - JUC',
    city: 'Jalandhar',
    state: 'Punjab',
    aliases: ['jalandhar', 'jalandhar city', 'juc'],
    coordinates: [75.5846, 31.326],
    isMajorHub: false,
  },
  {
    stationCode: 'JAT',
    name: 'JAMMU TAWI',
    displayName: 'JAMMU TAWI - JAT',
    city: 'Jammu',
    state: 'Jammu and Kashmir',
    aliases: ['jammu', 'jammu tawi', 'jat', 'kashmir'],
    coordinates: [74.8795, 32.7063],
    isMajorHub: true,
  },
  {
    stationCode: 'SVDK',
    name: 'SHRI MATA VAISHNO DEVI KATRA',
    displayName: 'SMVD KATRA - SVDK',
    city: 'Katra',
    state: 'Jammu and Kashmir',
    aliases: ['katra', 'vaishno devi', 'svdk'],
    coordinates: [74.9525, 32.9912],
    isMajorHub: true,
  },
  {
    stationCode: 'KLK',
    name: 'KALKA',
    displayName: 'KALKA - KLK',
    city: 'Kalka',
    state: 'Haryana',
    aliases: ['kalka', 'shimla toy train', 'klk'],
    coordinates: [76.9348, 30.8354],
    isMajorHub: false,
  },

  // -------------------------------------------------------------
  // ODISHA, CHHATTISGARH & JHARKHAND
  // -------------------------------------------------------------
  {
    stationCode: 'BBS',
    name: 'BHUBANESWAR',
    displayName: 'BHUBANESWAR - BBS',
    city: 'Bhubaneswar',
    state: 'Odisha',
    aliases: ['bhubaneswar', 'bbs', 'temple city'],
    coordinates: [85.8436, 20.2668],
    isMajorHub: true,
  },
  {
    stationCode: 'PURI',
    name: 'PURI',
    displayName: 'PURI - PURI',
    city: 'Puri',
    state: 'Odisha',
    aliases: ['puri', 'jagannath puri'],
    coordinates: [85.8398, 19.8135],
    isMajorHub: true,
  },
  {
    stationCode: 'CTC',
    name: 'CUTTACK JN',
    displayName: 'CUTTACK JN - CTC',
    city: 'Cuttack',
    state: 'Odisha',
    aliases: ['cuttack', 'ctc'],
    coordinates: [85.8951, 20.4625],
    isMajorHub: false,
  },
  {
    stationCode: 'ROU',
    name: 'ROURKELA JN',
    displayName: 'ROURKELA JN - ROU',
    city: 'Rourkela',
    state: 'Odisha',
    aliases: ['rourkela', 'rou', 'steel city'],
    coordinates: [84.8828, 22.2272],
    isMajorHub: false,
  },
  {
    stationCode: 'R',
    name: 'RAIPUR JN',
    displayName: 'RAIPUR JN - R',
    city: 'Raipur',
    state: 'Chhattisgarh',
    aliases: ['raipur', 'raipur jn', 'r'],
    coordinates: [81.6296, 21.2514],
    isMajorHub: true,
  },
  {
    stationCode: 'BSP',
    name: 'BILASPUR JN',
    displayName: 'BILASPUR JN - BSP',
    city: 'Bilaspur',
    state: 'Chhattisgarh',
    aliases: ['bilaspur', 'bsp'],
    coordinates: [82.1648, 22.0797],
    isMajorHub: true,
  },
  {
    stationCode: 'RNC',
    name: 'RANCHI JN',
    displayName: 'RANCHI JN - RNC',
    city: 'Ranchi',
    state: 'Jharkhand',
    aliases: ['ranchi', 'ranchi jn', 'rnc'],
    coordinates: [85.3347, 23.3512],
    isMajorHub: true,
  },
  {
    stationCode: 'DHN',
    name: 'DHANBAD JN',
    displayName: 'DHANBAD JN - DHN',
    city: 'Dhanbad',
    state: 'Jharkhand',
    aliases: ['dhanbad', 'dhn', 'coal capital'],
    coordinates: [86.4304, 23.7957],
    isMajorHub: true,
  },
  {
    stationCode: 'TATA',
    name: 'TATANAGAR JN',
    displayName: 'TATANAGAR JN - TATA',
    city: 'Jamshedpur',
    state: 'Jharkhand',
    aliases: ['jamshedpur', 'tatanagar', 'tata', 'steel city'],
    coordinates: [86.2029, 22.7719],
    isMajorHub: true,
  },

  // -------------------------------------------------------------
  // WEST BENGAL & NORTH EAST
  // -------------------------------------------------------------
  {
    stationCode: 'ASN',
    name: 'ASANSOL JN',
    displayName: 'ASANSOL JN - ASN',
    city: 'Asansol',
    state: 'West Bengal',
    aliases: ['asansol', 'asn'],
    coordinates: [86.9746, 23.6871],
    isMajorHub: true,
  },
  {
    stationCode: 'KGP',
    name: 'KHARAGPUR JN',
    displayName: 'KHARAGPUR JN - KGP',
    city: 'Kharagpur',
    state: 'West Bengal',
    aliases: ['kharagpur', 'kgp', 'iit'],
    coordinates: [87.3248, 22.3275],
    isMajorHub: true,
  },
  {
    stationCode: 'NJP',
    name: 'NEW JALPAIGURI',
    displayName: 'NEW JALPAIGURI - NJP',
    city: 'Siliguri',
    state: 'West Bengal',
    aliases: ['siliguri', 'new jalpaiguri', 'njp', 'darjeeling'],
    coordinates: [88.4429, 26.6853],
    isMajorHub: true,
  },
  {
    stationCode: 'GHY',
    name: 'GUWAHATI',
    displayName: 'GUWAHATI - GHY',
    city: 'Guwahati',
    state: 'Assam',
    aliases: ['guwahati', 'gauhati', 'ghy', 'kamakhya', 'assam'],
    coordinates: [91.7539, 26.1856],
    isMajorHub: true,
  },
  {
    stationCode: 'DBRG',
    name: 'DIBRUGARH',
    displayName: 'DIBRUGARH - DBRG',
    city: 'Dibrugarh',
    state: 'Assam',
    aliases: ['dibrugarh', 'dbrg', 'tea city'],
    coordinates: [94.9458, 27.4812],
    isMajorHub: false,
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
  const rawQuery = String(query || '').trim();
  const clean = rawQuery.toLowerCase();
  if (!clean || clean.length < 1) return [];

  const upperQuery = rawQuery.toUpperCase();

  // Extract candidate station code from formats like "RAIPUR JN - R", "NEW DELHI (NDLS)", "R - RAIPUR"
  const parenMatch = rawQuery.match(/\(([A-Za-z]{1,5})\)/);
  const dashMatch = rawQuery.match(/-\s*([A-Za-z]{1,5})$/);
  const prefixDashMatch = rawQuery.match(/^([A-Za-z]{1,5})\s*-\s*/);
  const extractedCode = (parenMatch?.[1] || dashMatch?.[1] || prefixDashMatch?.[1] || '').toUpperCase();

  // Base name with code suffixes/prefixes stripped
  const cleanBase = clean
    .replace(/\s*-\s*[a-z]{1,5}$/i, '')
    .replace(/\s*\([a-z]{1,5}\)$/i, '')
    .replace(/^[a-z]{1,5}\s*-\s*/i, '')
    .trim();

  // Scoring weights:
  // 1. Exact Station Code match = 1200
  // 2. Extracted Code match = 1100
  // 3. Exact DisplayName match = 1000
  // 4. Station Code starts with query = 850
  // 5. Exact Station Name match = 800
  // 6. Station Name starts with query = 650
  // 7. City Name equals query = 550
  // 8. Aliases match = 450
  // 9. Station Name contains query = 300

  const scored = [];

  for (const stn of INDIAN_RAILWAY_STATIONS) {
    let score = 0;
    const stnCode = stn.stationCode;
    const stnNameLower = stn.name.toLowerCase();
    const cityLower = stn.city.toLowerCase();
    const displayLower = (stn.displayName || `${stn.name} - ${stn.stationCode}`).toLowerCase();

    if (stnCode === upperQuery) {
      score += 1200;
    } else if (extractedCode && stnCode === extractedCode) {
      score += 1100;
    } else if (displayLower === clean) {
      score += 1000;
    } else if (stnNameLower === clean) {
      score += 850;
    } else if (cleanBase && cleanBase !== clean && stnNameLower === cleanBase) {
      score += 800;
    } else if (stnCode.startsWith(upperQuery)) {
      score += 750;
    } else if (stnNameLower.startsWith(clean)) {
      score += 650;
    } else if (cleanBase && cleanBase !== clean && stnNameLower.startsWith(cleanBase)) {
      score += 600;
    } else if (displayLower.startsWith(clean)) {
      score += 550;
    } else if (cityLower === clean || (cleanBase && cityLower === cleanBase)) {
      score += 500;
      if (stn.isMajorHub) score += 50;
    } else if (cityLower.startsWith(clean) || (cleanBase && cityLower.startsWith(cleanBase))) {
      score += 420;
      if (stn.isMajorHub) score += 30;
    } else if (stn.aliases && stn.aliases.some((a) => a === clean || a === cleanBase)) {
      score += 400;
    } else if (stn.aliases && stn.aliases.some((a) => a.startsWith(clean) || a.startsWith(cleanBase))) {
      score += 300;
    } else if (stnNameLower.includes(clean) || (cleanBase && cleanBase.length >= 2 && stnNameLower.includes(cleanBase))) {
      score += 250;
    } else if (displayLower.includes(clean)) {
      score += 200;
    } else if (cityLower.includes(clean) || (cleanBase && cleanBase.length >= 2 && cityLower.includes(cleanBase))) {
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
    displayName: s.station.displayName || `${s.station.name} - ${s.station.stationCode}`,
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

export function findStationByCode(code) {
  if (!code) return null;
  const clean = String(code).trim().toUpperCase();
  return INDIAN_RAILWAY_STATIONS.find((s) => s.stationCode === clean) || null;
}

/**
 * Finds a station in the authoritative registry by name, display name, code, or alias.
 * @param {string} name
 * @returns {Object|null}
 */
export function findStationByName(name) {
  if (!name) return null;
  const clean = String(name).trim();
  if (!clean) return null;
  const upper = clean.toUpperCase();
  const norm = (s) => String(s || '').toLowerCase().replace(/[.,/\\-]/g, ' ').replace(/\s+/g, ' ').trim();
  const lowerNorm = norm(clean);

  // 1. Exact station code match (1 to 5 letters)
  const byCode = findStationByCode(upper);
  if (byCode) return byCode;

  // 2. Extract code from "- CODE" or "(CODE)"
  const paren = clean.match(/\(([A-Za-z]{1,5})\)/) || clean.match(/-\s*([A-Za-z]{1,5})$/) || clean.match(/^([A-Za-z]{1,5})\s*-\s*/);
  if (paren) {
    const codeMatch = findStationByCode(paren[1].toUpperCase());
    if (codeMatch) return codeMatch;
  }

  // 3. Exact match against normalized name or displayName
  for (const stn of INDIAN_RAILWAY_STATIONS) {
    if (
      norm(stn.name) === lowerNorm ||
      (stn.displayName && norm(stn.displayName) === lowerNorm)
    ) {
      return stn;
    }
  }

  // 4. Match against aliases
  for (const stn of INDIAN_RAILWAY_STATIONS) {
    if (stn.aliases && stn.aliases.some((a) => norm(a) === lowerNorm)) {
      return stn;
    }
  }

  // 5. Strip suffixes like " JN", " JUNCTION", " CANTT", " TERMINAL", " CENTRAL"
  const stripped = lowerNorm.replace(/\s+(jn|junction|cantt|terminal|central|ter)$/i, '').trim();
  for (const stn of INDIAN_RAILWAY_STATIONS) {
    const stnStripped = norm(stn.name).replace(/\s+(jn|junction|cantt|terminal|central|ter)$/i, '').trim();
    if (stnStripped === stripped) {
      return stn;
    }
  }

  // 6. Match against aliases or city with stripped suffix
  for (const stn of INDIAN_RAILWAY_STATIONS) {
    if (
      stn.aliases &&
      stn.aliases.some((a) => norm(a) === stripped)
    ) {
      return stn;
    }
    if (norm(stn.city) === lowerNorm || norm(stn.city) === stripped) {
      return stn;
    }
  }

  return null;
}

export default {
  INDIAN_RAILWAY_STATIONS,
  searchRailwayStations,
  findStationByCode,
  findStationByName,
};
