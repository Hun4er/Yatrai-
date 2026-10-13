import React, { useState, useEffect } from 'react';
import { X, Clock, ShieldCheck, Calendar } from 'lucide-react';
import {
  formatDuration,
  formatPrice,
  formatTime,
  formatDateDisplay,
  formatTransportModes,
  formatTransfers,
  getDayOffset,
  formatDayOffsetBadge,
  getPriceLabel,
} from '../../utils/formatters.js';
import { JourneyLeg } from './JourneyLeg.jsx';
import { JourneyMap } from '../map/JourneyMap.jsx';

/**
 * JourneyDetailModal Component
 *
 * Dedicated inspection modal for selected journey.
 * Integrates Mapbox GL JS route visualization (Phase 12), canonical itinerary segments,
 * explicit arrival date handling, provider data freshness, and booking references.
 */
export function JourneyDetailModal({ journey, onClose }) {
  const [selectedLegSequence, setSelectedLegSequence] = useState(null);

  // Handle ESC key press to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!journey) return null;

  const originName = journey.origin?.name || journey.origin?.city || 'Origin';
  const destinationName = journey.destination?.name || journey.destination?.city || 'Destination';
  const depTime = formatTime(journey.departureTime);
  const arrTime = formatTime(journey.arrivalTime);
  const depDate = formatDateDisplay(journey.departureTime?.split('T')?.[0]);
  const arrDate = formatDateDisplay(journey.arrivalTime?.split('T')?.[0]);

  const dayOffset = getDayOffset(journey.departureTime, journey.arrivalTime);
  const dayOffsetBadge = formatDayOffsetBadge(dayOffset);

  const durationText = formatDuration(journey.duration);
  const priceText = formatPrice(journey.totalPrice, journey.currency);
  const priceLabel = getPriceLabel(journey);
  const transferText = formatTransfers(journey.numberOfTransfers);
  const modesText = formatTransportModes(journey.transportModes);
  const legs = Array.isArray(journey.legs) ? journey.legs : [];
  const rankingLabel = journey.ranking?.label;

  const providerName =
    legs[0]?.service?.operator ||
    journey.metadata?.provider ||
    legs[0]?.service?.name ||
    journey.provider ||
    'Transport Network';

  const freshnessInfo =
    journey.metadata?.freshness ||
    (journey.metadata?.searchedAt ? `Updated ${formatDateDisplay(journey.metadata.searchedAt.split('T')[0])}` : null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="journey-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-black/80 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl border border-[#303640] bg-[#181C22] p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#303640] pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {rankingLabel && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#15191F] px-3 py-0.5 text-xs font-semibold text-[#A7AFBA] border border-[#303640]">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#E8B04A]" aria-hidden="true" />
                  <span>{rankingLabel}</span>
                </span>
              )}
              <span className="text-xs font-semibold uppercase tracking-wider text-[#7E8794]">
                {modesText}
              </span>
            </div>
            <h2 id="journey-modal-title" className="text-2xl font-bold tracking-tight text-[#F0F1F3]">
              {originName} <span className="text-[#7E8794]">→</span> {destinationName}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#303640] bg-[#15191F] p-2 text-[#A7AFBA] hover:text-[#F0F1F3] hover:border-[#3A414C] transition-all cursor-pointer focus:outline-none"
            aria-label="Close itinerary details"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Journey Map Route Visualization */}
        <div className="w-full">
          <JourneyMap
            journey={journey}
            selectedLegSequence={selectedLegSequence}
            onSelectLeg={(seq) =>
              setSelectedLegSequence((prev) => (prev === seq ? null : seq))
            }
          />
        </div>

        {/* Quick Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-[#303640] bg-[#15191F] p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#7E8794]">
              Total Duration
            </div>
            <div className="mt-1 text-base font-bold text-[#F0F1F3] flex items-center gap-1.5 font-mono">
              <Clock className="h-4 w-4 text-[#E8B04A]" aria-hidden="true" />
              <span>{durationText}</span>
            </div>
          </div>

          <div className="rounded-xl border border-[#303640] bg-[#15191F] p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#7E8794] truncate">
              {priceLabel}
            </div>
            <div className="mt-1 text-base font-bold text-[#F0F1F3] flex items-center gap-1 font-mono">
              <span>{priceText}</span>
            </div>
          </div>

          <div className="rounded-xl border border-[#303640] bg-[#15191F] p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#7E8794]">
              Transfers
            </div>
            <div className="mt-1 text-base font-bold text-[#F0F1F3]">
              {transferText}
            </div>
          </div>

          <div className="rounded-xl border border-[#303640] bg-[#15191F] p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#7E8794]">
              Distance
            </div>
            <div className="mt-1 text-base font-bold text-[#F0F1F3] font-mono">
              {journey.totalDistance ? `${journey.totalDistance} km` : 'Calculated'}
            </div>
          </div>
        </div>

        {/* Departure & Arrival Schedule with Explicit Dates */}
        <div className="rounded-xl border border-[#303640] bg-[#15191F] p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#7E8794] flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-[#E8B04A]" />
              <span>Departure</span>
            </div>
            <div className="mt-1 text-xl font-bold text-[#F0F1F3] font-mono">{depTime}</div>
            <div className="text-xs text-[#A7AFBA] font-medium">{originName}</div>
            {depDate && <div className="text-xs text-[#7E8794]">{depDate}</div>}
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#7E8794] flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-[#E8B04A]" />
              <span>Arrival</span>
            </div>
            <div className="mt-1 text-xl font-bold text-[#F0F1F3] font-mono flex items-baseline gap-2">
              <span>{arrTime}</span>
              {dayOffsetBadge && (
                <span className="rounded-md bg-[#E8B04A]/10 px-1.5 py-0.5 text-xs font-bold text-[#E8B04A] border border-[#E8B04A]/30">
                  {dayOffsetBadge}
                </span>
              )}
            </div>
            <div className="text-xs text-[#A7AFBA] font-medium">{destinationName}</div>
            {arrDate && <div className="text-xs text-[#7E8794]">{arrDate}</div>}
          </div>
        </div>

        {/* Step-by-Step Itinerary Segments */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#A7AFBA]">
              Itinerary Segments ({legs.length} {legs.length === 1 ? 'segment' : 'segments'})
            </h3>
            {selectedLegSequence && (
              <button
                type="button"
                onClick={() => setSelectedLegSequence(null)}
                className="text-[11px] text-[#E8B04A] hover:underline cursor-pointer"
              >
                Clear segment highlight
              </button>
            )}
          </div>

          <div className="space-y-2">
            {legs.map((leg, idx) => (
              <JourneyLeg
                key={leg.id || idx}
                leg={leg}
                isLast={idx === legs.length - 1}
                nextLeg={legs[idx + 1] || null}
                isSelected={selectedLegSequence === leg.sequence}
                onSelect={(seq) =>
                  setSelectedLegSequence((prev) => (prev === seq ? null : seq))
                }
              />
            ))}
          </div>
        </div>

        {/* Footer Info & Disclaimers */}
        <div className="border-t border-[#303640] pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#7E8794]">
          <div className="space-y-0.5">
            {providerName && (
              <div>
                Discovered via <strong className="text-[#A7AFBA]">{providerName}</strong>
              </div>
            )}
            {freshnessInfo && (
              <div className="text-[11px] text-[#7E8794]">
                {freshnessInfo}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#15191F] hover:bg-[#181C22] px-5 py-2.5 text-xs font-semibold text-[#F0F1F3] border border-[#303640] hover:border-[#3A414C] transition-colors cursor-pointer self-end sm:self-auto"
          >
            Close Itinerary
          </button>
        </div>
      </div>
    </div>
  );
}

export default JourneyDetailModal;
