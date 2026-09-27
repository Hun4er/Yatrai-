import api from './api.js';

/**
 * Journey Search Service
 *
 * Dedicated frontend service layer for journey searches.
 * Handles HTTP delegation to the centralized API client, response extraction,
 * and canonical error formatting. Does NOT sort, rank, or alter backend data.
 */
export const journeyService = {
  /**
   * Search for journeys matching the search criteria.
   *
   * @param {Object} params
   * @param {string} params.origin
   * @param {string} params.destination
   * @param {string} params.departureDate - YYYY-MM-DD
   * @param {string} [params.ranking] - Strategy identifier ('overall', 'fastest', 'cheapest', 'fewest_transfers', 'most_convenient')
   * @param {number} [params.passengers]
   * @param {string[]} [params.requestedModes]
   * @returns {Promise<Object>} Safe canonical response containing journeys array and metadata
   */
  async searchJourneys({ origin, destination, departureDate, ranking = 'overall', passengers = 1, requestedModes }) {
    if (!origin || !origin.trim()) {
      const err = new Error('Origin is required.');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    if (!destination || !destination.trim()) {
      const err = new Error('Destination is required.');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    if (!departureDate) {
      const err = new Error('Departure date is required.');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    try {
      const response = await api.journeys.search({
        origin: origin.trim(),
        destination: destination.trim(),
        departureDate,
        ranking,
        passengers,
        requestedModes,
      });

      // Canonical response payload validation
      const resultData = response?.data || {};
      const journeys = Array.isArray(resultData.journeys)
        ? resultData.journeys
        : Array.isArray(response?.journeys)
          ? response.journeys
          : [];

      return {
        searchRequestId: resultData.searchRequestId || null,
        status: resultData.status || 'completed',
        count: resultData.count ?? journeys.length,
        totalResults: resultData.totalResults ?? journeys.length,
        origin: resultData.origin || null,
        destination: resultData.destination || null,
        ranking: resultData.ranking || { strategy: ranking, label: 'Best Overall' },
        meta: resultData.meta || {},
        journeys,
      };
    } catch (error) {
      // Create user-friendly error representation without internal leaks
      const formattedError = new Error(
        error.message || 'Unable to find routes. Please check your inputs and try again.'
      );
      formattedError.code = error.code || 'SEARCH_ERROR';
      formattedError.status = error.status || 500;
      formattedError.details = error.details || null;
      throw formattedError;
    }
  },

  /**
   * Search for journeys using natural language query (Phase 11).
   *
   * @param {Object} params
   * @param {string} params.query
   * @param {string} [params.referenceDate] - YYYY-MM-DD
   * @param {string} [params.timezone]
   * @returns {Promise<Object>}
   */
  async searchNaturalJourneys({ query, referenceDate, timezone }) {
    if (!query || !query.trim()) {
      const err = new Error('Query string is required.');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    try {
      const response = await api.journeys.searchNatural({
        query: query.trim(),
        referenceDate,
        timezone,
      });

      // Handle clarification state returned from parser
      if (response?.status === 'needs_clarification') {
        return {
          status: 'needs_clarification',
          message: response.message || 'Please clarify your travel details.',
          missingFields: response.missingFields || [],
          parsedRequest: response.parsedRequest || {},
          journeys: [],
        };
      }

      const resultData = response?.data || {};
      const journeys = Array.isArray(resultData.journeys)
        ? resultData.journeys
        : Array.isArray(response?.journeys)
          ? response.journeys
          : [];

      return {
        status: 'completed',
        parsedRequest: response.parsedRequest || {},
        query: response.query || query,
        searchRequestId: resultData.searchRequestId || null,
        count: resultData.count ?? journeys.length,
        totalResults: resultData.totalResults ?? journeys.length,
        origin: resultData.origin || null,
        destination: resultData.destination || null,
        ranking: resultData.ranking || { strategy: 'overall', label: 'Best Overall' },
        meta: resultData.meta || {},
        journeys,
      };
    } catch (error) {
      const formattedError = new Error(
        error.message || 'Unable to interpret travel request. Please try again.'
      );
      formattedError.code = error.code || 'NATURAL_SEARCH_ERROR';
      formattedError.status = error.status || 500;
      formattedError.details = error.details || null;
      throw formattedError;
    }
  },
};

export default journeyService;
