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
      className="mx-auto max-w-xl rounded-card border border-border-default bg-surface-primary p-7 sm:p-9 text-center"
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-control bg-surface-secondary text-text-secondary border border-border-default">
        <FilterX className="h-7 w-7 text-text-secondary" aria-hidden="true" />
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
            className="inline-flex items-center gap-2 rounded-control bg-amber-accent px-5 py-2.5 text-sm font-semibold text-amber-on hover:bg-amber-hover transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-accent focus:ring-offset-2 focus:ring-offset-graphite-bg"
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
