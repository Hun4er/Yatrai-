import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Layers,
  Search,
  Loader2,
  ChevronDown,
  ChevronUp,
  Info,
  ShieldAlert,
  Calendar,
} from 'lucide-react';
import P0DirectTrainCard from './P0DirectTrainCard.jsx';
import P0AlternativeCard from './P0AlternativeCard.jsx';
import P0ExtensionCard from './P0ExtensionCard.jsx';
import P0DateStrip from './P0DateStrip.jsx';
import { computeEmptyStateFacts } from '../../utils/journeyViewModel.js';

/**
 * P0ResultsView Component (P0 v2)
 *
 * Implements all Frontend specifications from P0 v2:
 * 1. Flow: Direct first; if no CONFIRMED train, alternatives skeleton displayed and auto-fetched.
 * 2. If direct seat exists: "Alternative journeys" button (new actionId, mode "alternatives").
 * 3. Under direct list:
 *    - "Checked X of Y trains" (friendly text, never raw calls unless ?debug=1).
 *    - "Check more trains" button (mode more-trains).
 *    - "Search deeper" button (mode deep), ONLY displayed after partial === true.
 * 4. Sticky class filter chips.
 * 5. Date strip (4-date availability, confirmed dates highlighted).
 * 6. "Partial results" banner when partial === true.
 * 7. Top notice on alternatives: "separate tickets, a missed connection is not protected".
 */
export function P0ResultsView({
  direct = [],
  waitingTrains = [],
  alternatives = [],
  dateStrip = [],
  partial = false,
  degraded = false,
  budget = { used: 0, cap: 40 },
  features = null,
  extension = null,
  date,
  quota = 'GN',
  destinationCode = '',
  destinationName = '',
  requestedDestination = '',
  requestedDestinationName = '',
  destinationCluster = [],
  providerNotice = null,
  allCancelled = false,
  message = null,
  isLoadingAlternatives = false,
  isLoadingMoreTrains = false,
  isSearchingDeeper = false,
  hasConfirmedDirectSeat = false,
  onCheckClass,
  onRefreshCard,
  onExploreAlternatives,
  onCheckMoreTrains,
  onSearchDeeper,
  onSelectDate,
  onBookJourney,
  onViewJourney,
  originCode = '',
  originName = '',
  requestedOrigin = '',
  requestedOriginName = '',
  onModifySearch = null,
}) {
  // Sticky class filter state
  const [selectedClassFilter, setSelectedClassFilter] = useState('ALL');
  const [showAllDirectTrains, setShowAllDirectTrains] = useState(false);

  // Check if ?debug=1 is in URL
  const isDebugMode = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('debug') === '1';
  }, []);

  // Collect only reservable classes (1A, 2A, 3A, 3E, SL, CC, EC, 2S). Remove GEN and PWD.
  const offeredClasses = useMemo(() => {
    const RESERVABLE_CLASSES = ['1A', '2A', '3A', '3E', 'SL', 'CC', 'EC', '2S'];
    const set = new Set();
    direct.forEach((t) => {
      (t.classes || []).forEach((c) => {
        const cls = String(c.class || '').toUpperCase();
        if (RESERVABLE_CLASSES.includes(cls)) set.add(cls);
      });
      (t.offeredClasses || []).forEach((c) => {
        const cls = String(c || '').toUpperCase();
        if (RESERVABLE_CLASSES.includes(cls)) set.add(cls);
      });
    });
    const sorted = RESERVABLE_CLASSES.filter((c) => set.has(c));
    return ['ALL', ...sorted];
  }, [direct]);

  // Selecting a class filters trains by that class and checks visible trains in budgeted order
  const handleSelectClassFilter = (cls) => {
    setSelectedClassFilter(cls);
    if (cls && cls !== 'ALL' && onCheckClass) {
      const visibleTrains = direct.filter((t) =>
        (t.classes || []).some((c) => c.class === cls) || (t.offeredClasses || []).includes(cls)
      ).slice(0, 3);

      visibleTrains.forEach((t) => {
        const targetClass = (t.classes || []).find((c) => c.class === cls);
        if (targetClass && targetClass.state !== 'CHECKED') {
          onCheckClass({
            trainNo: t.trainNumber,
            from: t.from,
            to: t.to,
            class: cls,
            date,
            quota,
          });
        }
      });
    }
  };

  // Filter direct trains by class if selected
  const filteredDirect = useMemo(() => {
    if (selectedClassFilter === 'ALL') return direct;
    return direct.filter((t) =>
      (t.classes || []).some((c) => c.class === selectedClassFilter) ||
      (t.offeredClasses || []).includes(selectedClassFilter)
    );
  }, [direct, selectedClassFilter]);

  // Filter alternatives by class if selected, keeping unknown/null values
  const filteredAlternatives = useMemo(() => {
    if (selectedClassFilter === 'ALL') return alternatives;
    return alternatives.filter((alt) => {
      if (!alt.laneClass && (!alt.legs || alt.legs.length === 0)) return true;
      if (alt.laneClass === selectedClassFilter) return true;
      return (alt.legs || []).some((l) => l.class === selectedClassFilter || !l.class);
    });
  }, [alternatives, selectedClassFilter]);

  const hiddenAlternativesCount = alternatives.length - filteredAlternatives.length;

  const totalTrainsCount = direct.length + waitingTrains.length;
  const checkedTrainsCount = direct.length;

  // Determine if alternatives have any confirmed plans or only risky plans
  const hasConfirmedAlt = useMemo(() => {
    return filteredAlternatives.some(
      (a) => !a.isRisky && (a.tier === 'CONFIRMED' || a.tier === 'AVAILABLE')
    );
  }, [filteredAlternatives]);

  // Factual empty state calculation
  const emptyFacts = useMemo(() => {
    return computeEmptyStateFacts({ direct });
  }, [direct]);

  // When direct has no confirmed seat, show only first 3 trains unless toggled
  const visibleDirectTrains = useMemo(() => {
    if (hasConfirmedDirectSeat || showAllDirectTrains) return filteredDirect;
    return filteredDirect.slice(0, 3);
  }, [filteredDirect, hasConfirmedDirectSeat, showAllDirectTrains]);

  // Calculate failed checks and whether >= 50% failed with TRANSIENT / AUTH_QUOTA
  const { failedChecksList, isSlowSeatData } = useMemo(() => {
    const failed = [];
    let totalCheckedOrFailed = 0;
    (direct || []).forEach((train) => {
      (train.classes || []).forEach((c) => {
        if (c.state === 'CHECKED' || c.tier === 'ERROR' || c.tier === 'UNKNOWN' || c.state === 'STALE') {
          totalCheckedOrFailed++;
          const isFailed = c.tier === 'ERROR' || c.tier === 'UNKNOWN' || c.errorClass === 'TRANSIENT' || c.errorClass === 'AUTH_QUOTA';
          if (isFailed) {
            failed.push({
              trainNo: train.trainNumber || train.train_number,
              from: train.from,
              to: train.to,
              class: c.class,
              date,
              quota,
            });
          }
        }
      });
    });
    const isSlow = totalCheckedOrFailed > 0 && failed.length >= Math.ceil(totalCheckedOrFailed / 2);
    return { failedChecksList: failed, isSlowSeatData: isSlow };
  }, [direct, date, quota]);

  const [isRetryingFailed, setIsRetryingFailed] = useState(false);
  const hasAutoRetriedRef = useRef(false);

  // Manual retry handler (cap 40, new actionId, only failed keys, most useful trains first)
  const handleRetryFailed = async () => {
    if (isRetryingFailed || failedChecksList.length === 0 || !onCheckClass) return;
    setIsRetryingFailed(true);
    try {
      const retryActionId = `p0_retry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const batch = failedChecksList.slice(0, 40);
      for (const item of batch) {
        await onCheckClass({ ...item, actionId: retryActionId });
      }
    } finally {
      setIsRetryingFailed(false);
    }
  };

  // Phase 3 item 3: Auto-retry failed checks for visible cards once after 20 s, within caps, and stop after one attempt
  useEffect(() => {
    if (hasAutoRetriedRef.current || !onCheckClass) return;

    const visibleFailed = [];
    (visibleDirectTrains || []).forEach((train) => {
      (train.classes || []).forEach((c) => {
        const isFailed = c.tier === 'ERROR' || c.tier === 'UNKNOWN' || c.errorClass === 'TRANSIENT' || c.errorClass === 'AUTH_QUOTA';
        if (isFailed) {
          visibleFailed.push({
            trainNo: train.trainNumber || train.train_number,
            from: train.from,
            to: train.to,
            class: c.class,
            date,
            quota,
          });
        }
      });
    });

    if (visibleFailed.length === 0) return;

    const timer = setTimeout(async () => {
      if (hasAutoRetriedRef.current) return;
      hasAutoRetriedRef.current = true;
      const retryActionId = `p0_auto_retry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      for (const item of visibleFailed.slice(0, 40)) {
        try {
          await onCheckClass({ ...item, actionId: retryActionId });
        } catch {}
      }
    }, 20000);

    return () => clearTimeout(timer);
  }, [visibleDirectTrains, onCheckClass, date, quota]);

  const handleShowNearbyDates = () => {
    const el = document.getElementById('p0-date-strip');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleRetryAll = () => {
    if (onRefreshCard && direct.length > 0) {
      onRefreshCard(direct[0].trainNumber || direct[0].train_number);
    }
  };

  // ── Render Helpers ────────────────────────────────────────────────────────

  const renderDirectSection = () => (
    <section className="space-y-4" aria-label="Direct Trains">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#E8B04A] flex items-center gap-2">
          <span>Direct Trains</span>
          <span className="rounded-full bg-[#1F242C] border border-[#303640] px-2 py-0.5 text-[10px] text-[#A7AFBA]">
            {filteredDirect.length}
          </span>
        </h2>

        {/* Friendly Checked Text & Debug info */}
        <div className="text-xs text-[#A7AFBA] flex flex-wrap items-center gap-2">
          <span>
            Checked <strong className="text-[#F0F1F3]">{checkedTrainsCount}</strong> of{' '}
            {totalTrainsCount} trains
          </span>
          {isDebugMode && (
            <span className="rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 text-[10px] font-mono">
              calls: {budget.used}/{budget.cap}
            </span>
          )}
        </div>
      </div>

      {/* Direct Train Cards */}
      {filteredDirect.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#303640] bg-[#12151A] p-6 text-center text-xs text-[#7E8794]">
          {allCancelled
            ? (message || 'All direct trains on this route are cancelled for the selected date.')
            : selectedClassFilter === 'ALL'
            ? (message || 'No direct trains found between selected stations.')
            : `No direct trains found matching class ${selectedClassFilter}.`}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleDirectTrains.map((train, idx) => (
            <P0DirectTrainCard
              key={train.trainNumber || idx}
              train={train}
              date={date}
              quota={quota}
              destinationCode={destinationCode}
              destinationName={destinationName}
              requestedDestination={requestedDestination}
              requestedDestinationName={requestedDestinationName}
              onCheckClass={onCheckClass}
              onRefreshCard={onRefreshCard}
              onBook={onBookJourney}
              activeClassFilter={selectedClassFilter === 'ALL' ? null : selectedClassFilter}
              onSelectClassFilter={handleSelectClassFilter}
            />
          ))}
        </div>
      )}

      {/* Show all / Show fewer toggle when not hasConfirmedDirectSeat */}
      {!hasConfirmedDirectSeat && filteredDirect.length > 3 && (
        <div className="text-center pt-1">
          <button
            type="button"
            onClick={() => setShowAllDirectTrains((p) => !p)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#303640] bg-[#15191F] px-4 py-2 text-xs font-semibold text-[#A7AFBA] hover:text-[#F0F1F3] hover:border-[#4B5563] transition-all cursor-pointer"
          >
            {showAllDirectTrains ? (
              <>
                <span>Show first 3 direct trains</span>
                <ChevronUp className="h-3.5 w-3.5 text-[#E8B04A]" />
              </>
            ) : (
              <>
                <span>Show all {filteredDirect.length} direct trains</span>
                <ChevronDown className="h-3.5 w-3.5 text-[#E8B04A]" />
              </>
            )}
          </button>
        </div>
      )}

      {/* Under Direct List Actions: Check More Trains & Search Deeper */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
        {waitingTrains.length > 0 && (
          <button
            type="button"
            onClick={onCheckMoreTrains}
            disabled={isLoadingMoreTrains}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-[#303640] bg-[#15191F] px-5 py-2.5 text-xs font-semibold text-[#F0F1F3] hover:bg-[#1A1F26] hover:border-[#E8B04A] transition-all cursor-pointer disabled:opacity-50"
          >
            {isLoadingMoreTrains ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E8B04A]" />
                <span>Checking next batch...</span>
              </>
            ) : (
              <>
                <span>Check more trains ({waitingTrains.length} waiting)</span>
                <ChevronDown className="h-3.5 w-3.5 text-[#E8B04A]" />
              </>
            )}
          </button>
        )}

        {/* Search Deeper button: Only when partial === true */}
        {partial && (
          <button
            type="button"
            onClick={onSearchDeeper}
            disabled={isSearchingDeeper}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#181C22] border border-[#E8B04A]/40 px-5 py-2.5 text-xs font-bold text-[#E8B04A] hover:bg-[#1E232B] hover:border-[#E8B04A] transition-all cursor-pointer shadow-md disabled:opacity-50"
          >
            {isSearchingDeeper ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E8B04A]" />
                <span>Searching deeper (cap 100)...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 text-[#E8B04A]" />
                <span>Search deeper</span>
              </>
            )}
          </button>
        )}
      </div>
    </section>
  );

  const [hasCompletedAltSearch, setHasCompletedAltSearch] = useState(false);
  const wasLoadingAltRef = useRef(false);

  useEffect(() => {
    if (isLoadingAlternatives) {
      wasLoadingAltRef.current = true;
    } else if (wasLoadingAltRef.current) {
      setHasCompletedAltSearch(true);
    }
  }, [isLoadingAlternatives]);

  const renderAlternativesSection = () => (
    <section id="alternatives-section" className="space-y-4 pt-4 border-t border-[#232830]" aria-label="Alternative Journeys">
      {/* 6.C / Header: When alternatives are present or direct seat exists */}
      {(filteredAlternatives.length > 0 || hasConfirmedDirectSeat) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-1">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#E8B04A] flex items-center gap-2">
              <span>
                {filteredAlternatives.length > 0
                  ? (hasConfirmedAlt ? 'Alternative Journeys Found' : 'Alternative Journeys Found (Risky)')
                  : 'Alternative Journeys'}
              </span>
              {filteredAlternatives.length > 0 && (
                <span className="rounded-full bg-[#181C22] border border-[#232830] px-2 py-0.5 text-[10px] text-[#9AA3AF]">
                  {filteredAlternatives.length} {hasConfirmedAlt ? 'verified' : 'available'}
                </span>
              )}
            </h2>
            <p className="text-[11px] text-[#9AA3AF] mt-0.5">
              {filteredAlternatives.length > 0
                ? 'Compare complete routes, journey time, transfers, and available fare information.'
                : 'Explore alternative split tickets and hub connections across station clusters.'}
            </p>
          </div>

          {/* "Find Alternative Journeys" header button when direct seat exists */}
          {hasConfirmedDirectSeat && alternatives.length === 0 && !isLoadingAlternatives && (
            <button
              type="button"
              onClick={onExploreAlternatives}
              disabled={isLoadingAlternatives}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#232830] bg-[#181C22] px-4 py-2 text-xs font-semibold text-[#E8B04A] hover:bg-[#1E232B] hover:border-[#E8B04A] transition-all cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-[#E8B04A]" />
              <span>Find Alternative Journeys</span>
            </button>
          )}
        </div>
      )}

      {/* 6.B: Truthful In-Context Progress State during Alternative Discovery */}
      {isLoadingAlternatives && (
        <div className="rounded-2xl border border-[#232830] bg-[#12151A] p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-[#232830] pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#E8B04A] animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#E8B04A]">
                Finding an Alternative Route
              </span>
            </div>
            <span className="text-[11px] text-[#9AA3AF] flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E8B04A]" />
              <span>Searching network...</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="flex items-start gap-2.5 rounded-xl border border-[#232830] bg-[#181C22] p-3 text-xs">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                ✓
              </div>
              <div>
                <div className="font-semibold text-[#EDEFF2]">1. Direct train options</div>
                <div className="text-[11px] text-[#9AA3AF] mt-0.5">Checked {direct.length} direct services</div>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-[#E8B04A]/30 bg-[#E8B04A]/5 p-3 text-xs">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E8B04A]/20 text-[#E8B04A] font-bold text-[10px]">
                <Loader2 className="h-3 w-3 animate-spin" />
              </div>
              <div>
                <div className="font-semibold text-[#EDEFF2]">2. Expanding station options</div>
                <div className="text-[11px] text-[#9AA3AF] mt-0.5">Exploring MMT station extensions & clusters</div>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-[#232830] bg-[#181C22] p-3 text-xs opacity-75">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#232830] text-[#9AA3AF] font-bold text-[10px]">
                3
              </div>
              <div>
                <div className="font-semibold text-[#9AA3AF]">3. Connecting trains</div>
                <div className="text-[11px] text-[#6B7480] mt-0.5">Searching interchange hubs & split routes</div>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-[#232830] bg-[#181C22] p-3 text-xs opacity-75">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#232830] text-[#9AA3AF] font-bold text-[10px]">
                4
              </div>
              <div>
                <div className="font-semibold text-[#9AA3AF]">4. Validating transfer times</div>
                <div className="text-[11px] text-[#6B7480] mt-0.5">Enforcing minimum/maximum layover rules</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden by filters banner */}
      {hiddenAlternativesCount > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-[#181C22] border border-[#232830] px-3.5 py-2 text-xs text-[#9AA3AF]">
          <span>
            {hiddenAlternativesCount} option{hiddenAlternativesCount > 1 ? 's' : ''} hidden by class filter ({selectedClassFilter})
          </span>
          <button
            type="button"
            onClick={() => setSelectedClassFilter('ALL')}
            className="font-semibold text-[#E8B04A] hover:underline cursor-pointer"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* If only risky options: Best chances notice */}
      {!isLoadingAlternatives && filteredAlternatives.length > 0 && !hasConfirmedAlt && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200">
          <span className="font-semibold">No confirmed seats found.</span> Closest options below.
        </div>
      )}

      {/* Truthful Station Expansion Banner (Phase 3 item 5) */}
      {features?.extension === true && extension && extension.status !== 'skipped' && (
        <div className="flex items-center gap-2.5 rounded-xl border border-[#E8B04A]/30 bg-[#E8B04A]/10 px-3.5 py-2.5 text-xs text-[#E8B04A]">
          <Sparkles className="h-4 w-4 text-[#E8B04A] shrink-0" />
          <span>
            Route extension checked:{' '}
            {(extension.found ?? extension.count ?? 0) > 0
              ? `${extension.found ?? extension.count} found`
              : 'none found'}
          </span>
        </div>
      )}

      {/* Notice Banner at Top of Alternatives */}
      {filteredAlternatives.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-2 text-xs text-amber-300">
          <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
          <span>Separate tickets. A missed connection is not protected.</span>
        </div>
      )}

      {/* Alternatives List */}
      {!isLoadingAlternatives && filteredAlternatives.length > 0 && (
        <div className="space-y-3">
          {filteredAlternatives.map((alt, idx) => {
            if (alt.type === 'EXTENSION') {
              if (!features || !features.extension) return null;
              return (
                <P0ExtensionCard
                  key={`ext-${alt.trainNumber || idx}`}
                  plan={alt}
                  destinationCode={destinationCode}
                  destinationName={destinationName}
                  onBook={onBookJourney}
                />
              );
            }
            if (alt.type === 'same_train' || alt.type === 'cross_train' || !alt.type) {
              return (
                <P0AlternativeCard
                  key={idx}
                  alternative={alt}
                  onViewJourney={onViewJourney}
                  onBook={onBookJourney}
                />
              );
            }
            if (typeof console !== 'undefined' && console.debug) {
              console.debug('[P0ResultsView] Unknown alternative plan type:', alt.type);
            }
            return null;
          })}
        </div>
      )}

      {/* 6.A / 6.D: Factual Empty State when no alternatives found and not loading */}
      {!isLoadingAlternatives && alternatives.length === 0 && !hasConfirmedDirectSeat && (
        hasCompletedAltSearch ? (
          /* Part 6.D: Final No Verified Alternative Found State */
          <div className="rounded-2xl border border-[#232830] bg-[#12151A] p-5 sm:p-7 text-center shadow-xl space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#181C22] text-[#E8B04A] border border-[#232830]">
              <AlertTriangle className="h-6 w-6 text-[#E8B04A]" />
            </div>

            <div>
              <h3 className="text-base sm:text-lg font-bold text-[#EDEFF2]">
                No verified alternative found for these criteria
              </h3>
              <p className="mt-1 text-xs text-[#9AA3AF] max-w-lg mx-auto">
                Checked direct trains ({direct.length} checked), expanded station clusters, and interchange hubs along this corridor. No confirmed seats or validated connections met the transfer window requirements.
              </p>
            </div>

            {/* Stage checklist */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-left max-w-lg mx-auto pt-1">
              <div className="rounded-xl border border-[#232830] bg-[#181C22] p-2.5 text-[11px]">
                <div className="text-[#6B7480] uppercase tracking-wider text-[9px] font-bold">Direct Trains</div>
                <div className="text-[#EDEFF2] font-semibold mt-0.5">{direct.length} Checked</div>
              </div>
              <div className="rounded-xl border border-[#232830] bg-[#181C22] p-2.5 text-[11px]">
                <div className="text-[#6B7480] uppercase tracking-wider text-[9px] font-bold">Station Extension</div>
                <div className="text-[#EDEFF2] font-semibold mt-0.5">Completed</div>
              </div>
              <div className="rounded-xl border border-[#232830] bg-[#181C22] p-2.5 text-[11px]">
                <div className="text-[#6B7480] uppercase tracking-wider text-[9px] font-bold">Connecting Hubs</div>
                <div className="text-[#EDEFF2] font-semibold mt-0.5">Explored</div>
              </div>
              <div className="rounded-xl border border-[#232830] bg-[#181C22] p-2.5 text-[11px]">
                <div className="text-[#6B7480] uppercase tracking-wider text-[9px] font-bold">Verified Routes</div>
                <div className="text-[#E8B04A] font-semibold mt-0.5">0 Available</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {dateStrip && dateStrip.length > 0 && (
                <button
                  type="button"
                  onClick={handleShowNearbyDates}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#232830] bg-[#181C22] px-3.5 py-2 text-xs font-semibold text-[#EDEFF2] hover:bg-[#1E232B] hover:border-[#E8B04A] transition-all cursor-pointer"
                >
                  <Calendar className="h-3.5 w-3.5 text-[#E8B04A]" />
                  <span>Check another date</span>
                </button>
              )}
              {emptyFacts.errorCount > 0 && (
                <button
                  type="button"
                  onClick={handleRetryFailed}
                  disabled={isRetryingFailed}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#232830] bg-[#181C22] px-3.5 py-2 text-xs font-semibold text-[#EDEFF2] hover:bg-[#1E232B] hover:border-[#E8B04A] transition-all cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-[#E8B04A]" />
                  <span>Retry failed checks ({emptyFacts.errorCount})</span>
                </button>
              )}
              {onModifySearch && (
                <button
                  type="button"
                  onClick={onModifySearch}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#232830] bg-[#181C22] px-3.5 py-2 text-xs font-semibold text-[#9AA3AF] hover:text-[#EDEFF2] hover:bg-[#1E232B] transition-all cursor-pointer"
                >
                  <span>Modify search</span>
                </button>
              )}
              {partial && (
                <button
                  type="button"
                  onClick={onSearchDeeper}
                  disabled={isSearchingDeeper}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8B04A]/40 bg-[#181C22] px-3.5 py-2 text-xs font-bold text-[#E8B04A] hover:bg-[#1E232B] hover:border-[#E8B04A] transition-all cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5 text-[#E8B04A]" />
                  <span>Search deeper</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Part 6.A: Prominent No Suitable Direct Seats Found Banner & CTA */
          <div className="rounded-2xl border border-[#232830] bg-[#12151A] p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-base sm:text-lg font-bold text-[#EDEFF2] flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-[#E07B39]" />
                  <span>No suitable direct seats found</span>
                </h3>
                <p className="text-xs text-[#9AA3AF] leading-relaxed max-w-xl">
                  Your selected trains may be unavailable or waitlisted for the requested criteria. Yatrai can look for alternative boarding stations and connecting journeys.
                </p>
              </div>

              <span className="hidden sm:inline-flex rounded-full bg-[#E07B39]/15 border border-[#E07B39]/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#E07B39] shrink-0">
                Seats Unavailable / WL
              </span>
            </div>

            {/* Compact summary */}
            <div className="rounded-xl border border-[#232830] bg-[#181C22] p-3 text-xs grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#6B7480]">Requested Route</div>
                <div className="mt-0.5 font-bold text-[#EDEFF2] truncate">
                  {requestedOrigin || originCode || 'Origin'} → {requestedDestination || destinationCode || 'Destination'}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#6B7480]">Travel Date</div>
                <div className="mt-0.5 font-bold text-[#EDEFF2]">{date || 'Selected date'}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#6B7480]">Selected Class</div>
                <div className="mt-0.5 font-bold text-[#EDEFF2]">{selectedClassFilter === 'ALL' ? 'Any Class' : selectedClassFilter}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#6B7480]">Direct Trains</div>
                <div className="mt-0.5 font-bold text-[#EDEFF2]">
                  {direct.length} checked {emptyFacts.waitlistedCount > 0 ? `(${emptyFacts.waitlistedCount} WL)` : ''}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={onExploreAlternatives}
                disabled={isLoadingAlternatives}
                className="inline-flex items-center gap-2 rounded-xl bg-[#E8B04A] px-5 py-2.5 text-xs font-bold text-[#0B0D10] hover:bg-[#F0C066] transition-all cursor-pointer shadow-md disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4 text-[#0B0D10]" />
                <span>Find Alternative Journeys</span>
              </button>

              {dateStrip && dateStrip.length > 0 && (
                <button
                  type="button"
                  onClick={handleShowNearbyDates}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#232830] bg-[#181C22] px-3.5 py-2 text-xs font-semibold text-[#EDEFF2] hover:bg-[#1E232B] hover:border-[#E8B04A] transition-all cursor-pointer"
                >
                  <Calendar className="h-3.5 w-3.5 text-[#E8B04A]" />
                  <span>Change travel date</span>
                </button>
              )}

              {offeredClasses.length > 2 && (
                <button
                  type="button"
                  onClick={() => {
                    const nextClass = offeredClasses.find((c) => c !== 'ALL' && c !== selectedClassFilter) || 'ALL';
                    handleSelectClassFilter(nextClass);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#232830] bg-[#181C22] px-3.5 py-2 text-xs font-semibold text-[#EDEFF2] hover:bg-[#1E232B] hover:border-[#E8B04A] transition-all cursor-pointer"
                >
                  <span>Change class</span>
                </button>
              )}

              {onModifySearch && (
                <button
                  type="button"
                  onClick={onModifySearch}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#232830] bg-[#181C22] px-3.5 py-2 text-xs font-semibold text-[#9AA3AF] hover:text-[#EDEFF2] hover:bg-[#1E232B] transition-all cursor-pointer"
                >
                  <span>Modify search</span>
                </button>
              )}
            </div>
          </div>
        )
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      {/* 1. Partial Results Banner */}
      {partial && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 shadow-md">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <div className="flex-1">
            <span className="font-bold">Partial results:</span> Search reached the action budget cap ({budget.used}/{budget.cap} calls). You can check more waiting trains or tap &quot;Search deeper&quot; below.
          </div>
        </div>
      )}

      {/* 2. Degraded Mode Banner */}
      {degraded && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-xs text-blue-200 shadow-md">
          <Info className="h-4 w-4 text-blue-400 shrink-0" />
          <div className="flex-1">
            <span className="font-bold">Degraded Mode:</span> Monthly RailKit quota under 10%. Cross-train combinations are temporarily limited to direct and same-train options.
          </div>
        </div>
      )}

      {/* 2b. Provider Notice Banner */}
      {providerNotice && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 shadow-md">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <div className="flex-1">
            <span className="font-bold">Provider Notice:</span> {providerNotice}
          </div>
        </div>
      )}

      {/* 2c. Slow Seat Data Banner (Phase 3 item 2: >= 50% failed checks) */}
      {isSlowSeatData && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 shadow-md">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span className="font-medium">
              Seat data is slow right now - showing last known results where available
            </span>
          </div>
          <button
            type="button"
            onClick={handleRetryFailed}
            disabled={isRetryingFailed}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-400/20 px-3.5 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-400/30 transition-all cursor-pointer disabled:opacity-50 shrink-0"
          >
            {isRetryingFailed ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-amber-300" />
                <span>Retrying...</span>
              </>
            ) : (
              <>
                <RotateCcw className="h-3 w-3 text-amber-300" />
                <span>Retry failed checks ({failedChecksList.length})</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* 3. Date Strip */}
      {dateStrip && dateStrip.length > 0 && (
        <div id="p0-date-strip" className="rounded-2xl border border-[#303640] bg-[#12151A] px-4 py-2.5 shadow-md">
          <P0DateStrip
            currentDate={date}
            dateStrip={dateStrip}
            onSelectDate={onSelectDate}
          />
        </div>
      )}

      {/* 4. Sticky Class Filter Strip */}
      {offeredClasses.length > 2 && (
        <div className="sticky top-2 z-20 flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-[#303640] bg-[#12151A]/95 p-2 shadow-lg backdrop-blur-md">
          <span className="text-[11px] font-semibold text-[#7E8794] uppercase tracking-wider px-2">
            Class:
          </span>
          {offeredClasses.map((cls) => {
            const isSelected = selectedClassFilter === cls;
            return (
              <button
                key={cls}
                type="button"
                onClick={() => setSelectedClassFilter(cls)}
                className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? 'border border-[#E8B04A] bg-[#E8B04A] text-[#0B0D10] shadow-sm'
                    : 'border border-[#303640] bg-[#1A1F26] text-[#A7AFBA] hover:text-[#F0F1F3] hover:border-[#4B5563]'
                }`}
              >
                {cls}
              </button>
            );
          })}
        </div>
      )}

      {/* 5 & 6. Sections rendered according to hasConfirmedDirectSeat */}
      {hasConfirmedDirectSeat ? (
        <>
          {renderDirectSection()}
          {renderAlternativesSection()}
        </>
      ) : (
        <>
          {renderAlternativesSection()}
          {renderDirectSection()}
        </>
      )}
    </div>
  );
}

export default P0ResultsView;
