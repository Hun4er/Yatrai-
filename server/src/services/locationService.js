import mongoose from 'mongoose';
import { Location } from '../models/Location.js';
import locationProvider from '../providers/location/location.provider.js';
import { parseTravelIntent } from '../utils/locationParser.js';
import { searchRailwayStations, findStationByCode } from './rail/stationRegistry.js';
import railKitAdapter from '../providers/rail/railKit.adapter.js';
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

/**
 * Scores a location candidate based on query intent and entity type.
 * Ensures cities/stations/airports are prioritized over highways, roads, and addresses.
 *
 * @param {Object} candidate
 * @param {string} cleanQuery
 * @returns {number} Score
 */
export function scoreLocationCandidate(candidate, cleanQuery) {
  if (!candidate) return -999;
  const lowerQ = cleanQuery.toLowerCase().trim();
  const upperQ = cleanQuery.toUpperCase().trim();
  const isStationCode = /^[A-Z]{1,5}$/.test(upperQ) && Boolean(findStationByCode(upperQ));
  const isAirportQuery = /\b(airport|aerodrome|airfield|terminal\s*[12345])\b/i.test(lowerQ);
  const isStationQuery = isStationCode || /\b(station|junction|central|cantt|railway|terminus|jn)\b/i.test(lowerQ);
  const isBusQuery = /\b(bus\s*(?:stand|station|terminal)|isbt)\b/i.test(lowerQ);
  const isRoadQuery = /\b(highway|expressway|bypass|road|street|nh-\d)\b/i.test(lowerQ);

  let score = 0;
  const type = (candidate.type || '').toLowerCase();
  const name = (candidate.name || '').toLowerCase();
  const city = (candidate.city || '').toLowerCase();
  const displayName = (candidate.displayName || '').toLowerCase();
  const candCode = (candidate.stationCode || candidate.metadata?.stationCode || '').toUpperCase().trim();

  // Exact station code match
  if (isStationCode && candCode && candCode === upperQ) {
    score += 350;
  }

  if (isAirportQuery) {
    if (type === 'airport') score += 160;
    else if (type === 'city') score += 30;
    else score -= 40;
  } else if (isStationQuery) {
    if (type === 'railway_station') score += 200;
    else if (type === 'city') score += isStationCode ? -20 : 40;
    else score -= 40;
  } else if (isBusQuery) {
    if (type === 'bus_station') score += 160;
    else if (type === 'city') score += 40;
    else score -= 40;
  } else if (isRoadQuery) {
    if (type === 'highway' || type === 'road') score += 160;
  } else {
    // Generic city/town search (e.g. "Chennai", "Delhi", "Sonipat", "Patna")
    // Rank cities & towns first! Heavily penalize highways and roads
    if (type === 'city') score += 140;
    else if (type === 'town') score += 120;
    else if (type === 'region') score += 80;
    else if (type === 'railway_station') score += 70;
    else if (type === 'airport') score += 60;
    else if (type === 'bus_station') score += 50;
    else if (type === 'landmark' || type === 'poi') score += 30;
    else if (type === 'address') score += 10;
    else if (type === 'highway' || type === 'road') score -= 150;
  }

  // Name / City match accuracy bonuses
  if (name === lowerQ) score += 70;
  else if (name.startsWith(lowerQ)) score += 35;
  else if (name.includes(lowerQ)) score += 15;

  if (city === lowerQ) score += 40;
  else if (city.startsWith(lowerQ)) score += 20;

  if (displayName.includes(lowerQ)) score += 10;

  // Bonus for importance metadata from geocoder
  const importance = Number(candidate.metadata?.importance) || 0.4;
  score += Math.round(importance * 25);

  // If candidate name contains "expressway" or "highway" when not requested, penalize
  if (!isRoadQuery && /expressway|highway|bypass/i.test(name + ' ' + displayName)) {
    score -= 120;
  }

  return score;
}

/**
 * Filters and ranks candidate locations to prevent road/highway confusion.
 *
 * @param {Array<Object>} candidates
 * @param {string} cleanQuery
 * @returns {Array<Object>} Sorted and filtered candidates
 */
export function filterAndRankCandidates(candidates = [], cleanQuery = '') {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  const lowerQ = cleanQuery.toLowerCase().trim();
  const isRoadQuery = /\b(highway|expressway|bypass|road|street|nh-\d)\b/i.test(lowerQ);

  // Filter out unwanted highways/roads for non-road queries if non-road candidates exist
  let filtered = candidates;
  if (!isRoadQuery) {
    const nonRoad = candidates.filter((c) => {
      const type = (c.type || '').toLowerCase();
      const isRoadOrHwy = type === 'highway' || type === 'road';
      const hasHwyName = /expressway|highway|bypass/i.test(c.name || '');
      return !isRoadOrHwy && !hasHwyName;
    });
    if (nonRoad.length > 0) {
      filtered = nonRoad;
    }
  }

  // Rank by calculated score descending
  return [...filtered].sort((a, b) => {
    return scoreLocationCandidate(b, cleanQuery) - scoreLocationCandidate(a, cleanQuery);
  });
}

/**
 * Formats a location document into canonical structured representation.
 *
 * @param {Object} doc
 * @returns {Object} Structured location
 */
export function formatLocationDoc(doc) {
  if (!doc) return null;
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  const coords = json.location?.coordinates || json.coordinates || [];
  const stationCode = json.stationCode || json.metadata?.stationCode || null;
  return {
    ...json,
    id: json._id ? json._id.toString() : json.id || null,
    name: json.name || '',
    type: json.type || 'unknown',
    stationCode,
    displayName: json.displayName || (stationCode ? `${json.name} - ${stationCode}` : json.name),
    latitude: typeof json.latitude === 'number' ? json.latitude : (coords[1] ?? null),
    longitude: typeof json.longitude === 'number' ? json.longitude : (coords[0] ?? null),
    city: json.city || '',
    state: json.state || null,
    country: json.country || 'India',
    placeId: json.placeId || null,
    source: json.source || json.metadata?.provider || 'nominatim',
  };
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
  // PHASE 3 & 22 LOCATION RESOLUTION & DISCOVERY METHODS
  // ============================================================================

  /**
   * Searches for canonical locations matching a query.
   * Checks database cache first to minimize external provider roundtrips and avoid duplicates.
   * Prioritizes cities/towns/stations and filters out roads/highways for generic queries.
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
      const localMatches = await Location.find({
        $or: [
          { name: new RegExp(`^${escaped}$`, 'i') },
          { aliases: new RegExp(`^${escaped}$`, 'i') },
          { city: new RegExp(`^${escaped}$`, 'i') },
          { name: new RegExp(`^${escaped}`, 'i') },
          { displayName: new RegExp(escaped, 'i') },
        ],
      }).limit(limit * 3);

      if (localMatches.length > 0) {
        const rankedLocal = filterAndRankCandidates(localMatches, cleanQuery);
        // Only return from cache if the top candidate has a viable positive score
        if (rankedLocal.length > 0 && scoreLocationCandidate(rankedLocal[0], cleanQuery) > 30) {
          logger.debug(
            `Found ${rankedLocal.length} cached location(s) in MongoDB for: "${cleanQuery}" (top: ${rankedLocal[0].name}, type: ${rankedLocal[0].type})`
          );
          return rankedLocal.slice(0, limit).map(formatLocationDoc);
        }
      }
    }

    // 2. If no custom provider adapter passed, check authoritative Indian Railway Station registry
    if (!providerAdapter) {
      const railwayMatches = searchRailwayStations(cleanQuery, limit);
      if (railwayMatches.length > 0) {
        // Persist or fetch from MongoDB to ensure valid ObjectIds
        const persistedStations = [];
        for (const st of railwayMatches.slice(0, limit)) {
          let existing = await Location.findOne({
            $or: [{ stationCode: st.stationCode }, { name: st.name }],
          });
          if (!existing) {
            try {
              existing = await Location.create({
                name: st.name,
                displayName: st.displayName,
                type: 'railway_station',
                stationCode: st.stationCode,
                city: st.city,
                state: st.state,
                country: 'India',
                countryCode: 'IN',
                location: st.location,
                placeId: `station:${st.stationCode}`,
              });
            } catch {
              existing = st;
            }
          }
          persistedStations.push(formatLocationDoc(existing));
        }
        return persistedStations;
      }
    }

    // 2. Query geocoding provider
    let candidates = [];
    try {
      candidates = await locationProvider.search(cleanQuery, {
        limit: Math.max(limit, 5),
        adapter: providerAdapter,
      });
    } catch (err) {
      logger.warn(`[LocationService] Geocoding provider search failed for "${cleanQuery}": ${err.message}`);
      candidates = [];
    }

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

    // Filter and rank external candidates based on query intent
    const rankedCandidates = filterAndRankCandidates(candidates, cleanQuery);

    // 3. Persist and deduplicate candidates in MongoDB
    const persisted = [];
    for (const candidate of rankedCandidates.slice(0, limit)) {
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
        persisted.push(formatLocationDoc(existing));
      } else {
        try {
          const doc = new Location(candidate);
          await doc.save();
          persisted.push(formatLocationDoc(doc));
        } catch (err) {
          logger.warn(
            'Error persisting location candidate, attempting lookup fallback:',
            err.message
          );
          const fallback = await Location.findOne({ name: candidate.name, city: candidate.city });
          if (fallback) {
            persisted.push(formatLocationDoc(fallback));
          } else {
            persisted.push(formatLocationDoc(candidate));
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

    // Step B: Direct place query resolution (e.g. "Chennai", "Chennai Central", "Chennai Airport")
    const candidates = await this.search(cleanInput, { limit: options.limit || 5, ...options });

    return {
      isNaturalLanguage: false,
      rawQuery: cleanInput,
      location: candidates[0] || null,
      candidates,
    };
  },

  /**
   * Searches railway stations across India with multi-tier discovery:
   * 1. Authoritative local in-memory station registry (expanded with all major hubs)
   * 2. MongoDB cached railway stations
   * 3. RailKit live station lookup by code or name
   *
   * @param {string} query
   * @param {number} [limit=6]
   * @returns {Promise<Array<Object>>}
   */
  async searchRailwayStations(query, limit = 6) {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return [];

    const results = [];
    const seenCodes = new Set();

    // 1. Check local station registry
    const registryMatches = searchRailwayStations(cleanQuery, limit * 2);
    for (const st of registryMatches) {
      if (st.stationCode && !seenCodes.has(st.stationCode.toUpperCase())) {
        seenCodes.add(st.stationCode.toUpperCase());
        results.push(st);
      }
    }

    // 2. If fewer than limit, check MongoDB cached railway stations (if connected)
    if (results.length < limit && mongoose.connection?.readyState === 1) {
      try {
        const escaped = escapeRegex(cleanQuery);
        const dbMatches = await Location.find({
          type: 'railway_station',
          $or: [
            { stationCode: new RegExp(`^${escaped}$`, 'i') },
            { name: new RegExp(`^${escaped}`, 'i') },
            { aliases: new RegExp(`^${escaped}`, 'i') },
            { city: new RegExp(`^${escaped}`, 'i') },
            { displayName: new RegExp(escaped, 'i') },
          ],
        }).limit(limit);

        for (const doc of dbMatches) {
          const docCode = (doc.stationCode || doc.metadata?.stationCode || '').toUpperCase();
          if (docCode && !seenCodes.has(docCode)) {
            seenCodes.add(docCode);
            results.push(formatLocationDoc(doc));
          }
        }
      } catch (err) {
        logger.debug(`[LocationService] DB station lookup notice: ${err.message}`);
      }
    }

    // 3. If still fewer than limit and query is at least 2 chars, query RailKit
    if (results.length < limit && cleanQuery.length >= 2) {
      try {
        const upperQuery = cleanQuery.toUpperCase();

        // 3a. If looks like station code (1-5 uppercase letters) or has extracted code
        const candidateCode = (
          cleanQuery.match(/\(([A-Za-z]{1,5})\)/)?.[1] ||
          cleanQuery.match(/-\s*([A-Za-z]{1,5})$/)?.[1] ||
          cleanQuery.match(/^([A-Za-z]{1,5})\s*-\s*/)?.[1] ||
          upperQuery
        ).toUpperCase();

        if (/^[A-Z]{1,5}$/.test(candidateCode)) {
          const localStn = findStationByCode(candidateCode);
          if (localStn && !seenCodes.has(localStn.stationCode)) {
            seenCodes.add(localStn.stationCode);
            results.push({
              id: `station_${localStn.stationCode.toLowerCase()}`,
              name: localStn.name,
              stationCode: localStn.stationCode,
              displayName: localStn.displayName || `${localStn.name} - ${localStn.stationCode}`,
              city: localStn.city,
              state: localStn.state || 'India',
              type: 'railway_station',
              country: 'India',
              location: {
                type: 'Point',
                coordinates: localStn.coordinates || [77.2, 28.6],
              },
              coordinates: localStn.coordinates || [77.2, 28.6],
              latitude: localStn.coordinates?.[1] || 28.6,
              longitude: localStn.coordinates?.[0] || 77.2,
              source: 'railway_registry',
            });
          }

          if (results.length < limit) {
            const codeRes = await railKitAdapter.stationByCode(candidateCode);
            if (codeRes?.success && codeRes.data) {
              const st = codeRes.data;
              const code = String(st.code || candidateCode).toUpperCase();
              if (!seenCodes.has(code)) {
                seenCodes.add(code);
                results.push({
                  id: `station_${code.toLowerCase()}`,
                  name: st.name || code,
                  stationCode: code,
                  displayName: `${st.name || code} - ${code}`,
                  city: st.name || code,
                  state: 'India',
                  type: 'railway_station',
                  country: 'India',
                  location: {
                    type: 'Point',
                    coordinates: [Number(st.lon) || 77.2, Number(st.lat) || 28.6],
                  },
                  coordinates: [Number(st.lon) || 77.2, Number(st.lat) || 28.6],
                  latitude: Number(st.lat) || 28.6,
                  longitude: Number(st.lon) || 77.2,
                  source: 'railkit',
                });
              }
            }
          }
        }

        // 3b. Search by station or city name (clean any "- CODE" or "(CODE)" suffix first)
        const cleanName = cleanQuery
          .replace(/\s*-\s*[a-z]{1,5}$/i, '')
          .replace(/\s*\([a-z]{1,5}\)$/i, '')
          .replace(/^[a-z]{1,5}\s*-\s*/i, '')
          .trim();
        const nameRes = await railKitAdapter.stationsByName(cleanName || cleanQuery);
        const rkStations = nameRes?.data?.stations || (Array.isArray(nameRes?.data) ? nameRes.data : []);
        for (const st of rkStations) {
          const code = String(st.code || '').toUpperCase();
          if (code && !seenCodes.has(code)) {
            seenCodes.add(code);
            results.push({
              id: `station_${code.toLowerCase()}`,
              name: st.name || code,
              stationCode: code,
              displayName: `${st.name || code} - ${code}`,
              city: st.name || code,
              state: 'India',
              type: 'railway_station',
              country: 'India',
              location: {
                type: 'Point',
                coordinates: [Number(st.lon) || 77.2, Number(st.lat) || 28.6],
              },
              coordinates: [Number(st.lon) || 77.2, Number(st.lat) || 28.6],
              latitude: Number(st.lat) || 28.6,
              longitude: Number(st.lon) || 77.2,
              source: 'railkit',
            });
          }
          if (results.length >= limit) break;
        }
      } catch (rkErr) {
        logger.debug(`[LocationService] RailKit station search: ${rkErr.message}`);
      }
    }

    // Persist discovered stations to MongoDB in background for instant future caching
    if (mongoose.connection?.readyState === 1) {
      for (const st of results.slice(0, limit)) {
        if (st.source === 'railkit' || st.source === 'railway_registry') {
          Location.findOne({
            $or: [{ stationCode: st.stationCode }, { name: st.name }],
          }).then((existing) => {
            if (!existing) {
              Location.create({
                name: st.name,
                displayName: st.displayName,
                type: 'railway_station',
                stationCode: st.stationCode,
                city: st.city,
                state: st.state,
                country: 'India',
                countryCode: 'IN',
                location: st.location,
                placeId: `station:${st.stationCode}`,
              }).catch(() => {});
            }
          }).catch(() => {});
        }
      }
    }

    return results.slice(0, limit);
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
