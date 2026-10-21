import React from 'react';
import { Calendar, Sparkles } from 'lucide-react';
import { formatDateDisplay } from '../../utils/formatters.js';

/**
 * P0DateStrip Component (P0 v2)
 *
 * Free multi-date availability strip extracted from the 4-date availability response.
 * - Highlights nearby dates with a CONFIRMED seat.
 * - Clicking a date lets the user jump to that date (0 calls if cached).
 */
export function P0DateStrip({
  currentDate,
  dateStrip = [],
  onSelectDate,
  isCachedDate = () => false,
}) {
  if (!dateStrip || dateStrip.length === 0) {
    return null;
  }

  return (
    <div className="w-full overflow-x-auto pb-1" aria-label="Nearby dates availability">
      <div className="flex items-center gap-2 min-w-max py-1">
        <div className="flex items-center gap-1.5 text-xs text-[#9CA3AF] pr-1">
          <Calendar className="h-3.5 w-3.5 text-[#E8B04A]" />
          <span className="font-medium text-[#E5E7EB]">Nearby dates:</span>
        </div>

        {dateStrip.map((item, idx) => {
          const isCurrent = item.date === currentDate;
          const isConfirmed = item.bestTier === 'AVAILABLE' || item.confirmed;
          const cached = isCachedDate(item.date);

          return (
            <button
              key={item.date || idx}
              type="button"
              onClick={() => onSelectDate && onSelectDate(item.date)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition-all cursor-pointer ${
                isCurrent
                  ? 'border border-[#E8B04A] bg-[#E8B04A]/10 text-[#F0F1F3] font-bold shadow-sm shadow-[#E8B04A]/20'
                  : isConfirmed
                  ? 'border border-emerald-500/50 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40 hover:border-emerald-400 font-semibold'
                  : 'border border-[#303640] bg-[#161B22] text-[#9CA3AF] hover:text-[#F0F1F3] hover:border-[#4B5563]'
              }`}
              title={
                isConfirmed
                  ? `Confirmed seat available on ${item.date} (${item.class || 'any class'})`
                  : `Search ${item.date}`
              }
            >
              <span>{formatDateDisplay(item.date)}</span>
              {item.availabilityText && !isConfirmed && (
                <span className="text-[11px] text-[#A7AFBA]">· {item.availabilityText}</span>
              )}
              {isConfirmed && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                  <Sparkles className="h-2.5 w-2.5" />
                  {item.availabilityText || (item.class ? `AVL (${item.class})` : 'AVL')}
                </span>
              )}
              {cached && !isCurrent && (
                <span className="text-[9px] text-[#7E8794]" title="Cached result (0 network calls)">
                  ⚡
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default P0DateStrip;
