export const seedProviders = [
  // Rail
  {
    name: 'Indian Railway Catering and Tourism Corporation',
    code: 'IRCTC',
    type: 'rail',
    description:
      'National railway provider connecting broad gauge and express networks across India.',
    website: 'https://www.irctc.co.in',
    supportedModes: ['rail'],
    status: 'active',
    capabilities: {
      realtimeAvailability: true,
      bookingRedirect: true,
      directBooking: false,
    },
  },

  // Airline
  {
    name: 'IndiGo Airlines',
    code: 'INDIGO',
    type: 'airline',
    description: "India's largest low-cost commercial passenger airline.",
    website: 'https://www.goindigo.in',
    supportedModes: ['flight'],
    status: 'active',
    capabilities: {
      realtimeAvailability: true,
      bookingRedirect: true,
      directBooking: false,
    },
  },
  {
    name: 'Air India',
    code: 'AIRINDIA',
    type: 'airline',
    description:
      'Full-service Indian flag carrier connecting major domestic and international routes.',
    website: 'https://www.airindia.com',
    supportedModes: ['flight'],
    status: 'active',
    capabilities: {
      realtimeAvailability: true,
      bookingRedirect: true,
      directBooking: false,
    },
  },

  // Bus
  {
    name: 'Uttar Pradesh State Road Transport Corporation',
    code: 'UPSRTC',
    type: 'bus',
    description:
      'State-run intercity bus transit operator in Uttar Pradesh and neighbouring regions.',
    website: 'https://www.upsrtc.up.gov.in',
    supportedModes: ['bus'],
    status: 'active',
    capabilities: {
      realtimeAvailability: false,
      bookingRedirect: true,
      directBooking: false,
    },
  },
  {
    name: 'Delhi Transport Corporation',
    code: 'DTC',
    type: 'bus',
    description: 'Public transit bus service operator in the National Capital Region.',
    website: 'https://dtc.delhi.gov.in',
    supportedModes: ['bus'],
    status: 'active',
    capabilities: {
      realtimeAvailability: false,
      bookingRedirect: false,
      directBooking: false,
    },
  },

  // Road / Ride-hailing / Taxi
  {
    name: 'Ola Cabs',
    code: 'OLA',
    type: 'ride_hailing',
    description: 'First and last mile on-demand cab and auto-rickshaw mobility platform.',
    website: 'https://www.olacabs.com',
    supportedModes: ['road', 'taxi'],
    status: 'active',
    capabilities: {
      realtimeAvailability: true,
      bookingRedirect: true,
      directBooking: false,
    },
  },
  {
    name: 'Uber India',
    code: 'UBER',
    type: 'ride_hailing',
    description: 'Global urban ridesharing and car service operator in major Indian cities.',
    website: 'https://www.uber.com',
    supportedModes: ['road', 'taxi'],
    status: 'active',
    capabilities: {
      realtimeAvailability: true,
      bookingRedirect: true,
      directBooking: false,
    },
  },
];

export default seedProviders;
