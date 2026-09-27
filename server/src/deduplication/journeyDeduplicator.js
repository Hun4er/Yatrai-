import logger from '../utils/logger.js';

/**
 * Journey Deduplicator Service
 *
 * Implements Phase 8 deduplication for canonical journeys.
 *
 * Purpose:
 * When multiple providers return the same or substantially equivalent journey
 * (e.g. multiple rail aggregators returning the same physical train service,
 * or direct provider and aggregator both listing the same flight),
 * deduplication prevents duplicate results from cluttering search output.
 *
 * Principles:
 * - Operates strictly on canonical normalized Journey domain models.
 * - Provider-independent: Does not assume external IDs are globally unique across providers.
 * - Does not over-dedupe: Legitimate alternative options (different departures, different arrivals,
 *   different transport modes, or different service numbers) are strictly preserved.
 * - Deterministic retention policy: Retains the richer/more complete candidate and records
 *   internal metadata on duplicates removed.
 */
export class JourneyDeduplicator {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Normalizes a time string or Date into a standardized ISO minute string for exact temporal comparison.
   * e.g. "2026-10-01T06:00:00.000Z" -> "2026-10-01T06:00"
   *
   * @param {string|Date} dateVal
   * @returns {string}
   */
  normalizeTimeKey(dateVal) {
    if (!dateVal) return '';
    try {
      const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
      if (isNaN(d.getTime())) return String(dateVal).slice(0, 16);
      return d.toISOString().slice(0, 16);
    } catch {
      return String(dateVal).slice(0, 16);
    }
  }

  /**
   * Normalizes a location identifier from an ObjectId, object, or string.
   *
   * @param {string|Object} loc
   * @returns {string}
   */
  normalizeLocationKey(loc) {
    if (!loc) return '';
    if (typeof loc === 'string') return loc.trim().toLowerCase();
    if (loc._id) return String(loc._id);
    if (loc.id) return String(loc.id);
    if (loc.name) return String(loc.name).trim().toLowerCase();
    if (loc.city) return String(loc.city).trim().toLowerCase();
    return '';
  }

  /**
   * Normalizes an alphanumeric identifier (e.g. train number "EXP-12424" -> "12424", flight "AI-101" -> "ai101").
   *
   * @param {string} val
   * @returns {string}
   */
  normalizeServiceNumber(val) {
    if (!val || typeof val !== 'string') return '';
    // Strip non-alphanumeric characters for robust comparison
    return val.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * Generates a deterministic identity fingerprint for a canonical journey.
   *
   * The fingerprint incorporates:
   * 1. Transport mode sequence (e.g. "rail", "flight", "road+rail")
   * 2. Canonical origin and destination
   * 3. Departure time (down to minute precision)
   * 4. Arrival time (down to minute precision)
   * 5. Service / vehicle identifier (if present on legs)
   *
   * Rules:
   * - If departure times differ: fingerprints differ (Preserves different departures, e.g. 06:00 vs 08:00)
   * - If arrival times differ: fingerprints differ (Preserves different arrivals, e.g. 18:00 vs 20:00)
   * - If transport modes differ: fingerprints differ (Preserves Rail vs Flight)
   * - If service numbers differ: fingerprints differ (Preserves Train A vs Train B on same corridor)
   *
   * @param {Object} journey - Canonical normalized journey
   * @returns {string} Deterministic deduplication key
   */
  generateFingerprint(journey) {
    if (!journey || typeof journey !== 'object') return '';

    const modes = Array.isArray(journey.transportModes)
      ? journey.transportModes.map((m) => String(m).toLowerCase()).sort().join('+')
      : String(journey.mode || 'unknown').toLowerCase();

    const originKey = this.normalizeLocationKey(journey.origin);
    const destKey = this.normalizeLocationKey(journey.destination);
    const depKey = this.normalizeTimeKey(journey.departureTime);
    const arrKey = this.normalizeTimeKey(journey.arrivalTime);

    // Extract leg-level service and vehicle identifiers
    const legs = Array.isArray(journey.legs) ? journey.legs : [];
    const serviceIdentifiers = legs
      .map((leg) => {
        const sNum = leg.service?.number || leg.vehicle?.identifier || leg.service?.name || '';
        return this.normalizeServiceNumber(sNum);
      })
      .filter(Boolean)
      .join('|');

    // Combine dimensions into a strict composite fingerprint
    return `${modes}::${originKey}->${destKey}::${depKey}::${arrKey}::${serviceIdentifiers}`;
  }

  /**
   * Computes a data completeness score for a candidate.
   * Used to deterministically retain the richer candidate when duplicates are detected.
   *
   * @param {Object} candidate
   * @returns {number} Higher score indicates richer data
   */
  computeCompletenessScore(candidate) {
    if (!candidate || typeof candidate !== 'object') return 0;
    let score = 0;

    // Price completeness
    if (typeof candidate.totalPrice === 'number' && candidate.totalPrice > 0) {
      score += 15;
    }

    // Duration completeness
    if (typeof candidate.duration === 'number' && candidate.duration > 0) {
      score += 10;
    }

    // Distance completeness
    if (typeof candidate.totalDistance === 'number' && candidate.totalDistance > 0) {
      score += 5;
    }

    // Legs completeness
    const legs = Array.isArray(candidate.legs) ? candidate.legs : [];
    if (legs.length > 0) {
      score += 10;
      for (const leg of legs) {
        if (leg.service?.name) score += 3;
        if (leg.service?.number) score += 5;
        if (leg.service?.operator) score += 3;
        if (leg.vehicle?.identifier) score += 3;
        if (leg.booking?.reference || leg.booking?.url) score += 4;
        if (leg.origin && (leg.origin.coordinates || leg.origin.location)) score += 2;
        if (leg.destination && (leg.destination.coordinates || leg.destination.location)) score += 2;
      }
    }

    // Source priority: prefer verified direct providers over mock fixtures
    const source = String(candidate.source || candidate.metadata?.source || '').toLowerCase();
    if (source && source !== 'development' && source !== 'mock') {
      score += 20;
    }

    return score;
  }

  /**
   * Deterministic tie-breaker between two equivalent candidates.
   * Returns true if candidateA should be retained over candidateB.
   *
   * @param {Object} candidateA
   * @param {Object} candidateB
   * @returns {boolean}
   */
  shouldRetainA(candidateA, candidateB) {
    const scoreA = this.computeCompletenessScore(candidateA);
    const scoreB = this.computeCompletenessScore(candidateB);

    if (scoreA !== scoreB) {
      return scoreA > scoreB;
    }

    // Tie-breaker 1: Prefer candidate with valid price
    const priceA = candidateA.totalPrice ?? Infinity;
    const priceB = candidateB.totalPrice ?? Infinity;
    if (priceA !== priceB && priceA > 0 && priceB > 0) {
      // If prices differ on same service, prefer lower fare
      return priceA <= priceB;
    }

    // Tie-breaker 2: Stable provider code alphabetical order
    const provA = String(candidateA.source || candidateA.legs?.[0]?.provider || '');
    const provB = String(candidateB.source || candidateB.legs?.[0]?.provider || '');
    if (provA && provB && provA !== provB) {
      return provA.localeCompare(provB) <= 0;
    }

    // Tie-breaker 3: Retain existing candidate (original index preservation)
    return true;
  }

  /**
   * Enriches the retained candidate with any missing fields from the duplicate.
   *
   * @param {Object} retained
   * @param {Object} duplicate
   * @returns {Object} Enriched retained candidate
   */
  enrichCandidate(retained, duplicate) {
    if (!retained || !duplicate) return retained;

    // Merge booking info if missing
    if (
      (!retained.booking?.url && duplicate.booking?.url) ||
      (!retained.booking?.reference && duplicate.booking?.reference)
    ) {
      retained.booking = {
        ...(retained.booking || {}),
        url: retained.booking?.url || duplicate.booking?.url || '',
        reference: retained.booking?.reference || duplicate.booking?.reference || '',
      };
    }

    // Merge leg-level booking/service references if missing
    if (Array.isArray(retained.legs) && Array.isArray(duplicate.legs)) {
      for (let i = 0; i < retained.legs.length && i < duplicate.legs.length; i++) {
        const retLeg = retained.legs[i];
        const dupLeg = duplicate.legs[i];

        if (!retLeg.booking?.url && dupLeg.booking?.url) {
          retLeg.booking = retLeg.booking || {};
          retLeg.booking.url = dupLeg.booking.url;
        }
        if (!retLeg.service?.operator && dupLeg.service?.operator) {
          retLeg.service = retLeg.service || {};
          retLeg.service.operator = dupLeg.service.operator;
        }
      }
    }

    return retained;
  }

  /**
   * Deduplicates an array of canonical journeys and produces an audit report.
   *
   * @param {Array<Object>} journeys - Array of normalized canonical journeys
   * @param {Object} [context={}] - Search context
   * @returns {{ journeys: Array<Object>, duplicates: Array<Object>, report: Object }}
   */
  deduplicateWithReport(journeys, context = {}) {
    if (!Array.isArray(journeys)) {
      throw new Error('Journeys must be an array');
    }

    if (journeys.length <= 1) {
      return {
        journeys: [...journeys],
        duplicates: [],
        report: {
          totalBefore: journeys.length,
          totalAfter: journeys.length,
          duplicatesRemoved: 0,
        },
      };
    }

    const startTime = Date.now();
    const uniqueMap = new Map(); // fingerprint -> retained candidate
    const duplicates = [];

    for (let i = 0; i < journeys.length; i++) {
      const candidate = journeys[i];
      const fingerprint = this.generateFingerprint(candidate);

      if (!fingerprint) {
        // Unidentifiable candidates are kept as unique
        uniqueMap.set(`__unknown_${i}`, candidate);
        continue;
      }

      if (uniqueMap.has(fingerprint)) {
        const existing = uniqueMap.get(fingerprint);

        if (this.shouldRetainA(candidate, existing)) {
          // New candidate is richer: replace existing and record existing as duplicate
          const enriched = this.enrichCandidate(candidate, existing);
          uniqueMap.set(fingerprint, enriched);
          duplicates.push({
            retained: enriched.id || enriched._id || fingerprint,
            duplicate: existing.id || existing._id || `index_${i}`,
            reason: 'Identical route, schedule, mode, and service with higher data completeness',
            fingerprint,
          });
        } else {
          // Existing candidate is retained: enrich with new candidate
          const enriched = this.enrichCandidate(existing, candidate);
          uniqueMap.set(fingerprint, enriched);
          duplicates.push({
            retained: enriched.id || enriched._id || fingerprint,
            duplicate: candidate.id || candidate._id || `index_${i}`,
            reason: 'Identical route, schedule, mode, and service with higher data completeness',
            fingerprint,
          });
        }
      } else {
        uniqueMap.set(fingerprint, candidate);
      }
    }

    const uniqueJourneys = Array.from(uniqueMap.values());
    const durationMs = Date.now() - startTime;

    logger.debug(
      `[JourneyDeduplicator] Deduplication completed: ${journeys.length} -> ${uniqueJourneys.length} (${duplicates.length} duplicate(s) removed in ${durationMs}ms)`
    );

    return {
      journeys: uniqueJourneys,
      duplicates,
      report: {
        totalBefore: journeys.length,
        totalAfter: uniqueJourneys.length,
        duplicatesRemoved: duplicates.length,
        durationMs,
      },
    };
  }

  /**
   * Main deduplication method: accepts canonical journeys and returns unique canonical journeys.
   *
   * @param {Array<Object>} journeys - Canonical normalized journeys
   * @param {Object} [context={}] - Search context
   * @returns {Array<Object>} Unique canonical journeys
   */
  deduplicate(journeys, context = {}) {
    const result = this.deduplicateWithReport(journeys, context);
    return result.journeys;
  }
}

export const journeyDeduplicator = new JourneyDeduplicator();
export default journeyDeduplicator;
