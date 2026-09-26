import { BaseRankingStrategy } from './base.strategy.js';
import { overallStrategy, OverallStrategy } from './overall.strategy.js';
import { fastestStrategy, FastestStrategy } from './fastest.strategy.js';
import { cheapestStrategy, CheapestStrategy } from './cheapest.strategy.js';
import { fewestTransfersStrategy, FewestTransfersStrategy } from './fewestTransfers.strategy.js';
import { mostConvenientStrategy, MostConvenientStrategy } from './mostConvenient.strategy.js';

export {
  BaseRankingStrategy,
  overallStrategy,
  OverallStrategy,
  fastestStrategy,
  FastestStrategy,
  cheapestStrategy,
  CheapestStrategy,
  fewestTransfersStrategy,
  FewestTransfersStrategy,
  mostConvenientStrategy,
  MostConvenientStrategy,
};

export default {
  overall: overallStrategy,
  fastest: fastestStrategy,
  cheapest: cheapestStrategy,
  fewest_transfers: fewestTransfersStrategy,
  most_convenient: mostConvenientStrategy,
};
