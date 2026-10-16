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
        className="rounded-2xl border border-[#303640] bg-[#181C22]/95 backdrop-blur-md p-5 sm:p-6 shadow-2xl space-y-4 transition-all"
        aria-label="Natural Language Journey Search"
      >
        <div className="flex items-center justify-between">
          <label
            htmlFor="natural-query-input"
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#A7AFBA]"
          >
            <Sparkles className="h-4 w-4 text-[#E8B04A]" aria-hidden="true" />
            <span>Describe Your Journey Naturally</span>
          </label>

          {onSwitchToStructured && (
            <button
              type="button"
              onClick={onSwitchToStructured}
              className="text-xs text-[#A7AFBA] hover:text-[#E8B04A] transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>Use structured form</span>
              <span aria-hidden="true">→</span>
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
            className={`w-full rounded-xl border bg-[#15191F] p-4 text-sm font-medium text-[#F0F1F3] placeholder:text-[#7E8794] transition-all focus:border-[#E8B04A] focus:outline-none focus:ring-1 focus:ring-[#E8B04A]/30 resize-none ${
              validationError ? 'border-red-500/80 ring-1 ring-red-500/30' : 'border-[#303640] hover:border-[#3A414C]'
            }`}
          />
        </div>

        {validationError && (
          <p className="text-xs text-red-400 flex items-center gap-1.5" role="alert">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{validationError}</span>
          </p>
        )}

        {/* Action Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          {/* Example query suggestions */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#7E8794]">
            <span className="font-semibold text-[#A7AFBA]">Try:</span>
            {sampleQueries.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setQuery(sample);
                  handleInterpretAndSubmit(sample);
                }}
                className="rounded-lg bg-[#15191F] px-2.5 py-1 text-[11px] text-[#A7AFBA] hover:text-[#F0F1F3] hover:bg-[#303640]/50 border border-[#303640] transition-colors cursor-pointer text-left"
              >
                &ldquo;{sample}&rdquo;
              </button>
            ))}
          </div>

          <button
            type="submit"
            id="natural-search-submit-btn"
            disabled={isLoading || isInterpreting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#E8B04A] hover:bg-[#F2BE62] active:bg-[#D9A139] px-6 py-3 text-sm font-semibold text-[#0B0D10] shadow-lg transition-all duration-150 ease-out disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#E8B04A] focus:ring-offset-2 focus:ring-offset-[#0B0D10] shrink-0"
            aria-busy={isLoading || isInterpreting}
          >
            {isInterpreting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-[#0B0D10]" aria-hidden="true" />
                <span>Interpreting trip...</span>
              </>
            ) : isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-[#0B0D10]" aria-hidden="true" />
                <span>Searching journeys...</span>
              </>
            ) : (
              <>
                <Search className="h-4 w-4 text-[#0B0D10]" aria-hidden="true" />
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
          className="rounded-xl border border-[#E8B04A]/40 bg-[#181C22] p-5 shadow-lg space-y-3 animate-in fade-in"
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#E8B04A]">
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
            <span>Additional Information Needed</span>
          </div>

          <p className="text-sm font-medium text-[#F0F1F3]">
            {clarificationState.message}
          </p>

          <form onSubmit={handleClarificationSubmit} className="flex gap-2">
            <input
              type="text"
              autoFocus
              placeholder={`Enter missing ${clarificationState.missingFields?.join(', ')}...`}
              value={clarificationValue}
              onChange={(e) => setClarificationValue(e.target.value)}
              className="flex-1 rounded-xl border border-[#303640] bg-[#15191F] px-4 py-2.5 text-xs text-[#F0F1F3] placeholder:text-[#7E8794] focus:border-[#E8B04A] focus:outline-none focus:ring-1 focus:ring-[#E8B04A]/30"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#E8B04A] hover:bg-[#F2BE62] px-4 py-2.5 text-xs font-semibold text-[#0B0D10] shadow-sm cursor-pointer"
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
