import React, { useEffect, useState, useMemo } from 'react';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  AlertTriangle,
  SlidersHorizontal,
  X,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  GitCompare,
  Network,
  Loader2,
} from 'lucide-react';
import RankingSelector from '../components/journey/RankingSelector.jsx';
import JourneyResultCard from '../components/journey/JourneyResultCard.jsx';
import JourneyFilters from '../components/journey/JourneyFilters.jsx';
import JourneyDetailModal from '../components/journey/JourneyDetailModal.jsx';
import JourneyComparisonModal from '../components/journey/JourneyComparisonModal.jsx';
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
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';

/**
 * ResultsPage Component
 *
 * Implements Sections 5, 6, 7, 8, 17, 18, 19, 20, 21:
 * - Results Header Redesign (intended location header + secondary routing POIs)
 * - Dynamic counts (journey options, transport modes, direct count, connecting count)
 * - Compact Provider Availability Warning with expandable details
 * - Desktop Layout (Filters left, Recommended by Yatrai + Other Journeys right)
 * - Mobile Layout (Dedicated vertical hierarchy + bottom-sheet filters)
 * - Journey Comparison Drawer & Modal
 */
export function ResultsPage({
  searchState,
  searchParams,
  onNavigateHome,
  onRankingChange,
  onRetry,
}) {
  const { status, data, error, isLoading } = searchState;
  const { isAuthenticated } = useAuth();
  const [activeRanking, setActiveRanking] = useState(searchParams?.ranking || 'overall');

  // Filter state
  const [filters, setFilters] = useState(getDefaultFilters);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Provider failure warning details toggle
  const [showProviderWarningDetails, setShowProviderWarningDetails] = useState(false);

  // Selected journey for detail modal inspection
  const [selectedJourney, setSelectedJourney] = useState(null);

  // Progressive disclosure: 1 train/journey initially, expand on demand
  const [showMoreJourneys, setShowMoreJourneys] = useState(false);

  // Journey comparison multi-selection state
  const [comparedJourneyIds, setComparedJourneyIds] = useState([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);

  // Station expansion recovery exploration state
  const [isRecoveringAlternatives, setIsRecoveringAlternatives] = useState(false);
  const [optionalAlternatives, setOptionalAlternatives] = useState([]);
  const [recoveryError, setRecoveryError] = useState(null);

  const handleViewJourney = (journey) => {
    setSelectedJourney(journey);
    if (isAuthenticated && journey?.id) {
      api.journeyHistory.record(journey.id).catch(() => {});
    }
  };

  const handleToggleCompare = (journey) => {
    if (!journey?.id) return;
    setComparedJourneyIds((prev) => {
      if (prev.includes(journey.id)) {
        return prev.filter((id) => id !== journey.id);
      }
      return [...prev, journey.id];
    });
  };

  // Sync active ranking when backend ranking changes or props update
  useEffect(() => {
    if (data?.ranking?.strategy) {
      setActiveRanking(data.ranking.strategy);
    } else if (searchParams?.ranking) {
      setActiveRanking(searchParams.ranking);
    }
  }, [data?.ranking?.strategy, searchParams?.ranking]);

  // Section 5: Distinguish intended locations vs exact POIs/stations
  const userOrigin = searchParams?.origin || searchParams?.from || data?.origin?.city || 'Origin';
  const userDest = searchParams?.destination || searchParams?.to || data?.destination?.city || 'Destination';

  const exactOriginName = data?.origin?.name || userOrigin;
  const exactDestName = data?.destination?.name || userDest;

  const showRoutingPoiSecondary =
    (data?.origin?.name && data.origin.name.toLowerCase() !== userOrigin.toLowerCase()) ||
    (data?.destination?.name && data.destination.name.toLowerCase() !== userDest.toLowerCase());

  const travelDate = searchParams?.departureDate || searchParams?.date || '';
  const formattedDate = formatDateDisplay(travelDate);
  const passengers = searchParams?.passengers || 1;

  // Canonical backend journeys (including any recovered alternatives)
  const backendJourneys = useMemo(() => {
    const primary = Array.isArray(data?.journeys) ? data.journeys : [];
    if (!optionalAlternatives || optionalAlternatives.length === 0) return primary;
    const existingIds = new Set(primary.map((j) => j.id));
    const newItems = optionalAlternatives.filter((j) => !existingIds.has(j.id));
    return [...primary, ...newItems];
  }, [data?.journeys, optionalAlternatives]);

  const recoveryMeta = data?.recoveryMeta || null;

  const handleExploreAlternatives = async () => {
    setIsRecoveringAlternatives(true);
    setRecoveryError(null);
    try {
      const res = await api.journeys.recover({
        origin: userOrigin,
        destination: userDest,
        departureDate: travelDate,
        passengers,
        ranking: activeRanking,
      });
      if (res?.data?.journeys) {
        setOptionalAlternatives(res.data.journeys);
      }
    } catch (err) {
      setRecoveryError(err.message || 'Unable to explore network alternatives at this time');
    } finally {
      setIsRecoveringAlternatives(false);
    }
  };

  // Section 5: Exact numbers derived exclusively from verified railway results
  const isRailwayValid = (j) => {
    if (!j) return false;
    const modes = Array.isArray(j.transportModes) ? j.transportModes : [];
    if (modes.length === 0 || modes.some((m) => String(m).toLowerCase() !== 'rail')) return false;
    const legs = Array.isArray(j.legs) ? j.legs : [];
    if (legs.length === 0 || legs.some((l) => String(l.mode || '').toLowerCase() !== 'rail')) return false;
    return true;
  };

  const validatedJourneys = useMemo(() => {
    return backendJourneys.filter(isRailwayValid);
  }, [backendJourneys]);

  const journeyStats = useMemo(() => {
    const total = validatedJourneys.length;
    const direct = validatedJourneys.filter((j) => (j.numberOfTransfers ?? 0) === 0).length;
    const connecting = total - direct;

    return {
      total,
      direct,
      connecting,
      modesCount: total > 0 ? 1 : 0,
    };
  }, [validatedJourneys]);

  // Derive filter bounds exclusively from validated railway dataset
  const bounds = useMemo(() => {
    return deriveFilterBounds(validatedJourneys);
  }, [validatedJourneys]);

  // Filtered journeys (client-side pure filtering)
  const filteredJourneys = useMemo(() => {
    return filterJourneys(validatedJourneys, filters);
  }, [validatedJourneys, filters]);

  const activeFilterCount = useMemo(() => {
    return countActiveFilters(filters, bounds);
  }, [filters, bounds]);

  const handleClearFilters = () => {
    setFilters(getDefaultFilters());
  };

  // Check if active railway search provider failed (Section 6, only active railway provider)
  const providerMeta = data?.meta?.providers || [];
  const failedProviders = providerMeta.filter(
    (p) =>
      (p.status === 'failed' || p.error) &&
      ['rail', 'irctc', 'railradar'].includes(String(p.provider || '').toLowerCase())
  );
  const hasPartialFailures = failedProviders.length > 0;

  const isMonthlyQuota =
    error?.code === 'PROVIDER_MONTHLY_QUOTA_EXHAUSTED' ||
    error?.subCode === 'MONTHLY_QUOTA_EXHAUSTED' ||
    error?.details?.isMonthlyQuota ||
    /monthly quota/i.test(error?.message || '');

  const isRateLimited =
    backendJourneys.length === 0 &&
    (status === 'rate_limited' ||
      Boolean(data?.meta?.isRateLimited) ||
      error?.code === 'RATE_LIMITED' ||
      error?.code === 'PROVIDER_RATE_LIMITED' ||
      error?.code === 'PROVIDER_MONTHLY_QUOTA_EXHAUSTED' ||
      error?.status === 429 ||
      error?.statusCode === 429 ||
      Boolean(error?.details?.isRateLimited) ||
      /rate limit|quota exceeded|too many requests|429/i.test(error?.message || ''));

  const rawRetryAfter = Number(error?.details?.retryAfter || error?.retryAfter) || 0;
  const [retryCountdown, setRetryCountdown] = useState(rawRetryAfter);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    setRetryCountdown(rawRetryAfter);
  }, [rawRetryAfter]);

  useEffect(() => {
    if (retryCountdown <= 0) return;
    const timer = setInterval(() => {
      setRetryCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [retryCountdown]);

  const handleRetrySearch = async () => {
    if (isRetrying || retryCountdown > 0 || !onRetry) return;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleRankingSelect = (newStrategy) => {
    setActiveRanking(newStrategy);
    if (onRankingChange) {
      onRankingChange(newStrategy);
    }
  };

  // Selected journeys for comparison modal
  const comparedJourneys = useMemo(() => {
    return backendJourneys.filter((j) => comparedJourneyIds.includes(j.id));
  }, [backendJourneys, comparedJourneyIds]);

  // Top recommended journey vs other journeys (Section 19)
  const topJourney = filteredJourneys.length > 0 ? filteredJourneys[0] : null;
  const otherJourneys = filteredJourneys.length > 1 ? filteredJourneys.slice(1) : [];

  return (
    <div className="space-y-6">
      {/* Search Header Banner (Section 5) */}
      <div className="rounded-2xl border border-white/10 bg-surface-primary p-6 sm:p-7 shadow-lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <button
              type="button"
              onClick={onNavigateHome}
              className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:text-brand-hover transition-colors cursor-pointer focus:outline-none"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Modify search</span>
            </button>

            {/* Route Title: Intended Locations */}
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-primary flex flex-wrap items-center gap-2">
              <span className="capitalize">{userOrigin}</span>
              <span className="text-brand-primary">→</span>
              <span className="capitalize">{userDest}</span>
            </h1>

            {/* Secondary: Exact Station/Airport/POI if resolved */}
            {showRoutingPoiSecondary && (
              <p className="mt-1 text-xs text-text-secondary">
                Routing via <strong className="text-text-primary">{exactOriginName}</strong> →{' '}
                <strong className="text-text-primary">{exactDestName}</strong>
              </p>
            )}

            {/* Travel Date & Passengers Summary */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
              {formattedDate && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-brand-primary" aria-hidden="true" />
                  <span>{formattedDate}</span>
                </div>
              )}
              <span>·</span>
              <span>{passengers} {passengers === 1 ? 'passenger' : 'passengers'}</span>

              {status === 'success' && backendJourneys.length > 0 && (
                <>
                  <span>·</span>
                  <div className="flex items-center gap-1.5 font-bold text-text-primary">
                    <MapPin className="h-3.5 w-3.5 text-brand-primary" aria-hidden="true" />
                    <span>
                      {activeFilterCount > 0 ? (
                        <>
                          Showing <strong className="text-brand-primary">{filteredJourneys.length}</strong> of{' '}
                          {journeyStats.total} journey options
                        </>
                      ) : (
                        <>
                          {journeyStats.total} {journeyStats.total === 1 ? 'journey option' : 'journey options'}
                        </>
                      )}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Railway breakdown badge strip */}
            {status === 'success' && backendJourneys.length > 0 && (
              <div className="mt-2 text-xs text-text-tertiary">
                <span className="font-semibold text-text-secondary">Indian Railways</span>
                <span> · {journeyStats.direct} direct</span>
                <span> · {journeyStats.connecting} connecting</span>
              </div>
            )}
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

            {/* Explore Alternatives Button (only when recovery wasn't already triggered) */}
            {backendJourneys.length > 0 && !recoveryMeta?.recoveryTriggered && (
              <button
                type="button"
                onClick={handleExploreAlternatives}
                disabled={isRecoveringAlternatives}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 transition-all cursor-pointer disabled:opacity-50"
                title="Search connecting routes via railway network expansion"
              >
                {isRecoveringAlternatives ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Network className="h-3.5 w-3.5 text-indigo-400" />
                )}
                <span>
                  {isRecoveringAlternatives
                    ? 'Exploring network...'
                    : optionalAlternatives.length > 0
                    ? `${optionalAlternatives.length} alternatives added`
                    : 'Explore alternatives'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={onNavigateHome}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface-secondary px-4 py-2 text-xs font-medium text-text-primary hover:bg-surface-elevated hover:border-white/20 transition-all cursor-pointer"
            >
              <span>Change criteria</span>
            </button>
          </div>
        </div>

        {/* Railway Recovery Engine Banner */}
        {recoveryMeta?.recoveryTriggered && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 text-xs text-indigo-300"
          >
            <div className="flex items-start gap-3">
              <Sparkles className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <div className="font-bold text-sm text-indigo-200">
                  No confirmed direct train seats found. Yatrai is finding alternative routes.
                </div>
                <p className="text-xs text-indigo-300/90 leading-relaxed">
                  {recoveryMeta.reason ||
                    'Direct trains were unavailable or waitlisted. Yatrai explored railway-network stations backward and forward along physical corridors to uncover verified connecting alternatives.'}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-indigo-300/75">
                  <span>• Network expansion: up to {recoveryMeta.originHops || 5} origin hops &amp; {recoveryMeta.destinationHops || 5} destination hops</span>
                  <span>• Independent leg availability verified</span>
                  <span>• Connections checked for safety</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Compact Provider Availability Warning (Section 6) */}
        {hasPartialFailures && (
          <div
            role="note"
            className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                <span>
                  <strong>Results may be incomplete:</strong> Some transport providers are currently unavailable.
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowProviderWarningDetails((prev) => !prev)}
                className="inline-flex items-center gap-1 font-semibold text-amber-400 hover:underline cursor-pointer shrink-0"
              >
                <span>{showProviderWarningDetails ? 'Hide details' : 'Details'}</span>
                {showProviderWarningDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>

            {/* Expandable Failed Providers List */}
            {showProviderWarningDetails && (
              <div className="mt-2.5 pt-2 border-t border-amber-500/20 space-y-1">
                <div className="text-[11px] font-semibold text-amber-200">
                  Unavailable Providers:
                </div>
                {failedProviders.map((fp, idx) => (
                  <div key={idx} className="text-[11px] text-amber-300/80 flex items-center gap-1.5">
                    <span>•</span>
                    <span className="font-semibold capitalize">{fp.provider}:</span>
                    <span>{fp.error?.message || 'Temporary connection timeout'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Ranking Strategy Selector (Section 7) */}
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

      {/* Railway Rate Limit / Monthly Quota State */}
      {!isLoading && isRateLimited && (
        <div className="rounded-2xl border border-amber-500/30 bg-surface-primary p-6 sm:p-8 text-center space-y-4 shadow-xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-text-primary">
              {isMonthlyQuota
                ? 'RailRadar Monthly Quota Exhausted'
                : 'Railway search temporarily rate-limited'}
            </h3>

            <p className="text-sm text-text-secondary max-w-lg mx-auto leading-relaxed">
              {isMonthlyQuota ? (
                <>
                  Your external RailRadar account quota of <strong>100 requests/month</strong> has been exhausted (0 remaining).
                  Yatrai provides verified Indian Railways timetable schedules for core corridors.
                </>
              ) : (
                <>
                  Railway search is temporarily rate-limited by the provider (max 10 requests/minute).
                  {retryCountdown > 0 ? (
                    <span className="block mt-1 font-semibold text-amber-400">
                      Please wait {retryCountdown}s before retrying.
                    </span>
                  ) : (
                    ' Please try again shortly.'
                  )}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            {onRetry && (
              <button
                type="button"
                onClick={handleRetrySearch}
                disabled={isRetrying || retryCountdown > 0}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer shadow-md shadow-brand-primary/25"
              >
                {isRetrying ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Retrying...</span>
                  </>
                ) : retryCountdown > 0 ? (
                  <span>Retry in {retryCountdown}s</span>
                ) : (
                  <span>Retry search</span>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onNavigateHome}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
            >
              <span>Modify criteria</span>
            </button>
          </div>
        </div>
      )}

      {!isLoading && !isRateLimited && status === 'error' && (
        <ErrorState
          title="Unable to find journeys"
          message={error?.message || "We couldn't complete the journey search. Please check your criteria."}
          onRetry={onRetry}
          onModifySearch={onNavigateHome}
        />
      )}

      {/* Backend Empty State (Section 29) */}
      {!isLoading && !isRateLimited && (status === 'empty' || (status === 'success' && validatedJourneys.length === 0)) && (
        <EmptyState onModifySearch={onNavigateHome} />
      )}

      {/* Success State with Journeys */}
      {!isLoading && status === 'success' && backendJourneys.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Desktop Left Sidebar: Filters (Section 17 & 19) */}
          <div className="hidden lg:block lg:col-span-4">
            <JourneyFilters
              filters={filters}
              onChange={setFilters}
              onReset={handleClearFilters}
              bounds={bounds}
            />
          </div>

          {/* Right Main Column: Results / Filter Empty (Section 19) */}
          <div className="lg:col-span-8 space-y-6">
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

            {/* Filter-Empty State */}
            {filteredJourneys.length === 0 ? (
              <FilterEmptyState onClearFilters={handleClearFilters} />
            ) : (
              <>
                {/* 1. RECOMMENDED / BEST JOURNEY SECTION */}
                {topJourney && (
                  <section className="space-y-2.5" aria-label="Recommended Journey">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-brand-primary" aria-hidden="true" />
                      <h2 className="text-xs font-bold uppercase tracking-wider text-brand-primary">
                        {recoveryMeta?.recoveryTriggered
                          ? 'Recommended Alternative Journey'
                          : 'Recommended Direct Train'}
                      </h2>
                    </div>

                    <JourneyResultCard
                      journey={topJourney}
                      isTopPick={true}
                      allJourneys={backendJourneys}
                      onViewJourney={handleViewJourney}
                      onToggleCompare={handleToggleCompare}
                      isCompared={comparedJourneyIds.includes(topJourney.id)}
                    />
                  </section>
                )}

                {/* 2. OTHER JOURNEYS PROGRESSIVE DISCLOSURE SECTION */}
                {otherJourneys.length > 0 && (
                  <section className="space-y-3 pt-2" aria-label="Other Journey Options">
                    {!showMoreJourneys ? (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => setShowMoreJourneys(true)}
                          className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-surface-secondary py-3.5 px-4 text-sm font-semibold text-text-primary hover:bg-surface-elevated hover:border-brand-primary/40 hover:text-brand-primary transition-all cursor-pointer shadow-sm"
                        >
                          <span>
                            {recoveryMeta?.recoveryTriggered
                              ? `Show more alternative journeys (${otherJourneys.length})`
                              : `Show more available trains (${otherJourneys.length})`}
                          </span>
                          <ChevronDown className="h-4 w-4 text-brand-primary" />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h2 className="text-xs font-bold uppercase tracking-wider text-text-tertiary">
                            {recoveryMeta?.recoveryTriggered
                              ? `Other Alternative Journeys (${otherJourneys.length})`
                              : `Other Available Trains (${otherJourneys.length})`}
                          </h2>
                          <button
                            type="button"
                            onClick={() => setShowMoreJourneys(false)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:text-brand-hover cursor-pointer"
                          >
                            <span>Show fewer</span>
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="space-y-4">
                          {otherJourneys.map((journey, idx) => (
                            <JourneyResultCard
                              key={journey.id || idx}
                              journey={journey}
                              isTopPick={false}
                              allJourneys={backendJourneys}
                              onViewJourney={handleViewJourney}
                              onToggleCompare={handleToggleCompare}
                              isCompared={comparedJourneyIds.includes(journey.id)}
                            />
                          ))}
                        </div>

                        <div className="pt-2 flex justify-center">
                          <button
                            type="button"
                            onClick={() => setShowMoreJourneys(false)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-surface-secondary px-4 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
                          >
                            <span>
                              {recoveryMeta?.recoveryTriggered
                                ? 'Show fewer alternative journeys'
                                : 'Show fewer trains'}
                            </span>
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Floating Bottom Comparison Bar (Section 21) */}
      {comparedJourneys.length > 0 && (
        <div
          role="region"
          aria-label="Journey Comparison Bar"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl border border-brand-primary/40 bg-surface-elevated px-5 py-3 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
            <GitCompare className="h-4 w-4 text-brand-primary" />
            <span>
              {comparedJourneys.length} {comparedJourneys.length === 1 ? 'journey' : 'journeys'} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={comparedJourneys.length < 2}
              onClick={() => setIsCompareModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-1.5 text-xs font-bold text-white shadow-md hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <span>Compare journeys</span>
            </button>

            <button
              type="button"
              onClick={() => setComparedJourneyIds([])}
              className="text-xs text-text-tertiary hover:text-text-primary cursor-pointer px-1"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Mobile Filters Bottom Sheet (Section 18) */}
      {isMobileFilterOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Filter Options"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm lg:hidden animate-in fade-in"
          onClick={() => setIsMobileFilterOpen(false)}
        >
          <div
            className="relative w-full max-w-lg max-h-[85vh] rounded-t-3xl bg-surface-primary border-t border-white/10 p-6 overflow-y-auto shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="text-base font-bold text-text-primary">Journey Filters</h3>
              <button
                type="button"
                onClick={() => setIsMobileFilterOpen(false)}
                className="rounded-xl border border-white/10 p-1.5 text-text-secondary hover:text-text-primary cursor-pointer"
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

      {/* Journey Comparison Modal (Section 21) */}
      {isCompareModalOpen && comparedJourneys.length > 0 && (
        <JourneyComparisonModal
          journeys={comparedJourneys}
          onClose={() => setIsCompareModalOpen(false)}
          onSelectJourney={handleViewJourney}
          onRemoveFromCompare={(id) => {
            setComparedJourneyIds((prev) => prev.filter((item) => item !== id));
            if (comparedJourneys.length <= 2) {
              setIsCompareModalOpen(false);
            }
          }}
        />
      )}
    </div>
  );
}

export default ResultsPage;
