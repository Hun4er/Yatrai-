import React from 'react';
import { Sparkles, Zap, DollarSign, Shuffle, Compass } from 'lucide-react';

export const RANKING_OPTIONS = [
  { id: 'overall', label: 'Best Overall', icon: Sparkles },
  { id: 'fastest', label: 'Fastest', icon: Zap },
  { id: 'cheapest', label: 'Cheapest', icon: DollarSign },
  { id: 'fewest_transfers', label: 'Fewest Transfers', icon: Shuffle },
  { id: 'most_convenient', label: 'Most Convenient', icon: Compass },
];

/**
 * RankingSelector Component
 *
 * Exposes ranking strategy tabs matching the Phase 7 & 8 backend ranking engine.
 * Selecting a tab requests re-ranking from the backend. The frontend NEVER sorts locally.
 */
export function RankingSelector({ activeRanking = 'overall', onSelect, disabled = false }) {
  return (
    <div
      role="tablist"
      aria-label="Journey Ranking Strategies"
      className="flex flex-wrap items-center gap-2 overflow-x-auto py-1 scrollbar-none"
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mr-1 hidden sm:inline">
        Rank by:
      </span>
      {RANKING_OPTIONS.map((option) => {
        const Icon = option.icon;
        const isActive = activeRanking === option.id;

        return (
          <button
            key={option.id}
            role="tab"
            aria-selected={isActive}
            disabled={disabled}
            onClick={() => {
              if (!isActive && onSelect) {
                onSelect(option.id);
              }
            }}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all cursor-pointer ${
              isActive
                ? 'bg-brand-primary text-white shadow-sm shadow-brand-primary/30 ring-1 ring-brand-primary'
                : 'bg-surface-secondary text-text-secondary border border-white/10 hover:border-white/20 hover:text-text-primary hover:bg-surface-elevated'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-white' : 'text-text-tertiary'}`} aria-hidden="true" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default RankingSelector;
