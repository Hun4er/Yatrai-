import React, { useEffect, useState, useMemo } from 'react';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  AlertCircle,
  SlidersHorizontal,
  X,
  RotateCcw,
} from 'lucide-react';
import RankingSelector from '../components/journey/RankingSelector.jsx';
import JourneyResultCard from '../components/journey/JourneyResultCard.jsx';
import JourneyFilters from '../components/journey/JourneyFilters.jsx';
import JourneyDetailModal from '../components/journey/JourneyDetailModal.jsx';
import LoadingState from '../components/common/LoadingState.jsx';
import ErrorState from '../components/common/ErrorState.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import FilterEmptyState from '../components/common/FilterEmptyState.jsx';
import {
  filterJourneys,
  deriveFilterBounds,
  getDefaultFilters,
  countActiveFilters,
} from '../utils/journeyFilters.js';
import { formatDateDisplay } from '../utils/formatters.js';

/**
 * ResultsPage Component
 *
 * Coordinates journey discovery presentation:
 * - Search header summary and modification actions
 * - Backend ranking strategy switching
 * - Client-side pure filtering (Price, Duration, Transfers, Mode, Departure Time)
 * - Result counts distinguishing backend vs filtered results
 * - Modal journey inspection
 * - Responsive desktop sidebar and mobile filter sheet
 */
export function ResultsPage({
  searchState,
  searchParams,
  onNavigateHome,
  onRankingChange,
  onRetry,
}) {
  const { status, data, error, isLoading } = searchState;
  const [activeRanking, setActiveRanking] = useState(searchParams?.ranking || 'overall');

  // Filter state (separate from backend search state)
  const [filters, setFilters] = useState(getDefaultFilters);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Selected journey for detail modal inspection
  const [selectedJourney, setSelectedJourney] = useState(null);

  // Sync active ranking when backend ranking changes or props update
  useEffect(() => {
    if (data?.ranking?.strategy) {
      setActiveRanking(data.ranking.strategy);
    } else if (searchParams?.ranking) {
      setActiveRanking(searchParams.ranking);
    }
  }, [data?.ranking?.strategy, searchParams?.ranking]);

  const originName =
    data?.origin?.name || data?.origin?.city || searchParams?.origin || searchParams?.from || 'Origin';
  const destinationName =
    data?.destination?.name ||
    data?.destination?.city ||
    searchParams?.destination ||
    searchParams?.to ||
    'Destination';
  const travelDate = searchParams?.departureDate || searchParams?.date || '';
  const formattedDate = formatDateDisplay(travelDate);

  // Canonical backend journeys
  const backendJourneys = useMemo(() => {
    return Array.isArray(data?.journeys) ? data.journeys : [];
  }, [data?.journeys]);

  // Derive filter bounds from backend dataset
  const bounds = useMemo(() => {
    return deriveFilterBounds(backendJourneys);
  }, [backendJourneys]);

  // Filtered journeys (pure client-side filtering)
  const filteredJourneys = useMemo(() => {
    return filterJourneys(backendJourneys, filters);
  }, [backendJourneys, filters]);

  const activeFilterCount = useMemo(() => {
    return countActiveFilters(filters, bounds);
  }, [filters, bounds]);

  const handleClearFilters = () => {
    setFilters(getDefaultFilters());
  };

  // Check if any transport providers failed (Phase 8 partial failure detection)
  const providerMeta = data?.meta?.providers || [];
  const failedProviders = providerMeta.filter((p) => p.status === 'failed' || p.error);
  const hasPartialFailures = failedProviders.length > 0;

  const handleRankingSelect = (newStrategy) => {
    setActiveRanking(newStrategy);
    if (onRankingChange) {
      onRankingChange(newStrategy);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Header Banner */}
      <div className="rounded-2xl border border-white/10 bg-surface-primary p-6 shadow-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <button
              type="button"
              onClick={onNavigateHome}
              className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:text-brand-hover transition-colors cursor-pointer focus:outline-none"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Modify Search</span>
            </button>

            {/* Route Title */}
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-text-primary flex flex-wrap items-center gap-2">
              <span>{originName}</span>
              <span className="text-brand-primary">→</span>
              <span>{destinationName}</span>
            </h1>

            {/* Travel Date & Result Count */}
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-text-secondary">
              {formattedDate && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-brand-primary" aria-hidden="true" />
                  <span>{formattedDate}</span>
                </div>
              )}
              {status === 'success' && backendJourneys.length > 0 && (
                <div className="flex items-center gap-1.5 font-medium text-text-primary">
                  <MapPin className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" />
                  <span>
                    {activeFilterCount > 0 ? (
                      <>
                        Showing <strong className="text-brand-primary">{filteredJourneys.length}</strong> of{' '}
                        {backendJourneys.length} routes
                      </>
                    ) : (
                      <>
                        {backendJourneys.length} {backendJourneys.length === 1 ? 'route' : 'routes'} found
                      </>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 self-start sm:self-center">
            {/* Mobile Filter Toggle Button */}
            {backendJourneys.length > 0 && (
              <button
                type="button"
                onClick={() => setIsMobileFilterOpen(true)}
                className="lg:hidden inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface-secondary px-3.5 py-2 text-xs font-semibold text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
                aria-label="Open filter options"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-brand-primary" aria-hidden="true" />
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-primary px-1 text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onNavigateHome}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface-secondary px-4 py-2 text-xs font-medium text-text-primary hover:bg-surface-elevated hover:border-white/20 transition-all cursor-pointer"
            >
              <span>Change Criteria</span>
            </button>
          </div>
        </div>

        {/* Partial Provider Failure Warning */}
        {hasPartialFailures && (
          <div
            role="note"
            className="mt-4 flex items-center gap-2 rounded-xl border border-semantic-warning/20 bg-semantic-warning/10 p-3 text-xs text-semantic-warning"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Some transport providers were temporarily unavailable. Discovered results may be
              incomplete.
            </span>
          </div>
        )}

        {/* Ranking Strategy Selector */}
        {(status === 'success' || (isLoading && backendJourneys.length > 0)) && (
          <div className="mt-6 border-t border-white/10 pt-4">
            <RankingSelector
              activeRanking={activeRanking}
              onSelect={handleRankingSelect}
              disabled={isLoading}
            />
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {isLoading && <LoadingState />}

      {!isLoading && status === 'error' && (
        <ErrorState
          title="Unable to find routes"
          message={error?.message || "We couldn't complete the journey search. Please try again."}
          onRetry={onRetry}
          onModifySearch={onNavigateHome}
        />
      )}

      {/* Backend Empty State (0 total journeys returned) */}
      {!isLoading && (status === 'empty' || (status === 'success' && backendJourneys.length === 0)) && (
        <EmptyState onModifySearch={onNavigateHome} />
      )}

      {/* Success State with Journeys */}
      {!isLoading && status === 'success' && backendJourneys.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Desktop Left Sidebar: Filters */}
          <div className="hidden lg:block lg:col-span-4">
            <JourneyFilters
              filters={filters}
              onChange={setFilters}
              onReset={handleClearFilters}
              bounds={bounds}
            />
          </div>

          {/* Right Main Column: Results / Filter Empty */}
          <div className="lg:col-span-8 space-y-4">
            {/* Active Filter Chips / Reset Shortcut on Top */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-surface-primary px-4 py-2.5 text-xs">
                <span className="text-text-secondary">
                  Showing <strong className="text-text-primary">{filteredJourneys.length}</strong> of{' '}
                  {backendJourneys.length} journeys matching your criteria
                </span>
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-1 font-semibold text-brand-primary hover:text-brand-hover cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  <span>Reset filters</span>
                </button>
              </div>
            )}

            {/* Filter-Empty State (Section 16B: filters excluded all routes) */}
            {filteredJourneys.length === 0 ? (
              <FilterEmptyState onClearFilters={handleClearFilters} />
            ) : (
              /* Filtered Journey Result Cards */
              filteredJourneys.map((journey, idx) => (
                <JourneyResultCard
                  key={journey.id || idx}
                  journey={journey}
                  isTopPick={idx === 0 && activeFilterCount === 0}
                  onViewJourney={setSelectedJourney}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Mobile Filters Drawer / Slide-Over Sheet */}
      {isMobileFilterOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Filter Options"
          className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm lg:hidden animate-in fade-in"
        >
          <div className="relative w-full max-w-md h-full bg-surface-primary border-l border-white/10 p-6 overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
              <h3 className="text-base font-bold text-text-primary">Journey Filters</h3>
              <button
                type="button"
                onClick={() => setIsMobileFilterOpen(false)}
                className="rounded-lg border border-white/10 p-1.5 text-text-secondary hover:text-text-primary cursor-pointer"
                aria-label="Close filters"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <JourneyFilters
              filters={filters}
              onChange={setFilters}
              onReset={handleClearFilters}
              bounds={bounds}
              isMobile={true}
              onCloseMobile={() => setIsMobileFilterOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Journey Detail Modal */}
      {selectedJourney && (
        <JourneyDetailModal
          journey={selectedJourney}
          onClose={() => setSelectedJourney(null)}
        />
      )}
    </div>
  );
}

export default ResultsPage;
