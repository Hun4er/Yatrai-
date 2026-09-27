import React, { useState } from 'react';
import { Clock, ArrowRight, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { JourneyLeg, getModeIcon } from './JourneyLeg.jsx';

/**
 * Format minutes into "Xh Ym" or "Xh"
 */
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0m';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

/**
 * Format ISO time into HH:mm
 */
function formatTime(isoString) {
  if (!isoString) return '--:--';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '--:--';
  }
}

/**
 * Format price and currency using standard browser formatting
 */
function formatPrice(amount, currency = 'INR') {
  if (amount === undefined || amount === null) return 'N/A';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

/**
 * JourneyResultCard Component
 *
 * Renders a canonical journey option following the Yatrai Design System.
 * Supports multi-leg inspection, transfer summaries, and ranking tags.
 */
export function JourneyResultCard({ journey, isTopPick = false }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!journey) return null;

  const originName = journey.origin?.name || journey.origin?.city || 'Origin';
  const destinationName = journey.destination?.name || journey.destination?.city || 'Destination';
  const depTime = formatTime(journey.departureTime);
  const arrTime = formatTime(journey.arrivalTime);
  const durationText = formatDuration(journey.duration);
  const priceText = formatPrice(journey.totalPrice, journey.currency);
  const transfers = journey.numberOfTransfers ?? 0;
  const transferText =
    transfers === 0 ? 'Direct' : transfers === 1 ? '1 transfer' : `${transfers} transfers`;

  const transportModes = Array.isArray(journey.transportModes) && journey.transportModes.length > 0
    ? journey.transportModes
    : ['rail'];

  const legs = Array.isArray(journey.legs) ? journey.legs : [];
  const rankingLabel = journey.ranking?.label;
  const providerName =
    journey.metadata?.provider ||
    journey.provider ||
    (legs[0]?.service?.operator ? legs[0].service.operator : null);

  return (
    <article
      className={`rounded-2xl border bg-surface-primary p-5 sm:p-6 transition-all hover:border-brand-primary/40 ${
        isTopPick ? 'border-brand-primary/50 shadow-md shadow-brand-primary/10' : 'border-white/10'
      }`}
      aria-label={`Journey from ${originName} to ${destinationName}, price ${priceText}`}
    >
      {/* Header: Ranking Tag & Modes Badges */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {rankingLabel && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-primary border border-brand-primary/20">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              <span>{rankingLabel}</span>
            </span>
          )}

          {/* Transport mode icons */}
          <div className="flex items-center gap-1.5 rounded-lg bg-surface-secondary px-2.5 py-1 text-xs text-text-secondary border border-white/5">
            {transportModes.map((mode, idx) => {
              const ModeIcon = getModeIcon(mode);
              return (
                <span key={idx} className="flex items-center gap-1">
                  {idx > 0 && <span className="text-text-tertiary">→</span>}
                  <ModeIcon className="h-3.5 w-3.5 text-brand-primary" aria-hidden="true" />
                  <span className="capitalize">{mode}</span>
                </span>
              );
            })}
          </div>
        </div>

        {/* Transfer pill & Provider */}
        <div className="flex items-center gap-2 text-xs">
          {providerName && (
            <span className="text-text-tertiary hidden sm:inline truncate max-w-[200px]" title={providerName}>
              {providerName}
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-0.5 font-medium ${
              transfers === 0
                ? 'bg-semantic-success/10 text-semantic-success border border-semantic-success/20'
                : 'bg-surface-secondary text-text-secondary border border-white/5'
            }`}
          >
            {transferText}
          </span>
        </div>
      </div>

      {/* Main Body: Times, Route, Duration, Price */}
      <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-12 items-center">
        {/* Departure & Arrival Column */}
        <div className="sm:col-span-8 flex items-center justify-between gap-4">
          {/* Origin */}
          <div className="flex-1 min-w-0">
            <div className="text-2xl font-bold tracking-tight text-text-primary">{depTime}</div>
            <div className="mt-0.5 text-sm font-medium text-text-secondary truncate" title={originName}>
              {originName}
            </div>
            {journey.origin?.city && journey.origin?.name !== journey.origin?.city && (
              <div className="text-xs text-text-tertiary truncate">{journey.origin.city}</div>
            )}
          </div>

          {/* Path Line & Duration */}
          <div className="flex flex-col items-center px-2 flex-1 max-w-[180px]">
            <div className="flex items-center gap-1 text-xs font-medium text-text-secondary">
              <Clock className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" />
              <span>{durationText}</span>
            </div>
            <div className="relative mt-2 w-full flex items-center justify-center">
              <div className="h-0.5 w-full bg-white/20" />
              <div className="absolute flex h-2 w-2 rounded-full bg-brand-primary" />
              <ArrowRight className="absolute right-0 h-3.5 w-3.5 text-text-tertiary translate-x-1" aria-hidden="true" />
            </div>
            <div className="mt-1.5 text-[11px] text-text-tertiary font-mono">
              {journey.totalDistance ? `${journey.totalDistance} km` : transferText}
            </div>
          </div>

          {/* Destination */}
          <div className="flex-1 min-w-0 text-right">
            <div className="text-2xl font-bold tracking-tight text-text-primary">{arrTime}</div>
            <div className="mt-0.5 text-sm font-medium text-text-secondary truncate" title={destinationName}>
              {destinationName}
            </div>
            {journey.destination?.city && journey.destination?.name !== journey.destination?.city && (
              <div className="text-xs text-text-tertiary truncate">{journey.destination.city}</div>
            )}
          </div>
        </div>

        {/* Price & Action Column */}
        <div className="sm:col-span-4 flex sm:flex-col sm:items-end justify-between items-center pt-4 sm:pt-0 sm:border-l sm:border-white/5 sm:pl-6 border-t border-white/5 sm:border-t-0">
          <div>
            <div className="text-xs uppercase tracking-wider text-text-tertiary sm:text-right">Total Price</div>
            <div className="text-2xl font-extrabold tracking-tight text-text-primary sm:text-right">
              {priceText}
            </div>
          </div>

          {legs.length > 0 && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:text-brand-hover transition-colors cursor-pointer focus:outline-none"
              aria-expanded={isExpanded}
            >
              <span>{isExpanded ? 'Hide Details' : 'View Details'}</span>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Expandable Multi-Leg Details */}
      {isExpanded && legs.length > 0 && (
        <div className="mt-5 border-t border-white/10 pt-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
            Journey Itinerary ({legs.length} {legs.length === 1 ? 'Leg' : 'Legs'})
          </h4>
          <div className="space-y-3">
            {legs.map((leg, index) => (
              <JourneyLeg
                key={leg.id || index}
                leg={leg}
                isLast={index === legs.length - 1}
                nextLeg={legs[index + 1] || null}
              />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export default JourneyResultCard;
