import React, { useState } from 'react';
import { Clock, RotateCcw, ArrowRight, Train, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import P0ClassChips from './P0ClassChips.jsx';
import { formatDuration, getDayOffset, formatDayOffsetBadge } from '../../utils/formatters.js';

/**
 * Calculates a friendly "checked N min ago" string from ISO timestamp.
 */
function formatCheckedAgo(isoStr) {
  if (!isoStr) return 'checked just now';
  const diffSec = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diffSec < 60) return 'checked just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin === 1) return 'checked 1 min ago';
  if (diffMin < 60) return `checked ${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  return `checked ${diffHours}h ago`;
}

/**
 * P0DirectTrainCard Component (P0 v2)
 *
 * Implements:
 * - Mobile-first layout
 * - Exact class chips: "SL AVL 12", "3A RAC 3", "2A WL 11 (89%)", "1A ?" (tap = check-class)
 * - "checked N min ago" + refresh icon (POST /api/v2/journeys/refresh-card)
 * - Transparent status indicators and booking button
 */
const KNOWN_CODES = {
  'NEW DELHI': 'NDLS',
  'DELHI': 'NDLS',
  'PATNA': 'PNBE',
  'PATNA JN': 'PNBE',
  'PATNA JUNCTION': 'PNBE',
};

const STATION_DISPLAY_NAMES = {
  'NDLS': 'New Delhi',
  'DLI': 'Old Delhi',
  'NZM': 'Hazrat Nizamuddin',
  'ANVT': 'Anand Vihar',
  'PNBE': 'Patna Jn',
  'DNR': 'Danapur',
  'RJPB': 'Rajendra Nagar',
  'PNC': 'Patna Saheb',
  'PPTA': 'Patliputra',
};

export function P0DirectTrainCard({
  train,
  date,
  quota = 'GN',
  destinationCode = '',
  destinationName = '',
  requestedDestination = '',
  requestedDestinationName = '',
  onCheckClass,
  onRefreshCard,
  onBook,
  activeClassFilter,
  onSelectClassFilter,
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState(null);

  const trainNo = train.trainNumber;
  const trainName = train.trainName;
  const from = train.from;
  const to = train.to;
  const depTime = train.departureTime;
  const arrTime = train.arrivalTime;
  const rawDuration = train.duration || train.durationMinutes;
  const duration = rawDuration ? formatDuration(rawDuration) : '';
  const checkedAt = train.checkedAt;

  const rawDayOffset = train.dayOffset ?? getDayOffset(depTime, arrTime, rawDuration);
  const dayOffsetBadge = formatDayOffsetBadge(rawDayOffset);

  // Has confirmed seat in any checked class?
  const hasConfirmed = (train.classes || []).some(
    (c) =>
      c.state === 'CHECKED' &&
      !/NOT|REGRET|CANCEL/i.test(c.availabilityText || '') &&
      (c.tier === 'AVAILABLE' || /AVL|\bAVAILABLE\b/i.test(c.availabilityText || ''))
  );

  const handleRefresh = async () => {
    if (isRefreshing || !onRefreshCard) return;
    setIsRefreshing(true);
    setRefreshMessage(null);
    try {
      // Find the first checked class or default to first offered
      const checkedClass = (train.classes || []).find((c) => c.state === 'CHECKED')?.class || train.classes?.[0]?.class || 'SL';
      await onRefreshCard({
        trainNo,
        from,
        to,
        class: checkedClass,
        date,
        quota,
      });
      setRefreshMessage('Refreshed');
      setTimeout(() => setRefreshMessage(null), 3000);
    } catch (err) {
      setRefreshMessage(err.message || 'Refresh failed');
      setTimeout(() => setRefreshMessage(null), 4000);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="relative rounded-2xl border border-[#303640] bg-[#12151A] p-4 sm:p-5 shadow-lg hover:border-[#3E4654] transition-all">
      {/* Top Header: Train Info & Refresh status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-[#242931]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1A1F26] border border-[#303640] text-[#E8B04A]">
            <Train className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#F0F1F3] text-sm sm:text-base">{trainNo}</span>
              <span className="text-[#A7AFBA] text-xs sm:text-sm font-medium">{trainName}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#7E8794]">
              <span>{from} → {to}</span>
              {(() => {
                const resolvedTarget = (
                  requestedDestination ||
                  KNOWN_CODES[String(destinationCode || '').toUpperCase().trim()] ||
                  (String(destinationCode || '').length <= 5 ? String(destinationCode || '').toUpperCase().trim() : null)
                );
                const trainToCode = String(to || '').toUpperCase().trim();
                const showNotice = Boolean(resolvedTarget && trainToCode && trainToCode !== resolvedTarget);
                if (!showNotice) return null;
                const targetName = requestedDestinationName || STATION_DISPLAY_NAMES[resolvedTarget] || destinationName || resolvedTarget;
                const arrivingAtName = train.toName || STATION_DISPLAY_NAMES[trainToCode] || trainToCode;
                return (
                  <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                    Arrives at {arrivingAtName}, not {targetName}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Checked N min ago + Refresh button */}
        <div className="flex items-center gap-2 self-start sm:self-auto text-xs text-[#7E8794]">
          {train.isCachedResult && (
            <span className="rounded bg-sky-500/15 border border-sky-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
              cached result
            </span>
          )}
          {refreshMessage ? (
            <span className="text-[11px] text-[#E8B04A] animate-pulse">{refreshMessage}</span>
          ) : (
            <span className="text-[11px] text-[#A7AFBA]">{formatCheckedAgo(checkedAt)}</span>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center justify-center rounded-lg p-1 text-[#A7AFBA] hover:text-[#E8B04A] hover:bg-[#1A1F26] transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh card availability (1 per minute)"
            aria-label={`Refresh availability for train ${trainNo}`}
          >
            <RotateCcw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-[#E8B04A]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Schedule Row */}
      <div className="grid grid-cols-3 items-center py-4 text-center sm:text-left">
        {/* Departure */}
        <div>
          <div className="text-lg sm:text-xl font-bold text-[#F0F1F3]">{depTime || '--:--'}</div>
          <div className="text-xs font-semibold text-[#A7AFBA]">{from}</div>
        </div>

        {/* Duration / Direction Indicator */}
        <div className="flex flex-col items-center justify-center">
          <span className="text-[11px] font-medium text-[#7E8794]">{duration}</span>
          <div className="relative flex items-center justify-center w-full max-w-[120px] my-1">
            <div className="h-0.5 w-full bg-[#303640]" />
            <ArrowRight className="absolute right-0 h-3 w-3 text-[#E8B04A]" />
          </div>
          <span className="text-[10px] text-emerald-400 font-medium">Direct Train</span>
        </div>

        {/* Arrival with optional day offset */}
        <div className="sm:text-right">
          <div className="text-lg sm:text-xl font-bold text-[#F0F1F3] flex items-baseline justify-center sm:justify-end gap-1.5">
            <span>{arrTime || '--:--'}</span>
            {dayOffsetBadge && (
              <span className="rounded-md bg-[#E8B04A]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#E8B04A] border border-[#E8B04A]/30">
                {dayOffsetBadge}
              </span>
            )}
          </div>
          <div className="text-xs font-semibold text-[#A7AFBA]">{to}</div>
        </div>
      </div>

      {/* Class Chips Strip */}
      <div className="pt-2 border-t border-[#242931] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex-1">
          <P0ClassChips
            trainNo={trainNo}
            from={from}
            to={to}
            date={date}
            quota={quota}
            classes={train.classes || []}
            onCheckClass={onCheckClass}
            activeClassFilter={activeClassFilter}
            onSelectClassFilter={onSelectClassFilter}
          />
        </div>

        {/* Action Button */}
        {hasConfirmed && (
          <button
            type="button"
            onClick={() => onBook && onBook(train)}
            className="inline-flex items-center justify-center rounded-xl bg-[#E8B04A] px-4 py-1.5 text-xs font-bold text-[#0B0D10] hover:bg-[#F2BE62] transition-colors shadow-sm cursor-pointer self-end sm:self-auto min-w-[80px]"
          >
            Book Now
          </button>
        )}
      </div>
    </div>
  );
}

export default P0DirectTrainCard;
