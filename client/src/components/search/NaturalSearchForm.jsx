import React, { useState } from 'react';
import {
  Sparkles,
  Search,
  Loader2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';
import journeyService from '../../services/journeyService.js';
import SearchIntentSummary from './SearchIntentSummary.jsx';

/**
 * NaturalSearchForm Component
 *
 * Natural language travel intent input for Yatrai (Phase 11 + Section 2 & 3).
 * Allows users to state travel plans naturally, interprets intent and location
 * candidates before search execution, and provides location disambiguation.
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
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [interpretation, setInterpretation] = useState(null);

  const sampleQueries = [
    'I need to go to patna from sonepat tomorrow',
    'Sonipat to Patna by train on 2026-10-10 under ₹1500',
    'Cheapest route from Sonipat to Patna next Monday',
  ];

  const handleInterpretAndSubmit = async (textToParse) => {
    const targetQuery = textToParse || query;
    if (!targetQuery || !targetQuery.trim()) {
      setValidationError('Please enter your travel request in natural language.');
      return;
    }

    setValidationError('');
    setIsInterpreting(true);

    try {
      const response = await journeyService.interpretJourneyIntent({
        query: targetQuery.trim(),
      });

      if (response?.status === 'needs_clarification' || response?.data?.status === 'needs_clarification') {
        setIsInterpreting(false);
        // Fallback to direct search handler which manages clarification
        onSearch(targetQuery.trim());
        return;
      }

      const interpData = response?.data || response;
      if (interpData?.parsedRequest) {
        setInterpretation({
          ...interpData,
          rawQuery: targetQuery.trim(),
        });
      } else {
        // Direct search fallback
        onSearch(targetQuery.trim());
      }
    } catch {
      // If interpret endpoint fails, fallback to direct search
      onSearch(targetQuery.trim());
    } finally {
      setIsInterpreting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLoading || isInterpreting) return;
    handleInterpretAndSubmit(query);
  };

  const handleClarificationSubmit = (e) => {
    e.preventDefault();
    if (!clarificationValue.trim()) return;

    if (onResolveClarification) {
      onResolveClarification(clarificationValue.trim());
    }
  };

  // If interpretation is present and user is reviewing intent before final search
  if (interpretation && !isLoading) {
    return (
      <SearchIntentSummary
        interpretation={interpretation}
        onConfirmSearch={(confirmedParams) => {
          onSearch(confirmedParams);
        }}
        onEditQuery={() => setInterpretation(null)}
        isLoading={isLoading}
      />
    );
  }

  return (
    <div className="w-full max-w-5xl space-y-4 font-sans">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-[#303640] bg-[#181C22] p-5 sm:p-6 shadow-2xl space-y-4 transition-all"
        aria-label="Natural Language Journey Search"
      >
        <div className="flex items-center justify-between">
          <label
            htmlFor="natural-query-input"
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-500"
          >
            <Sparkles className="h-4 w-4 text-ink-500" aria-hidden="true" />
            <span>Describe Your Journey Naturally</span>
          </label>

          {onSwitchToStructured && (
            <button
              type="button"
              onClick={onSwitchToStructured}
              className="text-xs text-ink-500 hover:text-ink-900 transition-colors cursor-pointer"
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
            disabled={isLoading || isInterpreting}
            placeholder="e.g. I need to go to Patna from Sonepat tomorrow..."
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
            className={`w-full rounded-xl border bg-graphite-850 p-4 text-sm text-ink-900 placeholder:text-ink-400 transition-all focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none ${
              validationError ? 'border-danger-500' : 'border-graphite-800'
            }`}
          />
        </div>

        {validationError && (
          <p className="text-xs text-danger-500 flex items-center gap-1.5" role="alert">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{validationError}</span>
          </p>
        )}

        {/* Action Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          {/* Example query suggestions */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
            <span className="font-semibold text-ink-500">Try:</span>
            {sampleQueries.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setQuery(sample);
                  handleInterpretAndSubmit(sample);
                }}
                className="rounded-lg bg-graphite-850 px-2.5 py-1 text-[11px] text-ink-500 hover:text-ink-900 hover:bg-graphite-800 border border-graphite-800/80 transition-colors cursor-pointer text-left"
              >
                &ldquo;{sample}&rdquo;
              </button>
            ))}
          </div>

          <button
            type="submit"
            id="natural-search-submit-btn"
            disabled={isLoading || isInterpreting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 px-6 py-3 text-sm font-semibold text-graphite-950 shadow-md transition-all duration-150 ease-out disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-graphite-950 shrink-0"
            aria-busy={isLoading || isInterpreting}
          >
            {isInterpreting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-graphite-950" aria-hidden="true" />
                <span>Interpreting trip...</span>
              </>
            ) : isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-graphite-950" aria-hidden="true" />
                <span>Searching journeys...</span>
              </>
            ) : (
              <>
                <Search className="h-4 w-4 text-graphite-950" aria-hidden="true" />
                <span>Find Trains</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Clarification State Banner */}
      {clarificationState && (
        <div
          role="region"
          aria-label="Clarification needed"
          className="rounded-xl border border-amber-500/40 bg-graphite-900 p-5 shadow-lg space-y-3 animate-in fade-in"
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-500">
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
            <span>Additional Information Needed</span>
          </div>

          <p className="text-sm font-medium text-ink-900">
            {clarificationState.message}
          </p>

          <form onSubmit={handleClarificationSubmit} className="flex gap-2">
            <input
              type="text"
              autoFocus
              placeholder={`Enter missing ${clarificationState.missingFields?.join(', ')}...`}
              value={clarificationValue}
              onChange={(e) => setClarificationValue(e.target.value)}
              className="flex-1 rounded-xl border border-graphite-800 bg-graphite-850 px-4 py-2.5 text-xs text-ink-900 placeholder:text-ink-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2.5 text-xs font-semibold text-graphite-950 shadow-sm cursor-pointer"
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
