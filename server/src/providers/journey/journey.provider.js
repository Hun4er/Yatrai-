import developmentJourneyProvider, { DevelopmentJourneyProvider } from './development.provider.js';
import { roadTransportProvider } from '../transport/road/road.provider.js';
import { railTransportProvider } from '../transport/rail/rail.provider.js';
import { busTransportProvider } from '../transport/bus/bus.provider.js';
import { flightTransportProvider } from '../transport/flight/flight.provider.js';

/**
 * Registry of active journey candidate sources / providers.
 * Coordinates transport adapters (Rail, Bus, Flight, Road) and development providers.
 */
class JourneyProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.resetToDefault();
  }

  register(code, providerInstance) {
    this.providers.set(code.toLowerCase(), providerInstance);
  }

  unregister(code) {
    this.providers.delete(code.toLowerCase());
  }

  get(code) {
    return this.providers.get(code.toLowerCase()) || null;
  }

  getAll() {
    return Array.from(this.providers.values());
  }

  getProviders(filter = {}) {
    const { requestedModes } = filter;
    if (!requestedModes || !Array.isArray(requestedModes) || requestedModes.length === 0) {
      return this.getAll();
    }

    const normalizedModes = requestedModes.map((m) => String(m).toLowerCase());
    const matched = [];

    for (const [code, provider] of this.providers.entries()) {
      if (normalizedModes.includes(code)) {
        matched.push(provider);
      } else if (code === 'development') {
        // Development provider serves as fallback/fixture provider for development and testing
        matched.push(provider);
      }
    }

    return matched.length > 0 ? matched : this.getAll();
  }

  clear() {
    this.providers.clear();
  }

  resetToDefault() {
    this.providers.clear();
    this.register('development', developmentJourneyProvider);
  }

  registerTransportProviders() {
    this.register('road', roadTransportProvider);
    this.register('rail', railTransportProvider);
    this.register('bus', busTransportProvider);
    this.register('flight', flightTransportProvider);
  }
}

export const journeyProviderRegistry = new JourneyProviderRegistry();
export { DevelopmentJourneyProvider };
export default journeyProviderRegistry;
