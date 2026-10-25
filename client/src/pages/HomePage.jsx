import React, { useState, useEffect, useCallback, useRef } from 'react';
import SearchForm from '../components/search/SearchForm.jsx';
import NaturalSearchForm from '../components/search/NaturalSearchForm.jsx';
import QuickDiscoverySection from '../components/home/QuickDiscoverySection.jsx';
import FindAnotherWaySection from '../components/home/FindAnotherWaySection.jsx';
import JourneyPreviewSection from '../components/home/JourneyPreviewSection.jsx';
import JourneyComparisonSection from '../components/home/JourneyComparisonSection.jsx';
import HowItWorksSection from '../components/home/HowItWorksSection.jsx';
import TrustSection from '../components/home/TrustSection.jsx';
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
 * Production-grade railway journey discovery experience matching the Graphite & Amber design system.
 *
 * Features:
 * 1. Cinematic Hero with clear discovery value proposition & responsive SearchForm
 * 2. Quick Discovery (canonical popular routes + device/account recent searches)
 * 3. Interactive "Find Another Way" (alternative stations, connecting routes, comparison)
 * 4. Live Journey Discovery Preview (cached RailKit schedule preview with data metadata)
 * 5. Journey Comparison Preview ("Compare before you travel" trade-off evaluation)
 * 6. "How Yatrai works" 4-step workflow
 * 7. Trust & Transparency commitments
 * 8. Refined responsive footer integration
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

  // Synchronized search criteria states (populated from hero or lower discovery cards)
  const [origin, setOrigin] = useState(initialOrigin);
  const [destination, setDestination] = useState(initialDestination);
  const [departureDate, setDepartureDate] = useState(initialDate);

  const searchContainerRef = useRef(null);

  useEffect(() => {
    if (initialOrigin) setOrigin(initialOrigin);
    if (initialDestination) setDestination(initialDestination);
    if (initialDate) setDepartureDate(initialDate);
  }, [initialOrigin, initialDestination, initialDate]);

  /**
   * Populate search form from any discovery card and scroll up to the search panel smoothly.
   */
  const handleSelectRoute = useCallback(
    (route) => {
      const originVal = route.origin || route.from || '';
      const destVal = route.destination || route.to || '';
      const dateVal = route.departureDate || route.date || departureDate;

      setOrigin(originVal);
      setDestination(destVal);
      if (dateVal) setDepartureDate(dateVal);
      setActiveTab('structured');

      // Scroll smoothly to hero search controls
      if (searchContainerRef.current) {
        searchContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    [departureDate]
  );

  return (
    <div className="relative min-h-[calc(100vh-64px)] w-full bg-[#0B0D10] text-[#EDEFF2] overflow-x-hidden flex flex-col font-sans">
      {/* ===================== HERO SECTION ===================== */}
      <section className="home-hero-section relative z-20 w-full pt-8 sm:pt-12 md:pt-16 pb-10 sm:pb-14 md:pb-18 px-3.5 sm:px-6 lg:px-8 border-b border-[#232830]/80">
        {/* Cinematic Photograph Background */}
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          {!imgError ? (
            <img
              src="/hero-train.jpg"
              alt="Indian Passenger Train traveling across a viaduct through mountain terrain at sunset"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover object-center sm:object-right md:object-center opacity-70 sm:opacity-75"
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

          {/* Editorial Gradient Overlays: ensures crisp legibility across all viewport widths */}
          <div
            className="absolute inset-0 sm:hidden"
            style={{
              background:
                'linear-gradient(to bottom, rgba(11, 13, 16, 0.94) 0%, rgba(11, 13, 16, 0.88) 50%, rgba(11, 13, 16, 0.98) 100%)',
            }}
          />
          <div
            className="hidden sm:block absolute inset-0"
            style={{
              background:
                'linear-gradient(to right, rgba(11, 13, 16, 0.98) 0%, rgba(11, 13, 16, 0.90) 45%, rgba(11, 13, 16, 0.55) 75%, rgba(11, 13, 16, 0.85) 100%)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to bottom, rgba(11, 13, 16, 0.6) 0%, transparent 20%, transparent 70%, #0B0D10 100%)',
            }}
          />
        </div>

        {/* Content Container */}
        <div className="relative z-10 mx-auto max-w-5xl">
          {/* Hero Typography */}
          <div className="space-y-3 sm:space-y-4 max-w-2xl pb-6 sm:pb-8 md:pb-10">
            {/* Tagline / Eyebrow */}
            <div className="inline-flex items-center gap-2 rounded-full bg-[#12151A]/80 px-3 py-1 border border-[#232830] backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[#E8B04A] animate-pulse" />
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-[#E8B04A]">
                ONE GOAL. DIFFERENT ROUTE.
              </span>
            </div>

            {/* Main Headline */}
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-[54px] font-normal tracking-tight text-[#EDEFF2] leading-[1.12] sm:leading-[1.1]">
              Find the best way to reach your destination by train.
            </h1>

            {/* Supporting Copy */}
            <p className="text-xs sm:text-sm md:text-base text-[#9AA3AF] leading-relaxed max-w-lg">
              Compare direct trains, discover alternative stations, and explore connecting journeys
              in one place.
            </p>
          </div>

          {/* Mode Switcher (Station Search vs Natural Language) */}
          <div
            ref={searchContainerRef}
            className="flex flex-wrap items-center justify-between gap-2 mb-2.5 sm:mb-3 px-1"
          >
            <div className="inline-flex items-center rounded-lg bg-[#181C22]/90 p-0.5 border border-[#232830] backdrop-blur-sm shadow-inner">
              <button
                type="button"
                onClick={() => setActiveTab('structured')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 sm:px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'structured'
                    ? 'bg-[#E8B04A] text-[#0B0D10] font-semibold shadow-sm'
                    : 'text-[#9AA3AF] hover:text-[#EDEFF2]'
                }`}
                aria-pressed={activeTab === 'structured'}
              >
                <SlidersHorizontal className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                <span>Station Search</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('natural')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 sm:px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'natural'
                    ? 'bg-[#E8B04A] text-[#0B0D10] font-semibold shadow-sm'
                    : 'text-[#9AA3AF] hover:text-[#EDEFF2]'
                }`}
                aria-pressed={activeTab === 'natural'}
              >
                <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                <span>Natural Language</span>
              </button>
            </div>

            <span className="hidden sm:inline-block text-[11px] text-[#6B7480]">
              {activeTab === 'structured'
                ? 'Direct station code & canonical route search'
                : 'Conversational travel intent discovery'}
            </span>
          </div>

          {/* Search Panel Component */}
          <div className="w-full relative z-30">
            {activeTab === 'structured' ? (
              <SearchForm
                initialOrigin={origin}
                initialDestination={destination}
                initialDate={departureDate}
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

      {/* ===================== SECTION 2: QUICK DISCOVERY ===================== */}
      <QuickDiscoverySection onSelectRoute={handleSelectRoute} />

      {/* ===================== SECTION 3: FIND ANOTHER WAY ===================== */}
      <FindAnotherWaySection onSelectRoute={handleSelectRoute} />

      {/* ===================== SECTION 4: LIVE JOURNEY PREVIEW ===================== */}
      <JourneyPreviewSection onSelectRoute={handleSelectRoute} />

      {/* ===================== SECTION 5: JOURNEY COMPARISON ===================== */}
      <JourneyComparisonSection onSelectRoute={handleSelectRoute} />

      {/* ===================== SECTION 6: HOW IT WORKS ===================== */}
      <HowItWorksSection />

      {/* ===================== SECTION 7: TRUST & TRANSPARENCY ===================== */}
      <TrustSection />

      {/* ===================== SECTION 8: BENEFIT HIGHLIGHTS ===================== */}
      <section className="relative z-0 w-full px-3.5 sm:px-6 lg:px-8 py-8 sm:py-10 bg-[#0B0D10]">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-6 md:gap-8">
            {/* Feature 1: Compare options */}
            <div className="flex items-start gap-3.5 sm:gap-4 p-3.5 sm:p-0 rounded-xl sm:rounded-none border sm:border-0 border-[#232830] bg-[#12151A]/60 sm:bg-transparent">
              <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border border-[#232830] bg-[#12151A] text-[#9AA3AF] shadow-inner">
                <Compass className="h-4 w-4 sm:h-5 sm:w-5 text-[#E8B04A]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-[#EDEFF2]">Compare options</h3>
                <p className="text-[11px] sm:text-xs text-[#9AA3AF] leading-relaxed mt-0.5 sm:mt-1">
                  See times, duration, transfers and official fares in one unified interface.
                </p>
              </div>
            </div>

            {/* Feature 2: Trusted information */}
            <div className="flex items-start gap-3.5 sm:gap-4 p-3.5 sm:p-0 rounded-xl sm:rounded-none border sm:border-0 border-[#232830] bg-[#12151A]/60 sm:bg-transparent">
              <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border border-[#232830] bg-[#12151A] text-[#9AA3AF] shadow-inner">
                <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-[#4CC38A]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-[#EDEFF2]">Trusted information</h3>
                <p className="text-[11px] sm:text-xs text-[#9AA3AF] leading-relaxed mt-0.5 sm:mt-1">
                  Verified timetables with clear distinction between scheduled and live data.
                </p>
              </div>
            </div>

            {/* Feature 3: Easy booking */}
            <div className="flex items-start gap-3.5 sm:gap-4 p-3.5 sm:p-0 rounded-xl sm:rounded-none border sm:border-0 border-[#232830] bg-[#12151A]/60 sm:bg-transparent">
              <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border border-[#232830] bg-[#12151A] text-[#9AA3AF] shadow-inner">
                <Ticket className="h-4 w-4 sm:h-5 sm:w-5 text-[#E8B04A]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-[#EDEFF2]">Easy booking</h3>
                <p className="text-[11px] sm:text-xs text-[#9AA3AF] leading-relaxed mt-0.5 sm:mt-1">
                  A simpler, more confident journey discovery process from search to reservation.
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
