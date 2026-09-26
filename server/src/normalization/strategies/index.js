import { railNormalizerStrategy } from './rail.normalizer.js';
import { busNormalizerStrategy } from './bus.normalizer.js';
import { flightNormalizerStrategy } from './flight.normalizer.js';
import { roadNormalizerStrategy } from './road.normalizer.js';
import { defaultNormalizerStrategy } from './default.normalizer.js';

export {
  railNormalizerStrategy,
  busNormalizerStrategy,
  flightNormalizerStrategy,
  roadNormalizerStrategy,
  defaultNormalizerStrategy,
};

/**
 * Selects the appropriate normalization strategy based on item metadata,
 * provider source, mode, or field structure.
 *
 * @param {Object} rawCandidate
 * @param {Object} [context={}]
 * @returns {BaseNormalizerStrategy} Selected strategy
 */
export function selectNormalizationStrategy(rawCandidate, context = {}) {
  if (!rawCandidate || typeof rawCandidate !== 'object') {
    return defaultNormalizerStrategy;
  }

  // 1. Explicit mode or source checks
  const mode = String(
    rawCandidate.mode ||
    rawCandidate.source ||
    rawCandidate.provider ||
    rawCandidate.providerCode ||
    context.mode ||
    context.provider ||
    ''
  ).toLowerCase();

  if (['rail', 'train', 'irctc'].includes(mode)) {
    return railNormalizerStrategy;
  }
  if (['bus', 'redbus', 'coach'].includes(mode)) {
    return busNormalizerStrategy;
  }
  if (['flight', 'air', 'airline', 'flight-gds', 'gds'].includes(mode)) {
    return flightNormalizerStrategy;
  }
  if (['road', 'osrm', 'driving', 'car'].includes(mode)) {
    return roadNormalizerStrategy;
  }

  // 2. Field signature heuristics
  if (rawCandidate.train_number || rawCandidate.trainNumber) {
    return railNormalizerStrategy;
  }
  if (rawCandidate.flight_number || rawCandidate.flightNumber) {
    return flightNormalizerStrategy;
  }
  if (rawCandidate.busNumber || rawCandidate.bus_number || rawCandidate.busType) {
    return busNormalizerStrategy;
  }
  if (rawCandidate.routes && Array.isArray(rawCandidate.routes)) {
    return roadNormalizerStrategy;
  }

  // 3. Fallback to default
  return defaultNormalizerStrategy;
}

export default {
  rail: railNormalizerStrategy,
  bus: busNormalizerStrategy,
  flight: flightNormalizerStrategy,
  road: roadNormalizerStrategy,
  default: defaultNormalizerStrategy,
  select: selectNormalizationStrategy,
};
