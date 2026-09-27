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
      className="mx-auto max-w-2xl rounded-2xl border border-semantic-error/30 bg-surface-primary p-8 text-center shadow-lg"
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-semantic-error/10 text-semantic-error border border-semantic-error/20">
        <AlertTriangle className="h-7 w-7" aria-hidden="true" />
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
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-hover active:bg-brand-active transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span>Try Again</span>
          </button>
        )}

        {onModifySearch && (
          <button
            type="button"
            onClick={onModifySearch}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface-secondary px-5 py-2.5 text-sm font-semibold text-text-primary hover:bg-surface-elevated hover:border-white/20 transition-all cursor-pointer focus:outline-none"
          >
            <ArrowLeft className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
            <span>Modify Search</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default ErrorState;
