import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider } from './context/AuthContext.jsx';
import MainLayout from './layouts/MainLayout.jsx';
import HomePage from './pages/HomePage.jsx';
import ResultsPage from './pages/ResultsPage.jsx';
import useJourneySearch from './hooks/useJourneySearch.js';

/**
 * Parse search parameters from a URL search string.
 */
function parseQueryParams(searchStr) {
  const params = new URLSearchParams(searchStr || window.location.search);
  const origin = params.get('origin') || params.get('from') || '';
  const destination = params.get('destination') || params.get('to') || '';
  const departureDate = params.get('departureDate') || params.get('date') || '';
  const ranking = params.get('ranking') || 'overall';
  return { origin, destination, departureDate, ranking };
}

/**
 * Build URL search string from parameters.
 */
function buildQueryString(params) {
  const query = new URLSearchParams();
  if (params.origin) query.set('from', params.origin);
  if (params.destination) query.set('to', params.destination);
  if (params.departureDate) query.set('date', params.departureDate);
  if (params.ranking && params.ranking !== 'overall') {
    query.set('ranking', params.ranking);
  }
  const str = query.toString();
  return str ? `?${str}` : '';
}

export function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [searchParams, setSearchParams] = useState(() => parseQueryParams());
  const searchState = useJourneySearch();
  const searchStateRef = useRef(searchState);
  searchStateRef.current = searchState;

  // Track initial execution on mount
  const hasExecutedInitialSearch = useRef(false);

  // Sync state with browser History API (Back/Forward navigation)
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const params = parseQueryParams();
      setCurrentPath(path);
      setSearchParams(params);

      if (path === '/results' && params.origin && params.destination && params.departureDate) {
        searchStateRef.current.search(params);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Execute initial search if user loaded /results directly or with query parameters
  useEffect(() => {
    if (hasExecutedInitialSearch.current) return;
    hasExecutedInitialSearch.current = true;

    const initialParams = parseQueryParams();
    if (
      (window.location.pathname === '/results' || window.location.search) &&
      initialParams.origin &&
      initialParams.destination &&
      initialParams.departureDate
    ) {
      setCurrentPath('/results');
      setSearchParams(initialParams);
      searchState.search(initialParams);
    }
  }, [searchState]);

  // Navigate to results page with fresh search criteria
  const handlePerformSearch = useCallback(
    async (params) => {
      const mergedParams = {
        ...params,
        ranking: searchParams.ranking || 'overall',
      };
      setSearchParams(mergedParams);
      setCurrentPath('/results');

      // Update URL state for refresh and back button support
      const queryString = buildQueryString(mergedParams);
      const targetUrl = `/results${queryString}`;
      if (window.location.pathname + window.location.search !== targetUrl) {
        window.history.pushState(null, '', targetUrl);
      }

      await searchState.search(mergedParams);
    },
    [searchParams.ranking, searchState]
  );

  // Execute natural language search intent discovery (Phase 11)
  const handlePerformNaturalSearch = useCallback(
    async (query) => {
      try {
        const result = await searchState.searchNatural(query);

        // If clarification is required, remain on home page to collect missing fields
        if (result?.status === 'needs_clarification') {
          return;
        }

        // Search executed and returned parsed request & journeys: transition to results page
        if (result?.parsedRequest) {
          const params = {
            origin: result.parsedRequest.origin || '',
            destination: result.parsedRequest.destination || '',
            departureDate: result.parsedRequest.departureDate || '',
            ranking: result.parsedRequest.ranking || 'overall',
          };
          setSearchParams(params);
          setCurrentPath('/results');

          const queryString = buildQueryString(params);
          const targetUrl = `/results${queryString}`;
          if (window.location.pathname + window.location.search !== targetUrl) {
            window.history.pushState(null, '', targetUrl);
          }
        }
      } catch {
        // Search state will hold the error
      }
    },
    [searchState]
  );

  // Switch ranking strategy on results page
  const handleRankingChange = useCallback(
    async (newRanking) => {
      const updatedParams = {
        ...searchParams,
        ranking: newRanking,
      };
      setSearchParams(updatedParams);

      const queryString = buildQueryString(updatedParams);
      const targetUrl = `/results${queryString}`;
      window.history.pushState(null, '', targetUrl);

      await searchState.changeRanking(newRanking);
    },
    [searchParams, searchState]
  );

  // Return to home page while preserving previous inputs
  const handleNavigateHome = useCallback(() => {
    setCurrentPath('/');
    if (window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
    }
  }, []);

  return (
    <AuthProvider>
      <MainLayout onNavigateHome={handleNavigateHome}>
        {currentPath === '/results' ? (
          <ResultsPage
            searchState={searchState}
            searchParams={searchParams}
            onNavigateHome={handleNavigateHome}
            onRankingChange={handleRankingChange}
            onRetry={searchState.retry}
          />
        ) : (
          <HomePage
            initialOrigin={searchParams.origin}
            initialDestination={searchParams.destination}
            initialDate={searchParams.departureDate}
            onSearch={handlePerformSearch}
            onNaturalSearch={handlePerformNaturalSearch}
            isLoading={searchState.isLoading}
            clarificationState={searchState.clarification}
            onResolveClarification={searchState.resolveClarification}
          />
        )}
      </MainLayout>
    </AuthProvider>
  );
}

export default App;
