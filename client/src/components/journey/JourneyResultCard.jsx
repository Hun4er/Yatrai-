import React, { useState, useEffect } from 'react';
import {
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Eye,
  Bookmark,
  CheckCircle2,
  GitCompare,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../services/api.js';
import {
  formatDuration,
  formatPrice,
  formatTime,
  formatDateDisplay,
  formatTransfers,
  getDayOffset,
  formatDayOffsetBadge,
  getPriceLabel,
  getRecommendationExplanation,
} from '../../utils/formatters.js';
import { JourneyLeg, getModeIcon } from './JourneyLeg.jsx';

/**
 * JourneyResultCard Component
 *
 * Implements Sections 8, 9, 10, 11, 12, 13, 14, 15, 18:
 * - Scannable 4-point hierarchy: Departure, Arrival, Duration, Cost
 * - Explicit arrival date and +1 day offset calculation
 * - Transparent "Why Yatrai recommends this" explanation for Best Overall
 * - Reduced badge density with semantic coloring
 * - Vertical multi-modal timeline without fabricating stops
 * - Clear distinction between "Total fare" vs "Estimated driving cost"
 * - Replaces "Legs" with "[ View itinerary ↓ ]" or "[ 2 segments · 1 transfer ↓ ]"
 * - Replaces "View Journey" with "View itinerary"
 * - Comparison selection support
 */
export function JourneyResultCard({
  journey,
  isTopPick = false,
  allJourneys = [],
  onViewJourney,
  isSaved: initialSaved,
  onRemoveSaved,
  onToggleCompare,
  isCompared = false,
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
      // Keep previous state
    } finally {
      setSaving(false);
    }
  };

  if (!journey) return null;

  const originName = journey.origin?.name || journey.origin?.city || 'Origin';
  const destinationName = journey.destination?.name || journey.destination?.city || 'Destination';
  const originCity = journey.origin?.city && journey.origin?.name !== journey.origin?.city ? journey.origin.city : null;
  const destinationCity = journey.destination?.city && journey.destination?.name !== journey.destination?.city ? journey.destination.city : null;

  const depTime = formatTime(journey.departureTime);
  const arrTime = formatTime(journey.arrivalTime);
  const depDate = formatDateDisplay(journey.departureTime?.split('T')?.[0]);
  const arrDate = formatDateDisplay(journey.arrivalTime?.split('T')?.[0]);

  // Mandatory Section 10: explicit arrival day offset
  const dayOffset = getDayOffset(journey.departureTime, journey.arrivalTime);
  const dayOffsetBadge = formatDayOffsetBadge(dayOffset);

  const durationText = formatDuration(journey.duration);
  const priceText = formatPrice(journey.totalPrice, journey.currency);
  const priceLabel = getPriceLabel(journey);

  const transfers = journey.numberOfTransfers ?? 0;
  const isDirect = transfers === 0;

  const transportModes = Array.isArray(journey.transportModes) && journey.transportModes.length > 0
    ? journey.transportModes
    : ['rail'];

  const legs = Array.isArray(journey.legs) ? journey.legs : [];
  const isMultiModal = transfers > 0 || legs.length > 1;

  // Primary mode icon
  const PrimaryModeIcon = getModeIcon(transportModes[0] || 'rail');

  // Service / Provider name
  const providerName =
    legs[0]?.service?.name ||
    journey.metadata?.provider ||
    legs[0]?.service?.operator ||
    (transportModes[0] === 'road' ? 'Road Transit' : null);

  const isBestOverall = isTopPick || journey.ranking?.strategy === 'overall' || journey.ranking?.label === 'Best Overall';
  const rankingLabel = journey.ranking?.label || (isTopPick ? 'Best Overall' : null);

  // Section 8: Explainable recommendation reasons
  const recommendationReasons = isBestOverall
    ? getRecommendationExplanation(journey, allJourneys)
    : [];

  const segmentSummaryLabel = isDirect
    ? 'Direct · 1 segment'
    : `${formatTransfers(transfers)} · ${legs.length} segments`;

  return (
    <article
      className={`rounded-2xl border bg-surface-primary p-5 sm:p-6 transition-all shadow-sm ${
        isBestOverall
          ? 'border-brand-primary/40 bg-surface-primary/95 ring-1 ring-brand-primary/20 shadow-brand-primary/5'
          : 'border-white/10 hover:border-white/20'
      }`}
      aria-label={`Journey from ${originName} to ${destinationName}, ${durationText}, ${priceLabel} ${priceText}`}
    >
      {/* 1. Header: Reorganized hierarchy with clear alignment */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3 sm:pb-3.5">
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 min-w-0">
          {/* Best Overall Badge */}
          {isBestOverall && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-primary px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm shrink-0">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              <span>BEST OVERALL</span>
            </span>
          )}

          {/* Other Ranking Badge */}
          {!isBestOverall && rankingLabel && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-secondary px-2.5 py-0.5 text-[11px] font-semibold text-text-primary border border-white/10 shrink-0">
              <span>{rankingLabel}</span>
            </span>
          )}

          {/* Transport Mode & Service / Operator */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary min-w-0">
            <PrimaryModeIcon className="h-3.5 w-3.5 text-brand-primary shrink-0" aria-hidden="true" />
            <span className="capitalize">{transportModes.join(' + ')}</span>
            {providerName && (
              <span className="text-text-secondary truncate max-w-[220px] sm:max-w-[340px]" title={providerName}>
                · {providerName}
              </span>
            )}
          </div>

          {/* Direct (Green) or Transfer (Amber) Status Badge */}
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold shrink-0 ${
              isDirect
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}
          >
            {isDirect ? 'Direct' : formatTransfers(transfers)}
          </span>
        </div>

        {/* Header Actions: Compare & Save */}
        <div className="flex items-center gap-1.5 text-xs shrink-0">
          {onToggleCompare && (
            <button
              type="button"
              onClick={() => onToggleCompare(journey)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors cursor-pointer ${
                isCompared
                  ? 'bg-brand-primary text-white font-semibold'
                  : 'bg-surface-secondary text-text-secondary hover:text-text-primary border border-white/10 hover:border-white/20'
              }`}
              title="Add to comparison"
              aria-label={isCompared ? 'Remove from comparison' : 'Compare journey'}
            >
              <GitCompare className="h-3.5 w-3.5" />
              <span>{isCompared ? 'Compared' : 'Compare'}</span>
            </button>
          )}

          {isAuthenticated && (
            <button
              type="button"
              onClick={handleToggleSave}
              disabled={saving}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors cursor-pointer ${
                saved
                  ? 'text-brand-primary bg-brand-primary/10'
                  : 'text-text-tertiary hover:text-text-primary'
              }`}
              title={saved ? 'Remove saved journey' : 'Save for later'}
              aria-label={saved ? 'Remove saved journey' : 'Save journey'}
            >
              <Bookmark className={`h-3.5 w-3.5 ${saved ? 'fill-brand-primary' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* 2. Recommendation Explanation: Compact, readable, slightly differentiated surface */}
      {isBestOverall && recommendationReasons.length > 0 && (
        <div className="mt-3.5 rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-3 sm:p-3.5 text-xs space-y-2">
          <div className="font-bold text-brand-primary flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span>Why Yatrai recommends this</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-x-5 sm:gap-y-1.5 text-text-secondary">
            {recommendationReasons.map((reason, idx) => (
              <div key={idx} className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>{reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Journey Summary & Fare Column */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
        {/* Departure, Duration Line, Arrival */}
        <div className="sm:col-span-8 flex items-start justify-between gap-3 sm:gap-4">
          {/* Departure */}
          <div className="flex-1 min-w-0">
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-text-primary font-mono">
              {depTime}
            </div>
            <div
              className="mt-1 text-sm font-semibold text-text-primary leading-snug break-words"
              title={originName}
            >
              {originName}
            </div>
            {originCity && (
              <div className="text-xs text-text-tertiary mt-0.5">{originCity}</div>
            )}
            {depDate && (
              <div className="text-xs text-text-tertiary mt-0.5">{depDate}</div>
            )}
          </div>

          {/* Route path line & Duration */}
          <div className="flex flex-col items-center px-1 sm:px-2 flex-1 max-w-[140px] sm:max-w-[190px] shrink-0 pt-1">
            <div className="flex items-center gap-1 text-xs font-bold text-text-primary">
              <Clock className="h-3.5 w-3.5 text-brand-primary shrink-0" aria-hidden="true" />
              <span>{durationText}</span>
            </div>

            <div className="relative mt-2 w-full flex items-center justify-center">
              <div className="h-0.5 w-full bg-white/20" />
              <div className="absolute flex h-2 w-2 rounded-full bg-brand-primary ring-2 ring-brand-primary/30" />
              <ArrowRight
                className="absolute right-0 h-3.5 w-3.5 text-text-tertiary translate-x-1"
                aria-hidden="true"
              />
            </div>

            <div className="mt-1 text-[11px] text-text-tertiary font-medium text-center">
              {isDirect ? 'Direct' : formatTransfers(transfers)}
              {journey.totalDistance ? ` · ${journey.totalDistance} km` : ''}
            </div>
          </div>

          {/* Arrival with Mandatory Day Offset */}
          <div className="flex-1 min-w-0 text-right">
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-text-primary font-mono flex items-baseline justify-end gap-1.5">
              <span>{arrTime}</span>
              {dayOffsetBadge && (
                <span className="rounded-md bg-brand-primary/10 px-1.5 py-0.5 text-xs font-bold text-brand-primary border border-brand-primary/20">
                  {dayOffsetBadge}
                </span>
              )}
            </div>
            <div
              className="mt-1 text-sm font-semibold text-text-primary leading-snug break-words"
              title={destinationName}
            >
              {destinationName}
            </div>
            {destinationCity && (
              <div className="text-xs text-text-tertiary mt-0.5">{destinationCity}</div>
            )}
            {arrDate && (
              <div className="text-xs text-text-tertiary mt-0.5">{arrDate}</div>
            )}
          </div>
        </div>

        {/* Fare & CTAs Column (Distinct right column on desktop, cleanly organized on mobile) */}
        <div className="sm:col-span-4 flex flex-col sm:items-end justify-between pt-3 sm:pt-0 sm:border-l sm:border-white/10 sm:pl-6 border-t border-white/5 sm:border-t-0 gap-3">
          <div className="flex sm:flex-col justify-between sm:justify-start items-baseline sm:items-end w-full">
            <div className="text-[11px] uppercase tracking-wider text-text-tertiary sm:text-right font-medium">
              {priceLabel}
            </div>
            <div className="text-2xl sm:text-3xl font-black tracking-tight text-text-primary sm:text-right font-mono">
              {priceText}
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap sm:flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto">
            {onViewJourney && (
              <button
                type="button"
                onClick={() => onViewJourney(journey)}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2 text-xs font-semibold text-white shadow-md shadow-brand-primary/20 hover:bg-brand-hover active:bg-brand-active transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary"
                aria-label={`View itinerary for ${originName} to ${destinationName}`}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                <span>View itinerary</span>
              </button>
            )}

            {legs.length > 0 && (
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 rounded-xl border border-white/10 bg-surface-secondary px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:border-white/20 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                aria-expanded={isExpanded}
                aria-label={isExpanded ? 'Collapse itinerary' : 'Expand itinerary'}
              >
                <span>{isExpanded ? 'Collapse itinerary' : (legs.length > 1 ? `Expand (${legs.length} segments)` : 'Expand itinerary')}</span>
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

      {/* 4. Multi-Modal Collapsed Route Preview (when collapsed and >1 segment) */}
      {isMultiModal && !isExpanded && legs.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-surface-secondary/50 px-3.5 py-2 text-xs text-text-secondary">
          <span className="font-semibold text-text-tertiary">Route:</span>
          {legs.map((leg, idx) => {
            const LegIcon = getModeIcon(leg.mode);
            const lOrigin = leg.origin?.name || leg.origin?.city || 'Origin';
            const lDest = leg.destination?.name || leg.destination?.city || 'Destination';
            return (
              <span key={leg.id || idx} className="inline-flex items-center gap-1.5">
                {idx > 0 && <span className="text-text-tertiary">·</span>}
                <LegIcon className="h-3 w-3 text-brand-primary" aria-hidden="true" />
                <span className="truncate max-w-[150px]" title={`${lOrigin} → ${lDest}`}>
                  {lOrigin} → {lDest}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* 5. Expanded Vertical Timeline Itinerary */}
      {isExpanded && legs.length > 0 && (
        <div className="mt-5 border-t border-white/10 pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                YOUR ITINERARY
              </h4>
              <p className="text-xs text-text-tertiary font-medium mt-0.5">
                {segmentSummaryLabel}
              </p>
            </div>
            {onViewJourney && (
              <button
                type="button"
                onClick={() => onViewJourney(journey)}
                className="text-xs font-semibold text-brand-primary hover:text-brand-hover hover:underline cursor-pointer transition-colors"
              >
                View route map →
              </button>
            )}
          </div>

          <div className="space-y-4 rounded-xl border border-white/5 bg-surface-secondary/40 p-3.5 sm:p-5">
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
