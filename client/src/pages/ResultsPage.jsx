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
import P0ResultsView from '../components/journey/P0ResultsView.jsx';
import { generateActionId } from '../services/p0SearchCache.js';

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
  onNavigate,
}) {
  const { status, data, error, isLoading } = searchState;
  const { isAuthenticated } = useAuth();
  const [activeRanking, setActiveRanking] = useState(searchParams?.ranking || 'overall');

  const handleBookJourney = (journey, isUserAuthed) => {
    if (!isUserAuthed) {
      if (onNavigate) {
        onNavigate('/profile');
      } else {
        window.history.pushState(null, '', '/profile');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    } else {
      const journeyId = journey.id || journey._id;
      if (onNavigate) {
        onNavigate(`/booking?journeyId=${journeyId}`);
      } else {
        window.history.pushState(null, '', `/booking?journeyId=${journeyId}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  };

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

  // ── P0 v2 Search Engine State & Handlers ─────────────────────────────────────
  const isP0V2 = Boolean(data?.direct && Array.isArray(data.direct));
  const [p0Direct, setP0Direct] = useState([]);
  const [p0Waiting, setP0Waiting] = useState([]);
  const [p0Alternatives, setP0Alternatives] = useState([]);
  const [p0DateStrip, setP0DateStrip] = useState([]);
  const [p0Budget, setP0Budget] = useState({ used: 0, cap: 40 });
  const [p0Partial, setP0Partial] = useState(false);
  const [p0Degraded, setP0Degraded] = useState(false);
  const [isLoadingAlternatives, setIsLoadingAlternatives] = useState(false);
  const [isLoadingMoreTrains, setIsLoadingMoreTrains] = useState(false);
  const [isSearchingDeeper, setIsSearchingDeeper] = useState(false);

  useEffect(() => {
    if (data?.direct) {
      setP0Direct(data.direct || []);
      setP0Waiting(data.waitingTrains || []);
      setP0Alternatives(data.alternatives || []);
      setP0DateStrip(data.dateStrip || []);
      setP0Budget(data.budget || { used: 0, cap: 40 });
      setP0Partial(Boolean(data.partial));
      setP0Degraded(Boolean(data.degraded));

      // Check if any train has a confirmed seat
      const hasConfirmed = (data.direct || []).some((t) =>
        (t.classes || []).some(
          (c) => c.state === 'CHECKED' && (c.tier === 'AVAILABLE' || /AVL|AVAILABLE/i.test(c.availabilityText || ''))
        )
      );

      // Auto alternatives flow: If no train is CONFIRMED and not degraded, trigger alternatives with SAME actionId
      if (!hasConfirmed && (!data.alternatives || data.alternatives.length === 0) && !data.degraded) {
        setIsLoadingAlternatives(true);
        const originCode = data.direct[0]?.from || searchParams?.origin || searchParams?.from || 'NDLS';
        const destCode = data.direct[0]?.to || searchParams?.destination || searchParams?.to || 'PNBE';
        api.journeysV2
          .search({
            actionId: data.actionId || generateActionId(),
            origins: [originCode],
            destinations: [destCode],
            date: searchParams?.departureDate || searchParams?.date || '',
            class: searchParams?.class || 'ANY',
            quota: searchParams?.quota || 'GN',
            mode: 'alternatives',
          })
          .then((res) => {
            const altData = res?.data || res || {};
            if (altData.alternatives) setP0Alternatives(altData.alternatives);
            if (altData.budget) setP0Budget(altData.budget);
            if (altData.partial) setP0Partial(true);
          })
          .catch(() => {})
          .finally(() => setIsLoadingAlternatives(false));
      }
    }
  }, [data, searchParams]);

  const handleP0CheckClass = async ({ trainNo, from, to, class: cls, date: d, quota: q }) => {
    const actId = generateActionId();
    const res = await api.journeysV2.checkClass({
      actionId: actId,
      trainNo,
      from,
      to,
      class: cls,
      date: d,
      quota: q,
    });
    const chip = res?.data?.checkedClass;
    setP0Direct((prev) =>
      prev.map((t) => {
        if (t.trainNumber !== trainNo) return t;
        const nextClasses = (t.classes || []).map((c) => {
          if (c.class === cls) {
            return {
              ...c,
              state: 'CHECKED',
              tier: chip?.tier || chip?.normalizedStatus,
              availabilityText: chip?.availabilityText || chip?.statusText,
              predictionPercentage: chip?.predictionPercentage || 0,
              checkedAt: new Date().toISOString(),
            };
          }
          return c;
        });
        return { ...t, classes: nextClasses };
      })
    );
  };

  const handleP0RefreshCard = async ({ trainNo, from, to, class: cls, date: d, quota: q }) => {
    const res = await api.journeysV2.refreshCard({ trainNo, from, to, class: cls, date: d, quota: q });
    const avail = res?.data?.availability;
    const checkedAt = res?.data?.checkedAt || new Date().toISOString();
    setP0Direct((prev) =>
      prev.map((t) => {
        if (t.trainNumber !== trainNo) return t;
        const nextClasses = (t.classes || []).map((c) => {
          if (c.class === cls) {
            return {
              ...c,
              state: 'CHECKED',
              tier: avail?.normalizedStatus,
              availabilityText: avail?.statusText || avail?.originalStatus,
              predictionPercentage: avail?.predictionPercentage || 0,
              checkedAt,
            };
          }
          return c;
        });
        return { ...t, classes: nextClasses, checkedAt };
      })
    );
  };

  const handleP0CheckMoreTrains = async () => {
    if (isLoadingMoreTrains || p0Waiting.length === 0) return;
    setIsLoadingMoreTrains(true);
    try {
      const res = await api.journeysV2.moreTrains({
        actionId: data?.actionId || generateActionId(),
        waitingTrains: p0Waiting,
        date: searchParams?.departureDate || searchParams?.date || '',
        class: searchParams?.class || 'ANY',
        quota: searchParams?.quota || 'GN',
      });
      const d = res?.data || res || {};
      if (d.checkedTrains) setP0Direct((prev) => [...prev, ...d.checkedTrains]);
      if (d.remainingWaiting) setP0Waiting(d.remainingWaiting);
      if (d.budget) setP0Budget(d.budget);
      if (d.partial) setP0Partial(true);
    } finally {
      setIsLoadingMoreTrains(false);
    }
  };

  const handleP0SearchDeeper = async () => {
    if (isSearchingDeeper) return;
    setIsSearchingDeeper(true);
    try {
      const originCode = p0Direct[0]?.from || searchParams?.origin || searchParams?.from || 'NDLS';
      const destCode = p0Direct[0]?.to || searchParams?.destination || searchParams?.to || 'PNBE';
      const res = await api.journeysV2.search({
        actionId: generateActionId(),
        origins: [originCode],
        destinations: [destCode],
        date: searchParams?.departureDate || searchParams?.date || '',
        class: searchParams?.class || 'ANY',
        quota: searchParams?.quota || 'GN',
        mode: 'deep',
      });
      const d = res?.data || res || {};
      if (d.alternatives) setP0Alternatives(d.alternatives);
      if (d.budget) setP0Budget(d.budget);
      if (d.partial !== undefined) setP0Partial(Boolean(d.partial));
    } finally {
      setIsSearchingDeeper(false);
    }
  };

  const handleP0ExploreAlternativesButton = async () => {
    if (isLoadingAlternatives) return;
    setIsLoadingAlternatives(true);
    try {
      const originCode = p0Direct[0]?.from || searchParams?.origin || searchParams?.from || 'NDLS';
      const destCode = p0Direct[0]?.to || searchParams?.destination || searchParams?.to || 'PNBE';
      const res = await api.journeysV2.search({
        actionId: generateActionId(),
        origins: [originCode],
        destinations: [destCode],
        date: searchParams?.departureDate || searchParams?.date || '',
        class: searchParams?.class || 'ANY',
        quota: searchParams?.quota || 'GN',
        mode: 'alternatives',
      });
      const d = res?.data || res || {};
      if (d.alternatives) setP0Alternatives(d.alternatives);
      if (d.budget) setP0Budget(d.budget);
      if (d.partial) setP0Partial(true);
    } finally {
      setIsLoadingAlternatives(false);
    }
  };

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
    const legs = Array.isArray(j.legs) ? j.legs : [];
    const hasRailLeg = legs.some((l) => String(l.mode || '').toLowerCase() === 'rail');
    const hasRailMode = modes.some((m) => String(m).toLowerCase() === 'rail');
    return hasRailLeg || hasRailMode || Boolean(j.isDirectTrain);
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
      ['rail', 'irctc', 'railkit'].includes(String(p.provider || '').toLowerCase())
  );
  const hasPartialFailures = failedProviders.length > 0;

  const isMaintenanceWindow =
    error?.code === 'MAINTENANCE_WINDOW' ||
    error?.details?.isMaintenanceWindow ||
    /IRCTC maintenance window/i.test(error?.message || '') ||
    Boolean(data?.meta?.isMaintenanceWindow);

  const isMonthlyQuota =
    error?.code === 'PROVIDER_MONTHLY_QUOTA_EXHAUSTED' ||
    error?.subCode === 'MONTHLY_QUOTA_EXHAUSTED' ||
    error?.details?.isMonthlyQuota ||
    /monthly quota/i.test(error?.message || '');

  const isLiveDisabled =
    error?.status === 403 ||
    error?.statusCode === 403 ||
    error?.code === 'LIVE_REQUESTS_BLOCKED' ||
    /LIVE_REQUESTS_ALLOWED|live requests blocked|live data is disabled/i.test(error?.message || '');

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
    <div className="space-y-5">
      {/* Search Header Banner (Section 5) */}
      <div className="rounded-2xl border border-[#303640] bg-[#12151A] p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <button
              type="button"
              onClick={onNavigateHome}
              className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#E8B04A] hover:text-[#F2BE62] transition-colors cursor-pointer focus:outline-none"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Modify search</span>
            </button>

            {/* Route Title: Intended Locations */}
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F0F1F3] flex flex-wrap items-center gap-2.5">
              <span className="capitalize">{userOrigin}</span>
              <span className="text-[#E8B04A]">→</span>
              <span className="capitalize">{userDest}</span>
            </h1>

            {/* Secondary: Exact Station/Airport/POI if resolved */}
            {showRoutingPoiSecondary && (
              <p className="mt-1 text-xs text-[#A7AFBA]">
                Routing via <strong className="text-[#F0F1F3]">{exactOriginName}</strong> →{' '}
                <strong className="text-[#F0F1F3]">{exactDestName}</strong>
              </p>
            )}

            {/* Travel Date & Passengers Summary */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#A7AFBA]">
              {formattedDate && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-[#E8B04A]" aria-hidden="true" />
                  <span>{formattedDate}</span>
                </div>
              )}
              <span>·</span>
              <span>{passengers} {passengers === 1 ? 'passenger' : 'passengers'}</span>

              {status === 'success' && backendJourneys.length > 0 && (
                <>
                  <span>·</span>
                  <div className="flex items-center gap-1.5 font-semibold text-[#F0F1F3]">
                    <MapPin className="h-3.5 w-3.5 text-[#E8B04A]" aria-hidden="true" />
                    <span>
                      {activeFilterCount > 0 ? (
                        <>
                          Showing <strong className="text-[#E8B04A]">{filteredJourneys.length}</strong> of{' '}
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
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[#7E8794]">
                <span className="font-medium text-[#A7AFBA]">Indian Railways</span>
                <span className="text-[#303640]">·</span>
                <span>{journeyStats.direct} direct</span>
                <span className="text-[#303640]">·</span>
                <span>{journeyStats.connecting} connecting</span>
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
                className="lg:hidden inline-flex items-center gap-2 rounded-xl border border-[#303640] bg-[#15191F] px-3.5 py-2 text-xs font-semibold text-[#F0F1F3] hover:bg-[#181C22] hover:border-[#3A414C] transition-colors cursor-pointer"
                aria-label="Open filter options"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-[#E8B04A]" aria-hidden="true" />
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#E8B04A] px-1 text-[10px] font-bold text-[#0B0D10]">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            )}

            {/* Unified Scroll-to-Alternatives Pill Button */}
            {isP0V2 ? (
              p0Alternatives.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('alternatives-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8B04A]/40 bg-[#E8B04A]/10 px-3.5 py-2 text-xs font-semibold text-[#E8B04A] hover:bg-[#E8B04A]/20 hover:border-[#E8B04A] transition-all cursor-pointer shadow-sm"
                  title="Scroll down to alternative journeys"
                >
                  <Sparkles className="h-3.5 w-3.5 text-[#E8B04A]" />
                  <span>{p0Alternatives.length} alternative{p0Alternatives.length > 1 ? 's' : ''} added</span>
                </button>
              )
            ) : (
              backendJourneys.length > 0 && !recoveryMeta?.recoveryTriggered && (
                <button
                  type="button"
                  onClick={handleExploreAlternatives}
                  disabled={isRecoveringAlternatives}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#303640] bg-[#15191F] px-3.5 py-2 text-xs font-semibold text-[#F0F1F3] hover:bg-[#181C22] hover:border-[#3A414C] transition-all cursor-pointer disabled:opacity-50"
                  title="Search connecting routes via railway network expansion"
                >
                  {isRecoveringAlternatives ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E8B04A]" />
                  ) : (
                    <Network className="h-3.5 w-3.5 text-[#E8B04A]" />
                  )}
                  <span>
                    {isRecoveringAlternatives
                      ? 'Exploring network...'
                      : optionalAlternatives.length > 0
                      ? `${optionalAlternatives.length} alternatives added`
                      : 'Explore alternatives'}
                  </span>
                </button>
              )
            )}

            <button
              type="button"
              onClick={onNavigateHome}
              className="inline-flex items-center gap-2 rounded-xl border border-[#303640] bg-[#15191F] px-4 py-2 text-xs font-medium text-[#A7AFBA] hover:text-[#F0F1F3] hover:bg-[#181C22] hover:border-[#3A414C] transition-all cursor-pointer"
            >
              <span>Change criteria</span>
            </button>
          </div>
        </div>

        {/* Railway Recovery Engine Banner */}
        {recoveryMeta?.recoveryTriggered && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-[#E8B04A]/25 bg-[#181C22] p-4 text-xs text-[#A7AFBA]"
          >
            <div className="flex items-start gap-3">
              <Sparkles className="h-4 w-4 text-[#E8B04A] shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <div className="font-bold text-sm text-[#F0F1F3]">
                  No confirmed direct train seats found. Yatrai is finding alternative routes.
                </div>
                <p className="text-xs text-[#A7AFBA] leading-relaxed">
                  {recoveryMeta.reason ||
                    'Direct trains were unavailable or waitlisted. Yatrai explored railway-network stations backward and forward along physical corridors to uncover verified connecting alternatives.'}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[#7E8794]">
                  <span>· Network expansion: up to {recoveryMeta.originHops || 5} origin hops &amp; {recoveryMeta.destinationHops || 5} destination hops</span>
                  <span>· Independent leg availability verified</span>
                  <span>· Connections checked for safety</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Compact Provider Availability Warning (Section 6) */}
        {hasPartialFailures && (
          <div
            role="note"
            className="mt-4 rounded-xl border border-amber-500/20 bg-[#181C22] p-3 text-xs text-amber-300"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                <span>
                  <strong className="text-amber-200">Results may be incomplete:</strong>{' '}
                  Some transport providers are currently unavailable.
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowProviderWarningDetails((prev) => !prev)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:text-amber-300 cursor-pointer shrink-0"
              >
                <span>{showProviderWarningDetails ? 'Hide' : 'Details'}</span>
                {showProviderWarningDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>

            {showProviderWarningDetails && (
              <div className="mt-2.5 pt-2 border-t border-amber-500/15 space-y-1">
                <div className="text-[11px] font-semibold text-amber-200/80 uppercase tracking-wide">
                  Unavailable Providers
                </div>
                {failedProviders.map((fp, idx) => (
                  <div key={idx} className="text-[11px] text-amber-300/70 flex items-center gap-1.5">
                    <span className="text-amber-500/60">·</span>
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
          <div className="mt-5 border-t border-[#303640]/80 pt-4">
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

      {/* IRCTC Maintenance Window State (23:45 - 00:15 IST) */}
      {!isLoading && isMaintenanceWindow && (
        <div className="rounded-2xl border border-blue-500/30 bg-graphite-900 p-6 sm:p-8 text-center space-y-4 shadow-xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-text-primary">
              IRCTC Maintenance Window (23:45 – 00:15 IST)
            </h3>
            <p className="text-sm text-text-secondary max-w-lg mx-auto leading-relaxed">
              IRCTC ticketing servers undergo nightly maintenance between 23:45 and 00:15 IST. Live seat availability and booking are unavailable during this period and will reopen at 00:15 IST.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onNavigateHome}
              className="inline-flex items-center gap-2 rounded-xl border border-graphite-800 bg-graphite-850 px-4 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-graphite-800 hover:border-graphite-700 transition-colors cursor-pointer"
            >
              <span>Modify criteria</span>
            </button>
          </div>
        </div>
      )}

      {/* Railway Rate Limit / Monthly Quota State */}
      {!isLoading && !isMaintenanceWindow && isRateLimited && (
        <div className="rounded-2xl border border-amber-500/30 bg-graphite-900 p-6 sm:p-8 text-center space-y-4 shadow-xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-text-primary">
              {isMonthlyQuota
                ? 'RailKit Monthly Quota Exhausted'
                : 'Railway search temporarily rate-limited'}
            </h3>

            <p className="text-sm text-text-secondary max-w-lg mx-auto leading-relaxed">
              {isMonthlyQuota ? (
                <>
                  Your external RailKit account quota of <strong>10,000 requests/month</strong> has been exhausted (0 remaining).
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
                className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-xs font-semibold text-graphite-950 hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer shadow-md shadow-brand-primary/25"
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
              className="inline-flex items-center gap-2 rounded-xl border border-graphite-800 bg-graphite-850 px-4 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-graphite-800 hover:border-graphite-700 transition-colors cursor-pointer"
            >
              <span>Modify criteria</span>
            </button>
          </div>
        </div>
      )}

      {!isLoading && !isRateLimited && status === 'error' && (
        <ErrorState
          title={isLiveDisabled ? 'Live Data Disabled' : 'Unable to find journeys'}
          message={
            isLiveDisabled
              ? 'Live data is disabled. Set LIVE_REQUESTS_ALLOWED=true or enable recorded mode'
              : (error?.message || "We couldn't complete the journey search. Please check your criteria.")
          }
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Desktop Left Sidebar: Filters */}
          <div className="hidden lg:block lg:col-span-4">
            <JourneyFilters
              filters={filters}
              onChange={setFilters}
              onReset={handleClearFilters}
              bounds={bounds}
            />
          </div>

          {/* Right Main Column: Results */}
          <div className="lg:col-span-8 space-y-4">
            {/* Active Filter Strip */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#303640] bg-[#12151A] px-4 py-2.5 text-xs">
                <span className="text-[#A7AFBA]">
                  Showing{' '}<strong className="text-[#F0F1F3]">{filteredJourneys.length}</strong>{' '}of{' '}
                  {backendJourneys.length} journeys
                </span>
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-1 font-semibold text-[#E8B04A] hover:text-[#F2BE62] cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  <span>Reset filters</span>
                </button>
              </div>
            )}

            {/* If P0 v2 results are active, render P0ResultsView */}
            {isP0V2 ? (
              <P0ResultsView
                direct={p0Direct}
                waitingTrains={p0Waiting}
                alternatives={p0Alternatives}
                dateStrip={p0DateStrip}
                partial={p0Partial}
                degraded={p0Degraded}
                budget={p0Budget}
                date={travelDate}
                quota={searchParams?.quota || 'GN'}
                isLoadingAlternatives={isLoadingAlternatives}
                isLoadingMoreTrains={isLoadingMoreTrains}
                isSearchingDeeper={isSearchingDeeper}
                hasConfirmedDirectSeat={p0Direct.some((t) =>
                  (t.classes || []).some(
                    (c) => c.state === 'CHECKED' && (c.tier === 'AVAILABLE' || /AVL|AVAILABLE/i.test(c.availabilityText || ''))
                  )
                )}
                onCheckClass={handleP0CheckClass}
                onRefreshCard={handleP0RefreshCard}
                onExploreAlternatives={handleP0ExploreAlternativesButton}
                onCheckMoreTrains={handleP0CheckMoreTrains}
                onSearchDeeper={handleP0SearchDeeper}
                onSelectDate={(newDate) => {
                  window.history.pushState(null, '', `?from=${userOrigin}&to=${userDest}&date=${newDate}`);
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                onBookJourney={(j) => handleBookJourney(j, isAuthenticated)}
              />
            ) : filteredJourneys.length === 0 ? (
              <FilterEmptyState onClearFilters={handleClearFilters} />
            ) : (
              <>
                {/* 1. RECOMMENDED / BEST JOURNEY SECTION */}
                {topJourney && (
                  <section className="space-y-2" aria-label="Recommended Journey">
                    <div className="flex items-center gap-1.5 pb-1">
                      <Sparkles className="h-3.5 w-3.5 text-[#E8B04A]" aria-hidden="true" />
                      <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#E8B04A]">
                        {recoveryMeta?.recoveryTriggered
                          ? 'Recommended Alternative'
                          : 'Recommended by Yatrai'}
                      </h2>
                    </div>

                    <JourneyResultCard
                      journey={topJourney}
                      isTopPick={true}
                      allJourneys={backendJourneys}
                      onViewJourney={handleViewJourney}
                      onBookJourney={handleBookJourney}
                      onToggleCompare={handleToggleCompare}
                      isCompared={comparedJourneyIds.includes(topJourney.id)}
                    />
                  </section>
                )}

                {/* 2. OTHER JOURNEYS PROGRESSIVE DISCLOSURE SECTION */}
                {otherJourneys.length > 0 && (
                  <section className="space-y-3 pt-1" aria-label="Other Journey Options">
                    {!showMoreJourneys ? (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setShowMoreJourneys(true)}
                          className="w-full flex items-center justify-center gap-2 rounded-xl border border-[#303640] bg-[#12151A] py-3 px-4 text-xs font-semibold text-[#A7AFBA] hover:bg-[#15191F] hover:border-[#3A414C] hover:text-[#E8B04A] transition-all cursor-pointer"
                        >
                          <span>
                            {recoveryMeta?.recoveryTriggered
                              ? `Show more alternatives (${otherJourneys.length})`
                              : `Show more trains (${otherJourneys.length})`}
                          </span>
                          <ChevronDown className="h-3.5 w-3.5 text-[#E8B04A]" />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7E8794]">
                            {recoveryMeta?.recoveryTriggered
                              ? `Other Alternatives (${otherJourneys.length})`
                              : `Other Trains (${otherJourneys.length})`}
                          </h2>
                          <button
                            type="button"
                            onClick={() => setShowMoreJourneys(false)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#E8B04A] hover:text-[#F2BE62] cursor-pointer"
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
                              onBookJourney={handleBookJourney}
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

      {/* Floating Bottom Comparison Bar */}
      {comparedJourneys.length > 0 && (
        <div
          role="region"
          aria-label="Journey Comparison Bar"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl border border-brand-primary/30 bg-graphite-850 px-5 py-3 shadow-2xl shadow-black/40 backdrop-blur-md animate-in slide-in-from-bottom"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
            <GitCompare className="h-3.5 w-3.5 text-brand-primary" />
            <span>
              {comparedJourneys.length} {comparedJourneys.length === 1 ? 'journey' : 'journeys'} selected
            </span>
          </div>

          <div className="w-px h-4 bg-graphite-700" aria-hidden="true" />

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={comparedJourneys.length < 2}
              onClick={() => setIsCompareModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-1.5 text-xs font-bold text-graphite-950 shadow-md shadow-brand-primary/20 hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <span>Compare journeys</span>
            </button>

            <button
              type="button"
              onClick={() => setComparedJourneyIds([])}
              className="text-xs text-text-tertiary hover:text-text-primary cursor-pointer px-1 transition-colors"
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
