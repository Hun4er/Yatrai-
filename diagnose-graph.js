import dotenv from 'dotenv';
dotenv.config({ path: './server/.env' });

import mongoose from 'mongoose';
import config from './server/src/config/index.js';
import { JourneyGraph } from './server/src/multimodal/graph/journeyGraph.js';
import { pathFinder } from './server/src/multimodal/multimodal/pathFinder.js';
import { corridorExplorer } from './server/src/multimodal/multimodal/corridorExplorer.js';
import locationService from './server/src/services/locationService.js';
import { railTransportProvider } from './server/src/providers/transport/rail/rail.provider.js';
import { journeyNormalizer } from './server/src/normalization/journeyNormalizer.js';

async function testGraph() {
  await mongoose.connect(config.mongoUri || process.env.MONGODB_URI);
  console.log('Connected to DB');

  const origin = await locationService.resolveSingle('Delhi');
  const destination = await locationService.resolveSingle('Patna');

  console.log('Origin resolved:', origin.name, origin._id);
  console.log('Destination resolved:', destination.name, destination._id);

  const graph = new JourneyGraph();
  const originNode = graph.addNode(origin);
  const destNode = graph.addNode(destination);

  console.log('Graph originNode:', originNode.id, originNode.name);
  console.log('Graph destNode:', destNode.id, destNode.name);

  // Search direct rail
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

  console.log('Normalized direct count:', normalizedDirect?.length);
  if (normalizedDirect?.length > 0) {
    console.log('Sample direct candidate leg[0]:', {
      origin: normalizedDirect[0].legs[0].origin,
      dest: normalizedDirect[0].legs[0].destination,
      metadata: normalizedDirect[0].legs[0].metadata
    });
  }

  graph.populateFromCandidates(normalizedDirect);

  // Explore intermediate
  const intermediate = await corridorExplorer.exploreIntermediateCorridors({
    origin,
    destination,
    departureDate: '2026-10-01'
  });
  console.log('Intermediate candidates count:', intermediate.length);

  graph.populateFromCandidates(intermediate);

  const summary = graph.getSummary();
  console.log('Graph nodes:', summary.nodes, 'edges:', summary.edges);
  console.log('All node IDs in graph:', Array.from(graph.nodes.keys()));

  console.log('Outgoing edges from originNode.id (', originNode.id, '):', graph.getOutgoingEdges(originNode.id).length);

  // Let's test pathFinder
  const paths = pathFinder.findPaths(graph, originNode.id, destNode.id);
  console.log('Found paths:', paths.length);
  paths.forEach((p, idx) => {
    console.log(`Path ${idx + 1}:`, p.map(e => `${e.fromNodeName} -> ${e.toNodeName} (${e.mode}) [dep: ${e.departureTime.toLocaleTimeString()}, arr: ${e.arrivalTime.toLocaleTimeString()}]`).join(' then '));
  });

  await mongoose.disconnect();
}

testGraph().catch(console.error);
