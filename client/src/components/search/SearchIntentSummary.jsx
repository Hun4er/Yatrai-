import React, { useState } from 'react';
import {
  Sparkles,
  MapPin,
  Navigation,
  Calendar,
  Users,
  Train,
  Check,
  ChevronDown,
  ArrowRight,
  Edit2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { formatDateDisplay } from '../../utils/formatters.js';

/**
 * SearchIntentSummary Component
 *
 * Implements Section 2 (Critical Location Resolution Fix) & Section 3 (Search Interpretation Experience).
 *
 * Distinguishes:
 * - User-entered location
 * - Resolved location / region
 * - Exact station / POI used for routing
 *
 * If multiple locations match or user wants to clarify, presents location selection UI.
 */
export function SearchIntentSummary({
  interpretation,
  onConfirmSearch,
  onEditQuery,
  isLoading = false,
}) {
  const { origin, destination, parsedRequest, rawQuery } = interpretation || {};

  // Track user-selected candidate objects for origin and destination
  const [selectedOrigin, setSelectedOrigin] = useState(
    origin?.selected || origin?.candidates?.[0] || null
  );
  const [selectedDestination, setSelectedDestination] = useState(
    destination?.selected || destination?.candidates?.[0] || null
  );

  // Toggle dropdown / modal for choosing alternative candidates
  const [showOriginSelector, setShowOriginSelector] = useState(false);
  const [showDestSelector, setShowDestSelector] = useState(false);

  if (!interpretation || !parsedRequest) return null;

  const originQuery = origin?.query || parsedRequest.origin || 'Origin';
  const destQuery = destination?.query || parsedRequest.destination || 'Destination';
  const originCandidates = origin?.candidates || [];
  const destCandidates = destination?.candidates || [];

  const travelDate = parsedRequest.departureDate;
  const formattedDate = formatDateDisplay(travelDate);
  const passengers = parsedRequest.passengers || 1;
  const requestedModes = Array.isArray(parsedRequest.requestedModes) && parsedRequest.requestedModes.length > 0
    ? parsedRequest.requestedModes.join(', ')
    : 'All modes';

  const handleSearchClick = () => {
    if (isLoading) return;

    // Use selected candidate names or fallback to queries
    const effectiveOrigin = selectedOrigin?.name || originQuery;
    const effectiveDestination = selectedDestination?.name || destQuery;

    onConfirmSearch({
      origin: effectiveOrigin,
      destination: effectiveDestination,
      departureDate: travelDate,
      passengers,
      ranking: parsedRequest.ranking || 'overall',
      requestedModes: parsedRequest.requestedModes || [],
      // Pass resolved meta for UI transparency
      resolvedOrigin: selectedOrigin,
      resolvedDestination: selectedDestination,
      userOriginQuery: originQuery,
      userDestinationQuery: destQuery,
    });
  };

  const isOriginPoi = selectedOrigin?.type && selectedOrigin.type !== 'city' && selectedOrigin.type !== 'region';
  const isDestPoi = selectedDestination?.type && selectedDestination.type !== 'city' && selectedDestination.type !== 'region';

  return (
    <div
      className="w-full max-w-4xl rounded-xl border border-graphite-800 bg-graphite-900 p-6 sm:p-7 shadow-2xl space-y-6 animate-in fade-in transition-all font-sans"
      aria-label="Trip Intent Interpretation"
    >
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-graphite-800 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-graphite-850 border border-graphite-800 text-ink-500">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-ink-900">We understood your trip</h3>
            <p className="text-xs text-ink-500">
              Review how Yatrai resolved your travel intent before searching.
            </p>
          </div>
        </div>

        {onEditQuery && (
          <button
            type="button"
            onClick={onEditQuery}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-graphite-700 bg-graphite-850 px-3 py-1.5 text-xs font-medium text-ink-500 hover:text-ink-900 hover:border-graphite-600 transition-all cursor-pointer"
          >
            <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Edit query</span>
          </button>
        )}
      </div>

      {/* Grid: Origin, Destination, Schedule, Passengers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Origin Resolution Box */}
        <div className="rounded-xl border border-graphite-800 bg-graphite-850/60 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">
              <MapPin className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" />
              <span>From</span>
            </div>

            {originCandidates.length > 1 && (
              <button
                type="button"
                onClick={() => setShowOriginSelector((prev) => !prev)}
                className="text-xs font-semibold text-amber-500 hover:text-amber-400 inline-flex items-center gap-1 cursor-pointer"
              >
                <span>{showOriginSelector ? 'Close' : 'Change location'}</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${showOriginSelector ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>

          <div>
            <div className="text-base font-bold text-ink-900 font-mono">
              {selectedOrigin?.city || selectedOrigin?.name || originQuery}
              {selectedOrigin?.state ? `, ${selectedOrigin.state}` : ''}
            </div>

            {/* Resolved starting point visibility */}
            {selectedOrigin && selectedOrigin.name && (
              <div className="mt-1 text-xs text-ink-500 flex items-center gap-1.5 font-medium">
                <span className="text-ink-400">Resolved starting point:</span>
                <span className="font-semibold text-ink-900 font-mono">{selectedOrigin.name}</span>
                {selectedOrigin.type && (
                  <span className="rounded-full bg-graphite-800 border border-graphite-700 px-1.5 py-0.2 text-[10px] text-ink-400 uppercase font-mono">
                    {selectedOrigin.type.replace('_', ' ')}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Multiple Candidates Selection UI */}
          {showOriginSelector && originCandidates.length > 1 && (
            <div className="mt-3 rounded-xl border border-graphite-700 bg-graphite-850 p-3 space-y-2 animate-in fade-in">
              <div className="text-[11px] font-semibold text-ink-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                <span>We found multiple locations matching &ldquo;{originQuery}&rdquo;:</span>
              </div>
              <div className="space-y-1">
                {originCandidates.map((cand, idx) => {
                  const isCandSelected = selectedOrigin?.id === cand.id || selectedOrigin?.name === cand.name;
                  return (
                    <button
                      key={cand.id || idx}
                      type="button"
                      onClick={() => {
                        setSelectedOrigin(cand);
                        setShowOriginSelector(false);
                      }}
                      className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                        isCandSelected
                          ? 'bg-amber-500/10 border border-amber-500/30 text-ink-900 font-semibold'
                          : 'hover:bg-graphite-800/60 text-ink-500'
                      }`}
                    >
                      <div className="truncate">
                        <div className="text-ink-900 font-medium font-mono">{cand.name}</div>
                        <div className="text-[10px] text-ink-400 truncate">{cand.displayName}</div>
                      </div>
                      {isCandSelected && <Check className="h-3.5 w-3.5 text-amber-500 shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Destination Resolution Box */}
        <div className="rounded-xl border border-graphite-800 bg-graphite-850/60 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">
              <Navigation className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" />
              <span>To</span>
            </div>

            {destCandidates.length > 1 && (
              <button
                type="button"
                onClick={() => setShowDestSelector((prev) => !prev)}
                className="text-xs font-semibold text-amber-500 hover:text-amber-400 inline-flex items-center gap-1 cursor-pointer"
              >
                <span>{showDestSelector ? 'Close' : 'Change location'}</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${showDestSelector ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>

          <div>
            <div className="text-base font-bold text-ink-900 font-mono">
              {selectedDestination?.city || selectedDestination?.name || destQuery}
              {selectedDestination?.state ? `, ${selectedDestination.state}` : ''}
            </div>

            {/* Resolved destination point visibility */}
            {selectedDestination && selectedDestination.name && (
              <div className="mt-1 text-xs text-ink-500 flex items-center gap-1.5 font-medium">
                <span className="text-ink-400">Resolved destination:</span>
                <span className="font-semibold text-ink-900 font-mono">{selectedDestination.name}</span>
                {selectedDestination.type && (
                  <span className="rounded-full bg-graphite-800 border border-graphite-700 px-1.5 py-0.2 text-[10px] text-ink-400 uppercase font-mono">
                    {selectedDestination.type.replace('_', ' ')}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Multiple Candidates Selection UI */}
          {showDestSelector && destCandidates.length > 1 && (
            <div className="mt-3 rounded-xl border border-graphite-700 bg-graphite-850 p-3 space-y-2 animate-in fade-in">
              <div className="text-[11px] font-semibold text-ink-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                <span>We found multiple locations matching &ldquo;{destQuery}&rdquo;:</span>
              </div>
              <div className="space-y-1">
                {destCandidates.map((cand, idx) => {
                  const isCandSelected = selectedDestination?.id === cand.id || selectedDestination?.name === cand.name;
                  return (
                    <button
                      key={cand.id || idx}
                      type="button"
                      onClick={() => {
                        setSelectedDestination(cand);
                        setShowDestSelector(false);
                      }}
                      className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                        isCandSelected
                          ? 'bg-amber-500/10 border border-amber-500/30 text-ink-900 font-semibold'
                          : 'hover:bg-graphite-800/60 text-ink-500'
                      }`}
                    >
                      <div className="truncate">
                        <div className="text-ink-900 font-medium font-mono">{cand.name}</div>
                        <div className="text-[10px] text-ink-400 truncate">{cand.displayName}</div>
                      </div>
                      {isCandSelected && <Check className="h-3.5 w-3.5 text-amber-500 shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Date & Mode Parameters Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-graphite-800 bg-graphite-850/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-ink-400 flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-ink-500" />
            <span>Date</span>
          </div>
          <div className="mt-1 text-sm font-semibold text-ink-900 font-mono">
            {formattedDate || travelDate}
          </div>
        </div>

        <div className="rounded-xl border border-graphite-800 bg-graphite-850/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-ink-400 flex items-center gap-1">
            <Users className="h-3.5 w-3.5 text-ink-500" />
            <span>Passengers</span>
          </div>
          <div className="mt-1 text-sm font-semibold text-ink-900 font-mono">
            {passengers} {passengers === 1 ? 'adult' : 'passengers'}
          </div>
        </div>

        <div className="rounded-xl border border-graphite-800 bg-graphite-850/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-ink-400 flex items-center gap-1">
            <Train className="h-3.5 w-3.5 text-ink-500" />
            <span>Transport</span>
          </div>
          <div className="mt-1 text-sm font-semibold text-ink-900 capitalize font-mono">
            {requestedModes}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="text-xs text-ink-400">
          Pressing &ldquo;Find Trains&rdquo; will discover verified Indian Railways trains and connecting routes.
        </div>

        <button
          type="button"
          onClick={handleSearchClick}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 px-7 py-3 text-sm font-semibold text-graphite-950 shadow-md transition-all duration-150 ease-out cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-graphite-950 shrink-0"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-graphite-950" aria-hidden="true" />
              <span>Orchestrating search...</span>
            </>
          ) : (
            <>
              <span>Find Trains</span>
              <ArrowRight className="h-4 w-4 text-graphite-950" aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default SearchIntentSummary;
