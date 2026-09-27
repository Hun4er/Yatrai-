import { useEffect } from 'react';
import { X, Clock, ShieldCheck } from 'lucide-react';
import {
  formatDuration,
  formatPrice,
  formatTime,
  formatDateDisplay,
  formatTransportModes,
  formatTransfers,
} from '../../utils/formatters.js';
import { JourneyLeg } from './JourneyLeg.jsx';

/**
 * JourneyDetailModal Component
 *
 * Dedicated inspection modal for selected journey.
 * Displays canonical itinerary, transfer details, service providers, and summary.
 * Contains ZERO raw provider payloads or payment forms.
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

  const originName = journey.origin?.name || journey.origin?.city || 'Origin';
  const destinationName = journey.destination?.name || journey.destination?.city || 'Destination';
  const depTime = formatTime(journey.departureTime);
  const arrTime = formatTime(journey.arrivalTime);
  const depDate = formatDateDisplay(journey.departureTime?.split('T')?.[0]);
  const arrDate = formatDateDisplay(journey.arrivalTime?.split('T')?.[0]);
  const durationText = formatDuration(journey.duration);
  const priceText = formatPrice(journey.totalPrice, journey.currency);
  const transferText = formatTransfers(journey.numberOfTransfers);
  const modesText = formatTransportModes(journey.transportModes);
  const legs = Array.isArray(journey.legs) ? journey.legs : [];
  const rankingLabel = journey.ranking?.label;
  const providerName =
    journey.metadata?.provider ||
    journey.provider ||
    (legs[0]?.service?.operator ? legs[0].service.operator : null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="journey-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/80 backdrop-blur-sm animate-in fade-in"
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl border border-white/10 bg-surface-primary p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/5 pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {rankingLabel && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-primary border border-brand-primary/20">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{rankingLabel}</span>
                </span>
              )}
              <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {modesText}
              </span>
            </div>
            <h2 id="journey-modal-title" className="text-2xl font-extrabold tracking-tight text-text-primary">
              {originName} <span className="text-brand-primary">→</span> {destinationName}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-surface-secondary p-2 text-text-secondary hover:text-text-primary hover:border-white/20 transition-all cursor-pointer focus:outline-none"
            aria-label="Close journey details"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Quick Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-white/5 bg-surface-secondary p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              Total Duration
            </div>
            <div className="mt-1 text-base font-bold text-text-primary flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-brand-primary" aria-hidden="true" />
              <span>{durationText}</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-surface-secondary p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              Total Price
            </div>
            <div className="mt-1 text-base font-bold text-semantic-success flex items-center gap-1">
              <span>{priceText}</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-surface-secondary p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              Connections
            </div>
            <div className="mt-1 text-base font-bold text-text-primary">
              {transferText}
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-surface-secondary p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              Distance
            </div>
            <div className="mt-1 text-base font-bold text-text-primary font-mono">
              {journey.totalDistance ? `${journey.totalDistance} km` : 'Calculated'}
            </div>
          </div>
        </div>

        {/* Departure & Arrival Schedule */}
        <div className="rounded-xl border border-white/5 bg-surface-secondary/70 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Departure
            </div>
            <div className="mt-1 text-xl font-bold text-text-primary">{depTime}</div>
            <div className="text-xs text-brand-primary font-medium">{originName}</div>
            {depDate && <div className="text-xs text-text-tertiary">{depDate}</div>}
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Arrival
            </div>
            <div className="mt-1 text-xl font-bold text-text-primary">{arrTime}</div>
            <div className="text-xs text-brand-primary font-medium">{destinationName}</div>
            {arrDate && <div className="text-xs text-text-tertiary">{arrDate}</div>}
          </div>
        </div>

        {/* Step-by-Step Itinerary Legs */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Itinerary Segments ({legs.length} {legs.length === 1 ? 'Leg' : 'Legs'})
          </h3>
          <div className="space-y-3">
            {legs.map((leg, idx) => (
              <JourneyLeg
                key={leg.id || idx}
                leg={leg}
                isLast={idx === legs.length - 1}
                nextLeg={legs[idx + 1] || null}
              />
            ))}
          </div>
        </div>

        {/* Footer info: provider & notice */}
        <div className="border-t border-white/5 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-text-tertiary">
          <div>
            {providerName && (
              <span>Discovered via <strong className="text-text-secondary">{providerName}</strong></span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-surface-secondary px-5 py-2.5 text-xs font-semibold text-text-primary border border-white/10 hover:bg-surface-elevated transition-colors cursor-pointer self-end sm:self-auto"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
}

export default JourneyDetailModal;
