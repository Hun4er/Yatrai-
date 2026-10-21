import React, { useState } from 'react';
import {
  ArrowRight,
  Clock,
  AlertTriangle,
  Train,
  Sparkles,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react';
import { formatDuration } from '../../utils/formatters.js';

/**
 * PlanErrorBoundary Component
 * Catches render errors inside a single alternative card so one corrupted plan
 * doesn't take down the entire alternatives section.
 */
export class PlanErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err, info) {
    console.error('[PlanErrorBoundary] Plan card error:', err, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-300 flex items-center justify-between">
          <span>couldn't display this option</span>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="text-[11px] underline text-red-400 hover:text-red-200"
          >
            retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * P0AlternativeCardInner Component (P0 v2)
 *
 * Implements:
 * - laneClass + tier badge
 * - every leg (train number + name, from -> to, dep -> arr, class, availability text, fare)
 * - layover between legs with "tight" label (< 180 min)
 * - total duration and total fare (or "Fare after check" if null/missing)
 * - leg retry chip if ERROR or UNCHECKED
 * - badges:
 *   sameTrain: "Stay on this train — two tickets, berth may change at <hub>"
 *   cross-train: "Separate tickets — a missed connection is not protected"
 * - collapse / expand
 */
export function P0AlternativeCardInner({
  alternative,
  onBook,
  onRetryLeg,
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!alternative || typeof alternative !== 'object') {
    throw new Error('Invalid alternative plan payload');
  }

  const isSameTrain = Boolean(alternative.sameTrain || alternative.type === 'same_train');
  const legs = Array.isArray(alternative.legs) ? alternative.legs : [];
  const hubCode = alternative.hubCode || legs[0]?.to || 'Hub';
  const laneClass = alternative.laneClass || legs[0]?.class || 'SL';
  const tier = alternative.tier || (isSameTrain ? 'CONFIRMED' : 'ALTERNATIVE');
  const layoverMinutes = Number(alternative.layoverMinutes) || 0;
  const isTight = Boolean(alternative.isTight || (layoverMinutes > 0 && layoverMinutes < 180));

  const totalFare = typeof alternative.totalFare === 'number' && alternative.totalFare > 0
    ? alternative.totalFare
    : (typeof alternative.fare === 'number' && alternative.fare > 0 ? alternative.fare : null);

  const fareDisplay = totalFare !== null
    ? `₹${totalFare.toLocaleString('en-IN')}`
    : 'Fare after check';

  const durationMin = alternative.duration || alternative.totalDurationMinutes || 0;
  const durationDisplay = durationMin > 0 ? formatDuration(durationMin) : null;

  return (
    <div className="rounded-2xl border border-[#303640] bg-[#12151A] p-4 sm:p-5 shadow-lg space-y-3.5 hover:border-[#3E4654] transition-all">
      {/* Top Banner & Badge Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#242931] pb-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Tier Badge */}
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
              tier === 'CONFIRMED'
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                : tier === 'RISKY' || tier === 'WAITLIST'
                ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                : 'bg-blue-500/15 border border-blue-500/30 text-blue-400'
            }`}
          >
            {tier}
          </span>

          {/* Lane Class Tag */}
          <span className="rounded-lg bg-[#1F242C] border border-[#303640] px-2 py-0.5 text-xs font-bold text-[#F0F1F3]">
            {laneClass}
          </span>

          {/* Demo Mode Cached Result Badge */}
          {alternative.isCachedResult && (
            <span className="rounded-full bg-sky-500/15 border border-sky-500/30 px-2.5 py-0.5 text-xs font-semibold text-sky-300">
              cached result
            </span>
          )}

          {/* Same-train vs Cross-train Badge */}
          {isSameTrain ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8B04A]/15 border border-[#E8B04A]/30 px-2.5 py-0.5 text-xs font-semibold text-[#E8B04A]">
              <Sparkles className="h-3 w-3" />
              Stay on this train — two tickets, berth may change at {hubCode}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 text-xs font-semibold text-blue-300">
              <Train className="h-3 w-3" />
              Separate tickets — connection via {hubCode}
            </span>
          )}
        </div>

        {/* Fare & Duration Summary + Collapse Toggle */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-bold text-[#E8B04A]">{fareDisplay}</div>
            {durationDisplay && (
              <div className="text-[11px] text-[#7E8794]">{durationDisplay}</div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1 rounded-lg text-[#7E8794] hover:text-[#F0F1F3] hover:bg-[#1A1F26] transition-colors cursor-pointer"
            aria-label={isExpanded ? 'Collapse journey legs' : 'Expand journey legs'}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Cross-train Layover Summary */}
      {!isSameTrain && layoverMinutes > 0 && (
        <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-[#161B22] border border-[#242931] text-xs">
          <span className="text-[#A7AFBA] flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-[#E8B04A]" />
            Layover at <strong className="text-[#F0F1F3]">{hubCode}</strong>: {Math.floor(layoverMinutes / 60)}h {layoverMinutes % 60}m
          </span>
          {isTight && (
            <span className="rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              tight connection (&lt; 3h)
            </span>
          )}
        </div>
      )}

      {/* Expanded Legs Breakdown */}
      {isExpanded && (
        <div className="space-y-2 pt-1">
          {legs.map((leg, idx) => {
            const legFare = typeof leg.fare === 'number' && leg.fare > 0
              ? `₹${leg.fare.toLocaleString('en-IN')}`
              : (leg.totalFare ? `₹${leg.totalFare.toLocaleString('en-IN')}` : 'Fare after check');

            const isErrorLeg = leg.tier === 'ERROR' || leg.normalizedStatus === 'ERROR' || leg.isError;
            const isUncheckedLeg = leg.normalizedStatus === 'UNCHECKED' || leg.tier === 'UNCHECKED';

            const availText = isErrorLeg
              ? "couldn't check"
              : isUncheckedLeg
              ? 'tap to check'
              : (leg.availabilityText || (leg.normalizedStatus === 'AVAILABLE' ? 'Confirmed (AVL)' : leg.rawStatus || 'Confirmed'));

            return (
              <React.Fragment key={idx}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl bg-[#161B22] border border-[#242931] p-3 text-xs text-[#F0F1F3] gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#E8B04A]">Leg {idx + 1}:</span>
                      <span className="font-semibold text-[#F0F1F3]">
                        {leg.trainNo || leg.trainNumber} {leg.trainName || ''}
                      </span>
                      <span className="rounded bg-[#1F242C] px-1.5 py-0.2 text-[10px] text-[#A7AFBA]">
                        {leg.class || leg.travelClass || laneClass}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#A7AFBA]">
                      {leg.from} ({leg.departureTime || leg.departure || '--:--'}) → {leg.to} ({leg.arrivalTime || leg.arrival || '--:--'})
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    {/* Status / Retry Chip */}
                    {isErrorLeg || isUncheckedLeg ? (
                      <button
                        type="button"
                        onClick={() => onRetryLeg && onRetryLeg(leg)}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-500/10 border border-red-500/30 px-2 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/20 transition-all cursor-pointer"
                      >
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        <span>couldn't check — tap to retry</span>
                      </button>
                    ) : (
                      <span className="font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg text-xs">
                        {availText}
                      </span>
                    )}

                    <span className="font-medium text-[#E8B04A] text-xs min-w-[70px] text-right">
                      {legFare}
                    </span>
                  </div>
                </div>

                {/* Layover connector between legs */}
                {idx < legs.length - 1 && !isSameTrain && (
                  <div className="flex items-center justify-center gap-2 py-0.5 text-[11px] text-[#7E8794]">
                    <div className="h-px w-10 bg-[#303640]" />
                    <span>Change trains at {hubCode} {isTight ? '(tight connection)' : ''}</span>
                    <div className="h-px w-10 bg-[#303640]" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Warning Notice & Book Button at bottom of card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-1 gap-2">
        <p className="text-[11px] text-[#A7AFBA] flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span>Separate tickets — a missed connection is not protected.</span>
        </p>

        <button
          type="button"
          onClick={() => onBook && onBook(alternative)}
          className="inline-flex items-center justify-center rounded-xl bg-[#E8B04A] px-4 py-1.5 text-xs font-bold text-[#0B0D10] hover:bg-[#F2BE62] transition-colors shadow-sm cursor-pointer shrink-0"
        >
          Book Combination
        </button>
      </div>
    </div>
  );
}

/**
 * P0AlternativeCard with ErrorBoundary wrapper
 */
export function P0AlternativeCard(props) {
  return (
    <PlanErrorBoundary>
      <P0AlternativeCardInner {...props} />
    </PlanErrorBoundary>
  );
}

export default P0AlternativeCard;
