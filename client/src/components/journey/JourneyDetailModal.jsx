import React, { useEffect } from 'react';
import { X, Clock, ShieldCheck, Calendar, MapPin } from 'lucide-react';
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
import { JourneyMap } from '../map/JourneyMap.jsx';
import { CompleteJourneyTimeline, parseJourneyStages } from './CompleteJourneyTimeline.jsx';

/**
 * JourneyDetailModal Component
 *
 * Dedicated inspection modal for the complete end-to-end journey.
 * Integrates Mapbox GL route visualization, full multi-stage journey timeline
 * (Access -> Train -> Onward), cost breakdown, and timing buffer analysis
 * in Graphite & Amber design system.
 */
export function JourneyDetailModal({ journey, onClose }) {
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

  const parsed = parseJourneyStages(journey);
  const originName = parsed?.reqOriginName || journey.origin?.name || journey.origin?.city || 'Origin';
  const destinationName = parsed?.reqDestName || journey.destination?.name || journey.destination?.city || 'Destination';
  const originCode = parsed?.reqOriginCode || '';
  const destinationCode = parsed?.reqDestCode || '';

  const depTime = parsed?.trainStage?.departureTime || formatTime(journey.departureTime);
  const arrTime = parsed?.trainStage?.arrivalTime || formatTime(journey.arrivalTime);
  const depDate = parsed?.trainStage?.departureDate || formatDateDisplay(journey.departureTime?.split('T')?.[0]);
  const arrDate = parsed?.trainStage?.arrivalDate || formatDateDisplay(journey.arrivalTime?.split('T')?.[0]);

  const dayOffset = parsed?.trainStage?.dayOffset ?? getDayOffset(journey.departureTime, journey.arrivalTime);
  const dayOffsetBadge = formatDayOffsetBadge(dayOffset);

  const durationText = formatDuration(journey.duration);
  const priceText = formatPrice(journey.totalPrice, journey.currency);
  const priceLabel = parsed?.costs?.hasMissingCosts ? 'Total Estimated Cost (Partial)' : getPriceLabel(journey);
  const transferText = formatTransfers(journey.numberOfTransfers);
  const modesText = formatTransportModes(journey.transportModes);
  const legs = Array.isArray(journey.legs) ? journey.legs : [];
  const rankingLabel = journey.ranking?.label;

  const providerName =
    parsed?.trainStage?.trainName ||
    legs[0]?.service?.operator ||
    journey.metadata?.provider ||
    legs[0]?.service?.name ||
    journey.provider ||
    'Indian Railways';

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
        className="relative w-full max-w-4xl rounded-2xl border border-[#232830] bg-[#181C22] p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto text-[#EDEFF2]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#232830] pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {rankingLabel && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#12151A] px-3 py-0.5 text-xs font-semibold text-[#9AA3AF] border border-[#232830]">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#E8B04A]" aria-hidden="true" />
                  <span>{rankingLabel}</span>
                </span>
              )}
              <span className="text-xs font-semibold uppercase tracking-wider text-[#6B7480]">
                {modesText}
              </span>
            </div>
            <h2 id="journey-modal-title" className="text-xl sm:text-2xl font-bold tracking-tight text-[#EDEFF2] flex flex-wrap items-center gap-2">
              <span>{originName}</span>
              {originCode && <span className="text-xs font-mono text-[#6B7480]">({originCode})</span>}
              <span className="text-[#6B7480]">→</span>
              <span>{destinationName}</span>
              {destinationCode && <span className="text-xs font-mono text-[#6B7480]">({destinationCode})</span>}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#232830] bg-[#12151A] p-2 text-[#9AA3AF] hover:text-[#EDEFF2] hover:border-[#3A414C] transition-all cursor-pointer focus:outline-none"
            aria-label="Close itinerary details"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Journey Map Route Visualization */}
        <div className="w-full rounded-xl overflow-hidden border border-[#232830]">
          <JourneyMap journey={journey} />
        </div>

        {/* Quick Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-[#232830] bg-[#12151A] p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7480]">
              Total Duration
            </div>
            <div className="mt-1 text-base font-bold text-[#EDEFF2] flex items-center gap-1.5 font-mono">
              <Clock className="h-4 w-4 text-[#E8B04A]" aria-hidden="true" />
              <span>{durationText}</span>
            </div>
          </div>

          <div className="rounded-xl border border-[#232830] bg-[#12151A] p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7480] truncate">
              {priceLabel}
            </div>
            <div className="mt-1 text-base font-bold text-[#EDEFF2] flex items-center gap-1 font-mono">
              <span>{priceText}</span>
            </div>
          </div>

          <div className="rounded-xl border border-[#232830] bg-[#12151A] p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7480]">
              Transfers
            </div>
            <div className="mt-1 text-base font-bold text-[#EDEFF2]">
              {transferText}
            </div>
          </div>

          <div className="rounded-xl border border-[#232830] bg-[#12151A] p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7480]">
              Distance
            </div>
            <div className="mt-1 text-base font-bold text-[#EDEFF2] font-mono">
              {journey.totalDistance ? `${journey.totalDistance} km` : 'Calculated'}
            </div>
          </div>
        </div>

        {/* Complete Journey Timeline & Itinerary Breakdown */}
        <div className="border-t border-[#232830] pt-4">
          <CompleteJourneyTimeline journey={journey} />
        </div>

        {/* Footer Info & Disclaimers */}
        <div className="border-t border-[#232830] pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#6B7480]">
          <div className="space-y-0.5">
            {providerName && (
              <div>
                Discovered via <strong className="text-[#9AA3AF]">{providerName}</strong>
              </div>
            )}
            {freshnessInfo && (
              <div className="text-[11px] text-[#6B7480]">
                {freshnessInfo}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#12151A] hover:bg-[#181C22] px-5 py-2.5 text-xs font-semibold text-[#EDEFF2] border border-[#232830] hover:border-[#3A414C] transition-colors cursor-pointer self-end sm:self-auto"
          >
            Close Itinerary
          </button>
        </div>
      </div>
    </div>
  );
}

export default JourneyDetailModal;
