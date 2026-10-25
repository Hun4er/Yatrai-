import React, { useState, useEffect, useRef } from 'react';
import {
  Train,
  ArrowRight,
  Clock,
  Sparkles,
  ShieldCheck,
  Calendar,
  Layers,
  Database,
  ExternalLink,
} from 'lucide-react';
import api from '../../services/api.js';
import { staleWhileRevalidate } from '../../utils/browserCache.js';

/**
 * Format relative time for cache timestamp display.
 */
function formatCacheAge(isoTimestamp) {
  if (!isoTimestamp) return 'Cached schedule';
  try {
    const diffSec = Math.floor((Date.now() - new Date(isoTimestamp).getTime()) / 1000);
    if (diffSec < 60) return 'Updated just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Updated ${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    return `Updated ${diffHr}h ago`;
  } catch {
    return 'Cached schedule';
  }
}

/**
 * JourneyPreviewSection Component
 *
 * Displays a small curated set of real train journeys from the RailKit backend preview endpoint.
 * Implements strict caching rules:
 * - Single request shared across homepage components
 * - Browser localStorage caching via Stale-While-Revalidate (15m TTL)
 * - Distinct labelling: "Scheduled Timetable" (NOT live availability)
 * - Real provider-reported fares and timetables
 */
export function JourneyPreviewSection({ onSelectRoute }) {
  const [journeys, setJourneys] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    async function fetchPreview() {
      try {
        const cachedOrFresh = await staleWhileRevalidate(
          'railkit_homepage_preview_v2',
          async () => {
            const res = await api.journeys.getPreview();
            return {
              data: res?.data || [],
              meta: res?.meta || null,
            };
          },
          15 * 60 * 1000, // 15 minutes TTL
          (revalidated) => {
            if (revalidated?.data) {
              setJourneys(revalidated.data);
              setMeta(revalidated.meta);
            }
          }
        );

        if (cachedOrFresh?.data) {
          setJourneys(cachedOrFresh.data);
          setMeta(cachedOrFresh.meta);
        }
      } catch (err) {
        setError(err.message || 'Unable to load scheduled train preview.');
      } finally {
        setLoading(false);
      }
    }

    fetchPreview();
  }, []);

  if (error || (!loading && journeys.length === 0)) {
    // If no preview data, show route search discovery CTA instead of broken cards
    return (
      <section className="relative z-10 w-full py-8 px-3.5 sm:px-6 lg:px-8 border-b border-[#232830]/80 bg-[#0B0D10]">
        <div className="mx-auto max-w-5xl rounded-xl border border-[#232830] bg-[#12151A] p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="text-base font-semibold text-[#EDEFF2]">Ready to explore rail routes?</h3>
            <p className="text-xs text-[#9AA3AF]">
              Search any origin and destination to discover real-time trains and alternatives.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelectRoute({ origin: 'NEW DELHI - NDLS', destination: 'PATNA JN - PNBE' })}
            className="inline-flex items-center gap-2 rounded-lg bg-[#E8B04A] px-4 py-2 text-xs font-semibold text-[#0B0D10] shadow-sm hover:bg-[#F0C066] cursor-pointer"
          >
            <span>Search Delhi → Patna</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="relative z-10 w-full py-10 sm:py-14 px-3.5 sm:px-6 lg:px-8 border-b border-[#232830]/80 bg-[#0B0D10]">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div className="space-y-1.5">
            <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-[#E8B04A] flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5" aria-hidden="true" />
              <span>TIMETABLE REGISTRY</span>
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl font-normal tracking-tight text-[#EDEFF2]">
              Explore train journeys
            </h2>
            <p className="text-xs sm:text-sm text-[#9AA3AF] max-w-xl leading-relaxed">
              Official scheduled train services across flagship corridors with verified departure
              timings and class fares.
            </p>
          </div>

          {/* Freshness Badge */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#9AA3AF]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#181C22] px-2.5 py-1 border border-[#232830] font-mono text-[10px] text-[#E8B04A]">
              <ShieldCheck className="h-3 w-3 text-[#4CC38A]" aria-hidden="true" />
              <span>Scheduled Timetable</span>
            </span>
            {meta?.fetchedAt && (
              <span className="text-[#6B7480] text-[10px]">
                {formatCacheAge(meta.fetchedAt)}
              </span>
            )}
          </div>
        </div>

        {/* Live Preview Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {journeys.map((train) => (
            <div
              key={train.id || train.trainNumber}
              className="flex flex-col justify-between rounded-xl border border-[#232830] bg-[#12151A] p-4 sm:p-5 hover:border-[#E8B04A]/60 hover:bg-[#181C22] transition-all"
            >
              <div className="space-y-3.5">
                {/* Header: Train Number & Name */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold text-[#E8B04A]">
                      <Train className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{train.trainNumber}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-[#EDEFF2] truncate" title={train.trainName}>
                      {train.trainName}
                    </h3>
                  </div>
                  <span className="rounded bg-[#181C22] border border-[#232830] px-2 py-0.5 text-[10px] font-medium text-[#9AA3AF] shrink-0">
                    {train.operator || 'IR'}
                  </span>
                </div>

                {/* Stations & Schedule Timings */}
                <div className="rounded-lg bg-[#0B0D10]/80 border border-[#232830] p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <div className="text-base font-bold font-mono text-[#EDEFF2]">
                        {train.departureTime}
                      </div>
                      <div className="text-[11px] text-[#9AA3AF] flex items-center gap-1">
                        <span className="font-mono text-[#E8B04A]">{train.from}</span>
                        <span className="truncate max-w-[90px]">{train.fromName}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-center px-1 text-[#6B7480]">
                      <span className="text-[10px] font-mono text-[#9AA3AF]">{train.duration}</span>
                      <div className="flex items-center gap-1 my-0.5">
                        <div className="h-[1px] w-6 bg-[#232830]" />
                        <ArrowRight className="h-3 w-3 text-[#E8B04A]" aria-hidden="true" />
                      </div>
                      <span className="text-[9px] uppercase tracking-wider text-[#4CC38A]">Direct</span>
                    </div>

                    <div className="space-y-0.5 text-right">
                      <div className="text-base font-bold font-mono text-[#EDEFF2]">
                        {train.arrivalTime}
                      </div>
                      <div className="text-[11px] text-[#9AA3AF] flex items-center justify-end gap-1">
                        <span className="truncate max-w-[90px]">{train.toName}</span>
                        <span className="font-mono text-[#E8B04A]">{train.to}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Fares & Available Classes */}
                {train.fares && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7480]">
                      Official Tariff (IRCTC Class Fare)
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(train.fares).map(([cls, fare]) => (
                        <span
                          key={cls}
                          className="inline-flex items-center gap-1 rounded bg-[#181C22] border border-[#232830] px-2 py-0.5 text-[10px] font-medium"
                        >
                          <span className="text-[#9AA3AF]">{cls}:</span>
                          <span className="text-[#EDEFF2] font-semibold">₹{fare}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action */}
              <div className="mt-4 pt-3 border-t border-[#232830]">
                <button
                  type="button"
                  onClick={() =>
                    onSelectRoute({
                      origin: `${train.fromName} - ${train.from}`,
                      destination: `${train.toName} - ${train.to}`,
                      originCode: train.from,
                      destinationCode: train.to,
                    })
                  }
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#E8B04A] hover:bg-[#F0C066] text-[#0B0D10] px-3.5 py-2 text-xs font-semibold shadow-sm transition-all cursor-pointer"
                >
                  <span>Search route</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default JourneyPreviewSection;
