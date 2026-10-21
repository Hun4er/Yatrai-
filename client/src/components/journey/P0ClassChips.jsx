import React, { useState } from 'react';
import { Loader2, HelpCircle } from 'lucide-react';

/**
 * P0ClassChips Component (P0 v2)
 *
 * Displays class chips with exact text labels per spec:
 *   "SL AVL 12"
 *   "3A RAC 3"
 *   "2A WL 11 (89%)"
 *   "1A ?"
 *
 * Tapping a "?" chip triggers checkClass (1 call, under its own actionId).
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
    // If chip is not checked yet (state === 'UNCHECKED' or 'UNVERIFIED' or no availabilityText)
    if (chip.state === 'UNCHECKED' || chip.state === 'UNVERIFIED' || !chip.availabilityText) {
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
   * Formats the label text:
   * e.g., "SL AVL 12", "3A RAC 3", "2A WL 11 (89%)", "1A ?"
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

    if (chip.state === 'UNCHECKED' || chip.state === 'UNVERIFIED' || !chip.availabilityText) {
      return (
        <span className="flex items-center gap-0.5">
          <span>{cls}</span>
          <span className="font-bold text-[#E8B04A]">?</span>
        </span>
      );
    }

    const text = chip.availabilityText || '';
    const tier = (chip.tier || '').toUpperCase();
    const pct = chip.predictionPercentage > 0 ? ` (${chip.predictionPercentage}%)` : '';

    // If text already starts with status e.g. "AVAILABLE 12" -> format as "SL AVL 12"
    let statusSummary = text;
    if (tier === 'AVAILABLE') {
      const match = text.match(/\d+/);
      statusSummary = match ? `AVL ${match[0]}` : 'AVL';
    } else if (tier === 'RAC') {
      const match = text.match(/\d+/);
      statusSummary = match ? `RAC ${match[0]}` : 'RAC';
    } else if (tier === 'WAITLIST' || tier === 'WL') {
      const match = text.match(/\d+/);
      statusSummary = match ? `WL ${match[0]}${pct}` : `WL${pct}`;
    }

    return `${cls} ${statusSummary}`;
  };

  /**
   * Styling based on tier and state
   */
  const getChipStyle = (chip) => {
    const isQuestion = chip.state === 'UNCHECKED' || chip.state === 'UNVERIFIED' || !chip.availabilityText;
    const isSelected = activeClassFilter === chip.class;

    if (isQuestion) {
      return 'border border-dashed border-[#4B5563] bg-[#1A1F26] text-[#9CA3AF] hover:border-[#E8B04A] hover:text-[#E8B04A] hover:bg-[#202731] cursor-pointer';
    }

    const tier = (chip.tier || '').toUpperCase();
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
    // WAITLIST or other
    return isSelected
      ? 'border border-[#6B7280] bg-[#2A313C] text-[#E5E7EB] font-semibold'
      : 'border border-[#374151] bg-[#161B22] text-[#9CA3AF] hover:border-[#4B5563]';
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Class availability chips">
      {classes.map((chip, idx) => (
        <button
          key={chip.class || idx}
          type="button"
          onClick={() => handleChipClick(chip)}
          className={`inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-xs transition-all ${getChipStyle(chip)}`}
          title={
            chip.state === 'UNCHECKED' || chip.state === 'UNVERIFIED'
              ? `Check availability for ${chip.class} (1 call)`
              : `${chip.class}: ${chip.availabilityText || 'Checked'}`
          }
        >
          {renderChipContent(chip)}
        </button>
      ))}
    </div>
  );
}

export default P0ClassChips;
