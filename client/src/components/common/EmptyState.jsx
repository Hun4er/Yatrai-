import React from 'react';
import { RouteOff, ArrowLeft, RefreshCw } from 'lucide-react';

/**
 * EmptyState Component
 *
 * Rendered when a search completes successfully (HTTP 200) but no journeys are found.
 * Provides actionable suggestions: removing budget limits, allowing transfers, or changing departure date.
 */
export function EmptyState({ onModifySearch }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-surface-primary p-7 sm:p-9 text-center shadow-xl">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-elevated text-brand-primary border border-white/10 shadow-inner">
        <RouteOff className="h-7 w-7" aria-hidden="true" />
      </div>

      <h3 className="mt-5 text-xl sm:text-2xl font-extrabold tracking-tight text-text-primary">
        No journey found
      </h3>

      <p className="mt-2 text-sm text-text-secondary leading-relaxed max-w-md mx-auto">
        We couldn&apos;t find a route matching your criteria across available transport providers.
      </p>

      {/* Helpful suggestions */}
      <div className="mt-6 rounded-xl border border-white/5 bg-surface-secondary/70 p-4 text-left max-w-sm mx-auto">
        <div className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-2">
          Try:
        </div>
        <ul className="space-y-1.5 text-xs text-text-secondary">
          <li className="flex items-center gap-2">
            <span className="text-brand-primary">•</span>
            <span>Removing any budget or time limits</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-brand-primary">•</span>
            <span>Allowing multi-modal transfers</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-brand-primary">•</span>
            <span>Changing your departure date</span>
          </li>
        </ul>
      </div>

      {onModifySearch && (
        <div className="mt-6">
          <button
            type="button"
            onClick={onModifySearch}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-6 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-md shadow-brand-primary/25 hover:bg-brand-hover active:bg-brand-active transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary"
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
