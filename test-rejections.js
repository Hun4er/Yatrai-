import dotenv from 'dotenv';
dotenv.config({ path: './server/.env' });

import mongoose from 'mongoose';
import config from './server/src/config/index.js';
import { JourneyGraph } from './server/src/multimodal/graph/journeyGraph.js';
import { PathFinder } from './server/src/multimodal/multimodal/pathFinder.js';
import { corridorExplorer } from './server/src/multimodal/multimodal/corridorExplorer.js';
import locationService from './server/src/services/locationService.js';
import { railTransportProvider } from './server/src/providers/transport/rail/rail.provider.js';
import { journeyNormalizer } from './server/src/normalization/journeyNormalizer.js';

async function testRejectionReasons() {
  await mongoose.connect(config.mongoUri || process.env.MONGODB_URI);
  const origin = await locationService.resolveSingle('Delhi');
  const destination = await locationService.resolveSingle('Patna');

  const graph = new JourneyGraph();
  const originNode = graph.addNode(origin);
  const destNode = graph.addNode(destination);

  const railRes = await railTransportProvider.search({
    origin,
    destination,
    departureDate: '2026-10-01'
  });
  const normalizedDirect = journeyNormalizer.normalize(railRes, {
    origin: origin._id,
    destination: destination._id,
    departureDate: '2026-10-01'
  }, { validate: true });
  graph.populateFromCandidates(normalizedDirect);

  const intermediate = await corridorExplorer.exploreIntermediateCorridors({
    origin,
    destination,
    departureDate: '2026-10-01'
  });
  graph.populateFromCandidates(intermediate);

  const pf = new PathFinder();

  // Test outgoing from intermediate hubs:
  ['varanasi', 'kanpur central', 'prayagraj jn'].forEach(hub => {
    const toHub = graph.getOutgoingEdges('delhi').filter(e => e.toNodeId === hub);
    const fromHub = graph.getOutgoingEdges(hub).filter(e => e.toNodeId === 'patna junction');
    console.log(`\nHub: ${hub}`);
    console.log(`  Edges delhi -> ${hub}: ${toHub.length}`);
    console.log(`  Edges ${hub} -> patna junction: ${fromHub.length}`);
    if (toHub.length > 0 && fromHub.length > 0) {
      toHub.slice(0, 3).forEach((e1, i) => {
        fromHub.slice(0, 3).forEach((e2, j) => {
          const res = pf.transferValidator.validateConnection(e1, e2);
          console.log(`    Pair (${i},${j}): e1 arr ${e1.arrivalTime.toISOString()} -> e2 dep ${e2.departureTime.toISOString()} => valid: ${res.valid}, reason: ${res.reason || 'OK'}`);
        });
      });
    }
  });

  await mongoose.disconnect();
}

testRejectionReasons().catch(console.error);
