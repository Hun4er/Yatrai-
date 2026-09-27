import React, { useState, useEffect } from 'react';
import {
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Eye,
  Bookmark,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../services/api.js';
import {
  formatDuration,
  formatPrice,
  formatTime,
  formatTransportModes,
  formatTransfers,
} from '../../utils/formatters.js';
import { JourneyLeg, getModeIcon } from './JourneyLeg.jsx';

/**
 * JourneyResultCard Component
 *
 * Production-quality result card for Yatrai.
 * Displays canonical route, composite modes, departure/arrival schedules,
 * duration, transfers, localized price, compact leg breakdown, and [ View Journey ] CTA.
 */
export function JourneyResultCard({
  journey,
  isTopPick = false,
  onViewJourney,
  isSaved: initialSaved,
  onRemoveSaved,
}) {
  const { isAuthenticated } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [saved, setSaved] = useState(initialSaved || false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialSaved !== undefined) {
      setSaved(initialSaved);
      return;
    }
    if (isAuthenticated && journey?.id) {
      api.savedJourneys
        .check(journey.id)
        .then((res) => {
          if (res?.data?.saved !== undefined) {
            setSaved(res.data.saved);
          }
        })
        .catch(() => {});
    }
  }, [isAuthenticated, journey?.id, initialSaved]);

  const handleToggleSave = async (e) => {
    e.stopPropagation();
    if (!isAuthenticated) return;
    if (!journey?.id || saving) return;

    setSaving(true);
    try {
      if (saved) {
        await api.savedJourneys.remove(journey.id);
        setSaved(false);
        if (onRemoveSaved) onRemoveSaved(journey.id);
      } else {
        await api.savedJourneys.save(journey.id);
        setSaved(true);
      }
    } catch {
      // Keep previous state on error
    } finally {
      setSaving(false);
    }
  };

  if (!journey) return null;

  const originName = journey.origin?.name || journey.origin?.city || 'Origin';
  const destinationName = journey.destination?.name || journey.destination?.city || 'Destination';
  const depTime = formatTime(journey.departureTime);
  const arrTime = formatTime(journey.arrivalTime);
  const durationText = formatDuration(journey.duration);
  const priceText = formatPrice(journey.totalPrice, journey.currency);
  const transfers = journey.numberOfTransfers ?? 0;
  const transferText = formatTransfers(transfers);
  const modesText = formatTransportModes(journey.transportModes);

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
      aria-label={`Journey from ${originName} to ${destinationName}, ${modesText}, price ${priceText}`}
    >
      {/* Top Banner: Ranking Tag, Composite Mode, Transfers & Provider */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {rankingLabel && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-primary border border-brand-primary/20">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{rankingLabel}</span>
            </span>
          )}

          {/* Transport mode badges & composite label */}
          <div className="flex items-center gap-2 rounded-lg bg-surface-secondary px-2.5 py-1 text-xs text-text-primary border border-white/5">
            <div className="flex items-center gap-1">
              {transportModes.map((mode, idx) => {
                const ModeIcon = getModeIcon(mode);
                return (
                  <span key={idx} className="flex items-center gap-1">
                    {idx > 0 && <span className="text-text-tertiary">+</span>}
                    <ModeIcon className="h-3.5 w-3.5 text-brand-primary" aria-hidden="true" />
                  </span>
                );
              })}
            </div>
            <span className="font-semibold text-text-primary">{modesText}</span>
          </div>
        </div>

        {/* Transfer badge & Provider label */}
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

      {/* Main Schedule & Price Grid */}
      <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-12 items-center">
        {/* Origin / Schedule / Destination Column */}
        <div className="sm:col-span-8 flex items-center justify-between gap-3 sm:gap-4">
          {/* Origin */}
          <div className="flex-1 min-w-0">
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
              {depTime}
            </div>
            <div className="mt-1 text-sm font-semibold text-text-primary truncate" title={originName}>
              {originName}
            </div>
            {journey.origin?.city && journey.origin?.name !== journey.origin?.city && (
              <div className="text-xs text-text-tertiary truncate">{journey.origin.city}</div>
            )}
          </div>

          {/* Route path line & Duration */}
          <div className="flex flex-col items-center px-2 flex-1 max-w-[190px]">
            <div className="flex items-center gap-1 text-xs font-semibold text-text-secondary">
              <Clock className="h-3.5 w-3.5 text-brand-primary" aria-hidden="true" />
              <span>{durationText}</span>
            </div>
            <div className="relative mt-2 w-full flex items-center justify-center">
              <div className="h-0.5 w-full bg-white/20" />
              <div className="absolute flex h-2 w-2 rounded-full bg-brand-primary" />
              <ArrowRight
                className="absolute right-0 h-3.5 w-3.5 text-text-tertiary translate-x-1"
                aria-hidden="true"
              />
            </div>
            <div className="mt-1.5 text-[11px] text-text-tertiary font-mono">
              {journey.totalDistance ? `${journey.totalDistance} km` : transferText}
            </div>
          </div>

          {/* Destination */}
          <div className="flex-1 min-w-0 text-right">
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
              {arrTime}
            </div>
            <div className="mt-1 text-sm font-semibold text-text-primary truncate" title={destinationName}>
              {destinationName}
            </div>
            {journey.destination?.city && journey.destination?.name !== journey.destination?.city && (
              <div className="text-xs text-text-tertiary truncate">{journey.destination.city}</div>
            )}
          </div>
        </div>

        {/* Price & Primary CTA Column */}
        <div className="sm:col-span-4 flex sm:flex-col sm:items-end justify-between items-center pt-4 sm:pt-0 sm:border-l sm:border-white/5 sm:pl-6 border-t border-white/5 sm:border-t-0">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-text-tertiary sm:text-right font-medium">
              Total Fare
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-text-primary sm:text-right">
              {priceText}
            </div>
          </div>

          {/* Action CTAs */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {onViewJourney && (
              <button
                type="button"
                onClick={() => onViewJourney(journey)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-brand-primary/25 hover:bg-brand-hover active:bg-brand-active transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary"
                aria-label={`View journey details from ${originName} to ${destinationName}`}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                <span>View Journey</span>
              </button>
            )}

            {isAuthenticated && (
              <button
                type="button"
                onClick={handleToggleSave}
                disabled={saving}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all cursor-pointer ${
                  saved
                    ? 'border-brand-primary/40 bg-brand-primary/10 text-brand-primary'
                    : 'border-white/10 bg-surface-secondary text-text-secondary hover:text-text-primary hover:border-white/20'
                }`}
                title={saved ? 'Remove from saved journeys' : 'Save journey for later'}
                aria-label={saved ? 'Remove saved journey' : 'Save journey'}
              >
                <Bookmark className={`h-3.5 w-3.5 ${saved ? 'fill-brand-primary' : ''}`} aria-hidden="true" />
                <span className="hidden sm:inline">{saved ? 'Saved' : 'Save'}</span>
              </button>
            )}

            {legs.length > 0 && (
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-surface-secondary px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:border-white/20 transition-all cursor-pointer focus:outline-none"
                aria-expanded={isExpanded}
                aria-label={isExpanded ? 'Hide leg breakdown' : 'Show leg breakdown'}
              >
                <span>{isExpanded ? 'Hide' : 'Legs'}</span>
                {isExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Compact Multi-Leg Breakdown (Section 5) */}
      {legs.length > 1 && !isExpanded && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-surface-secondary/40 px-3 py-2 text-xs text-text-secondary">
          <span className="font-semibold text-text-tertiary">Route:</span>
          {legs.map((leg, idx) => {
            const LegIcon = getModeIcon(leg.mode);
            const lOrigin = leg.origin?.name || leg.origin?.city || 'Origin';
            const lDest = leg.destination?.name || leg.destination?.city || 'Destination';
            return (
              <span key={leg.id || idx} className="inline-flex items-center gap-1.5">
                {idx > 0 && <span className="text-text-tertiary">·</span>}
                <LegIcon className="h-3.5 w-3.5 text-brand-primary" aria-hidden="true" />
                <span className="truncate max-w-[140px]" title={`${lOrigin} → ${lDest}`}>
                  {lOrigin} → {lDest}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* Expandable Multi-Leg Details */}
      {isExpanded && legs.length > 0 && (
        <div className="mt-5 border-t border-white/10 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Journey Itinerary ({legs.length} {legs.length === 1 ? 'Leg' : 'Legs'})
            </h4>
            {onViewJourney && (
              <button
                type="button"
                onClick={() => onViewJourney(journey)}
                className="text-xs font-medium text-brand-primary hover:underline cursor-pointer"
              >
                Inspect in modal →
              </button>
            )}
          </div>
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
