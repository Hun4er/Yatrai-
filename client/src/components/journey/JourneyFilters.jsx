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
 * Implements Section 17 (Simplified Filter Experience):
 * 1. Transport: Train, Bus, Flight, Road
 * 2. Transfers: Any, Direct only, 1 max, 2 max
 * 3. Price: Range slider / limits
 * 4. Departure: Morning, Afternoon, Evening, Night
 * 5. Advanced filters: [ More filters ] for Duration and granular limits
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

  const allAvailableModes = bounds.availableModes?.length > 0
    ? bounds.availableModes
    : ['rail', 'bus', 'flight', 'road'];

  return (
    <aside
      className={`rounded-2xl border border-white/10 bg-surface-primary p-5 sm:p-6 shadow-sm ${
        isMobile ? 'w-full' : 'sticky top-20'
      }`}
      aria-label="Journey Filters"
    >
      {/* Filters Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-brand-primary" aria-hidden="true" />
          <h2 className="text-sm font-bold tracking-tight text-text-primary">FILTERS</h2>
          {activeCount > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-primary px-1.5 text-[11px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-primary hover:text-brand-hover transition-colors cursor-pointer focus:outline-none"
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
              className="rounded-lg bg-brand-primary px-3 py-1 text-xs font-semibold text-white shadow-sm cursor-pointer"
            >
              Apply filters
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-6">
        {/* 1. Transport Modes */}
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold uppercase tracking-wider text-text-secondary">
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
                      ? 'border-brand-primary/40 bg-surface-secondary text-text-primary font-medium'
                      : 'border-white/5 bg-surface-secondary/40 text-text-tertiary'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleModeToggle(mode)}
                    className="h-3.5 w-3.5 rounded border-white/20 bg-surface-secondary text-brand-primary focus:ring-brand-primary accent-brand-primary"
                  />
                  <Icon className="h-3.5 w-3.5 text-brand-primary shrink-0" aria-hidden="true" />
                  <span className="truncate">{modeLabel}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* 2. Transfers */}
        <fieldset className="space-y-2 border-t border-white/5 pt-4">
          <legend className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Transfers
          </legend>
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Transfer count filter">
            {TRANSFER_FILTER_OPTIONS.map((opt) => {
              const isSelected = (filters.transfers || 'any') === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleTransferChange(opt.id)}
                  className={`rounded-xl px-2.5 py-2 text-xs font-medium transition-all text-center cursor-pointer ${
                    isSelected
                      ? 'bg-brand-primary text-white shadow-sm shadow-brand-primary/20 ring-1 ring-brand-primary'
                      : 'bg-surface-secondary text-text-secondary border border-white/5 hover:border-white/10 hover:text-text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* 3. Price Filter */}
        <fieldset className="space-y-3 border-t border-white/5 pt-4">
          <div className="flex items-center justify-between">
            <legend className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Price
            </legend>
            <span className="text-xs font-bold text-text-primary font-mono">
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
            className="w-full accent-brand-primary cursor-pointer"
            aria-valuemin={bounds.minPrice}
            aria-valuemax={bounds.maxPrice}
            aria-valuenow={filters.maxPrice !== null ? filters.maxPrice : bounds.maxPrice}
          />

          <div className="flex justify-between text-[11px] text-text-tertiary font-mono">
            <span>{formatPrice(bounds.minPrice, currency)}</span>
            <span>{formatPrice(bounds.maxPrice, currency)}</span>
          </div>
        </fieldset>

        {/* 4. Departure Time */}
        <fieldset className="space-y-2 border-t border-white/5 pt-4">
          <legend className="text-xs font-bold uppercase tracking-wider text-text-secondary">
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
                      ? 'border-brand-primary/50 bg-brand-soft/50 text-text-primary font-semibold'
                      : 'border-white/5 bg-surface-secondary/40 text-text-secondary hover:border-white/10 hover:text-text-primary'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="departureTimeBucket"
                      value={bucket.id}
                      checked={isSelected}
                      onChange={() => handleDepartureBucketChange(bucket.id)}
                      className="accent-brand-primary"
                    />
                    <span>{bucket.label}</span>
                  </div>
                  <span className="text-[11px] text-text-tertiary">{bucket.description}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* 5. Advanced filters toggle */}
        <div className="border-t border-white/5 pt-4 space-y-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="w-full flex items-center justify-between text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            <span>Advanced filters</span>
            {showAdvanced ? (
              <ChevronUp className="h-3.5 w-3.5 text-brand-primary" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-brand-primary" />
            )}
          </button>

          {showAdvanced && (
            <div className="space-y-4 pt-2 animate-in fade-in">
              {/* Max Duration */}
              {bounds.maxDuration > bounds.minDuration && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">Max Duration</span>
                    <span className="font-bold text-brand-primary font-mono">
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
                    className="w-full accent-brand-primary cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] text-text-tertiary">
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
