import React, { useState } from 'react';
import SearchForm from '../components/search/SearchForm.jsx';
import NaturalSearchForm from '../components/search/NaturalSearchForm.jsx';
import { APP_NAME, APP_TAGLINE } from '../constants/index.js';
import { Compass, Sparkles, Shield, SlidersHorizontal } from 'lucide-react';

/**
 * HomePage Component
 *
 * Dedicated search discovery page for Yatrai.
 * Supports both Natural Language Intent Discovery (Phase 11) and
 * Deterministic Structured Form Search.
 */
export function HomePage({
  initialOrigin = '',
  initialDestination = '',
  initialDate = '',
  onSearch,
  onNaturalSearch,
  isLoading = false,
  clarificationState = null,
  onResolveClarification,
}) {
  const [activeTab, setActiveTab] = useState('natural'); // 'natural' | 'structured'

  return (
    <div className="flex flex-col items-center justify-center space-y-8 py-6 sm:py-10">
      {/* Brand Hero Heading */}
      <div className="text-center space-y-4 max-w-2xl px-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3.5 py-1 text-xs font-semibold text-brand-primary border border-brand-primary/20">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Intelligent Multi-Modal Discovery</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-text-primary">
          {APP_NAME}
        </h1>

        <p className="text-lg sm:text-xl font-medium text-brand-primary">
          {APP_TAGLINE}
        </p>

        <p className="text-sm sm:text-base text-text-secondary leading-relaxed max-w-lg mx-auto">
          Describe where you want to go in plain English, or use structured criteria.
          Yatrai resolves your travel intent and discovers connected routes across all transport modes.
        </p>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center rounded-xl bg-surface-secondary/80 p-1 border border-white/10 shadow-inner">
        <button
          type="button"
          onClick={() => setActiveTab('natural')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'natural'
              ? 'bg-brand-primary text-white shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
          aria-pressed={activeTab === 'natural'}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Natural Language</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('structured')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'structured'
              ? 'bg-brand-primary text-white shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
          aria-pressed={activeTab === 'structured'}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Structured Search</span>
        </button>
      </div>

      {/* Search Input Container */}
      <div className="w-full flex justify-center px-2">
        {activeTab === 'natural' ? (
          <NaturalSearchForm
            onSearch={onNaturalSearch}
            onSwitchToStructured={() => setActiveTab('structured')}
            isLoading={isLoading}
            clarificationState={clarificationState}
            onResolveClarification={onResolveClarification}
          />
        ) : (
          <SearchForm
            initialOrigin={initialOrigin}
            initialDestination={initialDestination}
            initialDate={initialDate}
            onSearch={onSearch}
            isLoading={isLoading}
          />
        )}
      </div>

      {/* Core Highlights / Trust Indicators */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 max-w-4xl w-full px-4 pt-4">
        <div className="flex items-center gap-3.5 rounded-xl border border-white/5 bg-surface-primary/60 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-brand-primary border border-white/5">
            <Compass className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs font-semibold text-text-primary">Cross-Modal Routing</div>
            <div className="text-[11px] text-text-secondary">Rail, bus, air, and road connections.</div>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-xl border border-white/5 bg-surface-primary/60 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-brand-primary border border-white/5">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs font-semibold text-text-primary">Multi-Criteria Ranking</div>
            <div className="text-[11px] text-text-secondary">Fastest, cheapest, or fewest transfers.</div>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-xl border border-white/5 bg-surface-primary/60 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-brand-primary border border-white/5">
            <Shield className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs font-semibold text-text-primary">Canonical Validation</div>
            <div className="text-[11px] text-text-secondary">Strict spatial and temporal leg continuity.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
