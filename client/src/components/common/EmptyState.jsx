import React from 'react';
import { RouteOff, ArrowLeft, RotateCcw, AlertTriangle, Train, Sparkles, Loader2, Calendar } from 'lucide-react';

/**
 * EmptyState Component
 *
 * Rendered when no verified train journeys are found for search criteria.
 * Distinguishes whether the search completed across direct and connecting routes
 * or whether live provider data was unavailable.
 * Provides "Find Alternative Journeys" primary recovery action, Retry Search, and Modify Search.
 */
export function EmptyState({
  onModifySearch,
  onRetry,
  onExploreAlternatives,
  isLoadingAlternatives = false,
  isProviderUnavailable = false,
  origin = '',
  destination = '',
  date = '',
  travelClass = 'ANY',
}) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-[#232830] bg-[#12151A] p-6 sm:p-9 text-center shadow-2xl">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#181C22] text-[#E8B04A] border border-[#232830]">
        {isProviderUnavailable ? (
          <AlertTriangle className="h-7 w-7 text-amber-400" aria-hidden="true" />
        ) : (
          <RouteOff className="h-7 w-7 text-[#E8B04A]" aria-hidden="true" />
        )}
      </div>

      <h3 className="mt-5 text-xl sm:text-2xl font-bold tracking-tight text-[#EDEFF2]">
        {isProviderUnavailable
          ? 'Live railway data temporarily unavailable'
          : 'No verified alternative found for these criteria'}
      </h3>

      <p className="mt-2.5 text-sm text-[#9AA3AF] leading-relaxed max-w-md mx-auto">
        {isProviderUnavailable ? (
          <>
            Live Indian Railways provider data was temporarily unavailable or timed out during the search.
            Please retry your request.
          </>
        ) : (
          <>
            Checked direct trains and explored expanded station options and connecting interchange hubs along this corridor.
            No operating trains or verified connections match this route on {date || 'the selected date'}.
          </>
        )}
      </p>

      {/* Search Criteria Context Summary */}
      {(origin || destination) && (
        <div className="mt-5 rounded-xl border border-[#232830] bg-[#181C22] p-3.5 text-xs text-left grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#6B7480]">Route</div>
            <div className="mt-0.5 font-bold text-[#EDEFF2] truncate">{origin || 'Origin'} → {destination || 'Destination'}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#6B7480]">Date</div>
            <div className="mt-0.5 font-bold text-[#EDEFF2]">{date || 'Any Date'}</div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#6B7480]">Class</div>
            <div className="mt-0.5 font-bold text-[#EDEFF2]">{travelClass}</div>
          </div>
        </div>
      )}

      {/* Alternative Discovery In-Progress State (Part 6.B) */}
      {isLoadingAlternatives && (
        <div className="mt-6 rounded-xl border border-[#E8B04A]/30 bg-[#181C22] p-4 text-left space-y-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-[#E8B04A]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#E8B04A]">
              FINDING AN ALTERNATIVE ROUTE
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#9AA3AF]">
            <div className="flex items-center gap-1.5 text-[#4CC38A]">
              <span>✓</span>
              <span>1. Direct trains checked</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#E8B04A] font-semibold">
              <Loader2 className="h-3 w-3 animate-spin text-[#E8B04A]" />
              <span>2. Expanding stations &amp; hubs</span>
            </div>
          </div>
        </div>
      )}

      {/* Actionable Train Suggestions */}
      {!isLoadingAlternatives && (
        <div className="mt-6 rounded-xl border border-[#232830] bg-[#181C22] p-4 text-left max-w-md mx-auto space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#E8B04A] flex items-center gap-1.5">
            <Train className="h-3.5 w-3.5" />
            <span>Suggestions:</span>
          </div>
          <ul className="space-y-1.5 text-xs text-[#9AA3AF]">
            <li className="flex items-start gap-2">
              <span className="text-[#E8B04A] font-bold">•</span>
              <span>Try nearby cluster stations (e.g. major junctions in the same metropolitan area).</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#E8B04A] font-bold">•</span>
              <span>Try an alternate travel date to see periodic or non-daily express trains.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#E8B04A] font-bold">•</span>
              <span>Search with &quot;All Classes&quot; or General (GN) quota for maximum schedule coverage.</span>
            </li>
          </ul>
        </div>
      )}

      {/* Primary Actions: Find Alternative Journeys, Retry Search & Modify Search */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {onExploreAlternatives && !isLoadingAlternatives && (
          <button
            type="button"
            onClick={onExploreAlternatives}
            className="inline-flex items-center gap-2 rounded-xl bg-[#E8B04A] px-5 py-2.5 text-xs sm:text-sm font-bold text-[#0B0D10] hover:bg-[#F0C066] transition-colors cursor-pointer shadow-md focus:outline-none focus:ring-2 focus:ring-[#E8B04A]"
          >
            <Sparkles className="h-4 w-4 text-[#0B0D10]" aria-hidden="true" />
            <span>Find Alternative Journeys</span>
          </button>
        )}

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-xl border border-[#232830] bg-[#181C22] px-5 py-2.5 text-xs sm:text-sm font-semibold text-[#EDEFF2] hover:bg-[#232830] hover:border-[#3A414C] transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#232830]"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>Retry search</span>
          </button>
        )}

        {onModifySearch && (
          <button
            type="button"
            onClick={onModifySearch}
            className="inline-flex items-center gap-2 rounded-xl border border-[#232830] bg-[#181C22] px-5 py-2.5 text-xs sm:text-sm font-semibold text-[#EDEFF2] hover:bg-[#232830] hover:border-[#3A414C] transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#232830]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Modify search</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default EmptyState;

