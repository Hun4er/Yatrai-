import developmentJourneyProvider, { DevelopmentJourneyProvider } from './development.provider.js';

/**
 * Registry of active journey candidate sources / providers.
 * Phase 4 registers the internal development test provider by default.
 * Phase 5 will register external transport adapters (Rail, Bus, Flight, Road).
 */
class JourneyProviderRegistry {
  constructor() {
    this.providers = new Map();
    // Register development provider by default for Phase 4
    this.register('development', developmentJourneyProvider);
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

  clear() {
    this.providers.clear();
  }

  resetToDefault() {
    this.providers.clear();
    this.register('development', developmentJourneyProvider);
  }
}

export const journeyProviderRegistry = new JourneyProviderRegistry();
export { DevelopmentJourneyProvider };
export default journeyProviderRegistry;
