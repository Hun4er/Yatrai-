import React, { useEffect } from 'react';
import { X, GitCompare, Eye } from 'lucide-react';
import {
  formatDuration,
  formatPrice,
  formatTime,
  formatTransfers,
  getDayOffset,
  formatDayOffsetBadge,
  getPriceLabel,
} from '../../utils/formatters.js';
import { getModeIcon } from './JourneyLeg.jsx';

/**
 * JourneyComparisonModal Component
 *
 * Implements Section 21 (Comparison Feature).
 * Allows side-by-side comparison of 2 or more selected journeys across:
 * - Transport modes
 * - Total duration
 * - Cost & pricing model
 * - Transfers
 * - Distance
 * - Departure & arrival schedule
 */
export function JourneyComparisonModal({
  journeys = [],
  onClose,
  onSelectJourney,
  onRemoveFromCompare,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!journeys || journeys.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-black/80 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl rounded-2xl border border-[#303640] bg-[#12151A] p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#303640] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#15191F] border border-[#303640] text-[#E8B04A]">
              <GitCompare className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="compare-modal-title" className="text-xl sm:text-2xl font-serif font-bold tracking-tight text-[#F0F1F3]">
                Compare Journeys ({journeys.length})
              </h2>
              <p className="text-xs text-[#A7AFBA]">
                Side-by-side trade-off comparison between your selected route options.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#303640] bg-[#15191F] p-2 text-[#A7AFBA] hover:text-[#F0F1F3] hover:border-[#424A56] transition-all cursor-pointer"
            aria-label="Close comparison"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Comparison Matrix Table */}
        <div className="overflow-x-auto pb-2">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#303640]">
                <th className="py-3 px-4 font-bold text-[#7E8794] uppercase tracking-wider w-36">
                  Metric
                </th>
                {journeys.map((j, idx) => {
                  const PrimaryIcon = getModeIcon(j.transportModes?.[0] || 'rail');
                  const modeText = Array.isArray(j.transportModes)
                    ? j.transportModes.join(' + ')
                    : 'Transit';

                  return (
                    <th key={j.id || idx} className="py-3 px-4 min-w-[200px]">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 font-bold text-text-primary capitalize text-sm">
                            <PrimaryIcon className="h-4 w-4 text-text-secondary shrink-0" />
                            <span>{modeText}</span>
                          </div>
                          <div className="text-[11px] text-text-secondary truncate mt-0.5">
                            {j.metadata?.provider || j.legs?.[0]?.service?.name || 'Transit Provider'}
                          </div>
                        </div>

                        {onRemoveFromCompare && (
                          <button
                            type="button"
                            onClick={() => onRemoveFromCompare(j.id)}
                            className="text-text-disabled hover:text-text-secondary p-1"
                            title="Remove from comparison"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-[#303640]">
              {/* Duration Row */}
              <tr>
                <td className="py-3 px-4 font-semibold text-[#A7AFBA]">
                  Duration
                </td>
                {journeys.map((j, idx) => (
                  <td key={idx} className="py-3 px-4 font-bold text-[#F0F1F3] font-mono text-sm">
                    {formatDuration(j.duration)}
                  </td>
                ))}
              </tr>

              {/* Cost Row */}
              <tr>
                <td className="py-3 px-4 font-semibold text-[#A7AFBA]">
                  Cost
                </td>
                {journeys.map((j, idx) => (
                  <td key={idx} className="py-3 px-4">
                    <div className="font-bold text-[#E8B04A] font-mono text-sm">
                      {formatPrice(j.totalPrice, j.currency)}
                    </div>
                    <div className="text-[11px] text-[#7E8794]">
                      {getPriceLabel(j)}
                    </div>
                  </td>
                ))}
              </tr>

              {/* Transfers Row */}
              <tr>
                <td className="py-3 px-4 font-semibold text-[#A7AFBA]">
                  Transfers
                </td>
                {journeys.map((j, idx) => {
                  const transfers = j.numberOfTransfers ?? 0;
                  return (
                    <td key={idx} className="py-3 px-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                          transfers === 0
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-[#15191F] text-[#A7AFBA] border-[#303640]'
                        }`}
                      >
                        {formatTransfers(transfers)}
                      </span>
                    </td>
                  );
                })}
              </tr>

              {/* Distance Row */}
              <tr>
                <td className="py-3 px-4 font-semibold text-[#A7AFBA]">
                  Distance
                </td>
                {journeys.map((j, idx) => (
                  <td key={idx} className="py-3 px-4 text-[#F0F1F3] font-mono">
                    {j.totalDistance ? `${j.totalDistance} km` : 'Calculated'}
                  </td>
                ))}
              </tr>

              {/* Schedule Row */}
              <tr>
                <td className="py-3 px-4 font-semibold text-[#A7AFBA]">
                  Schedule
                </td>
                {journeys.map((j, idx) => {
                  const dayOffset = getDayOffset(j.departureTime, j.arrivalTime);
                  const dayBadge = formatDayOffsetBadge(dayOffset);

                  return (
                    <td key={idx} className="py-3 px-4 space-y-1">
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="font-semibold text-[#F0F1F3]">{formatTime(j.departureTime)}</span>
                        <span className="text-[#7E8794]">→</span>
                        <span className="font-semibold text-[#F0F1F3]">{formatTime(j.arrivalTime)}</span>
                        {dayBadge && (
                          <span className="rounded bg-[#15191F] px-1 text-[10px] font-bold text-[#E8B04A] border border-[#303640]">
                            {dayBadge}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#7E8794] truncate">
                        {j.origin?.name || 'Origin'} → {j.destination?.name || 'Destination'}
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Recommendation Label */}
              <tr>
                <td className="py-3 px-4 font-semibold text-[#A7AFBA]">
                  Ranking
                </td>
                {journeys.map((j, idx) => (
                  <td key={idx} className="py-3 px-4">
                    <span className="text-xs text-[#A7AFBA] font-medium">
                      {j.ranking?.label || 'Available option'}
                    </span>
                  </td>
                ))}
              </tr>

              {/* Action CTA Row */}
              <tr>
                <td className="py-3 px-4 font-semibold text-[#A7AFBA]">
                  Action
                </td>
                {journeys.map((j, idx) => (
                  <td key={idx} className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        if (onSelectJourney) onSelectJourney(j);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#E8B04A] hover:bg-[#F2BE62] text-[#0B0D10] px-3.5 py-1.5 text-xs font-bold shadow-sm cursor-pointer transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>View itinerary</span>
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default JourneyComparisonModal;
