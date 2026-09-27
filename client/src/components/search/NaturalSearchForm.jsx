import React, { useState } from 'react';
import {
  Sparkles,
  Search,
  Loader2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';

/**
 * NaturalSearchForm Component
 *
 * Natural language travel intent input for Yatrai (Phase 11).
 * Allows users to state travel plans naturally, handles clarification states,
 * and passes the interpreted request to the deterministic journey engine.
 */
export function NaturalSearchForm({
  onSearch,
  onSwitchToStructured,
  isLoading = false,
  clarificationState = null,
  onResolveClarification,
}) {
  const [query, setQuery] = useState('');
  const [clarificationValue, setClarificationValue] = useState('');
  const [validationError, setValidationError] = useState('');

  const sampleQueries = [
    'I need to reach Patna from Sonipat tomorrow morning under ₹1500',
    'Sonipat to Patna by train on 2026-10-01',
    'Cheapest route from Sonipat to Patna next Monday',
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLoading) return;

    if (!query.trim()) {
      setValidationError('Please enter your travel request in natural language.');
      return;
    }

    setValidationError('');
    onSearch(query.trim());
  };

  const handleClarificationSubmit = (e) => {
    e.preventDefault();
    if (!clarificationValue.trim()) return;

    if (onResolveClarification) {
      onResolveClarification(clarificationValue.trim());
    }
  };

  return (
    <div className="w-full max-w-4xl space-y-4">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-white/10 bg-surface-primary p-6 sm:p-7 shadow-xl space-y-4 transition-all"
        aria-label="Natural Language Journey Search"
      >
        <div className="flex items-center justify-between">
          <label
            htmlFor="natural-query-input"
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-primary"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>Describe Your Journey Naturally</span>
          </label>

          {onSwitchToStructured && (
            <button
              type="button"
              onClick={onSwitchToStructured}
              className="text-xs text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
            >
              Use structured form →
            </button>
          )}
        </div>

        {/* Query Input Area */}
        <div className="relative">
          <textarea
            id="natural-query-input"
            name="query"
            rows={3}
            disabled={isLoading}
            placeholder="e.g. I need to reach Patna from Sonipat tomorrow morning and I don't want to spend more than ₹1500..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (validationError) setValidationError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                handleSubmit(e);
              }
            }}
            className={`w-full rounded-xl border bg-surface-secondary p-4 text-sm text-text-primary placeholder:text-text-disabled transition-all focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary resize-none ${
              validationError ? 'border-semantic-error' : 'border-white/10'
            }`}
          />
        </div>

        {validationError && (
          <p className="text-xs text-semantic-error flex items-center gap-1.5" role="alert">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{validationError}</span>
          </p>
        )}

        {/* Action Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          {/* Example query suggestions */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-tertiary">
            <span className="font-semibold text-text-secondary">Try:</span>
            {sampleQueries.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setQuery(sample)}
                className="rounded-lg bg-surface-secondary px-2.5 py-1 text-[11px] text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer text-left"
              >
                &ldquo;{sample}&rdquo;
              </button>
            ))}
          </div>

          <button
            type="submit"
            id="natural-search-submit-btn"
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-primary px-6 py-3 text-sm font-semibold text-white shadow-md shadow-brand-primary/25 hover:bg-brand-hover active:bg-brand-active disabled:opacity-60 disabled:cursor-not-allowed transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary shrink-0"
            aria-busy={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Interpreting intent...</span>
              </>
            ) : (
              <>
                <Search className="h-4 w-4" aria-hidden="true" />
                <span>Find Routes</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Clarification State Banner (Section 25) */}
      {clarificationState && (
        <div
          role="region"
          aria-label="Clarification needed"
          className="rounded-2xl border border-semantic-warning/30 bg-surface-primary p-5 shadow-lg space-y-3 animate-in fade-in"
        >
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-semantic-warning">
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
            <span>Additional Information Needed</span>
          </div>

          <p className="text-sm font-medium text-text-primary">
            {clarificationState.message}
          </p>

          <form onSubmit={handleClarificationSubmit} className="flex gap-2">
            <input
              type="text"
              autoFocus
              placeholder={`Enter missing ${clarificationState.missingFields?.join(', ')}...`}
              value={clarificationValue}
              onChange={(e) => setClarificationValue(e.target.value)}
              className="flex-1 rounded-xl border border-white/10 bg-surface-secondary px-4 py-2.5 text-xs text-text-primary placeholder:text-text-disabled focus:border-brand-primary focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-hover cursor-pointer"
            >
              <span>Continue</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default NaturalSearchForm;
