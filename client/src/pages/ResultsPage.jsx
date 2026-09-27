import React, { useEffect, useState } from 'react';
import { ArrowLeft, Calendar, MapPin, AlertCircle } from 'lucide-react';
import RankingSelector from '../components/journey/RankingSelector.jsx';
import JourneyResultCard from '../components/journey/JourneyResultCard.jsx';
import LoadingState from '../components/common/LoadingState.jsx';
import ErrorState from '../components/common/ErrorState.jsx';
import EmptyState from '../components/common/EmptyState.jsx';

/**
 * Format ISO date (YYYY-MM-DD) into user-friendly display (e.g. 01 Oct 2026)
 */
function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const monthIndex = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, monthIndex, day);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
      }
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/**
 * ResultsPage Component
 *
 * Renders the journey search results page, ranking tabs, and handles
 * loading, error, and empty result states.
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

  const journeys = Array.isArray(data?.journeys) ? data.journeys : [];
  const resultCount = data?.count ?? journeys.length;

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

            {/* Origin -> Destination Route Title */}
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-text-primary flex flex-wrap items-center gap-2">
              <span>{originName}</span>
              <span className="text-brand-primary">→</span>
              <span>{destinationName}</span>
            </h1>

            {/* Travel Date & Count */}
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-text-secondary">
              {formattedDate && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-brand-primary" aria-hidden="true" />
                  <span>{formattedDate}</span>
                </div>
              )}
              {status === 'success' && (
                <div className="flex items-center gap-1.5 font-medium text-text-primary">
                  <MapPin className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" />
                  <span>
                    {resultCount} {resultCount === 1 ? 'route' : 'routes'} found
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Action to return/modify */}
          <div className="sm:text-right">
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

        {/* Ranking Strategy Selector (shown when journeys are available or loading ranking) */}
        {(status === 'success' || (isLoading && journeys.length > 0)) && (
          <div className="mt-6 border-t border-white/10 pt-4">
            <RankingSelector
              activeRanking={activeRanking}
              onSelect={handleRankingSelect}
              disabled={isLoading}
            />
          </div>
        )}
      </div>

      {/* Main Content States */}
      {isLoading && <LoadingState />}

      {!isLoading && status === 'error' && (
        <ErrorState
          title="Unable to find routes"
          message={error?.message || "We couldn't complete the journey search. Please try again."}
          onRetry={onRetry}
          onModifySearch={onNavigateHome}
        />
      )}

      {!isLoading && status === 'empty' && (
        <EmptyState onModifySearch={onNavigateHome} />
      )}

      {!isLoading && status === 'success' && journeys.length > 0 && (
        <div className="space-y-4" aria-label="Journey Results">
          {journeys.map((journey, idx) => (
            <JourneyResultCard
              key={journey.id || idx}
              journey={journey}
              isTopPick={idx === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default ResultsPage;
