import React, { useState } from 'react';
import {
  Scale,
  ArrowRight,
  CheckCircle2,
  Clock,
  MapPin,
  TrendingUp,
  Tag,
  SlidersHorizontal,
} from 'lucide-react';

const COMPARISON_OPTIONS = [
  {
    id: 'direct-rajdhani',
    type: 'Direct Premier',
    trainNumber: '12310',
    trainName: 'Tejas Rajdhani',
    boarding: 'New Delhi (NDLS)',
    arrival: 'Patna Jn (PNBE)',
    departure: '17:10',
    arrival_time: '05:15',
    duration: '12h 05m',
    transfers: 0,
    fare: '₹1,850 (3A)',
    badge: 'Fastest Direct',
    badgeColor: 'text-[#4CC38A] bg-[#4CC38A]/10 border-[#4CC38A]/30',
    description: 'Overnight non-stop priority path between primary metropolitan terminals.',
  },
  {
    id: 'cluster-alternative',
    type: 'Alternative Station',
    trainNumber: '12392',
    trainName: 'Shramjeevi SF',
    boarding: 'Anand Vihar (ANVT)',
    arrival: 'Danapur (DNR)',
    departure: '13:10',
    arrival_time: '06:50',
    duration: '17h 40m',
    transfers: 0,
    fare: '₹1,320 (3A)',
    badge: 'Nearby Station',
    badgeColor: 'text-[#E8B04A] bg-[#E8B04A]/10 border-[#E8B04A]/30',
    description: 'Board from satellite terminal Anand Vihar to Danapur (10 km from Patna).',
  },
  {
    id: 'connecting-express',
    type: 'Connecting Route',
    trainNumber: '12428 + 12394',
    trainName: 'Via Prayagraj Junction',
    boarding: 'New Delhi (NDLS)',
    arrival: 'Patna Jn (PNBE)',
    departure: '21:15',
    arrival_time: '12:45',
    duration: '15h 30m',
    transfers: 1,
    fare: '₹1,410 (3A Total)',
    badge: 'Safe Layover (95m)',
    badgeColor: 'text-[#9AA3AF] bg-[#181C22] border-[#232830]',
    description: 'Multi-segment connection with guaranteed daytime transfer window at Prayagraj.',
  },
];

/**
 * JourneyComparisonSection Component
 *
 * Demonstrates Yatrai's multi-dimensional evaluation:
 * - Departure/Arrival Timings
 * - Duration vs Convenience
 * - Ticket Fares
 * - Transfer Buffers
 * - Boarding & Arrival Hubs
 */
export function JourneyComparisonSection({ onSelectRoute }) {
  const [selectedId, setSelectedId] = useState('direct-rajdhani');

  return (
    <section className="relative z-10 w-full py-10 sm:py-14 px-3.5 sm:px-6 lg:px-8 border-b border-[#232830]/80 bg-[#0B0D10]">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div className="space-y-1.5">
            <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-[#E8B04A] flex items-center gap-1.5">
              <Scale className="h-3.5 w-3.5" aria-hidden="true" />
              <span>DECISION INTELLIGENCE</span>
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl font-normal tracking-tight text-[#EDEFF2]">
              Compare before you travel
            </h2>
            <p className="text-xs sm:text-sm text-[#9AA3AF] max-w-xl leading-relaxed">
              Evaluate real journey options by timings, total duration, fare, number of transfers,
              and boarding convenience.
            </p>
          </div>

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
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#E8B04A] hover:text-[#F0C066] transition-colors cursor-pointer self-start sm:self-auto"
          >
            <span>Compare Delhi → Patna</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {/* Responsive Comparison Grid / Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COMPARISON_OPTIONS.map((opt) => {
            const isSelected = selectedId === opt.id;
            return (
              <div
                key={opt.id}
                onClick={() => setSelectedId(opt.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setSelectedId(opt.id);
                  }
                }}
                className={`relative flex flex-col justify-between rounded-xl border p-4 sm:p-5 transition-all text-left cursor-pointer ${
                  isSelected
                    ? 'border-[#E8B04A] bg-[#181C22] shadow-md shadow-[#E8B04A]/5'
                    : 'border-[#232830] bg-[#12151A] hover:border-[#232830]/80 hover:bg-[#181C22]/60'
                }`}
              >
                <div className="space-y-3">
                  {/* Top Badge & Option Type */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-semibold text-[#EDEFF2]">
                      {opt.type}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold border ${opt.badgeColor}`}
                    >
                      {opt.badge}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-[#EDEFF2]">
                      {opt.trainName}
                    </h3>
                    <p className="text-[11px] text-[#9AA3AF] mt-0.5 leading-relaxed">
                      {opt.description}
                    </p>
                  </div>

                  {/* Metrics List */}
                  <div className="rounded-lg bg-[#0B0D10]/80 border border-[#232830] p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#9AA3AF] flex items-center gap-1 text-[11px]">
                        <Clock className="h-3 w-3 text-[#6B7480]" />
                        Duration:
                      </span>
                      <span className="font-mono font-semibold text-[#EDEFF2]">{opt.duration}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#9AA3AF] flex items-center gap-1 text-[11px]">
                        <SlidersHorizontal className="h-3 w-3 text-[#6B7480]" />
                        Departure & Arrival:
                      </span>
                      <span className="font-mono text-[#EDEFF2]">
                        {opt.departure} → {opt.arrival_time}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#9AA3AF] flex items-center gap-1 text-[11px]">
                        <MapPin className="h-3 w-3 text-[#6B7480]" />
                        Boarding Station:
                      </span>
                      <span className="text-[#EDEFF2] font-medium truncate max-w-[140px]">
                        {opt.boarding}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-[#232830]">
                      <span className="text-[#9AA3AF] flex items-center gap-1 text-[11px]">
                        <Tag className="h-3 w-3 text-[#6B7480]" />
                        Fare:
                      </span>
                      <span className="font-semibold text-[#E8B04A]">{opt.fare}</span>
                    </div>
                  </div>
                </div>

                {/* Card Action */}
                <div className="mt-4 pt-3 border-t border-[#232830]">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRoute({
                        origin: 'NEW DELHI - NDLS',
                        destination: 'PATNA JN - PNBE',
                        originCode: 'NDLS',
                        destinationCode: 'PNBE',
                      });
                    }}
                    className={`w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#E8B04A] text-[#0B0D10] hover:bg-[#F0C066]'
                        : 'bg-[#181C22] text-[#EDEFF2] hover:bg-[#232830] border border-[#232830]'
                    }`}
                  >
                    <span>Inspect this route</span>
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default JourneyComparisonSection;
