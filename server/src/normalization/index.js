import {
  journeyNormalizer,
  JourneyNormalizer,
  normalizeJourneyCandidate,
  normalizeProviderResult,
} from './journeyNormalizer.js';
import { validateJourneyCandidate } from './journeyValidator.js';
import {
  railNormalizerStrategy,
  busNormalizerStrategy,
  flightNormalizerStrategy,
  roadNormalizerStrategy,
  defaultNormalizerStrategy,
  selectNormalizationStrategy,
} from './strategies/index.js';

export {
  journeyNormalizer,
  JourneyNormalizer,
  normalizeJourneyCandidate,
  normalizeProviderResult,
  validateJourneyCandidate,
  railNormalizerStrategy,
  busNormalizerStrategy,
  flightNormalizerStrategy,
  roadNormalizerStrategy,
  defaultNormalizerStrategy,
  selectNormalizationStrategy,
};

export default journeyNormalizer;
