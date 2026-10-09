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
        <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mr-1 shrink-0 hidden sm:inline">
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
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-brand-primary text-white shadow-sm shadow-brand-primary/20 ring-1 ring-brand-primary'
                    : 'bg-surface-secondary text-text-secondary border border-white/10 hover:border-white/20 hover:text-text-primary hover:bg-surface-elevated'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Icon
                  className={`h-3.5 w-3.5 ${isActive ? 'text-white' : 'text-text-tertiary'}`}
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
                      isActive ? 'text-white/80 hover:text-white' : 'text-text-tertiary hover:text-text-primary'
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
          className="absolute z-30 left-0 sm:left-16 mt-2 max-w-sm rounded-xl border border-brand-primary/30 bg-surface-elevated p-3.5 text-xs text-text-primary shadow-xl animate-in fade-in"
        >
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <span className="font-bold text-brand-primary flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              <span>How Best Overall Works</span>
            </span>
            <button
              type="button"
              onClick={() => setShowTooltipFor(null)}
              className="text-text-tertiary hover:text-text-primary cursor-pointer"
              aria-label="Close tooltip"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-text-secondary leading-relaxed">
            Yatrai balances travel time (35%), total cost (30%), transfers (20%), and convenience (15%) to find routes that offer the best overall trade-offs.
          </p>
        </div>
      )}
    </div>
  );
}

export default RankingSelector;
