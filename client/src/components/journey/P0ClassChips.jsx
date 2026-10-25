import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * P0ClassChips Component (P0 v2 / Phase 2)
 *
 * Displays class chips with exact text labels per spec:
 *   "SL · AVL 12"
 *   "3A · RAC 3"
 *   "3A · WL 11 · 89%"
 *   "2A · Not available"
 *   "1A · ?" (tap = 1 call)
 *   "2A · couldn't check" (tap = retry)
 * Checked chips also show fare: e.g. "₹2,545"
 *
 * "UNKNOWN" is completely removed from the UI vocabulary.
 */
export function P0ClassChips({
  trainNo,
  from,
  to,
  date,
  quota = 'GN',
  classes = [],
  onCheckClass,
  activeClassFilter,
  onSelectClassFilter,
}) {
  const [loadingClass, setLoadingClass] = useState(null);

  const handleChipClick = async (chip) => {
    const isError = chip.tier === 'ERROR' || chip.tier === 'UNKNOWN' || chip.tier === 'UNAVAILABLE';
    const isUnchecked = chip.state === 'UNCHECKED' || chip.state === 'UNVERIFIED' || !chip.tier;

    // Tapping a "?", unavailable, or "couldn't check" chip triggers checkClass (1 call, under its own actionId)
    if (isUnchecked || isError) {
      if (!onCheckClass) return;
      setLoadingClass(chip.class);
      try {
        await onCheckClass({
          trainNo,
          from,
          to,
          class: chip.class,
          date,
          quota,
        });
      } finally {
        setLoadingClass(null);
      }
    } else if (onSelectClassFilter) {
      onSelectClassFilter(chip.class === activeClassFilter ? null : chip.class);
    }
  };

  /**
   * Formats the label text per spec:
   * "SL · AVL 12", "3A · RAC 3", "3A · WL 11 · 89%", "2A · Not available", "1A · ?", "2A · couldn't check"
   */
  const renderChipContent = (chip) => {
    const cls = chip.class;
    const isLoading = loadingClass === cls;

    if (isLoading) {
      return (
        <span className="flex items-center gap-1">
          <span>{cls}</span>
          <Loader2 className="h-3 w-3 animate-spin text-[#E8B04A]" />
        </span>
      );
    }

    if (chip.state === 'UNCHECKED' || chip.state === 'UNVERIFIED' || !chip.tier) {
      return (
        <span className="flex items-center gap-1">
          <span>{cls}</span>
          <span>·</span>
          <span className="font-bold text-[#E8B04A]">?</span>
        </span>
      );
    }

    const tier = (chip.tier || '').toUpperCase();

    // 1. Error / Couldn't check -> Neutral grey "tap to retry" (calm failure state)
    if (tier === 'ERROR' || tier === 'UNKNOWN') {
      return (
        <span className="flex items-center gap-1 text-[#9CA3AF]">
          <span>{cls}</span>
          <span>·</span>
          <span>tap to retry</span>
        </span>
      );
    }

    // 2. Stale availability -> "older · 14:02"
    if (chip.state === 'STALE' || tier === 'OLDER_RESULT') {
      let timeStr = '14:02';
      if (chip.checkedAt) {
        try {
          const d = new Date(chip.checkedAt);
          if (!isNaN(d.getTime())) {
            timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
          }
        } catch {}
      }
      return (
        <span className="flex items-center gap-1 text-[#C5A880]">
          <span>{cls}</span>
          <span>·</span>
          <span>older · {timeStr}</span>
        </span>
      );
    }

    // 3. Not Bookable (Chart prepared, departed, booking closed, class not offered)
    if (tier === 'NOT_BOOKABLE' || chip.isNotBookable) {
      let reasonText = chip.availabilityText || 'Not available';
      if (chip.reason === 'CHART_PREPARED') reasonText = 'Chart prepared';
      else if (chip.reason === 'TRAIN_DEPARTED') reasonText = 'Departed';
      else if (chip.reason === 'BOOKING_CLOSED' || chip.reason === 'REGRET') reasonText = 'Booking closed';
      else if (chip.reason === 'BOOKING_NOT_OPEN') reasonText = 'Booking not open';
      else if (chip.reason === 'CLASS_NOT_OFFERED') reasonText = 'Not offered on this train';

      return (
        <span className="flex items-center gap-1 text-[#9CA3AF]">
          <span>{cls}</span>
          <span>·</span>
          <span>{reasonText}</span>
        </span>
      );
    }

    // 4. Unavailable
    if (tier === 'UNAVAILABLE') {
      return (
        <span className="flex items-center gap-1 text-[#9CA3AF]">
          <span>{cls}</span>
          <span>·</span>
          <span>Not available</span>
        </span>
      );
    }

    // Fare string if present on checked chip
    const fareStr = (typeof chip.fare === 'number' && chip.fare > 0)
      ? ` · ₹${chip.fare.toLocaleString('en-IN')}`
      : '';

    // 5. Available
    if (tier === 'AVAILABLE') {
      let count = chip.seatsAvailable;
      if (count === null || count === undefined) {
        const match = String(chip.availabilityText || '').match(/\d+/);
        count = match ? match[0] : '';
      }
      const avlText = count ? `AVL ${count}` : 'AVL';
      return (
        <span className="flex items-center gap-1">
          <span>{cls}</span>
          <span>·</span>
          <span>{avlText}</span>
          {fareStr && <span className="text-emerald-300 font-semibold">{fareStr}</span>}
        </span>
      );
    }

    // 6. RAC
    if (tier === 'RAC') {
      let racPos = chip.racPosition ?? chip.seatsAvailable;
      if (!racPos) {
        const match = String(chip.availabilityText || '').match(/\d+/);
        racPos = match ? match[0] : '';
      }
      const racText = racPos ? `RAC ${racPos}` : 'RAC';
      return (
        <span className="flex items-center gap-1">
          <span>{cls}</span>
          <span>·</span>
          <span>{racText}</span>
          {fareStr && <span className="text-[#E8B04A] font-semibold">{fareStr}</span>}
        </span>
      );
    }

    // 7. WAITLIST
    if (tier === 'WAITLIST' || tier === 'WL') {
      let wlPos = chip.waitlistPosition;
      if (!wlPos) {
        const slashMatch = /(?:GNWL|RLWL|PQWL|TQWL|RSWL|WL)\s*\d+\s*\/\s*(?:WL\s*)?(\d+)/i.exec(String(chip.availabilityText || ''));
        if (slashMatch) {
          wlPos = slashMatch[1];
        } else {
          const match = String(chip.availabilityText || '').match(/\d+/);
          wlPos = match ? match[0] : '';
        }
      }
      const pct = chip.predictionPercentage > 0 ? ` · ${chip.predictionPercentage}%` : '';
      const wlText = wlPos ? `WL ${wlPos}${pct}` : `WL${pct}`;
      return (
        <span className="flex items-center gap-1">
          <span>{cls}</span>
          <span>·</span>
          <span>{wlText}</span>
          {fareStr && <span className="text-[#A7AFBA] font-semibold">{fareStr}</span>}
        </span>
      );
    }

    return `${cls} · ${chip.availabilityText || tier}`;
  };

  /**
   * Styling based on tier and state
   */
  const getChipStyle = (chip) => {
    const isQuestion = chip.state === 'UNCHECKED' || chip.state === 'UNVERIFIED' || !chip.tier;
    const isSelected = activeClassFilter === chip.class;

    if (isQuestion) {
      return 'border border-dashed border-[#4B5563] bg-[#1A1F26] text-[#9CA3AF] hover:border-[#E8B04A] hover:text-[#E8B04A] hover:bg-[#202731] cursor-pointer';
    }

    const tier = (chip.tier || '').toUpperCase();
    if (tier === 'ERROR' || tier === 'UNKNOWN') {
      return 'border border-dashed border-[#4B5563] bg-[#1A1F26] text-[#9CA3AF] hover:border-[#6B7280] hover:text-[#D1D5DB] hover:bg-[#202731] cursor-pointer';
    }
    if (chip.state === 'STALE' || tier === 'OLDER_RESULT') {
      return 'border border-[#4B443B] bg-[#1A1815] text-[#C5A880] hover:border-[#6B5E4F] cursor-pointer';
    }
    if (tier === 'NOT_BOOKABLE' || chip.isNotBookable || tier === 'UNAVAILABLE') {
      return 'border border-[#303640] bg-[#12151A] text-[#7E8794] opacity-80 cursor-default';
    }
    if (tier === 'AVAILABLE') {
      return isSelected
        ? 'border border-emerald-400 bg-emerald-500/20 text-emerald-300 font-semibold shadow-sm shadow-emerald-900/30'
        : 'border border-emerald-500/40 bg-emerald-950/40 text-emerald-400 hover:border-emerald-400 font-medium';
    }
    if (tier === 'RAC') {
      return isSelected
        ? 'border border-amber-400 bg-amber-500/20 text-amber-300 font-semibold shadow-sm'
        : 'border border-amber-500/40 bg-amber-950/40 text-amber-400 hover:border-amber-400 font-medium';
    }
    // WAITLIST
    return isSelected
      ? 'border border-[#6B7280] bg-[#2A313C] text-[#E5E7EB] font-semibold'
      : 'border border-[#374151] bg-[#161B22] text-[#9CA3AF] hover:border-[#4B5563]';
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Class availability chips">
      {classes.map((chip, idx) => {
        const isError = chip.tier === 'ERROR' || chip.tier === 'UNKNOWN';
        const isUnchecked = chip.state === 'UNCHECKED' || chip.state === 'UNVERIFIED' || !chip.tier;

        return (
          <button
            key={chip.class || idx}
            type="button"
            onClick={() => handleChipClick(chip)}
            className={`inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-xs transition-all ${getChipStyle(chip)}`}
            title={
              isUnchecked
                ? `Check availability for ${chip.class} (1 call)`
                : isError
                ? `Could not check availability. Tap to retry (1 call)`
                : `${chip.class}: ${chip.availabilityText || 'Checked'}`
            }
          >
            {renderChipContent(chip)}
          </button>
        );
      })}
    </div>
  );
}

export default P0ClassChips;
