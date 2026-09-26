import rankingEngine, { RankingEngine } from './rankingEngine.js';
import rankingRegistry, { RankingRegistry } from './rankingRegistry.js';
import {
  DEFAULT_STRATEGY,
  STRATEGY_DEFINITIONS,
  OVERALL_WEIGHTS,
  CONVENIENCE_WEIGHTS,
  SCHEDULE_SCORING,
  MISSING_VALUE_POLICY,
} from './rankingConfig.js';
import {
  BaseRankingStrategy,
  overallStrategy,
  fastestStrategy,
  cheapestStrategy,
  fewestTransfersStrategy,
  mostConvenientStrategy,
} from './strategies/index.js';
import {
  normalizeLowerIsBetter,
  normalizeHigherIsBetter,
  getMetricBounds,
} from './utils/scoreNormalizer.js';
import { createTieBreaker } from './utils/tieBreaker.js';

export {
  rankingEngine,
  RankingEngine,
  rankingRegistry,
  RankingRegistry,
  DEFAULT_STRATEGY,
  STRATEGY_DEFINITIONS,
  OVERALL_WEIGHTS,
  CONVENIENCE_WEIGHTS,
  SCHEDULE_SCORING,
  MISSING_VALUE_POLICY,
  BaseRankingStrategy,
  overallStrategy,
  fastestStrategy,
  cheapestStrategy,
  fewestTransfersStrategy,
  mostConvenientStrategy,
  normalizeLowerIsBetter,
  normalizeHigherIsBetter,
  getMetricBounds,
  createTieBreaker,
};

export default rankingEngine;
