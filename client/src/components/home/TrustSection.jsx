import React from 'react';
import {
  ShieldCheck,
  Clock,
  Database,
  Info,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

/**
 * TrustSection Component
 *
 * Compact transparency section addressing data provenance, provider dependencies,
 * cache freshness, and booking provider boundaries.
 */
export function TrustSection() {
  return (
    <section className="relative z-10 w-full py-10 sm:py-12 px-3.5 sm:px-6 lg:px-8 border-b border-[#232830]/80 bg-[#0B0D10]">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-xl border border-[#232830] bg-[#12151A] p-5 sm:p-7 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#232830]">
            <div className="space-y-1">
              <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-[#E8B04A] flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-[#4CC38A]" aria-hidden="true" />
                <span>TRUST & TRANSPARENCY</span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-[#EDEFF2]">
                Our commitments on data accuracy and booking
              </h3>
            </div>
            <span className="text-[11px] text-[#9AA3AF] rounded-lg bg-[#181C22] px-2.5 py-1 border border-[#232830] font-mono self-start sm:self-auto">
              Policy v1.2
            </span>
          </div>

          {/* 4 Points Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-[#EDEFF2]">
                <Database className="h-3.5 w-3.5 text-[#E8B04A]" aria-hidden="true" />
                <span>Provider Feeds</span>
              </div>
              <p className="text-[11px] text-[#9AA3AF] leading-relaxed">
                Railway timetable and schedule records originate from verified Indian Railways feeds and RailKit adapters.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-[#EDEFF2]">
                <Clock className="h-3.5 w-3.5 text-[#E8B04A]" aria-hidden="true" />
                <span>Cache Freshness</span>
              </div>
              <p className="text-[11px] text-[#9AA3AF] leading-relaxed">
                Stable routes and timetables are safely cached. Seat availability and live running status follow short-term TTLs.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-[#EDEFF2]">
                <AlertCircle className="h-3.5 w-3.5 text-[#E07B39]" aria-hidden="true" />
                <span>Dynamic Seat Quotas</span>
              </div>
              <p className="text-[11px] text-[#9AA3AF] leading-relaxed">
                IRCTC seat status and waiting lists (GNWL/RLWL/PQWL) fluctuate continuously until passenger booking completion.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-[#EDEFF2]">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#4CC38A]" aria-hidden="true" />
                <span>Booking Providers</span>
              </div>
              <p className="text-[11px] text-[#9AA3AF] leading-relaxed">
                Confirmed railway ticket reservations and PNR issuance are fulfilled strictly through supported authorized partners.
              </p>
            </div>
          </div>

          {/* Clear Non-Affiliation Disclaimer */}
          <div className="pt-4 border-t border-[#232830] flex items-start gap-2 text-[11px] text-[#6B7480]">
            <Info className="h-4 w-4 text-[#6B7480] shrink-0 mt-0.5" aria-hidden="true" />
            <p className="leading-relaxed">
              Yatrai is an independent railway journey discovery and itinerary planning service.
              Yatrai is not officially affiliated with Indian Railways or IRCTC.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default TrustSection;
