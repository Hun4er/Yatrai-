export const seedUsers = [
  {
    name: 'Aarav Sharma',
    email: 'aarav.sharma@example.com',
    passwordHash: '$2b$10$eFfTZVRO571dHuc.12Cljum5aRbZaA6xzWXKrf9T8upjBX0ae3BQS', // YatraiPass@123
    phone: '+91-9876543210',
    avatar:
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150',
    preferences: {
      preferredTransportModes: ['rail', 'flight'],
      preferredCurrency: 'INR',
      preferredLanguage: 'en',
    },
    status: 'active',
  },
  {
    name: 'Priya Patel',
    email: 'priya.patel@example.com',
    passwordHash: '$2b$10$eFfTZVRO571dHuc.12Cljum5aRbZaA6xzWXKrf9T8upjBX0ae3BQS', // YatraiPass@123
    phone: '+91-9876543211',
    avatar:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150',
    preferences: {
      preferredTransportModes: ['rail', 'bus', 'road'],
      preferredCurrency: 'INR',
      preferredLanguage: 'en',
    },
    status: 'active',
  },
  {
    name: 'Dev Traveler',
    email: 'dev.traveler@example.com',
    passwordHash: '$2b$10$eFfTZVRO571dHuc.12Cljum5aRbZaA6xzWXKrf9T8upjBX0ae3BQS', // YatraiPass@123
    phone: '+91-9876543212',
    avatar: null,
    preferences: {
      preferredTransportModes: ['rail', 'flight', 'bus', 'taxi'],
      preferredCurrency: 'INR',
      preferredLanguage: 'en',
    },
    status: 'active',
  },
];

export default seedUsers;
