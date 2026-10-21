import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Layers,
  Search,
  Loader2,
  ChevronDown,
  Info,
  ShieldAlert,
} from 'lucide-react';
import P0DirectTrainCard from './P0DirectTrainCard.jsx';
import P0AlternativeCard from './P0AlternativeCard.jsx';
import P0DateStrip from './P0DateStrip.jsx';

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
  date,
  quota = 'GN',
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
}) {
  // Sticky class filter state
  const [selectedClassFilter, setSelectedClassFilter] = useState('ALL');

  // Check if ?debug=1 is in URL
  const isDebugMode = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('debug') === '1';
  }, []);

  // Collect all unique classes offered across direct trains
  const offeredClasses = useMemo(() => {
    const set = new Set();
    direct.forEach((t) => {
      (t.classes || []).forEach((c) => set.add(c.class));
      (t.offeredClasses || []).forEach((c) => set.add(c));
    });
    return ['ALL', ...Array.from(set)];
  }, [direct]);

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

      {/* 3. Date Strip */}
      {dateStrip && dateStrip.length > 0 && (
        <div className="rounded-2xl border border-[#303640] bg-[#12151A] px-4 py-2.5 shadow-md">
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

      {/* 5. Direct Trains Section */}
      <section className="space-y-4" aria-label="Direct Trains">
        <div className="flex items-center justify-between pb-1">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#E8B04A] flex items-center gap-2">
            <span>Direct Trains</span>
            <span className="rounded-full bg-[#1F242C] border border-[#303640] px-2 py-0.5 text-[10px] text-[#A7AFBA]">
              {filteredDirect.length}
            </span>
          </h2>

          {/* Friendly Checked Text & Debug info */}
          <div className="text-xs text-[#A7AFBA] flex items-center gap-2">
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
            {filteredDirect.map((train, idx) => (
              <P0DirectTrainCard
                key={train.trainNumber || idx}
                train={train}
                date={date}
                quota={quota}
                onCheckClass={onCheckClass}
                onRefreshCard={onRefreshCard}
                onBook={onBookJourney}
                activeClassFilter={selectedClassFilter === 'ALL' ? null : selectedClassFilter}
                onSelectClassFilter={(cls) => setSelectedClassFilter(cls || 'ALL')}
              />
            ))}
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
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600/30 border border-purple-500/50 px-5 py-2.5 text-xs font-bold text-purple-200 hover:bg-purple-600/40 hover:border-purple-400 transition-all cursor-pointer shadow-md disabled:opacity-50"
            >
              {isSearchingDeeper ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-300" />
                  <span>Searching deeper (cap 100)...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-purple-300" />
                  <span>Search deeper</span>
                </>
              )}
            </button>
          )}
        </div>
      </section>

      {/* 6. Alternatives Section */}
      <section id="alternatives-section" className="space-y-4 pt-4 border-t border-[#242931]" aria-label="Alternative Journeys">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-1">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#E8B04A] flex items-center gap-2">
              <span>Alternative Journeys</span>
              {filteredAlternatives.length > 0 && (
                <span className="rounded-full bg-[#1F242C] border border-[#303640] px-2 py-0.5 text-[10px] text-[#A7AFBA]">
                  {filteredAlternatives.length} verified
                </span>
              )}
            </h2>
            <p className="text-[11px] text-[#7E8794] mt-0.5">
              Same-train split tickets &amp; verified hub connections with guaranteed seats.
            </p>
          </div>

          {/* "Alternative journeys" button when a direct seat exists */}
          {hasConfirmedDirectSeat && alternatives.length === 0 && !isLoadingAlternatives && (
            <button
              type="button"
              onClick={onExploreAlternatives}
              disabled={isLoadingAlternatives}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#303640] bg-[#15191F] px-4 py-2 text-xs font-semibold text-[#E8B04A] hover:bg-[#1A1F26] hover:border-[#E8B04A] transition-all cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-[#E8B04A]" />
              <span>Alternative journeys</span>
            </button>
          )}
        </div>

        {/* Alternatives Loading Skeleton State */}
        {isLoadingAlternatives && (
          <div className="rounded-2xl border border-[#303640] bg-[#12151A] p-5 space-y-3 animate-pulse">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-[#E8B04A]" />
              <span className="text-xs font-semibold text-[#F0F1F3]">Finding guaranteed seat combinations...</span>
            </div>
            <div className="h-4 bg-[#242931] rounded w-3/4" />
            <div className="h-16 bg-[#1A1F26] rounded-xl" />
          </div>
        )}

        {/* Hidden by filters banner */}
        {hiddenAlternativesCount > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-[#161B22] border border-[#242931] px-3.5 py-2 text-xs text-[#A7AFBA]">
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
            {filteredAlternatives.map((alt, idx) => (
              <P0AlternativeCard
                key={idx}
                alternative={alt}
                onBook={onBookJourney}
              />
            ))}
          </div>
        )}

        {/* If no alternatives found yet and not loading */}
        {!isLoadingAlternatives && alternatives.length === 0 && !hasConfirmedDirectSeat && (
          <div className="rounded-2xl border border-dashed border-[#303640] bg-[#12151A] p-5 text-center text-xs text-[#7E8794]">
            No viable split-ticket or connection combinations found within budget and layover rules.
          </div>
        )}
      </section>
    </div>
  );
}

export default P0ResultsView;
