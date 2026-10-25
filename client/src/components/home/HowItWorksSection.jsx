import React from 'react';
import {
  Search,
  GitFork,
  CheckCircle2,
  Ticket,
  ArrowRight,
} from 'lucide-react';

const STEPS = [
  {
    step: '01',
    title: 'Enter your destination',
    description:
      'Input origin, destination and travel date, or describe your travel intent in conversational natural language.',
    icon: Search,
  },
  {
    step: '02',
    title: 'Discover direct & alternatives',
    description:
      'Yatrai discovers direct trains, alternative nearby boarding hubs, and connecting train journeys in one unified search.',
    icon: GitFork,
  },
  {
    step: '03',
    title: 'Review itinerary details',
    description:
      'Compare exact departure times, total travel durations, safe transfer layovers, and official class tariffs.',
    icon: CheckCircle2,
  },
  {
    step: '04',
    title: 'Continue to booking',
    description:
      'Review your complete journey plan and transition smoothly to supported railway booking providers.',
    icon: Ticket,
  },
];

/**
 * HowItWorksSection Component
 *
 * 4 clear, transparent steps communicating Yatrai's discovery-to-booking workflow.
 */
export function HowItWorksSection() {
  return (
    <section className="relative z-10 w-full py-10 sm:py-14 px-3.5 sm:px-6 lg:px-8 border-b border-[#232830]/80 bg-[#0B0D10]">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="space-y-1.5 mb-8 text-center sm:text-left">
          <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-[#E8B04A]">
            HOW IT WORKS
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl font-normal tracking-tight text-[#EDEFF2]">
            Intelligent railway discovery in four steps
          </h2>
          <p className="text-xs sm:text-sm text-[#9AA3AF] max-w-xl">
            From search intent to complete itinerary verification.
          </p>
        </div>

        {/* 4 Steps Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {STEPS.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="relative flex flex-col justify-between rounded-xl border border-[#232830] bg-[#12151A] p-5 hover:border-[#232830]/80 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[#E8B04A] tracking-wider">
                      {item.step}
                    </span>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#181C22] border border-[#232830] text-[#9AA3AF]">
                      <Icon className="h-4 w-4 text-[#E8B04A]" aria-hidden="true" />
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-[#EDEFF2]">
                    {item.title}
                  </h3>

                  <p className="text-xs text-[#9AA3AF] leading-relaxed">
                    {item.description}
                  </p>
                </div>

                {idx < STEPS.length - 1 && (
                  <div className="hidden lg:block absolute -right-2.5 top-1/2 -translate-y-1/2 z-20 text-[#6B7480]">
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default HowItWorksSection;
