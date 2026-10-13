import React from 'react';
import { RouteOff, ArrowLeft } from 'lucide-react';

/**
 * EmptyState Component
 *
 * Rendered when a search completes successfully (HTTP 200) but no journeys are found.
 * Provides actionable suggestions: removing budget limits, allowing transfers, or changing departure date.
 */
export function EmptyState({ onModifySearch }) {
  return (
    <div className="mx-auto max-w-xl rounded-card border border-border-default bg-surface-primary p-7 sm:p-9 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-control bg-surface-secondary text-text-secondary border border-border-default">
        <RouteOff className="h-7 w-7 text-text-secondary" aria-hidden="true" />
      </div>

      <h3 className="mt-5 text-xl sm:text-2xl font-bold tracking-tight text-text-primary">
        No journey found
      </h3>

      <p className="mt-2 text-sm text-text-secondary leading-relaxed max-w-md mx-auto">
        We couldn&apos;t find a route matching your criteria across available transport providers.
      </p>

      {/* Helpful suggestions */}
      <div className="mt-6 rounded-control border border-border-default bg-surface-secondary p-4 text-left max-w-sm mx-auto">
        <div className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-2">
          Try:
        </div>
        <ul className="space-y-1.5 text-xs text-text-secondary">
          <li className="flex items-center gap-2">
            <span className="text-text-muted">•</span>
            <span>Removing any budget or time limits</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-text-muted">•</span>
            <span>Allowing multi-modal transfers</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-text-muted">•</span>
            <span>Changing your departure date</span>
          </li>
        </ul>
      </div>

      {onModifySearch && (
        <div className="mt-6">
          <button
            type="button"
            onClick={onModifySearch}
            className="inline-flex items-center gap-2 rounded-control bg-amber-accent px-6 py-2.5 text-xs sm:text-sm font-semibold text-amber-on hover:bg-amber-hover transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-accent focus:ring-offset-2 focus:ring-offset-graphite-bg"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Modify search</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default EmptyState;
