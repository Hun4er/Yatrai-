import React from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

/**
 * ErrorState Component
 *
 * Displays a clean, non-leaking error banner when the backend journey search fails.
 * Provides explicit recovery actions: Retry current search or modify parameters.
 */
export function ErrorState({
  title = 'Unable to find routes',
  message = "We couldn't complete the journey search. Please verify your connection and try again.",
  onRetry,
  onModifySearch,
}) {
  return (
    <div
      role="alert"
      className="mx-auto max-w-2xl rounded-card border border-border-default bg-surface-primary p-7 sm:p-9 text-center"
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-control bg-surface-secondary text-semantic-error border border-border-default">
        <AlertTriangle className="h-7 w-7 text-semantic-error" aria-hidden="true" />
      </div>

      <h3 className="mt-5 text-xl font-bold tracking-tight text-text-primary">{title}</h3>
      <p className="mt-2 text-sm text-text-secondary leading-relaxed max-w-md mx-auto">
        {message}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-control bg-amber-accent px-5 py-2.5 text-sm font-semibold text-amber-on hover:bg-amber-hover transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-accent focus:ring-offset-2 focus:ring-offset-graphite-bg"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span>Try Again</span>
          </button>
        )}

        {onModifySearch && (
          <button
            type="button"
            onClick={onModifySearch}
            className="inline-flex items-center gap-2 rounded-control border border-border-strong bg-surface-primary px-5 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-secondary hover:border-border-strong transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-border-strong focus:ring-offset-2 focus:ring-offset-graphite-bg"
          >
            <ArrowLeft className="h-4 w-4 text-text-secondary" aria-hidden="true" />
            <span>Modify Search</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default ErrorState;
