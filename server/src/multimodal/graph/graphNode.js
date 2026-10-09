/**
 * GraphNode
 * Represents a geographical / transport node in the Journey Graph.
 * Supports cities, railway stations, airports, bus terminals, and road transfer points.
 */
export class GraphNode {
  constructor({
    id,
    name,
    type = 'city',
    coordinates = [0, 0],
    city = '',
    state = '',
    country = 'India',
    locationDoc = null,
    stationCode = null,
    aliases = [],
  }) {
    this.id = String(id || name).toLowerCase().trim();
    this.name = name || 'Unknown Location';
    this.type = type;
    this.coordinates = Array.isArray(coordinates) ? coordinates : [0, 0];
    this.city = city || name || '';
    this.state = state || '';
    this.country = country || 'India';
    this.locationDoc = locationDoc;
    this.stationCode = stationCode || null;
    this.aliases = Array.isArray(aliases) ? aliases : [];
  }

  get longitude() {
    return this.coordinates[0];
  }

  get latitude() {
    return this.coordinates[1];
  }

  /**
   * Calculates approximate distance (in km) to another GraphNode using Haversine formula.
   */
  distanceTo(otherNode) {
    if (!otherNode || !Array.isArray(otherNode.coordinates)) return 0;
    const [lon1, lat1] = this.coordinates;
    const [lon2, lat2] = otherNode.coordinates;
    if (lon1 === 0 && lat1 === 0) return 0;
    if (lon2 === 0 && lat2 === 0) return 0;

    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  /**
   * Checks if this node matches a query or location object.
   */
  matches(queryOrLocation) {
    if (!queryOrLocation) return false;
    if (typeof queryOrLocation === 'string') {
      const q = queryOrLocation.toLowerCase().trim();
      return (
        this.id === q ||
        this.name.toLowerCase() === q ||
        this.city.toLowerCase() === q ||
        (this.stationCode && this.stationCode.toLowerCase() === q) ||
        this.aliases.some((a) => a.toLowerCase() === q)
      );
    }
    const locId = queryOrLocation._id || queryOrLocation.id;
    if (locId && String(locId).toLowerCase() === this.id) return true;
    const qName = (queryOrLocation.name || queryOrLocation.city || '').toLowerCase().trim();
    return qName && (this.name.toLowerCase() === qName || this.city.toLowerCase() === qName);
  }
}

export default GraphNode;
