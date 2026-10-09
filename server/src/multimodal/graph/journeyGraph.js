import { GraphNode } from './graphNode.js';
import { GraphEdge } from './graphEdge.js';
import logger from '../../utils/logger.js';

/**
 * JourneyGraph
 * Directed temporal multi-modal graph representing reachable nodes and scheduled transport edges.
 */
export class JourneyGraph {
  constructor() {
    this.nodes = new Map(); // canonicalNodeId -> GraphNode
    this.aliasMap = new Map(); // alias/name/code/objectId -> canonicalNodeId
    this.adjacency = new Map(); // canonicalNodeId -> Array<GraphEdge>
  }

  /**
   * Clears the graph state.
   */
  clear() {
    this.nodes.clear();
    this.aliasMap.clear();
    this.adjacency.clear();
  }

  /**
   * Safe extraction of ID string from any format (string, ObjectId, location object).
   */
  extractId(loc) {
    if (!loc) return '';
    if (typeof loc === 'string') return loc.trim();
    if (loc._bsontype === 'ObjectID' || typeof loc.toHexString === 'function') {
      return loc.toString();
    }
    if (loc._id) {
      return typeof loc._id === 'object' && loc._id !== null ? loc._id.toString() : String(loc._id);
    }
    if (loc.id && typeof loc.id === 'string') {
      return loc.id;
    }
    return '';
  }

  /**
   * Resolves any identifier, ObjectId, name, city, or station code to canonical node ID.
   */
  getCanonicalId(idOrLocation) {
    if (!idOrLocation) return '';

    if (typeof idOrLocation === 'object') {
      const oid = this.extractId(idOrLocation);
      if (oid && this.aliasMap.has(oid.toLowerCase())) return this.aliasMap.get(oid.toLowerCase());

      const code = idOrLocation.stationCode || idOrLocation.code;
      if (code && this.aliasMap.has(String(code).toLowerCase().trim())) {
        return this.aliasMap.get(String(code).toLowerCase().trim());
      }

      const name = idOrLocation.name ? idOrLocation.name.toLowerCase().trim() : '';
      if (name && this.aliasMap.has(name)) return this.aliasMap.get(name);

      // Only check city alias if no specific name was given
      if (!name) {
        const city = idOrLocation.city ? idOrLocation.city.toLowerCase().trim() : '';
        if (city && this.aliasMap.has(city)) return this.aliasMap.get(city);
      }

      return name || (idOrLocation.city ? idOrLocation.city.toLowerCase().trim() : '') || oid || 'unknown';
    }

    const clean = String(idOrLocation).toLowerCase().trim();
    if (this.aliasMap.has(clean)) {
      return this.aliasMap.get(clean);
    }
    return clean;
  }

  /**
   * Adds or returns an existing GraphNode.
   */
  addNode(locationData) {
    if (!locationData) return null;

    // If already known via alias, return existing node
    const canonicalCandidate = this.getCanonicalId(locationData);
    if (this.nodes.has(canonicalCandidate)) {
      return this.nodes.get(canonicalCandidate);
    }

    const rawName = String(locationData.name || locationData.displayName || locationData.city || '').trim();
    const rawId = this.extractId(locationData);
    const canonicalId = (rawName || rawId || 'unknown').toLowerCase().trim();

    if (!canonicalId) return null;

    let node = this.nodes.get(canonicalId);
    if (!node) {
      node = new GraphNode({
        id: canonicalId,
        name: rawName || canonicalId,
        type: locationData.type || 'city',
        coordinates: locationData.coordinates || [
          locationData.longitude ?? locationData.lon ?? 0,
          locationData.latitude ?? locationData.lat ?? 0,
        ],
        city: locationData.city || rawName || '',
        state: locationData.state || '',
        country: locationData.country || 'India',
        locationDoc: locationData,
        stationCode: locationData.stationCode || locationData.code || null,
        aliases: locationData.aliases || [],
      });
      this.nodes.set(canonicalId, node);
      this.adjacency.set(canonicalId, []);
    }

    // Register all aliases pointing to this canonical node
    this.aliasMap.set(canonicalId, canonicalId);
    if (rawId) this.aliasMap.set(rawId.toLowerCase(), canonicalId);
    if (rawName) this.aliasMap.set(rawName.toLowerCase().trim(), canonicalId);
    if (locationData.city && (!rawName || rawName.toLowerCase() === locationData.city.toLowerCase())) {
      this.aliasMap.set(locationData.city.toLowerCase().trim(), canonicalId);
    }
    if (locationData.stationCode) this.aliasMap.set(String(locationData.stationCode).toLowerCase().trim(), canonicalId);
    if (locationData.code) this.aliasMap.set(String(locationData.code).toLowerCase().trim(), canonicalId);

    // Common transit station abbreviations
    const lowerName = rawName.toLowerCase();
    if (lowerName.includes(' jn') || lowerName.includes(' junction')) {
      const base = lowerName.replace(/\b(jn|junction)\b/g, '').trim();
      if (base) {
        this.aliasMap.set(`${base} jn`, canonicalId);
        this.aliasMap.set(`${base} junction`, canonicalId);
        this.aliasMap.set(base, canonicalId);
      }
    }

    // Metropolitan cluster station associations
    const METRO_SYNONYMS = {
      delhi: ['new delhi', 'ndls', 'dli', 'delhi junction', 'old delhi', 'hazrat nizamuddin', 'nzm', 'anand vihar', 'anvt'],
      'new delhi': ['delhi', 'ndls', 'dli', 'delhi junction', 'old delhi', 'hazrat nizamuddin', 'nzm', 'anand vihar', 'anvt'],
      patna: ['patna jn', 'patna junction', 'pnbe', 'danapur', 'patliputra', 'ppta'],
      'patna junction': ['patna', 'patna jn', 'pnbe', 'danapur', 'patliputra', 'ppta'],
      varanasi: ['varanasi jn', 'varanasi junction', 'bsb', 'deendayal upadhyaya', 'ddu'],
      kanpur: ['kanpur central', 'cnb'],
      'kanpur central': ['kanpur', 'cnb'],
      prayagraj: ['prayagraj jn', 'prayagraj junction', 'pryj', 'allahabad'],
      'prayagraj junction': ['prayagraj', 'prayagraj jn', 'pryj', 'allahabad'],
      lucknow: ['lucknow charbagh', 'lko', 'ljn', 'lucknow junction'],
      mumbai: ['csmt', 'mumbai central', 'bct', 'bandra terminus', 'bdts', 'lokmanya tilak', 'ltt'],
      chennai: ['chennai central', 'mas', 'chennai egmore', 'ms', 'tambaram'],
      bangalore: ['ksr bengaluru', 'sbc', 'yesvantpur', 'ypr', 'bengaluru'],
      bengaluru: ['ksr bengaluru', 'sbc', 'yesvantpur', 'ypr', 'bangalore'],
      kolkata: ['howrah', 'hwh', 'sealdah', 'sdah', 'kolkata terminus'],
    };

    const synonyms = METRO_SYNONYMS[lowerName] || METRO_SYNONYMS[locationData.city?.toLowerCase()];
    if (synonyms) {
      synonyms.forEach((syn) => {
        if (!this.aliasMap.has(syn)) {
          this.aliasMap.set(syn, canonicalId);
        }
      });
    }

    if (Array.isArray(locationData.aliases)) {
      locationData.aliases.forEach((a) => {
        if (a) this.aliasMap.set(String(a).toLowerCase().trim(), canonicalId);
      });
    }

    return node;
  }

  /**
   * Finds a node by ID or query text.
   */
  findNode(idOrQuery) {
    if (!idOrQuery) return null;
    const canonicalId = this.getCanonicalId(idOrQuery);
    if (this.nodes.has(canonicalId)) return this.nodes.get(canonicalId);

    for (const node of this.nodes.values()) {
      if (node.matches(idOrQuery)) return node;
    }
    return null;
  }

  /**
   * Adds a directed transport edge to the graph.
   */
  addEdge(edgeData) {
    if (!edgeData) return null;
    const edge = edgeData instanceof GraphEdge ? edgeData : new GraphEdge(edgeData);
    if (!edge.isValidTiming()) {
      logger.debug(`[JourneyGraph] Discarding edge with invalid timing: ${edge.fromNodeId} -> ${edge.toNodeId}`);
      return null;
    }

    const fromCanonical = this.getCanonicalId(edge.fromNodeId);
    const toCanonical = this.getCanonicalId(edge.toNodeId);

    // Ensure source and destination nodes exist
    if (!this.nodes.has(fromCanonical)) {
      this.addNode({ id: fromCanonical, name: edge.fromNodeName });
    }
    if (!this.nodes.has(toCanonical)) {
      this.addNode({ id: toCanonical, name: edge.toNodeName });
    }

    edge.fromNodeId = fromCanonical;
    edge.toNodeId = toCanonical;

    const list = this.adjacency.get(fromCanonical) || [];
    list.push(edge);
    this.adjacency.set(fromCanonical, list);
    return edge;
  }

  /**
   * Returns all outgoing edges from a node.
   */
  getOutgoingEdges(nodeId) {
    const canonicalId = this.getCanonicalId(nodeId);
    return this.adjacency.get(canonicalId) || [];
  }

  /**
   * Populates the graph from normalized provider candidate journeys and their legs.
   *
   * @param {Array<Object>} candidates - Normalized journey candidate objects
   */
  populateFromCandidates(candidates = []) {
    let edgeCount = 0;
    for (const journey of candidates) {
      if (!journey) continue;

      const legs = Array.isArray(journey.legs) && journey.legs.length > 0 ? journey.legs : null;

      if (legs) {
        // Populate from sequential individual legs
        for (const leg of legs) {
          const fromId = this.extractId(leg.origin);
          const toId = this.extractId(leg.destination);

          const fromLoc =
            typeof leg.origin === 'object' &&
            leg.origin !== null &&
            !leg.origin._bsontype &&
            typeof leg.origin.toHexString !== 'function'
              ? leg.origin
              : {
                  id: fromId,
                  name:
                    leg.metadata?.fromStation ||
                    leg.metadata?.originStation ||
                    (journey.origin?.name ? journey.origin.name : fromId || 'Origin'),
                  stationCode: leg.metadata?.fromStationCode || leg.metadata?.originStationCode || null,
                  city: leg.metadata?.originCity || journey.origin?.city || '',
                };

          const toLoc =
            typeof leg.destination === 'object' &&
            leg.destination !== null &&
            !leg.destination._bsontype &&
            typeof leg.destination.toHexString !== 'function'
              ? leg.destination
              : {
                  id: toId,
                  name:
                    leg.metadata?.toStation ||
                    leg.metadata?.destinationStation ||
                    (journey.destination?.name ? journey.destination.name : toId || 'Destination'),
                  stationCode: leg.metadata?.toStationCode || leg.metadata?.destinationStationCode || null,
                  city: leg.metadata?.destinationCity || journey.destination?.city || '',
                };

          const fromNode = this.addNode(fromLoc);
          const toNode = this.addNode(toLoc);

          if (fromNode && toNode) {
            const edge = this.addEdge({
              fromNodeId: fromNode.id,
              toNodeId: toNode.id,
              fromNodeName: fromNode.name,
              toNodeName: toNode.name,
              mode: leg.mode,
              provider: leg.provider?.name || leg.service?.operator || journey.metadata?.provider || 'provider',
              providerCode: leg.providerCode || journey.providerCode,
              departureTime: leg.departureTime,
              arrivalTime: leg.arrivalTime,
              duration: leg.duration,
              distance: leg.distance,
              price: leg.price,
              currency: leg.currency,
              isEstimatedPrice:
                leg.booking?.status === 'not_bookable' ||
                leg.metadata?.isEstimatedPrice === true ||
                leg.mode === 'road',
              vehicle: leg.vehicle,
              service: leg.service,
              booking: leg.booking,
              metadata: { ...journey.metadata, ...leg.metadata },
              rawLeg: leg,
              source: journey.source || 'provider',
            });
            if (edge) edgeCount++;
          }
        }
      } else {
        // Populate direct edge from journey root
        const fromId = this.extractId(journey.origin);
        const toId = this.extractId(journey.destination);

        const fromLoc =
          typeof journey.origin === 'object' &&
          journey.origin !== null &&
          !journey.origin._bsontype &&
          typeof journey.origin.toHexString !== 'function'
            ? journey.origin
            : {
                id: fromId,
                name:
                  journey.metadata?.fromStation ||
                  journey.metadata?.originStation ||
                  journey.origin?.name ||
                  fromId ||
                  'Origin',
                stationCode: journey.metadata?.fromStationCode || journey.metadata?.originStationCode || null,
                city: journey.metadata?.originCity || journey.origin?.city || '',
              };

        const toLoc =
          typeof journey.destination === 'object' &&
          journey.destination !== null &&
          !journey.destination._bsontype &&
          typeof journey.destination.toHexString !== 'function'
            ? journey.destination
            : {
                id: toId,
                name:
                  journey.metadata?.toStation ||
                  journey.metadata?.destinationStation ||
                  journey.destination?.name ||
                  toId ||
                  'Destination',
                stationCode: journey.metadata?.toStationCode || journey.metadata?.destinationStationCode || null,
                city: journey.metadata?.destinationCity || journey.destination?.city || '',
              };

        const fromNode = this.addNode(fromLoc);
        const toNode = this.addNode(toLoc);

        if (fromNode && toNode) {
          const edge = this.addEdge({
            fromNodeId: fromNode.id,
            toNodeId: toNode.id,
            fromNodeName: fromNode.name,
            toNodeName: toNode.name,
            mode: journey.transportModes?.[0] || journey.mode || 'rail',
            provider: journey.metadata?.provider || 'provider',
            providerCode: journey.providerCode,
            departureTime: journey.departureTime,
            arrivalTime: journey.arrivalTime,
            duration: journey.duration,
            distance: journey.totalDistance,
            price: journey.totalPrice,
            currency: journey.currency,
            isEstimatedPrice:
              journey.metadata?.isEstimatedPrice === true ||
              (journey.transportModes?.length === 1 && journey.transportModes[0] === 'road'),
            metadata: journey.metadata,
            source: journey.source || 'provider',
          });
          if (edge) edgeCount++;
        }
      }
    }

    logger.debug(`[JourneyGraph] Populated graph: ${this.nodes.size} nodes, ${edgeCount} edges`);
    return { nodeCount: this.nodes.size, edgeCount };
  }

  /**
   * Diagnostic summary of graph state
   */
  getSummary() {
    const totalEdges = Array.from(this.adjacency.values()).reduce((sum, list) => sum + list.length, 0);
    return {
      nodes: this.nodes.size,
      edges: totalEdges,
      nodeList: Array.from(this.nodes.values()).map((n) => ({ id: n.id, name: n.name, type: n.type })),
    };
  }
}

export default JourneyGraph;
