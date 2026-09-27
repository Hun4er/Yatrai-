import { useState, useCallback, useRef } from 'react';
import journeyService from '../services/journeyService.js';

/**
 * useJourneySearch Hook
 *
 * Encapsulates explicit search state management:
 * States: 'idle' | 'loading' | 'success' | 'empty' | 'error'
 */
export function useJourneySearch() {
  const [state, setState] = useState({
    status: 'idle',
    data: null,
    error: null,
    clarification: null,
  });

  // Track latest search parameters for easy retry/re-ranking
  const lastParamsRef = useRef(null);
  const activeRequestIdRef = useRef(0);
  const lastNaturalQueryRef = useRef(null);

  const search = useCallback(async (params) => {
    const requestId = ++activeRequestIdRef.current;
    lastParamsRef.current = params;

    setState((prev) => ({
      ...prev,
      status: 'loading',
      error: null,
      clarification: null,
    }));

    try {
      const data = await journeyService.searchJourneys(params);

      // Guard against race conditions if another search was triggered
      if (requestId !== activeRequestIdRef.current) {
        return;
      }

      if (!data.journeys || data.journeys.length === 0) {
        setState({
          status: 'empty',
          data,
          error: null,
          clarification: null,
        });
      } else {
        setState({
          status: 'success',
          data,
          error: null,
          clarification: null,
        });
      }
      return data;
    } catch (err) {
      if (requestId !== activeRequestIdRef.current) {
        return;
      }

      setState({
        status: 'error',
        data: null,
        error: err,
        clarification: null,
      });
      throw err;
    }
  }, []);

  const searchNatural = useCallback(async (options) => {
    const requestId = ++activeRequestIdRef.current;
    const query = typeof options === 'string' ? options : options?.query;
    lastNaturalQueryRef.current = query;

    setState((prev) => ({
      ...prev,
      status: 'loading',
      error: null,
      clarification: null,
    }));

    try {
      const opts = typeof options === 'string' ? { query } : options;
      const result = await journeyService.searchNaturalJourneys(opts);

      if (requestId !== activeRequestIdRef.current) {
        return;
      }

      if (result.status === 'needs_clarification') {
        setState({
          status: 'clarification',
          data: null,
          error: null,
          clarification: {
            message: result.message,
            missingFields: result.missingFields,
            parsedRequest: result.parsedRequest,
            originalQuery: query,
          },
        });
        return result;
      }

      // Successful search execution: cache parsed parameters for ranking/retry
      if (result.parsedRequest) {
        lastParamsRef.current = {
          origin: result.parsedRequest.origin,
          destination: result.parsedRequest.destination,
          departureDate: result.parsedRequest.departureDate,
          ranking: result.parsedRequest.ranking || 'overall',
          maxBudget: result.parsedRequest.maxBudget,
          departureWindow: result.parsedRequest.departureWindow,
        };
      }

      if (!result.journeys || result.journeys.length === 0) {
        setState({
          status: 'empty',
          data: result,
          error: null,
          clarification: null,
        });
      } else {
        setState({
          status: 'success',
          data: result,
          error: null,
          clarification: null,
        });
      }
      return result;
    } catch (err) {
      if (requestId !== activeRequestIdRef.current) {
        return;
      }

      setState({
        status: 'error',
        data: null,
        error: err,
        clarification: null,
      });
      throw err;
    }
  }, []);

  const resolveClarification = useCallback(async (missingValue) => {
    if (!state.clarification || !missingValue) return;

    const { missingFields, parsedRequest, originalQuery } = state.clarification;
    const firstMissing = missingFields?.[0];

    // If we have an identified missing field, synthesize a combined request
    if (firstMissing && parsedRequest) {
      const updatedParams = {
        ...parsedRequest,
        [firstMissing]: missingValue,
      };

      // If all required fields are now present, search directly
      if (updatedParams.origin && updatedParams.destination && updatedParams.departureDate) {
        return search(updatedParams);
      }
    }

    // Fallback: re-query with clarified input appended
    const refinedQuery = `${originalQuery}. ${firstMissing || 'Details'}: ${missingValue}`;
    return searchNatural({ query: refinedQuery });
  }, [state.clarification, search, searchNatural]);

  const changeRanking = useCallback(async (newRanking) => {
    if (!lastParamsRef.current) return;
    const updatedParams = {
      ...lastParamsRef.current,
      ranking: newRanking,
    };
    return search(updatedParams);
  }, [search]);

  const retry = useCallback(() => {
    if (lastParamsRef.current) {
      return search(lastParamsRef.current);
    }
    if (lastNaturalQueryRef.current) {
      return searchNatural(lastNaturalQueryRef.current);
    }
  }, [search, searchNatural]);

  const reset = useCallback(() => {
    activeRequestIdRef.current++;
    lastParamsRef.current = null;
    lastNaturalQueryRef.current = null;
    setState({
      status: 'idle',
      data: null,
      error: null,
      clarification: null,
    });
  }, []);

  return {
    status: state.status,
    data: state.data,
    error: state.error,
    clarification: state.clarification,
    isLoading: state.status === 'loading',
    isSuccess: state.status === 'success',
    isEmpty: state.status === 'empty',
    isError: state.status === 'error',
    isIdle: state.status === 'idle',
    isClarification: state.status === 'clarification',
    lastParams: lastParamsRef.current,
    lastNaturalQuery: lastNaturalQueryRef.current,
    search,
    searchNatural,
    resolveClarification,
    changeRanking,
    retry,
    reset,
  };
}

export default useJourneySearch;
