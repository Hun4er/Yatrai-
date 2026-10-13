import React, { useState } from 'react';
import {
  SlidersHorizontal,
  RotateCcw,
  Train,
  Bus,
  Plane,
  Car,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  DEPARTURE_TIME_BUCKET_CONFIG,
  TRANSFER_FILTER_OPTIONS,
  countActiveFilters,
} from '../../utils/journeyFilters.js';
import { formatDuration, formatPrice } from '../../utils/formatters.js';

export function getModeIcon(mode) {
  const normalized = (mode || '').toLowerCase();
  switch (normalized) {
    case 'rail':
    case 'train':
      return Train;
    case 'bus':
      return Bus;
    case 'flight':
    case 'air':
      return Plane;
    case 'road':
    case 'car':
      return Car;
    default:
      return Train;
  }
}

/**
 * JourneyFilters Component
 *
 * Implements simplified filter experience matching the Graphite & Amber homepage theme:
 * - Surface container: #12151A with #303640 borders
 * - Filter controls: #15191F with #E8B04A amber primary highlights
 * - Clear contrast typography: #F0F1F3, #A7AFBA, #7E8794
 */
export function JourneyFilters({
  filters,
  onChange,
  onReset,
  bounds,
  isMobile = false,
  onCloseMobile,
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const activeCount = countActiveFilters(filters, bounds);
  const currency = bounds.currencies?.[0] || 'INR';

  const handlePriceChange = (val) => {
    const num = val === '' ? null : Math.max(0, Number(val));
    onChange({
      ...filters,
      maxPrice: num,
    });
  };

  const handleDurationChange = (val) => {
    const num = val === '' ? null : Number(val);
    onChange({
      ...filters,
      maxDuration: num,
    });
  };

  const handleTransferChange = (transferId) => {
    onChange({
      ...filters,
      transfers: transferId,
    });
  };

  const handleModeToggle = (mode) => {
    const current = filters.transportModes || [];
    let updated;
    if (current.includes(mode)) {
      updated = current.filter((m) => m !== mode);
    } else {
      updated = [...current, mode];
    }
    onChange({
      ...filters,
      transportModes: updated,
    });
  };

  const handleDepartureBucketChange = (bucketId) => {
    onChange({
      ...filters,
      departureTimeBucket: bucketId,
    });
  };

  const allAvailableModes = (bounds.availableModes?.length > 0
    ? bounds.availableModes
    : ['rail']).filter((m) => m === 'rail' || m === 'train');

  return (
    <aside
      className={`rounded-2xl border border-[#303640] bg-[#12151A] p-5 sm:p-6 shadow-xl ${
        isMobile ? 'w-full' : 'sticky top-20'
      }`}
      aria-label="Journey Filters"
    >
      {/* Filters Header */}
      <div className="flex items-center justify-between border-b border-[#303640]/80 pb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-[#E8B04A]" aria-hidden="true" />
          <h2 className="text-xs font-bold tracking-wider uppercase text-[#F0F1F3]">FILTERS</h2>
          {activeCount > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#E8B04A] px-1.5 text-[11px] font-bold text-[#0B0D10]">
              {activeCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#E8B04A] hover:text-[#F2BE62] transition-colors cursor-pointer focus:outline-none"
              aria-label="Clear all filters"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              <span>Clear</span>
            </button>
          )}

          {isMobile && onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="rounded-lg bg-[#E8B04A] hover:bg-[#F2BE62] px-3 py-1 text-xs font-semibold text-[#0B0D10] shadow-sm cursor-pointer transition-colors"
            >
              Apply filters
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-6">
        {/* 1. Transport Modes */}
        {allAvailableModes.length > 1 && (
          <fieldset className="space-y-2">
            <legend className="text-[11px] font-semibold uppercase tracking-wider text-[#7E8794]">
              Transport
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {allAvailableModes.map((mode) => {
                const Icon = getModeIcon(mode);
                const isChecked =
                  !filters.transportModes ||
                  filters.transportModes.length === 0 ||
                  filters.transportModes.includes(mode);

                const modeLabel = mode === 'rail' ? 'Train' : mode.charAt(0).toUpperCase() + mode.slice(1);

                return (
                  <label
                    key={mode}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 border transition-all cursor-pointer text-xs ${
                      isChecked
                        ? 'border-[#E8B04A]/40 bg-[#15191F] text-[#F0F1F3] font-medium'
                        : 'border-[#303640] bg-[#15191F]/40 text-[#7E8794] hover:border-[#3A414C]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleModeToggle(mode)}
                      className="h-3.5 w-3.5 rounded border-[#303640] bg-[#15191F] text-[#E8B04A] focus:ring-[#E8B04A] accent-[#E8B04A]"
                    />
                    <Icon className="h-3.5 w-3.5 text-[#E8B04A] shrink-0" aria-hidden="true" />
                    <span className="truncate">{modeLabel}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {/* 2. Transfers */}
        <fieldset className={`space-y-2.5 ${allAvailableModes.length > 1 ? 'border-t border-[#303640]/80 pt-4' : ''}`}>
          <legend className="text-[11px] font-semibold uppercase tracking-wider text-[#7E8794]">
            Transfers
          </legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Transfer count filter">
            {TRANSFER_FILTER_OPTIONS.map((opt) => {
              const isSelected = (filters.transfers || 'any') === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleTransferChange(opt.id)}
                  className={`rounded-xl px-3 py-2 text-xs font-medium transition-all text-center cursor-pointer ${
                    isSelected
                      ? 'bg-[#E8B04A] text-[#0B0D10] font-semibold shadow-sm shadow-[#E8B04A]/10'
                      : 'bg-[#15191F] text-[#A7AFBA] border border-[#303640] hover:border-[#3A414C] hover:text-[#F0F1F3]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* 3. Price Filter */}
        <fieldset className="space-y-3 border-t border-[#303640]/80 pt-4">
          <div className="flex items-center justify-between">
            <legend className="text-[11px] font-semibold uppercase tracking-wider text-[#7E8794]">
              Price
            </legend>
            <span className="text-xs font-bold text-[#F0F1F3] font-mono tabular-nums">
              {filters.maxPrice !== null
                ? formatPrice(filters.maxPrice, currency)
                : formatPrice(bounds.maxPrice, currency)}
            </span>
          </div>

          <input
            id="filter-max-price"
            type="range"
            min={bounds.minPrice}
            max={bounds.maxPrice}
            step={100}
            value={filters.maxPrice !== null ? filters.maxPrice : bounds.maxPrice}
            onChange={(e) => handlePriceChange(Number(e.target.value))}
            className="w-full accent-[#E8B04A] cursor-pointer"
            aria-valuemin={bounds.minPrice}
            aria-valuemax={bounds.maxPrice}
            aria-valuenow={filters.maxPrice !== null ? filters.maxPrice : bounds.maxPrice}
          />

          <div className="flex justify-between text-[11px] text-[#7E8794] font-mono tabular-nums">
            <span>{formatPrice(bounds.minPrice, currency)}</span>
            <span>{formatPrice(bounds.maxPrice, currency)}</span>
          </div>
        </fieldset>

        {/* 4. Departure Time */}
        <fieldset className="space-y-2 border-t border-[#303640]/80 pt-4">
          <legend className="text-[11px] font-semibold uppercase tracking-wider text-[#7E8794]">
            Departure
          </legend>
          <div className="space-y-1.5">
            {DEPARTURE_TIME_BUCKET_CONFIG.map((bucket) => {
              const isSelected = (filters.departureTimeBucket || 'any') === bucket.id;
              return (
                <label
                  key={bucket.id}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 border transition-all cursor-pointer text-xs ${
                    isSelected
                      ? 'border-[#E8B04A]/50 bg-[#15191F] text-[#F0F1F3] font-semibold'
                      : 'border-[#303640] bg-[#15191F]/40 text-[#A7AFBA] hover:border-[#3A414C] hover:text-[#F0F1F3]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="departureTimeBucket"
                      value={bucket.id}
                      checked={isSelected}
                      onChange={() => handleDepartureBucketChange(bucket.id)}
                      className="accent-[#E8B04A]"
                    />
                    <span>{bucket.label}</span>
                  </div>
                  <span className="text-[11px] text-[#7E8794]">{bucket.description}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* 5. Advanced filters toggle */}
        <div className="border-t border-[#303640]/80 pt-4 space-y-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="w-full flex items-center justify-between text-xs font-semibold text-[#A7AFBA] hover:text-[#F0F1F3] transition-colors cursor-pointer"
          >
            <span>Advanced filters</span>
            {showAdvanced ? (
              <ChevronUp className="h-3.5 w-3.5 text-[#E8B04A]" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-[#E8B04A]" />
            )}
          </button>

          {showAdvanced && (
            <div className="space-y-4 pt-2 animate-in fade-in">
              {/* Max Duration */}
              {bounds.maxDuration > bounds.minDuration && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#A7AFBA]">Max Duration</span>
                    <span className="font-bold text-[#F0F1F3] font-mono tabular-nums">
                      {filters.maxDuration !== null
                        ? formatDuration(filters.maxDuration)
                        : formatDuration(bounds.maxDuration)}
                    </span>
                  </div>
                  <input
                    id="filter-max-duration"
                    type="range"
                    min={bounds.minDuration}
                    max={bounds.maxDuration}
                    step={15}
                    value={filters.maxDuration !== null ? filters.maxDuration : bounds.maxDuration}
                    onChange={(e) => handleDurationChange(Number(e.target.value))}
                    className="w-full accent-[#E8B04A] cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] text-[#7E8794] font-mono tabular-nums">
                    <span>{formatDuration(bounds.minDuration)}</span>
                    <span>{formatDuration(bounds.maxDuration)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export default JourneyFilters;
