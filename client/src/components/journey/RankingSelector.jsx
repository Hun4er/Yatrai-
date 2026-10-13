import React, { useState } from 'react';
import { Sparkles, Zap, DollarSign, Shuffle, Compass, Info, X } from 'lucide-react';

export const RANKING_OPTIONS = [
  {
    id: 'overall',
    label: 'Best Overall',
    icon: Sparkles,
    tooltip: 'Yatrai balances travel time (35%), total cost (30%), transfers (20%), and convenience (15%).',
  },
  {
    id: 'fastest',
    label: 'Fastest',
    icon: Zap,
    tooltip: 'Prioritizes shortest total journey duration.',
  },
  {
    id: 'cheapest',
    label: 'Cheapest',
    icon: DollarSign,
    tooltip: 'Prioritizes lowest total journey cost and estimated fare.',
  },
  {
    id: 'fewest_transfers',
    label: 'Fewest Transfers',
    icon: Shuffle,
    tooltip: 'Prioritizes routes with direct journeys and minimum connection interchanges.',
  },
  {
    id: 'most_convenient',
    label: 'Most Convenient',
    icon: Compass,
    tooltip: 'Optimizes daylight schedules, seamless transfers, and minimal mode switching.',
  },
];

/**
 * RankingSelector Component
 *
 * Exposes ranking strategy tabs matching the backend ranking engine (Phase 7 & 8).
 * Includes accessible ranking tooltips explaining how Yatrai scores options.
 */
export function RankingSelector({ activeRanking = 'overall', onSelect, disabled = false }) {
  const [showTooltipFor, setShowTooltipFor] = useState(null);

  return (
    <div className="relative">
      <div
        role="tablist"
        aria-label="Journey Ranking Strategies"
        className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none max-w-full"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#7E8794] mr-1 shrink-0 hidden sm:inline">
          Rank by:
        </span>

        {RANKING_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = activeRanking === option.id;

          return (
            <div key={option.id} className="relative inline-flex items-center shrink-0">
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                disabled={disabled}
                onClick={() => {
                  if (!isActive && onSelect) {
                    onSelect(option.id);
                  }
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#E8B04A] text-[#0B0D10] shadow-sm shadow-[#E8B04A]/20'
                    : 'bg-[#15191F] text-[#A7AFBA] border border-[#303640] hover:border-[#3A414C] hover:text-[#F0F1F3] hover:bg-[#181C22]'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Icon
                  className={`h-3.5 w-3.5 ${isActive ? 'text-[#0B0D10]' : 'text-[#7E8794]'}`}
                  aria-hidden="true"
                />
                <span>{option.label}</span>

                {/* Info Tooltip Trigger */}
                {option.id === 'overall' && (
                  <span
                    role="button"
                    tabIndex={0}
                    title="How ranking works"
                    aria-label="How Best Overall ranking works"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTooltipFor((prev) => (prev === 'overall' ? null : 'overall'));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        setShowTooltipFor((prev) => (prev === 'overall' ? null : 'overall'));
                      }
                    }}
                    className={`ml-0.5 rounded-full p-0.5 transition-colors cursor-pointer ${
                      isActive ? 'text-[#0B0D10]/80 hover:text-[#0B0D10]' : 'text-[#7E8794] hover:text-[#F0F1F3]'
                    }`}
                  >
                    <Info className="h-3 w-3" />
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Floating Info Tooltip for Best Overall */}
      {showTooltipFor === 'overall' && (
        <div
          role="tooltip"
          className="absolute z-30 left-0 sm:left-16 mt-2 max-w-sm rounded-xl border border-[#303640] bg-[#181C22] p-4 text-xs text-[#F0F1F3] shadow-2xl animate-in fade-in"
        >
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <span className="font-bold text-[#E8B04A] flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              <span>How Best Overall Works</span>
            </span>
            <button
              type="button"
              onClick={() => setShowTooltipFor(null)}
              className="text-[#7E8794] hover:text-[#F0F1F3] cursor-pointer"
              aria-label="Close tooltip"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-[#A7AFBA] leading-relaxed">
            Yatrai balances travel time (35%), total cost (30%), transfers (20%), and convenience (15%) to find routes that offer the best overall trade-offs.
          </p>
        </div>
      )}
    </div>
  );
}

export default RankingSelector;
