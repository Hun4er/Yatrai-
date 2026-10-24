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

  const trainFromName = parsed?.trainFromName || originName;
  const trainFromCode = parsed?.trainFromCode || originCode;
  const trainToName = parsed?.trainToName || destinationName;
  const trainToCode = parsed?.trainToCode || destinationCode;

  const rawDuration = journey.duration ?? journey.durationMinutes ?? parsed?.trainStage?.duration ?? null;
  const durationText = formatDuration(rawDuration);

  const depTime = parsed?.trainStage?.departureTime || journey.departureTimeFormatted || formatTime(journey.departureTime);
  const arrTime = parsed?.trainStage?.arrivalTime || journey.arrivalTimeFormatted || formatTime(journey.arrivalTime);
  const depDate = parsed?.trainStage?.departureDate || (journey.departureDateFormatted ? formatDateDisplay(journey.departureDateFormatted) : formatDateDisplay(journey.departureTime));
  const arrDate = parsed?.trainStage?.arrivalDate || (journey.arrivalDateFormatted ? formatDateDisplay(journey.arrivalDateFormatted) : formatDateDisplay(journey.arrivalTime));

  const dayOffset = parsed?.trainStage?.dayOffset ?? (journey.dayOffset !== undefined ? journey.dayOffset : getDayOffset(journey.departureTime, journey.arrivalTime, rawDuration));
  const dayOffsetBadge = formatDayOffsetBadge(dayOffset);

  const rawPrice =
    journey.totalPrice ??
    journey.pricing?.totalFare ??
    journey.pricing?.mainTrainFare ??
    journey.fare ??
    journey.price ??
    parsed?.costs?.knownCostSum ??
    null;
  const priceText = formatPrice(rawPrice, journey.currency);
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

        {/* Timetable Schedule Summary */}
        <div className="rounded-xl border border-[#232830] bg-[#12151A] p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Departure */}
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#6B7480]">Departure</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[#EDEFF2] font-mono tabular-nums">{depTime}</div>
              <div className="text-sm font-semibold text-[#EDEFF2] leading-snug mt-0.5">
                {trainFromName}
                {trainFromCode && <span className="text-[#6B7480] font-mono text-xs ml-1">({trainFromCode})</span>}
              </div>
              {depDate && <div className="text-xs text-[#6B7480] mt-0.5">{depDate}</div>}
            </div>

            {/* Route & Duration Line */}
            <div className="flex flex-col items-center justify-center px-2 py-1 w-full sm:w-auto">
              <div className="flex items-center gap-1 text-xs font-bold font-mono text-[#EDEFF2]">
                <Clock className="h-3.5 w-3.5 text-[#E8B04A]" />
                <span>{durationText}</span>
              </div>
              <div className="relative my-2 w-32 sm:w-40 flex items-center justify-center">
                <div className="h-px w-full bg-[#232830]" />
                <div className="absolute flex h-2 w-2 rounded-full bg-[#E8B04A] ring-4 ring-[#12151A]" />
              </div>
              <div className="text-[11px] text-[#6B7480]">{transferText}</div>
            </div>

            {/* Arrival */}
            <div className="min-w-0 sm:text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#6B7480]">Arrival</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[#EDEFF2] font-mono tabular-nums flex items-baseline sm:justify-end gap-1.5">
                <span>{arrTime}</span>
                {dayOffsetBadge && (
                  <span className="rounded-md bg-[#E8B04A]/10 px-1.5 py-0.5 text-[11px] font-bold text-[#E8B04A] border border-[#E8B04A]/30">
                    {dayOffsetBadge}
                  </span>
                )}
              </div>
              <div className="text-sm font-semibold text-[#EDEFF2] leading-snug mt-0.5">
                {trainToName}
                {trainToCode && <span className="text-[#6B7480] font-mono text-xs ml-1">({trainToCode})</span>}
              </div>
              {arrDate && <div className="text-xs text-[#6B7480] mt-0.5">{arrDate}</div>}
            </div>
          </div>
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
