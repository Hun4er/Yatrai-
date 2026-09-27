import {
  SlidersHorizontal,
  RotateCcw,
  Train,
  Bus,
  Plane,
  Car,
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
 * Renders the filter controls for Price, Duration, Transfers,
 * Transport Modes, and Departure Time buckets.
 */
export function JourneyFilters({
  filters,
  onChange,
  onReset,
  bounds,
  isMobile = false,
  onCloseMobile,
}) {
  const activeCount = countActiveFilters(filters, bounds);
  const currency = bounds.currencies?.[0] || 'INR';

  const handlePriceChange = (field, val) => {
    const num = val === '' ? null : Math.max(0, Number(val));
    onChange({
      ...filters,
      [field]: num,
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
          <h2 className="text-sm font-bold tracking-tight text-text-primary">Filters</h2>
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
              className="rounded-lg bg-surface-secondary px-3 py-1 text-xs font-semibold text-text-primary border border-white/10"
            >
              Done
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-6">
        {/* 1. Price Filter */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Price Range
          </legend>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label htmlFor="filter-min-price" className="block text-[11px] text-text-tertiary mb-1">
                Min ({currency})
              </label>
              <input
                id="filter-min-price"
                type="number"
                min={bounds.minPrice}
                max={bounds.maxPrice}
                placeholder={formatPrice(bounds.minPrice, currency)}
                value={filters.minPrice !== null ? filters.minPrice : ''}
                onChange={(e) => handlePriceChange('minPrice', e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-surface-secondary px-3 py-2 text-xs text-text-primary placeholder:text-text-disabled focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>
            <div>
              <label htmlFor="filter-max-price" className="block text-[11px] text-text-tertiary mb-1">
                Max ({currency})
              </label>
              <input
                id="filter-max-price"
                type="number"
                min={bounds.minPrice}
                max={bounds.maxPrice}
                placeholder={formatPrice(bounds.maxPrice, currency)}
                value={filters.maxPrice !== null ? filters.maxPrice : ''}
                onChange={(e) => handlePriceChange('maxPrice', e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-surface-secondary px-3 py-2 text-xs text-text-primary placeholder:text-text-disabled focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>
          </div>
          <div className="flex justify-between text-[11px] text-text-tertiary">
            <span>Min: {formatPrice(bounds.minPrice, currency)}</span>
            <span>Max: {formatPrice(bounds.maxPrice, currency)}</span>
          </div>
        </fieldset>

        {/* 2. Duration Filter */}
        {bounds.maxDuration > bounds.minDuration && (
          <fieldset className="space-y-2 border-t border-white/5 pt-4">
            <div className="flex items-center justify-between">
              <legend className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                Max Duration
              </legend>
              <span className="text-xs font-semibold text-brand-primary font-mono">
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
              aria-valuemin={bounds.minDuration}
              aria-valuemax={bounds.maxDuration}
              aria-valuenow={filters.maxDuration !== null ? filters.maxDuration : bounds.maxDuration}
            />
            <div className="flex justify-between text-[11px] text-text-tertiary">
              <span>{formatDuration(bounds.minDuration)}</span>
              <span>{formatDuration(bounds.maxDuration)}</span>
            </div>
          </fieldset>
        )}

        {/* 3. Transfers Filter */}
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
                  className={`rounded-xl px-3 py-2 text-xs font-medium transition-all text-center cursor-pointer ${
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

        {/* 4. Transport Type Filter */}
        <fieldset className="space-y-2.5 border-t border-white/5 pt-4">
          <legend className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Transport Mode
          </legend>
          <div className="space-y-1.5">
            {allAvailableModes.map((mode) => {
              const Icon = getModeIcon(mode);
              const isChecked =
                !filters.transportModes ||
                filters.transportModes.length === 0 ||
                filters.transportModes.includes(mode);

              return (
                <label
                  key={mode}
                  className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 hover:bg-surface-secondary transition-colors cursor-pointer text-xs"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleModeToggle(mode)}
                    className="h-4 w-4 rounded border-white/20 bg-surface-secondary text-brand-primary focus:ring-brand-primary accent-brand-primary"
                  />
                  <Icon className="h-3.5 w-3.5 text-brand-primary shrink-0" aria-hidden="true" />
                  <span className="capitalize text-text-primary font-medium">{mode}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* 5. Departure Time Filter */}
        <fieldset className="space-y-2 border-t border-white/5 pt-4">
          <legend className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Departure Time
          </legend>
          <div className="space-y-1.5">
            {DEPARTURE_TIME_BUCKET_CONFIG.map((bucket) => {
              const isSelected = (filters.departureTimeBucket || 'any') === bucket.id;
              return (
                <label
                  key={bucket.id}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 border transition-all cursor-pointer text-xs ${
                    isSelected
                      ? 'border-brand-primary/50 bg-brand-soft/50 text-text-primary'
                      : 'border-white/5 bg-surface-secondary/50 text-text-secondary hover:border-white/10 hover:text-text-primary'
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
                    <span className="font-medium">{bucket.label}</span>
                  </div>
                  <span className="text-[11px] text-text-tertiary">{bucket.description}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>
    </aside>
  );
}

export default JourneyFilters;
