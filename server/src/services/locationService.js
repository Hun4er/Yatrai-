import { Location } from '../models/Location.js';
import locationProvider from '../providers/location/location.provider.js';
import { parseTravelIntent } from '../utils/locationParser.js';
import logger from '../utils/logger.js';

/**
 * Escapes regex special characters in a search string.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const locationService = {
  // ============================================================================
  // PHASE 1 CRUD & GEOSPATIAL METHODS (Preserved for Backward Compatibility)
  // ============================================================================

  async create(locationData) {
    const location = new Location(locationData);
    return await location.save();
  },

  async findById(id) {
    return await Location.findById(id);
  },

  async findByCity(city) {
    return await Location.find({ city: new RegExp(`^${city}$`, 'i') });
  },

  async findNearby(longitude, latitude, maxDistanceMeters = 50000) {
    return await Location.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude],
          },
          $maxDistance: maxDistanceMeters,
        },
      },
    });
  },

  async update(id, updateData) {
    return await Location.findByIdAndUpdate(id, updateData, {
      returnDocument: 'after',
      runValidators: true,
    });
  },

  async delete(id) {
    return await Location.findByIdAndDelete(id);
  },

  // ============================================================================
  // PHASE 3 LOCATION RESOLUTION & DISCOVERY METHODS
  // ============================================================================

  /**
   * Searches for canonical locations matching a query.
   * Checks database cache first to minimize external provider roundtrips and avoid duplicates.
   *
   * @param {string} query - Human entered text
   * @param {Object} [options]
   * @param {number} [options.limit=5]
   * @param {boolean} [options.forceRefresh=false]
   * @param {Object} [options.providerAdapter] - Optional custom adapter (useful for testing)
   * @returns {Promise<Array<Object>>} Canonical Location documents
   */
  async search(query, options = {}) {
    const { limit = 5, forceRefresh = false, providerAdapter } = options;
    const cleanQuery = (query || '').trim();

    if (!cleanQuery) return [];

    const escaped = escapeRegex(cleanQuery);

    // 1. Check local MongoDB cache if not forcing refresh
    if (!forceRefresh) {
      // Prioritize exact or prefix matches on name, city, or aliases
      const localMatches = await Location.find({
        $or: [
          { name: new RegExp(`^${escaped}$`, 'i') },
          { aliases: new RegExp(`^${escaped}$`, 'i') },
          { city: new RegExp(`^${escaped}$`, 'i') },
          { name: new RegExp(`^${escaped}`, 'i') },
          { displayName: new RegExp(escaped, 'i') },
        ],
      }).limit(limit);

      if (localMatches.length > 0) {
        // Sort matches to prioritize exact name match, then exact city match, then prefix
        const lowerQ = cleanQuery.toLowerCase();
        localMatches.sort((a, b) => {
          const aExactName = (a.name || '').toLowerCase() === lowerQ;
          const bExactName = (b.name || '').toLowerCase() === lowerQ;
          if (aExactName && !bExactName) return -1;
          if (!aExactName && bExactName) return 1;

          const aExactCity = (a.city || '').toLowerCase() === lowerQ;
          const bExactCity = (b.city || '').toLowerCase() === lowerQ;
          if (aExactCity && !bExactCity) return -1;
          if (!aExactCity && bExactCity) return 1;

          const aStarts = (a.name || '').toLowerCase().startsWith(lowerQ);
          const bStarts = (b.name || '').toLowerCase().startsWith(lowerQ);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;

          return 0;
        });

        logger.debug(
          `Found ${localMatches.length} cached location(s) in MongoDB for: "${cleanQuery}"`
        );
        return localMatches.map((doc) => doc.toJSON());
      }
    }

    // 2. Query geocoding provider
    let candidates = await locationProvider.search(cleanQuery, {
      limit,
      adapter: providerAdapter,
    });

    // 2b. If no results found and query has regional qualifiers (e.g. "NCR"), attempt clean relaxation
    if ((!candidates || candidates.length === 0) && /\bNCR\b/i.test(cleanQuery)) {
      const relaxed = cleanQuery
        .replace(/\bNCR\b/gi, '')
        .trim()
        .replace(/\s+/g, ' ');
      if (relaxed && relaxed !== cleanQuery) {
        logger.debug(`Retrying geocoding with relaxed query: "${relaxed}"`);
        candidates = await locationProvider.search(relaxed, {
          limit,
          adapter: providerAdapter,
        });
      }
    }

    if (!candidates || candidates.length === 0) {
      return [];
    }

    // 3. Persist and deduplicate candidates in MongoDB
    const persisted = [];
    for (const candidate of candidates) {
      // Deduplication check: match existing by placeId, or compound name + city + type
      const queryFilter = candidate.placeId
        ? { placeId: candidate.placeId }
        : {
            name: candidate.name,
            city: candidate.city,
            type: candidate.type,
          };

      let existing = await Location.findOne(queryFilter);

      if (existing) {
        // Reuse existing canonical document
        persisted.push(existing.toJSON());
      } else {
        try {
          const doc = new Location(candidate);
          await doc.save();
          persisted.push(doc.toJSON());
        } catch (err) {
          // If concurrent insert triggered duplicate key or validation, attempt recovery
          logger.warn(
            'Error persisting location candidate, attempting lookup fallback:',
            err.message
          );
          const fallback = await Location.findOne({ name: candidate.name, city: candidate.city });
          if (fallback) {
            persisted.push(fallback.toJSON());
          }
        }
      }
    }

    return persisted;
  },

  /**
   * Resolves a single query or natural-language travel phrase.
   *
   * @param {string} rawInput
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async resolve(rawInput, options = {}) {
    const cleanInput = (rawInput || '').trim();

    if (!cleanInput) {
      const error = new Error('Location query string cannot be empty.');
      error.status = 400;
      error.code = 'INVALID_QUERY';
      throw error;
    }

    // Step A: Check for natural language travel intent (e.g. "I need to go from Sonipat to Patna")
    const intent = parseTravelIntent(cleanInput);

    if (intent.isTravelIntent && intent.origin && intent.destination) {
      logger.info(`Detected travel intent: "${intent.origin}" -> "${intent.destination}"`);

      const [originCandidates, destinationCandidates] = await Promise.all([
        this.search(intent.origin, { limit: 3, ...options }),
        this.search(intent.destination, { limit: 3, ...options }),
      ]);

      return {
        isNaturalLanguage: true,
        rawQuery: cleanInput,
        extraction: {
          origin: {
            query: intent.origin,
            location: originCandidates[0] || null,
            candidates: originCandidates,
          },
          destination: {
            query: intent.destination,
            location: destinationCandidates[0] || null,
            candidates: destinationCandidates,
          },
        },
      };
    }

    // Step B: Direct place query resolution (e.g. "Delhi", "SRM University Delhi NCR", "Patna Junction")
    const candidates = await this.search(cleanInput, { limit: options.limit || 5, ...options });

    return {
      isNaturalLanguage: false,
      rawQuery: cleanInput,
      location: candidates[0] || null,
      candidates,
    };
  },

  /**
   * Resolves a query directly to its primary canonical location document.
   *
   * @param {string} query
   * @param {Object} [options]
   * @returns {Promise<Object|null>}
   */
  async resolveSingle(query, options = {}) {
    const result = await this.resolve(query, options);
    if (result.isNaturalLanguage) {
      return result.extraction?.destination?.location || null;
    }
    return result.location || null;
  },
};

export default locationService;
