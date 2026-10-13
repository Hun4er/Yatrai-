import React, { useState } from 'react';
import SearchForm from '../components/search/SearchForm.jsx';
import NaturalSearchForm from '../components/search/NaturalSearchForm.jsx';
import {
  Sparkles,
  SlidersHorizontal,
  Compass,
  ShieldCheck,
  Ticket,
} from 'lucide-react';

/**
 * HomePage Component
 *
 * Cinematic railway discovery homepage matching the Graphite & Amber design reference.
 * Fully responsive for all screen sizes:
 * - Mobile (320px - 639px): Mobile-optimized hero typography, dark contrast wash, paired search fields, compact cards
 * - Tablet (640px - 1023px): Two-row structured search layout, balanced hero proportion
 * - Desktop (>= 1024px): Seamless horizontal search row, expansive cinematic composition
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
  const [activeTab, setActiveTab] = useState('structured');
  const [imgError, setImgError] = useState(false);

  return (
    <div className="relative min-h-[calc(100vh-64px)] w-full bg-[#0B0D10] text-[#F0F1F3] overflow-x-hidden flex flex-col justify-between font-sans">
      {/* ===================== HERO SECTION ===================== */}
      <section className="relative w-full pt-8 sm:pt-12 md:pt-16 pb-10 sm:pb-14 md:pb-20 px-3.5 sm:px-6 lg:px-8">
        {/* Cinematic Photograph Background */}
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          {!imgError ? (
            <img
              src="/hero-train.jpg"
              alt="Indian Passenger Train traveling across a viaduct through mountain terrain at sunset"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover object-center sm:object-right md:object-center opacity-80 sm:opacity-85"
            />
          ) : (
            <div
              className="h-full w-full bg-[#0B0D10]"
              style={{
                backgroundImage:
                  'radial-gradient(ellipse at 80% 30%, rgba(232, 176, 74, 0.18) 0%, rgba(11, 13, 16, 0.95) 70%)',
              }}
            />
          )}

          {/* Editorial Gradient Overlays:
              Mobile (<640px): Uniform dark wash across width ensures crisp typography legibility
              Desktop (>=640px): Rich gradient fading to right revealing the warm sunset train viaduct
          */}
          <div
            className="absolute inset-0 sm:hidden"
            style={{
              background:
                'linear-gradient(to bottom, rgba(11, 13, 16, 0.92) 0%, rgba(11, 13, 16, 0.85) 50%, rgba(11, 13, 16, 0.97) 100%)',
            }}
          />
          <div
            className="hidden sm:block absolute inset-0"
            style={{
              background:
                'linear-gradient(to right, rgba(11, 13, 16, 0.98) 0%, rgba(11, 13, 16, 0.88) 38%, rgba(11, 13, 16, 0.45) 70%, rgba(11, 13, 16, 0.75) 100%)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to bottom, rgba(11, 13, 16, 0.5) 0%, transparent 20%, transparent 70%, #0B0D10 100%)',
            }}
          />
        </div>

        {/* Content Container */}
        <div className="relative z-10 mx-auto max-w-5xl">
          {/* Hero Typography */}
          <div className="space-y-3 sm:space-y-4 max-w-xl pb-6 sm:pb-8 md:pb-10">
            {/* Eyebrow */}
            <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em] sm:tracking-[0.22em] text-[#E8B04A]">
              SIMPLER TRAIN TRAVEL
            </div>

            {/* Headline */}
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-[58px] font-normal tracking-tight text-[#F0F1F3] leading-[1.1] sm:leading-[1.08]">
              ONE GOAL
              <br />
              DIFFERENT ROUTE
            </h1>

            {/* Supporting Copy */}
            <p className="text-xs sm:text-sm md:text-base text-[#A7AFBA] leading-relaxed max-w-md">
              Compare trains, check availability and book with confidence. All in one place.
            </p>
          </div>

          {/* Mode Switcher (Station Search vs Natural Language) */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 sm:mb-3 px-1">
            <div className="inline-flex items-center rounded-lg bg-[#181C22]/90 p-0.5 border border-[#303640] backdrop-blur-sm shadow-inner">
              <button
                type="button"
                onClick={() => setActiveTab('structured')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 sm:px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${activeTab === 'structured'
                    ? 'bg-[#E8B04A] text-[#0B0D10] font-semibold shadow-sm'
                    : 'text-[#A7AFBA] hover:text-[#F0F1F3]'
                  }`}
                aria-pressed={activeTab === 'structured'}
              >
                <SlidersHorizontal className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                <span>Station Search</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('natural')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 sm:px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${activeTab === 'natural'
                    ? 'bg-[#E8B04A] text-[#0B0D10] font-semibold shadow-sm'
                    : 'text-[#A7AFBA] hover:text-[#F0F1F3]'
                  }`}
                aria-pressed={activeTab === 'natural'}
              >
                <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                <span>Natural Language</span>
              </button>
            </div>

            <span className="hidden sm:inline-block text-[11px] text-[#7E8794]">
              {activeTab === 'structured'
                ? 'Direct station code & route search'
                : 'Conversational travel intent discovery'}
            </span>
          </div>

          {/* Search Panel Component */}
          <div className="w-full">
            {activeTab === 'structured' ? (
              <SearchForm
                initialOrigin={initialOrigin}
                initialDestination={initialDestination}
                initialDate={initialDate}
                onSearch={onSearch}
                isLoading={isLoading}
              />
            ) : (
              <NaturalSearchForm
                onSearch={onNaturalSearch}
                onSwitchToStructured={() => setActiveTab('structured')}
                isLoading={isLoading}
                clarificationState={clarificationState}
                onResolveClarification={onResolveClarification}
              />
            )}
          </div>
        </div>
      </section>

      {/* ===================== FEATURE HIGHLIGHTS ===================== */}
      <section className="relative z-10 w-full px-3.5 sm:px-6 lg:px-8 py-6 sm:py-10 md:py-12 bg-[#0B0D10]">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-6 md:gap-8 pt-4 border-t border-[#303640]/40">
            {/* Feature 1: Compare options */}
            <div className="flex items-start gap-3.5 sm:gap-4 p-3.5 sm:p-0 rounded-xl sm:rounded-none border sm:border-0 border-[#303640]/30 bg-[#12151A]/40 sm:bg-transparent">
              <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border border-[#303640] bg-[#12151A] text-[#A7AFBA] shadow-inner">
                <Compass className="h-4 w-4 sm:h-5 sm:w-5 text-[#A7AFBA]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-[#F0F1F3]">Compare options</h3>
                <p className="text-[11px] sm:text-xs text-[#7E8794] leading-relaxed mt-0.5 sm:mt-1">
                  See times, duration and fares in one place
                </p>
              </div>
            </div>

            {/* Feature 2: Trusted information */}
            <div className="flex items-start gap-3.5 sm:gap-4 p-3.5 sm:p-0 rounded-xl sm:rounded-none border sm:border-0 border-[#303640]/30 bg-[#12151A]/40 sm:bg-transparent">
              <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border border-[#303640] bg-[#12151A] text-[#A7AFBA] shadow-inner">
                <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-[#A7AFBA]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-[#F0F1F3]">Trusted information</h3>
                <p className="text-[11px] sm:text-xs text-[#7E8794] leading-relaxed mt-0.5 sm:mt-1">
                  Provider data clearly marked
                </p>
              </div>
            </div>

            {/* Feature 3: Easy booking */}
            <div className="flex items-start gap-3.5 sm:gap-4 p-3.5 sm:p-0 rounded-xl sm:rounded-none border sm:border-0 border-[#303640]/30 bg-[#12151A]/40 sm:bg-transparent">
              <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border border-[#303640] bg-[#12151A] text-[#A7AFBA] shadow-inner">
                <Ticket className="h-4 w-4 sm:h-5 sm:w-5 text-[#A7AFBA]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-[#F0F1F3]">Easy booking</h3>
                <p className="text-[11px] sm:text-xs text-[#7E8794] leading-relaxed mt-0.5 sm:mt-1">
                  A simpler, more confident journey
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default HomePage;
