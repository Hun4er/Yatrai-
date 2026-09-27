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
  });

  // Track latest search parameters for easy retry/re-ranking
  const lastParamsRef = useRef(null);
  const activeRequestIdRef = useRef(0);

  const search = useCallback(async (params) => {
    const requestId = ++activeRequestIdRef.current;
    lastParamsRef.current = params;

    setState((prev) => ({
      ...prev,
      status: 'loading',
      error: null,
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
        });
      } else {
        setState({
          status: 'success',
          data,
          error: null,
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
      });
      throw err;
    }
  }, []);

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
  }, [search]);

  const reset = useCallback(() => {
    activeRequestIdRef.current++;
    lastParamsRef.current = null;
    setState({
      status: 'idle',
      data: null,
      error: null,
    });
  }, []);

  return {
    status: state.status,
    data: state.data,
    error: state.error,
    isLoading: state.status === 'loading',
    isSuccess: state.status === 'success',
    isEmpty: state.status === 'empty',
    isError: state.status === 'error',
    isIdle: state.status === 'idle',
    lastParams: lastParamsRef.current,
    search,
    changeRanking,
    retry,
    reset,
  };
}

export default useJourneySearch;
