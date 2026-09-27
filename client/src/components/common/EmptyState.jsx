import React from 'react';
import { RouteOff, ArrowLeft, Lightbulb } from 'lucide-react';

/**
 * EmptyState Component
 *
 * Rendered when a search completes successfully (HTTP 200) but no routes are found.
 * Provides helpful suggestions and a quick button to modify search criteria.
 */
export function EmptyState({ onModifySearch }) {
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-surface-primary p-8 text-center shadow-lg">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-elevated text-brand-primary border border-white/10">
        <RouteOff className="h-7 w-7" aria-hidden="true" />
      </div>

      <h3 className="mt-5 text-xl font-bold tracking-tight text-text-primary">No routes found</h3>
      <p className="mt-2 text-sm text-text-secondary leading-relaxed max-w-md mx-auto">
        We couldn&apos;t find a journey matching your search criteria. The requested route may not
        have scheduled transit on this date.
      </p>

      {/* Helpful suggestions */}
      <div className="mt-6 rounded-xl border border-white/5 bg-surface-secondary/70 p-4 text-left max-w-md mx-auto">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-primary">
          <Lightbulb className="h-4 w-4" aria-hidden="true" />
          <span>Suggestions</span>
        </div>
        <ul className="mt-2 space-y-1.5 text-xs text-text-secondary">
          <li>• Try searching for a nearby major city or railway junction.</li>
          <li>• Check for alternate departure dates.</li>
          <li>• Allow different transportation modes or connecting journeys.</li>
        </ul>
      </div>

      {onModifySearch && (
        <div className="mt-6">
          <button
            type="button"
            onClick={onModifySearch}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-hover active:bg-brand-active transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Modify Search</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default EmptyState;
