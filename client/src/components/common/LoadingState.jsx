import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * LoadingState Component
 *
 * Renders a calm, non-distracting loading skeleton and indicator
 * while the Journey Orchestrator evaluates routes across providers.
 */
export function LoadingState({ message = 'Searching routes across transport providers...' }) {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      {/* Loading banner */}
      <div className="flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-surface-primary p-6 text-center shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin text-brand-primary" aria-hidden="true" />
        <span className="text-sm font-medium text-text-primary">{message}</span>
      </div>

      {/* Skeletons mimicking Journey Cards */}
      <div className="space-y-4">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="animate-pulse rounded-2xl border border-white/5 bg-surface-primary p-6 space-y-4"
          >
            {/* Top row skeleton */}
            <div className="flex justify-between items-center">
              <div className="h-5 w-24 rounded-full bg-white/10" />
              <div className="h-5 w-16 rounded-full bg-white/10" />
            </div>

            {/* Middle route skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center py-2">
              <div className="sm:col-span-8 flex items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="h-7 w-20 rounded bg-white/10" />
                  <div className="h-4 w-28 rounded bg-white/5" />
                </div>
                <div className="flex-1 max-w-[140px] space-y-2">
                  <div className="h-3 w-16 mx-auto rounded bg-white/10" />
                  <div className="h-1 w-full rounded bg-white/5" />
                </div>
                <div className="space-y-2 text-right">
                  <div className="h-7 w-20 ml-auto rounded bg-white/10" />
                  <div className="h-4 w-28 ml-auto rounded bg-white/5" />
                </div>
              </div>
              <div className="sm:col-span-4 flex flex-col items-end space-y-2 sm:pl-6">
                <div className="h-4 w-16 rounded bg-white/5" />
                <div className="h-7 w-24 rounded bg-white/10" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default LoadingState;
