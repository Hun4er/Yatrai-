import React from 'react';
import {
  GitFork,
  ArrowRight,
  Split,
  Scale,
  MapPin,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react';

/**
 * FindAnotherWaySection Component
 *
 * Core differentiator section explaining Yatrai's three unique railway discovery capabilities:
 * 1. Alternative Stations (nearby metropolitan cluster hubs)
 * 2. Connecting Journeys (multi-segment itineraries with safe layover buffers)
 * 3. Journey Comparisons (time vs fare vs transfers)
 *
 * Every card has a working action connected to the application search flow.
 */
export function FindAnotherWaySection({ onSelectRoute }) {
  return (
    <section className="relative z-10 w-full py-10 sm:py-14 px-3.5 sm:px-6 lg:px-8 border-b border-[#232830]/80 bg-[#0B0D10]">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="space-y-1.5 mb-8 text-center sm:text-left">
          <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-[#E8B04A] flex items-center justify-center sm:justify-start gap-1.5">
            <GitFork className="h-3.5 w-3.5" aria-hidden="true" />
            <span>INTELLIGENT ROUTE DISCOVERY</span>
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-normal tracking-tight text-[#EDEFF2]">
            Your destination. More ways to get there.
          </h2>
          <p className="text-xs sm:text-sm text-[#9AA3AF] max-w-2xl leading-relaxed">
            Discover alternative boarding stations, arrival stations, and connecting train journeys
            when direct trains are waitlisted or unavailable.
          </p>
        </div>

        {/* 3 Interactive Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {/* Card A: Alternative Stations */}
          <div className="flex flex-col justify-between rounded-xl border border-[#232830] bg-[#12151A] p-5 hover:border-[#E8B04A]/60 hover:bg-[#181C22] transition-all">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#181C22] border border-[#232830] text-[#E8B04A]">
                  <GitFork className="h-5 w-5" aria-hidden="true" />
                </div>
                <span className="rounded bg-[#E8B04A]/10 border border-[#E8B04A]/20 px-2 py-0.5 text-[10px] font-semibold text-[#E8B04A]">
                  Alternative Stations
                </span>
              </div>

              <div>
                <h3 className="text-base font-semibold text-[#EDEFF2]">
                  Nearby Station Clustering
                </h3>
                <p className="text-xs text-[#9AA3AF] mt-1 leading-relaxed">
                  When trains don't operate from your preferred station, Yatrai checks nearby
                  metropolitan hubs within the same city cluster.
                </p>
              </div>

              {/* Concrete Illustrative Breakdown */}
              <div className="rounded-lg bg-[#0B0D10]/80 border border-[#232830] p-3 text-[11px] space-y-2">
                <div className="flex items-center justify-between text-[#EDEFF2] font-semibold pb-1.5 border-b border-[#232830]">
                  <span>Requested: Howrah → Varanasi</span>
                  <span className="text-[10px] text-[#6B7480] font-mono">ILLUSTRATION</span>
                </div>

                <div className="space-y-1.5 text-[#9AA3AF]">
                  <div className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#181C22] text-[10px] text-[#E8B04A] font-bold">
                      1
                    </span>
                    <span>Howrah → Sealdah (SDAH) local transit</span>
                  </div>
                  <div className="flex items-start gap-2 text-[#EDEFF2] font-medium">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#E8B04A] text-[10px] text-[#0B0D10] font-bold">
                      2
                    </span>
                    <span>Sealdah → Pt Deen Dayal Upadhyaya (DDU)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#181C22] text-[10px] text-[#E8B04A] font-bold">
                      3
                    </span>
                    <span>DDU → Varanasi (15 km suburban connection)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-[#232830]">
              <button
                type="button"
                onClick={() =>
                  onSelectRoute({
                    origin: 'HOWRAH JN - HWH',
                    destination: 'VARANASI JN - BSB',
                    originCode: 'HWH',
                    destinationCode: 'BSB',
                  })
                }
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#181C22] hover:bg-[#E8B04A] hover:text-[#0B0D10] text-[#E8B04A] border border-[#232830] px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer group"
              >
                <span>Try Howrah → Varanasi</span>
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Card B: Connecting Journeys */}
          <div className="flex flex-col justify-between rounded-xl border border-[#232830] bg-[#12151A] p-5 hover:border-[#E8B04A]/60 hover:bg-[#181C22] transition-all">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#181C22] border border-[#232830] text-[#E8B04A]">
                  <Split className="h-5 w-5" aria-hidden="true" />
                </div>
                <span className="rounded bg-[#E8B04A]/10 border border-[#E8B04A]/20 px-2 py-0.5 text-[10px] font-semibold text-[#E8B04A]">
                  Connecting Routes
                </span>
              </div>

              <div>
                <h3 className="text-base font-semibold text-[#EDEFF2]">
                  Multi-Segment Connections
                </h3>
                <p className="text-xs text-[#9AA3AF] mt-1 leading-relaxed">
                  When direct trains are completely sold out, Yatrai orchestrates two-train
                  combinations through intermediate junction hubs.
                </p>
              </div>

              {/* Safety layover buffer box */}
              <div className="rounded-lg bg-[#0B0D10]/80 border border-[#232830] p-3 text-[11px] space-y-2">
                <div className="flex items-center justify-between text-[#EDEFF2] font-semibold pb-1.5 border-b border-[#232830]">
                  <span>Delhi → Patna via Kanpur/DDU</span>
                  <span className="text-[10px] text-[#4CC38A] font-semibold flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    FEASIBLE
                  </span>
                </div>

                <div className="space-y-2 text-[#9AA3AF]">
                  <div className="flex items-center justify-between">
                    <span>Leg 1: Train A to Junction</span>
                    <span className="text-[#EDEFF2] font-mono">Available</span>
                  </div>
                  <div className="flex items-center justify-between bg-[#181C22] px-2 py-1 rounded text-[#E8B04A]">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Layover Window
                    </span>
                    <span className="font-semibold">90 – 180 min buffer</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Leg 2: Train B to Destination</span>
                    <span className="text-[#EDEFF2] font-mono">Available</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-[#232830]">
              <button
                type="button"
                onClick={() =>
                  onSelectRoute({
                    origin: 'NEW DELHI - NDLS',
                    destination: 'PATNA JN - PNBE',
                    originCode: 'NDLS',
                    destinationCode: 'PNBE',
                  })
                }
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#181C22] hover:bg-[#E8B04A] hover:text-[#0B0D10] text-[#E8B04A] border border-[#232830] px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer group"
              >
                <span>Explore Connecting Routes</span>
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Card C: Compare Alternatives */}
          <div className="flex flex-col justify-between rounded-xl border border-[#232830] bg-[#12151A] p-5 hover:border-[#E8B04A]/60 hover:bg-[#181C22] transition-all">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#181C22] border border-[#232830] text-[#E8B04A]">
                  <Scale className="h-5 w-5" aria-hidden="true" />
                </div>
                <span className="rounded bg-[#E8B04A]/10 border border-[#E8B04A]/20 px-2 py-0.5 text-[10px] font-semibold text-[#E8B04A]">
                  Comparative Trade-offs
                </span>
              </div>

              <div>
                <h3 className="text-base font-semibold text-[#EDEFF2]">
                  Compare Time, Fare & Ease
                </h3>
                <p className="text-xs text-[#9AA3AF] mt-1 leading-relaxed">
                  Evaluate real journey alternatives side-by-side: weigh total duration against
                  fare savings, transfers, and boarding convenience.
                </p>
              </div>

              {/* Trade-off Matrix */}
              <div className="rounded-lg bg-[#0B0D10]/80 border border-[#232830] p-3 text-[11px] space-y-2">
                <div className="flex items-center justify-between text-[#EDEFF2] font-semibold pb-1.5 border-b border-[#232830]">
                  <span>Evaluation Criteria</span>
                  <span className="text-[#E8B04A] font-semibold">Yatrai Score</span>
                </div>

                <div className="space-y-1.5 text-[#9AA3AF]">
                  <div className="flex items-center justify-between">
                    <span>• Duration & Departure Timings</span>
                    <span className="text-[#EDEFF2]">Exact Minutes</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>• Fare & Class Tariffs</span>
                    <span className="text-[#EDEFF2]">Official IRCTC</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>• Number of Transfers</span>
                    <span className="text-[#EDEFF2]">0 vs 1 Transfer</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-[#232830]">
              <button
                type="button"
                onClick={() =>
                  onSelectRoute({
                    origin: 'NEW DELHI - NDLS',
                    destination: 'MUMBAI CENTRAL - MMCT',
                    originCode: 'NDLS',
                    destinationCode: 'MMCT',
                  })
                }
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#181C22] hover:bg-[#E8B04A] hover:text-[#0B0D10] text-[#E8B04A] border border-[#232830] px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer group"
              >
                <span>Compare Delhi → Mumbai</span>
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default FindAnotherWaySection;
