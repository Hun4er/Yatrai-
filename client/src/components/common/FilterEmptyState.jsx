import React from 'react';
import { FilterX, RotateCcw } from 'lucide-react';

/**
 * FilterEmptyState Component
 *
 * Rendered when backend returned valid journeys, but the user's active
 * filter constraints eliminated all of them. Provides an immediate [ Clear Filters ] CTA.
 */
export function FilterEmptyState({ onClearFilters }) {
  return (
    <div
      role="status"
      className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-surface-primary p-8 text-center shadow-lg animate-in fade-in"
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-secondary text-brand-primary border border-white/10">
        <FilterX className="h-7 w-7" aria-hidden="true" />
      </div>

      <h3 className="mt-5 text-xl font-bold tracking-tight text-text-primary">
        No journeys match your filters
      </h3>
      <p className="mt-2 text-sm text-text-secondary leading-relaxed max-w-md mx-auto">
        Your current price, duration, transfer, or departure time criteria excluded all available routes.
        Try broadening your filters to see more options.
      </p>

      {onClearFilters && (
        <div className="mt-6">
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-primary/20 hover:bg-brand-hover active:bg-brand-active transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>Clear Filters</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default FilterEmptyState;
