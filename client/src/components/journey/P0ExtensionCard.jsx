import React, { Component, useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Train,
} from 'lucide-react';

/**
 * ExtensionCardErrorBoundary
 * Prevents any rendering or lifecycle errors in an extension card from crashing the results list.
 */
class ExtensionCardErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[P0ExtensionCard] Error in extension card:', error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      // In debug mode show small fallback, otherwise render null to avoid breaking card list
      return null;
    }
    return this.props.children;
  }
}

/**
 * P0ExtensionCardInner Component
 *
 * Implements Strategy A UI:
 * - Clear badge showing Route Extension to Station Y
 * - Explicit instruction: "Book to Y, deboard at B"
 * - Extra fare calculation and display
 * - Train timings (departure from A, arrival at destination B)
 * - Confirmed seat badge
 */
export function P0ExtensionCardInner({
  plan,
  destinationCode = '',
  _destinationName = '',
  onBook,
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!plan || typeof plan !== 'object') {
    return null;
  }

  const trainNumber = plan.trainNumber || plan.trainNo || '';
  const trainName = plan.trainName || 'Express';
  const fromCode = plan.from || '';
  const destCode = plan.to || destinationCode || '';
  const extendedTo = plan.bookedTo || plan.extendedTo || '';
  const extendedStationName = plan.extendedStationName || extendedTo;
  const laneClass = plan.laneClass || plan.class || '3A';

  const totalFare = typeof plan.totalFare === 'number'
    ? plan.totalFare
    : (typeof plan.fare === 'number' ? plan.fare : null);
  const extraFare = typeof plan.extraFare === 'number' ? plan.extraFare : null;

  const depTime = plan.departureTime || '00:00';
  const arrTime = plan.destinationArrivalTime || plan.arrivalTime || '00:00';
  const extendedArrTime = plan.extendedArrivalTime || '';

  const handleBookClick = () => {
    if (typeof onBook === 'function') {
      onBook({
        ...plan,
        isExtension: true,
        type: 'EXTENSION',
      });
    }
  };

  return (
    <div
      className="rounded-2xl border border-emerald-500/30 bg-[#12151A] p-4 sm:p-5 shadow-lg space-y-3.5 hover:border-emerald-500/50 transition-all relative overflow-hidden"
      data-testid="p0-extension-card"
    >
      {/* Subtle emerald accent top bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />

      {/* Top Badge Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#242931] pb-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Strategy A Extension Pill */}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
            <Sparkles className="h-3 w-3 text-emerald-400" />
            <span>ROUTE EXTENSION</span>
          </span>

          {/* Confirmed Tier */}
          <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-bold text-emerald-300 uppercase tracking-wider">
            CONFIRMED
          </span>

          {/* Lane Class Tag */}
          <span className="rounded-lg bg-[#1F242C] border border-[#303640] px-2 py-0.5 text-xs font-bold text-[#F0F1F3]">
            {laneClass}
          </span>
        </div>

        {/* Fare Summary */}
        <div className="text-right">
          <div className="text-sm font-bold text-[#F0F1F3]">
            {totalFare !== null ? `₹${totalFare.toLocaleString('en-IN')}` : 'Fare after check'}
          </div>
          {extraFare !== null && extraFare > 0 && (
            <div className="text-[11px] text-emerald-400 font-medium">
              +₹{extraFare} extra fare
            </div>
          )}
        </div>
      </div>

      {/* Train Info & Route Explanation */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Train className="h-4 w-4 text-[#E8B04A]" />
            <span className="text-sm font-bold text-[#F0F1F3]">{trainNumber}</span>
            <span className="text-xs text-[#A7AFBA]">{trainName}</span>
          </div>

          <div className="text-xs text-[#7E8794]">
            {plan.status || 'AVAILABLE'}
          </div>
        </div>

        {/* Key Strategy Insight Banner */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200 flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-emerald-300">
              Book to {extendedTo} ({extendedStationName}) — Deboard at {destCode}
            </span>
            <p className="text-[11px] text-emerald-200/80 mt-0.5">
              Waitlisted to {destCode}, but confirmed quota exists to the next stoppage.
              You can legally deboard at {destCode}.
            </p>
          </div>
        </div>
      </div>

      {/* Journey Timeline Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-[#161B22] p-3 rounded-xl border border-[#242931] text-xs">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-[#7E8794] block">Board at</span>
          <span className="font-bold text-[#F0F1F3]">{fromCode}</span>
          <span className="text-[#A7AFBA] block text-[11px]">{depTime}</span>
        </div>

        <div>
          <span className="text-[10px] uppercase tracking-wider text-emerald-400 block font-semibold">Deboard at</span>
          <span className="font-bold text-emerald-300">{destCode}</span>
          <span className="text-[#A7AFBA] block text-[11px]">{arrTime}</span>
        </div>

        <div className="col-span-2 sm:col-span-1 border-t sm:border-t-0 sm:border-l border-[#242931] pt-2 sm:pt-0 sm:pl-3">
          <span className="text-[10px] uppercase tracking-wider text-[#7E8794] block">Ticket Booked To</span>
          <span className="font-semibold text-[#A7AFBA]">{extendedTo}</span>
          {extendedArrTime && <span className="text-[#7E8794] block text-[11px]">arr {extendedArrTime}</span>}
        </div>
      </div>

      {/* Action Strip */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => setIsExpanded((p) => !p)}
          className="text-xs text-[#A7AFBA] hover:text-[#F0F1F3] inline-flex items-center gap-1 cursor-pointer transition-colors"
        >
          <span>{isExpanded ? 'Hide details' : 'View details'}</span>
          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          onClick={handleBookClick}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-md transition-all cursor-pointer"
        >
          <span>Book Confirmed Berth</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Expandable Details */}
      {isExpanded && (
        <div className="border-t border-[#242931] pt-3 text-xs text-[#A7AFBA] space-y-2">
          <div className="flex items-center justify-between">
            <span>Ticket booking quota station:</span>
            <span className="font-mono text-[#F0F1F3]">{extendedTo}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Intended deboarding station:</span>
            <span className="font-mono text-[#F0F1F3]">{destCode}</span>
          </div>
          {extraFare !== null && (
            <div className="flex items-center justify-between text-emerald-400">
              <span>Extra fare paid for confirmed berth:</span>
              <span>₹{extraFare}</span>
            </div>
          )}
          <p className="text-[11px] text-[#7E8794] pt-1">
            Indian Railways permits passengers to alight at any intermediate scheduled stoppage before the destination station mentioned on the ticket.
          </p>
        </div>
      )}
    </div>
  );
}

export function P0ExtensionCard(props) {
  return (
    <ExtensionCardErrorBoundary>
      <P0ExtensionCardInner {...props} />
    </ExtensionCardErrorBoundary>
  );
}

export default P0ExtensionCard;
