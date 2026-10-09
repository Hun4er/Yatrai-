import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JourneyGraph } from '../src/multimodal/graph/journeyGraph.js';
import { GraphNode } from '../src/multimodal/graph/graphNode.js';
import { GraphEdge } from '../src/multimodal/graph/graphEdge.js';
import { PathFinder } from '../src/multimodal/multimodal/pathFinder.js';
import { JourneyBuilder } from '../src/multimodal/multimodal/journeyBuilder.js';
import { TransferValidator } from '../src/multimodal/multimodal/transferValidator.js';
import { JourneyValidator } from '../src/multimodal/validation/journeyValidator.js';
import { MultiModalEngine } from '../src/multimodal/multiModalEngine.js';

describe('Phase 23 — Multi-Modal Journey Discovery Engine', () => {
  const transferValidator = new TransferValidator();
  const journeyValidator = new JourneyValidator();
  const journeyBuilder = new JourneyBuilder();

  // Test 1: Direct train
  it('1. Direct train leg is discovered and validated as DIRECT', () => {
    const graph = new JourneyGraph();
    const o = graph.addNode({ name: 'Delhi', city: 'Delhi' });
    const d = graph.addNode({ name: 'Patna', city: 'Patna' });

    graph.addEdge({
      fromNodeId: o.id,
      toNodeId: d.id,
      fromNodeName: 'Delhi',
      toNodeName: 'Patna',
      mode: 'rail',
      departureTime: new Date('2026-10-01T06:00:00Z'),
      arrivalTime: new Date('2026-10-01T18:00:00Z'),
      duration: 720,
      price: 1449,
    });

    const pf = new PathFinder({ transferValidator });
    const paths = pf.findPaths(graph, o.id, d.id);
    assert.equal(paths.length, 1);
    const journey = journeyBuilder.buildJourney(paths[0], { originLocation: o, destLocation: d });
    assert.equal(journey.type, 'DIRECT');
    assert.equal(journey.numberOfTransfers, 0);
    assert.equal(journey.transportModes[0], 'rail');
  });

  // Test 2: Direct bus
  it('2. Direct bus leg is discovered and validated as DIRECT', () => {
    const graph = new JourneyGraph();
    const o = graph.addNode({ name: 'Delhi', city: 'Delhi' });
    const d = graph.addNode({ name: 'Patna', city: 'Patna' });

    graph.addEdge({
      fromNodeId: o.id,
      toNodeId: d.id,
      fromNodeName: 'Delhi',
      toNodeName: 'Patna',
      mode: 'bus',
      departureTime: new Date('2026-10-01T17:00:00Z'),
      arrivalTime: new Date('2026-10-02T11:00:00Z'),
      duration: 1080,
      price: 1200,
    });

    const pf = new PathFinder({ transferValidator });
    const paths = pf.findPaths(graph, o.id, d.id);
    assert.equal(paths.length, 1);
    const journey = journeyBuilder.buildJourney(paths[0]);
    assert.equal(journey.type, 'DIRECT');
    assert.equal(journey.transportModes[0], 'bus');
  });

  // Test 3: Direct flight
  it('3. Direct flight leg is discovered and validated as DIRECT', () => {
    const graph = new JourneyGraph();
    const o = graph.addNode({ name: 'Delhi', city: 'Delhi' });
    const d = graph.addNode({ name: 'Patna', city: 'Patna' });

    graph.addEdge({
      fromNodeId: o.id,
      toNodeId: d.id,
      fromNodeName: 'Delhi Airport',
      toNodeName: 'Patna Airport',
      mode: 'flight',
      departureTime: new Date('2026-10-01T08:00:00Z'),
      arrivalTime: new Date('2026-10-01T09:40:00Z'),
      duration: 100,
      price: 4500,
    });

    const pf = new PathFinder({ transferValidator });
    const paths = pf.findPaths(graph, o.id, d.id);
    assert.equal(paths.length, 1);
    const journey = journeyBuilder.buildJourney(paths[0]);
    assert.equal(journey.type, 'DIRECT');
    assert.equal(journey.transportModes[0], 'flight');
  });

  // Test 4: Direct road
  it('4. Direct road route is discovered and pricing marked as estimated', () => {
    const graph = new JourneyGraph();
    const o = graph.addNode({ name: 'Delhi', city: 'Delhi' });
    const d = graph.addNode({ name: 'Patna', city: 'Patna' });

    graph.addEdge({
      fromNodeId: o.id,
      toNodeId: d.id,
      fromNodeName: 'Delhi',
      toNodeName: 'Patna',
      mode: 'road',
      departureTime: new Date('2026-10-01T06:00:00Z'),
      arrivalTime: new Date('2026-10-01T22:00:00Z'),
      duration: 960,
      price: 12000,
      isEstimatedPrice: true,
    });

    const pf = new PathFinder({ transferValidator });
    const paths = pf.findPaths(graph, o.id, d.id);
    assert.equal(paths.length, 1);
    const journey = journeyBuilder.buildJourney(paths[0]);
    assert.equal(journey.type, 'DIRECT');
    assert.equal(journey.pricing.containsEstimatedComponents, true);
  });

  // Test 5: Road -> Train
  it('5. Road -> Train multi-modal connection is dynamically discovered', () => {
    const graph = new JourneyGraph();
    const o = graph.addNode({ name: 'Delhi', city: 'Delhi' });
    const hub = graph.addNode({ name: 'New Delhi Railway Station', city: 'Delhi' });
    const d = graph.addNode({ name: 'Patna', city: 'Patna' });

    graph.addEdge({
      fromNodeId: o.id,
      toNodeId: hub.id,
      fromNodeName: 'Delhi',
      toNodeName: 'New Delhi Railway Station',
      mode: 'road',
      departureTime: new Date('2026-10-01T04:30:00Z'),
      arrivalTime: new Date('2026-10-01T05:15:00Z'),
      duration: 45,
      price: 250,
      isEstimatedPrice: true,
    });

    graph.addEdge({
      fromNodeId: hub.id,
      toNodeId: d.id,
      fromNodeName: 'New Delhi Railway Station',
      toNodeName: 'Patna',
      mode: 'rail',
      departureTime: new Date('2026-10-01T06:00:00Z'), // 45m buffer
      arrivalTime: new Date('2026-10-01T18:00:00Z'),
      duration: 720,
      price: 1449,
    });

    const pf = new PathFinder({ transferValidator });
    const paths = pf.findPaths(graph, o.id, d.id);
    assert.equal(paths.length, 1);
    const journey = journeyBuilder.buildJourney(paths[0], { originLocation: o, destLocation: d });
    assert.equal(journey.type, 'MULTI_MODAL');
    assert.equal(journey.numberOfTransfers, 1);
    assert.deepEqual(journey.transportModes, ['road', 'rail']);
    assert.equal(journey.legs.length, 2);
  });

  // Test 6: Train -> Train
  it('6. Train -> Train transfer via intermediate hub is dynamically discovered', () => {
    const graph = new JourneyGraph();
    const o = graph.addNode({ name: 'Delhi', city: 'Delhi' });
    const hub = graph.addNode({ name: 'Varanasi', city: 'Varanasi' });
    const d = graph.addNode({ name: 'Patna', city: 'Patna' });

    graph.addEdge({
      fromNodeId: o.id,
      toNodeId: hub.id,
      fromNodeName: 'Delhi',
      toNodeName: 'Varanasi',
      mode: 'rail',
      departureTime: new Date('2026-10-01T06:00:00Z'),
      arrivalTime: new Date('2026-10-01T14:00:00Z'),
      duration: 480,
      price: 1100,
    });

    graph.addEdge({
      fromNodeId: hub.id,
      toNodeId: d.id,
      fromNodeName: 'Varanasi',
      toNodeName: 'Patna',
      mode: 'rail',
      departureTime: new Date('2026-10-01T15:30:00Z'), // 90m layover
      arrivalTime: new Date('2026-10-01T20:00:00Z'),
      duration: 270,
      price: 450,
    });

    const pf = new PathFinder({ transferValidator });
    const paths = pf.findPaths(graph, o.id, d.id);
    assert.equal(paths.length, 1);
    const journey = journeyBuilder.buildJourney(paths[0]);
    assert.equal(journey.type, 'MULTI_MODAL');
    assert.equal(journey.numberOfTransfers, 1);
    assert.equal(journey.totalPrice, 1550);
  });

  // Test 7: Train -> Bus
  it('7. Train -> Bus transfer is discovered and validated', () => {
    const graph = new JourneyGraph();
    const o = graph.addNode({ name: 'Delhi', city: 'Delhi' });
    const hub = graph.addNode({ name: 'Varanasi', city: 'Varanasi' });
    const d = graph.addNode({ name: 'Patna', city: 'Patna' });

    graph.addEdge({
      fromNodeId: o.id,
      toNodeId: hub.id,
      fromNodeName: 'Delhi',
      toNodeName: 'Varanasi',
      mode: 'rail',
      departureTime: new Date('2026-10-01T06:00:00Z'),
      arrivalTime: new Date('2026-10-01T14:00:00Z'),
      duration: 480,
      price: 1100,
    });

    graph.addEdge({
      fromNodeId: hub.id,
      toNodeId: d.id,
      fromNodeName: 'Varanasi Bus Stand',
      toNodeName: 'Patna',
      mode: 'bus',
      departureTime: new Date('2026-10-01T15:30:00Z'), // 90m transfer between train and bus
      arrivalTime: new Date('2026-10-01T21:00:00Z'),
      duration: 330,
      price: 400,
    });

    const pf = new PathFinder({ transferValidator });
    const paths = pf.findPaths(graph, o.id, d.id);
    assert.equal(paths.length, 1);
    const journey = journeyBuilder.buildJourney(paths[0]);
    assert.equal(journey.type, 'MULTI_MODAL');
    assert.deepEqual(journey.transportModes, ['rail', 'bus']);
  });

  // Test 8: Flight -> Road
  it('8. Flight -> Road transfer from airport to destination is discovered', () => {
    const graph = new JourneyGraph();
    const o = graph.addNode({ name: 'Delhi', city: 'Delhi' });
    const airport = graph.addNode({ name: 'Patna Airport', city: 'Patna' });
    const d = graph.addNode({ name: 'Patna City Center', city: 'Patna' });

    graph.addEdge({
      fromNodeId: o.id,
      toNodeId: airport.id,
      fromNodeName: 'Delhi Airport',
      toNodeName: 'Patna Airport',
      mode: 'flight',
      departureTime: new Date('2026-10-01T08:00:00Z'),
      arrivalTime: new Date('2026-10-01T09:40:00Z'),
      duration: 100,
      price: 4500,
    });

    graph.addEdge({
      fromNodeId: airport.id,
      toNodeId: d.id,
      fromNodeName: 'Patna Airport',
      toNodeName: 'Patna City Center',
      mode: 'road',
      departureTime: new Date('2026-10-01T10:40:00Z'), // 60m transfer from flight
      arrivalTime: new Date('2026-10-01T11:15:00Z'),
      duration: 35,
      price: 350,
      isEstimatedPrice: true,
    });

    const pf = new PathFinder({ transferValidator });
    const paths = pf.findPaths(graph, o.id, d.id);
    assert.equal(paths.length, 1);
    const journey = journeyBuilder.buildJourney(paths[0]);
    assert.equal(journey.type, 'MULTI_MODAL');
    assert.deepEqual(journey.transportModes, ['flight', 'road']);
  });

  // Test 9: Invalid transfer timing
  it('9. Rejects connection when transfer buffer is insufficient', () => {
    const edge1 = new GraphEdge({
      fromNodeId: 'delhi',
      toNodeId: 'varanasi',
      mode: 'rail',
      departureTime: new Date('2026-10-01T06:00:00Z'),
      arrivalTime: new Date('2026-10-01T14:00:00Z'),
    });

    const edge2 = new GraphEdge({
      fromNodeId: 'varanasi',
      toNodeId: 'patna',
      mode: 'rail',
      departureTime: new Date('2026-10-01T14:20:00Z'), // Only 20 mins, 45 mins required!
      arrivalTime: new Date('2026-10-01T19:00:00Z'),
    });

    const conn = transferValidator.validateConnection(edge1, edge2);
    assert.equal(conn.valid, false);
    assert.match(conn.reason, /Insufficient transfer buffer/);
  });

  // Test 10: Same location transfer
  it('10. Path exploration rejects cyclic / same-station loops', () => {
    const graph = new JourneyGraph();
    const o = graph.addNode({ name: 'Delhi', city: 'Delhi' });
    const d = graph.addNode({ name: 'Patna', city: 'Patna' });

    // Edge from Delhi to Delhi (loop)
    graph.addEdge({
      fromNodeId: o.id,
      toNodeId: o.id,
      fromNodeName: 'Delhi',
      toNodeName: 'Delhi',
      mode: 'road',
      departureTime: new Date('2026-10-01T06:00:00Z'),
      arrivalTime: new Date('2026-10-01T06:30:00Z'),
    });

    const pf = new PathFinder({ transferValidator });
    const paths = pf.findPaths(graph, o.id, d.id);
    assert.equal(paths.length, 0);
  });

  // Test 11: Duplicate journey deduplication
  it('11. Exact duplicate multi-modal fingerprints are collapsed', () => {
    const mm1 = {
      numberOfTransfers: 1,
      duration: 600,
      transportModes: ['rail', 'rail'],
      legs: [
        { origin: 'NDLS', destination: 'CNB', departureTime: new Date('2026-10-01T06:00:00Z') },
        { origin: 'CNB', destination: 'PNBE', departureTime: new Date('2026-10-01T12:00:00Z') },
      ],
    };

    const mm2 = {
      numberOfTransfers: 1,
      duration: 600,
      transportModes: ['rail', 'rail'],
      legs: [
        { origin: 'NDLS', destination: 'CNB', departureTime: new Date('2026-10-01T06:00:00Z') },
        { origin: 'CNB', destination: 'PNBE', departureTime: new Date('2026-10-01T12:00:00Z') },
      ],
    };

    const seen = new Set();
    const list = [mm1, mm2].filter((m) => {
      const fp = `${m.transportModes.join('+')}::${m.legs.map((l) => `${l.origin}->${l.destination}@${l.departureTime.toISOString()}`).join('|')}`;
      if (seen.has(fp)) return false;
      seen.add(fp);
      return true;
    });

    assert.equal(list.length, 1);
  });

  // Test 12: Maximum transfer limit
  it('12. Paths exceeding maximum transfers are rejected', () => {
    const graph = new JourneyGraph();
    const n1 = graph.addNode({ name: 'A' });
    const n2 = graph.addNode({ name: 'B' });
    const n3 = graph.addNode({ name: 'C' });
    const n4 = graph.addNode({ name: 'D' });
    const n5 = graph.addNode({ name: 'E' });

    graph.addEdge({ fromNodeId: n1.id, toNodeId: n2.id, mode: 'road', departureTime: new Date('2026-10-01T01:00:00Z'), arrivalTime: new Date('2026-10-01T02:00:00Z') });
    graph.addEdge({ fromNodeId: n2.id, toNodeId: n3.id, mode: 'rail', departureTime: new Date('2026-10-01T03:00:00Z'), arrivalTime: new Date('2026-10-01T05:00:00Z') });
    graph.addEdge({ fromNodeId: n3.id, toNodeId: n4.id, mode: 'rail', departureTime: new Date('2026-10-01T06:00:00Z'), arrivalTime: new Date('2026-10-01T08:00:00Z') });
    graph.addEdge({ fromNodeId: n4.id, toNodeId: n5.id, mode: 'road', departureTime: new Date('2026-10-01T09:00:00Z'), arrivalTime: new Date('2026-10-01T10:00:00Z') });

    // maxTransfers = 2, this path has 3 transfers (4 legs)
    const pf = new PathFinder({ maxTransfers: 2, maxLegs: 3 });
    const paths = pf.findPaths(graph, n1.id, n5.id);
    assert.equal(paths.length, 0);
  });

  // Test 13: Maximum journey duration
  it('13. Paths exceeding maximum allowed duration are rejected', () => {
    const graph = new JourneyGraph();
    const o = graph.addNode({ name: 'Delhi' });
    const hub = graph.addNode({ name: 'Kanpur' });
    const d = graph.addNode({ name: 'Patna' });

    graph.addEdge({
      fromNodeId: o.id,
      toNodeId: hub.id,
      mode: 'rail',
      departureTime: new Date('2026-10-01T06:00:00Z'),
      arrivalTime: new Date('2026-10-01T12:00:00Z'),
    });

    graph.addEdge({
      fromNodeId: hub.id,
      toNodeId: d.id,
      mode: 'rail',
      departureTime: new Date('2026-10-03T20:00:00Z'), // 56 hours later!
      arrivalTime: new Date('2026-10-04T02:00:00Z'),
    });

    const pf = new PathFinder({ maxDurationMinutes: 1440 }); // 24 hr limit
    const paths = pf.findPaths(graph, o.id, d.id);
    assert.equal(paths.length, 0);
  });

  // Test 14: Provider unavailable
  it('14. Engine gracefully functions when a secondary provider is unavailable', async () => {
    const engine = new MultiModalEngine();
    const directCandidates = [
      {
        origin: '6ab6dc2f7136cda73470c3a4',
        destination: '6ab6dc347136cda73470c3a6',
        departureTime: new Date('2026-10-01T06:00:00Z'),
        arrivalTime: new Date('2026-10-01T18:00:00Z'),
        duration: 720,
        totalPrice: 1449,
        numberOfTransfers: 0,
        transportModes: ['rail'],
        legs: [
          {
            sequence: 1,
            origin: '6ab6dc2f7136cda73470c3a4',
            destination: '6ab6dc347136cda73470c3a6',
            mode: 'rail',
            departureTime: new Date('2026-10-01T06:00:00Z'),
            arrivalTime: new Date('2026-10-01T18:00:00Z'),
            duration: 720,
            price: 1449,
          },
        ],
      },
    ];

    const results = await engine.discoverJourneys(
      {
        originLocation: { id: 'delhi', name: 'Delhi' },
        destLocation: { id: 'patna', name: 'Patna' },
        departureDate: '2026-10-01',
      },
      directCandidates,
      { exploreCorridors: false }
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].transportModes[0], 'rail');
  });

  // Test 15: Missing provider data
  it('15. Discards legs missing critical departure or arrival schedules', () => {
    const edge = new GraphEdge({
      fromNodeId: 'delhi',
      toNodeId: 'patna',
      mode: 'rail',
      departureTime: null,
      arrivalTime: new Date('2026-10-01T18:00:00Z'),
    });
    assert.equal(edge.isValidTiming(), false);
  });

  // Test 16: Invalid provider response (negative duration or backwards timing)
  it('16. Rejects corrupted edge where arrival precedes departure', () => {
    const edge = new GraphEdge({
      fromNodeId: 'delhi',
      toNodeId: 'patna',
      mode: 'rail',
      departureTime: new Date('2026-10-01T18:00:00Z'),
      arrivalTime: new Date('2026-10-01T06:00:00Z'), // Arrives before departing!
    });
    assert.equal(edge.isValidTiming(), false);
  });

  // Test 17: Estimated road pricing
  it('17. Multi-modal journey containing road components flags estimated pricing', () => {
    const journey = journeyBuilder.buildJourney([
      new GraphEdge({
        fromNodeId: 'delhi',
        toNodeId: 'station',
        mode: 'road',
        isEstimatedPrice: true,
        price: 250,
        departureTime: new Date('2026-10-01T05:00:00Z'),
        arrivalTime: new Date('2026-10-01T05:30:00Z'),
        duration: 30,
      }),
      new GraphEdge({
        fromNodeId: 'station',
        toNodeId: 'patna',
        mode: 'rail',
        isEstimatedPrice: false,
        price: 1449,
        departureTime: new Date('2026-10-01T06:30:00Z'),
        arrivalTime: new Date('2026-10-01T18:00:00Z'),
        duration: 690,
      }),
    ]);

    assert.equal(journey.pricing.containsEstimatedComponents, true);
    assert.equal(journey.totalPrice, 1699);
  });

  // Test 18: Multiple valid alternatives coexist
  it('18. Direct and multi-modal alternatives coexist in discovered journey set', async () => {
    const graph = new JourneyGraph();
    const o = graph.addNode({ name: 'Delhi' });
    const hub = graph.addNode({ name: 'Kanpur' });
    const d = graph.addNode({ name: 'Patna' });

    // Direct rail
    graph.addEdge({
      fromNodeId: o.id,
      toNodeId: d.id,
      mode: 'rail',
      departureTime: new Date('2026-10-01T06:00:00Z'),
      arrivalTime: new Date('2026-10-01T18:00:00Z'),
      duration: 720,
      price: 1449,
    });

    // Multi-modal rail -> rail
    graph.addEdge({
      fromNodeId: o.id,
      toNodeId: hub.id,
      mode: 'rail',
      departureTime: new Date('2026-10-01T07:00:00Z'),
      arrivalTime: new Date('2026-10-01T11:00:00Z'),
      duration: 240,
      price: 600,
    });
    graph.addEdge({
      fromNodeId: hub.id,
      toNodeId: d.id,
      mode: 'rail',
      departureTime: new Date('2026-10-01T12:00:00Z'),
      arrivalTime: new Date('2026-10-01T17:00:00Z'),
      duration: 300,
      price: 550,
    });

    const pf = new PathFinder({ transferValidator });
    const paths = pf.findPaths(graph, o.id, d.id);
    assert.equal(paths.length, 2);

    const journeys = paths.map((p) => journeyBuilder.buildJourney(p));
    const direct = journeys.filter((j) => j.type === 'DIRECT');
    const multi = journeys.filter((j) => j.type === 'MULTI_MODAL');

    assert.equal(direct.length, 1);
    assert.equal(multi.length, 1);
    assert.equal(multi[0].totalPrice, 1150);
  });
});
