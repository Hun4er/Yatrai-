import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, Circle } from 'lucide-react';

const ORCHESTRATION_STAGES = [
  'Resolving stations...',
  'Searching direct trains...',
  'Checking confirmed-seat availability...',
  'Finding alternative routes...',
  'Validating connections...',
  'Preparing results...',
];

/**
 * LoadingState Component
 *
 * Communicates Yatrai's multi-stage orchestration pipeline:
 * 1. Understanding your trip
 * 2. Resolving locations
 * 3. Checking transport providers
 * 4. Finding direct journeys
 * 5. Building connected journeys
 * 6. Comparing time, cost and transfers
 * 7. Ranking your options
 */
export function LoadingState({ message = null, activeStageIndex = null }) {
  const [currentStage, setCurrentStage] = useState(activeStageIndex ?? 0);

  useEffect(() => {
    if (activeStageIndex !== null && activeStageIndex !== undefined) {
      setCurrentStage(activeStageIndex);
      return;
    }

    // Progress naturally across stages while background orchestration runs
    const interval = setInterval(() => {
      setCurrentStage((prev) => {
        if (prev < ORCHESTRATION_STAGES.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 700);

    return () => clearInterval(interval);
  }, [activeStageIndex]);

  const activeMessage = message || ORCHESTRATION_STAGES[currentStage] || 'Orchestrating journey routes...';

  return (
    <div className="space-y-6 max-w-4xl mx-auto" role="status" aria-live="polite">
      {/* Orchestration Stage Tracker Card */}
      <div className="rounded-2xl border border-white/10 bg-surface-primary p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary/10 border border-brand-primary/20 text-brand-primary">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary">
                Yatrai Journey Orchestrator
              </h3>
              <p className="text-xs text-brand-primary font-medium">
                {activeMessage}
              </p>
            </div>
          </div>

          <div className="text-right text-[11px] text-text-tertiary font-mono">
            Step {Math.min(currentStage + 1, ORCHESTRATION_STAGES.length)} of {ORCHESTRATION_STAGES.length}
          </div>
        </div>

        {/* Progress Stages Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-1">
          {ORCHESTRATION_STAGES.slice(0, 4).map((stage, idx) => {
            const isCompleted = currentStage > idx;
            const isCurrent = currentStage === idx;
            return (
              <div
                key={idx}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs transition-all ${
                  isCurrent
                    ? 'border border-brand-primary/40 bg-brand-soft/60 text-text-primary font-semibold'
                    : isCompleted
                      ? 'border border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
                      : 'border border-white/5 bg-surface-secondary/40 text-text-disabled'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                ) : isCurrent ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-primary" aria-hidden="true" />
                ) : (
                  <Circle className="h-3.5 w-3.5 shrink-0 text-text-disabled" aria-hidden="true" />
                )}
                <span className="truncate">{stage.replace('...', '')}</span>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {ORCHESTRATION_STAGES.slice(4).map((stage, idx) => {
            const actualIdx = idx + 4;
            const isCompleted = currentStage > actualIdx;
            const isCurrent = currentStage === actualIdx;
            return (
              <div
                key={actualIdx}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs transition-all ${
                  isCurrent
                    ? 'border border-brand-primary/40 bg-brand-soft/60 text-text-primary font-semibold'
                    : isCompleted
                      ? 'border border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
                      : 'border border-white/5 bg-surface-secondary/40 text-text-disabled'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                ) : isCurrent ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-primary" aria-hidden="true" />
                ) : (
                  <Circle className="h-3.5 w-3.5 shrink-0 text-text-disabled" aria-hidden="true" />
                )}
                <span className="truncate">{stage.replace('...', '')}</span>
              </div>
            );
          })}
        </div>
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
              <div className="h-5 w-28 rounded-full bg-white/10" />
              <div className="h-5 w-20 rounded-full bg-white/10" />
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
                <div className="h-4 w-20 rounded bg-white/5" />
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
