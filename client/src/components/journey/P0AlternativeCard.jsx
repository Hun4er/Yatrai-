import React from 'react';
import { ArrowRight, Clock, AlertTriangle, Train, Sparkles, ShieldAlert } from 'lucide-react';
import { formatDuration } from '../../utils/formatters.js';

/**
 * P0AlternativeCard Component (P0 v2)
 *
 * Implements:
 * - Same-train badge: "Stay on this train — two tickets, berth may change at <hub>"
 * - Cross-train layover with "tight" label (< 180 min)
 * - Notice: "separate tickets, a missed connection is not protected"
 * - Multi-leg display with verified availability
 */
export function P0AlternativeCard({
  alternative,
  onBook,
}) {
  const isSameTrain = Boolean(alternative.sameTrain || alternative.type === 'same_train');
  const legs = Array.isArray(alternative.legs) ? alternative.legs : [];
  const hubCode = alternative.hubCode || legs[0]?.to;
  const laneClass = alternative.laneClass || legs[0]?.class || 'SL';
  const layoverMinutes = alternative.layoverMinutes;
  const isTight = Boolean(alternative.isTight || (layoverMinutes > 0 && layoverMinutes < 180));

  const leg1 = legs[0];
  const leg2 = legs[1];
  const leg3 = legs[2]; // Deep 3-leg if present

  return (
    <div className="rounded-2xl border border-[#303640] bg-[#12151A] p-4 sm:p-5 shadow-lg space-y-3.5 hover:border-[#3E4654] transition-all">
      {/* Top Banner & Badge Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#242931] pb-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {isSameTrain ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8B04A]/15 border border-[#E8B04A]/30 px-2.5 py-0.5 text-xs font-semibold text-[#E8B04A]">
              <Sparkles className="h-3 w-3" />
              Stay on this train — two tickets, berth may change at {hubCode}
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 text-xs font-semibold text-blue-400">
                <Train className="h-3 w-3" />
                Connection via {hubCode}
              </span>
              {layoverMinutes > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-[#A7AFBA]">
                  <Clock className="h-3 w-3 text-[#E8B04A]" />
                  <span>{Math.floor(layoverMinutes / 60)}h {layoverMinutes % 60}m layover</span>
                  {isTight && (
                    <span className="rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1 py-0.2 text-[10px] font-bold uppercase tracking-wider">
                      tight
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Lane Class Tag */}
        <span className="rounded-lg bg-[#1F242C] border border-[#303640] px-2 py-0.5 text-xs font-bold text-[#F0F1F3]">
          Class: {laneClass}
        </span>
      </div>

      {/* Legs Breakdown */}
      <div className="space-y-2">
        {/* Leg 1 */}
        {leg1 && (
          <div className="flex items-center justify-between rounded-xl bg-[#161B22] p-2.5 text-xs text-[#F0F1F3]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#E8B04A]">Leg 1</span>
              <span>Train {leg1.trainNo}</span>
              <span className="text-[#7E8794]">·</span>
              <span>{leg1.from} → {leg1.to}</span>
            </div>
            <span className="font-semibold text-emerald-400">Confirmed (AVL)</span>
          </div>
        )}

        {/* Layover / Hub indicator for cross-train */}
        {!isSameTrain && (
          <div className="flex items-center justify-center gap-2 py-0.5 text-[11px] text-[#A7AFBA]">
            <div className="h-px w-8 bg-[#303640]" />
            <span>Transfer at {hubCode} {isTight ? '(tight connection)' : ''}</span>
            <div className="h-px w-8 bg-[#303640]" />
          </div>
        )}

        {/* Leg 2 */}
        {leg2 && (
          <div className="flex items-center justify-between rounded-xl bg-[#161B22] p-2.5 text-xs text-[#F0F1F3]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#E8B04A]">Leg 2</span>
              <span>Train {leg2.trainNo}</span>
              <span className="text-[#7E8794]">·</span>
              <span>{leg2.from} → {leg2.to}</span>
            </div>
            <span className="font-semibold text-emerald-400">Confirmed (AVL)</span>
          </div>
        )}

        {/* Leg 3 if deep */}
        {leg3 && (
          <div className="flex items-center justify-between rounded-xl bg-[#161B22] p-2.5 text-xs text-[#F0F1F3]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#E8B04A]">Leg 3</span>
              <span>Train {leg3.trainNo}</span>
              <span className="text-[#7E8794]">·</span>
              <span>{leg3.from} → {leg3.to}</span>
            </div>
            <span className="font-semibold text-emerald-400">Confirmed (AVL)</span>
          </div>
        )}
      </div>

      {/* Warning Notice at bottom of card */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-[11px] text-[#A7AFBA] flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span>Separate tickets. A missed connection is not protected.</span>
        </p>

        <button
          type="button"
          onClick={() => onBook && onBook(alternative)}
          className="inline-flex items-center justify-center rounded-xl bg-[#E8B04A] px-3.5 py-1 text-xs font-bold text-[#0B0D10] hover:bg-[#F2BE62] transition-colors shadow-sm cursor-pointer ml-2 shrink-0"
        >
          Book Combination
        </button>
      </div>
    </div>
  );
}

export default P0AlternativeCard;
