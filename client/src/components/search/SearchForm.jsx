import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, Calendar, Search, Loader2 } from 'lucide-react';

/**
 * SearchForm Component
 *
 * Provides the primary journey discovery input: Origin, Destination, and Departure Date.
 * Handles client-side validation, accessible form inputs, and triggers search submission.
 */
export function SearchForm({
  initialOrigin = '',
  initialDestination = '',
  initialDate = '',
  onSearch,
  isLoading = false,
  compact = false,
}) {
  const [origin, setOrigin] = useState(initialOrigin);
  const [destination, setDestination] = useState(initialDestination);
  const [departureDate, setDepartureDate] = useState(initialDate);
  const [errors, setErrors] = useState({});

  // Sync state if initial props change (e.g. from URL params or navigation)
  useEffect(() => {
    if (initialOrigin) setOrigin(initialOrigin);
    if (initialDestination) setDestination(initialDestination);
    if (initialDate) setDepartureDate(initialDate);
  }, [initialOrigin, initialDestination, initialDate]);

  // Set default date to today's or tomorrow's date if not set
  useEffect(() => {
    if (!departureDate) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      setDepartureDate(`${yyyy}-${mm}-${dd}`);
    }
  }, [departureDate]);

  const validate = () => {
    const errs = {};
    if (!origin || !origin.trim()) {
      errs.origin = 'Please enter an origin city or station.';
    }
    if (!destination || !destination.trim()) {
      errs.destination = 'Please enter a destination city or station.';
    }
    if (
      origin &&
      destination &&
      origin.trim().toLowerCase() === destination.trim().toLowerCase()
    ) {
      errs.destination = 'Origin and destination cannot be the same.';
    }
    if (!departureDate) {
      errs.departureDate = 'Please select a travel date.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLoading) return;

    if (validate()) {
      onSearch({
        origin: origin.trim(),
        destination: destination.trim(),
        departureDate,
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className={`w-full rounded-2xl border border-white/10 bg-surface-primary p-5 sm:p-7 shadow-lg transition-all ${
        compact ? 'max-w-4xl' : 'max-w-5xl'
      }`}
      aria-label="Journey Search Form"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:gap-3 items-end">
        {/* Origin Field */}
        <div className="lg:col-span-4">
          <label
            htmlFor="origin-input"
            className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1.5"
          >
            From
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-text-tertiary">
              <MapPin className="h-4 w-4 text-brand-primary" aria-hidden="true" />
            </div>
            <input
              id="origin-input"
              name="origin"
              type="text"
              required
              autoComplete="off"
              disabled={isLoading}
              placeholder="e.g. Sonipat"
              value={origin}
              onChange={(e) => {
                setOrigin(e.target.value);
                if (errors.origin) setErrors((prev) => ({ ...prev, origin: null }));
              }}
              className={`w-full rounded-xl border bg-surface-secondary pl-10 pr-4 py-3 text-sm text-text-primary placeholder:text-text-disabled transition-all focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary ${
                errors.origin ? 'border-semantic-error' : 'border-white/10'
              }`}
              aria-invalid={Boolean(errors.origin)}
              aria-describedby={errors.origin ? 'origin-error' : undefined}
            />
          </div>
          {errors.origin && (
            <p id="origin-error" className="mt-1 text-xs text-semantic-error" role="alert">
              {errors.origin}
            </p>
          )}
        </div>

        {/* Destination Field */}
        <div className="lg:col-span-4">
          <label
            htmlFor="destination-input"
            className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1.5"
          >
            To
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-text-tertiary">
              <Navigation className="h-4 w-4 text-brand-primary" aria-hidden="true" />
            </div>
            <input
              id="destination-input"
              name="destination"
              type="text"
              required
              autoComplete="off"
              disabled={isLoading}
              placeholder="e.g. Patna"
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value);
                if (errors.destination) setErrors((prev) => ({ ...prev, destination: null }));
              }}
              className={`w-full rounded-xl border bg-surface-secondary pl-10 pr-4 py-3 text-sm text-text-primary placeholder:text-text-disabled transition-all focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary ${
                errors.destination ? 'border-semantic-error' : 'border-white/10'
              }`}
              aria-invalid={Boolean(errors.destination)}
              aria-describedby={errors.destination ? 'destination-error' : undefined}
            />
          </div>
          {errors.destination && (
            <p id="destination-error" className="mt-1 text-xs text-semantic-error" role="alert">
              {errors.destination}
            </p>
          )}
        </div>

        {/* Departure Date Field */}
        <div className="sm:col-span-1 lg:col-span-2">
          <label
            htmlFor="date-input"
            className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1.5"
          >
            Date
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-text-tertiary">
              <Calendar className="h-4 w-4 text-brand-primary" aria-hidden="true" />
            </div>
            <input
              id="date-input"
              name="departureDate"
              type="date"
              required
              disabled={isLoading}
              value={departureDate}
              onChange={(e) => {
                setDepartureDate(e.target.value);
                if (errors.departureDate) setErrors((prev) => ({ ...prev, departureDate: null }));
              }}
              className={`w-full rounded-xl border bg-surface-secondary pl-10 pr-3 py-3 text-sm text-text-primary placeholder:text-text-disabled transition-all focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary ${
                errors.departureDate ? 'border-semantic-error' : 'border-white/10'
              }`}
              aria-invalid={Boolean(errors.departureDate)}
              aria-describedby={errors.departureDate ? 'date-error' : undefined}
            />
          </div>
          {errors.departureDate && (
            <p id="date-error" className="mt-1 text-xs text-semantic-error" role="alert">
              {errors.departureDate}
            </p>
          )}
        </div>

        {/* Submit Button */}
        <div className="sm:col-span-1 lg:col-span-2">
          <button
            type="submit"
            id="search-submit-btn"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 py-3 text-sm font-semibold text-white shadow-md shadow-brand-primary/25 transition-all hover:bg-brand-hover active:bg-brand-active disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 focus:ring-offset-background-primary cursor-pointer"
            aria-busy={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Searching...</span>
              </>
            ) : (
              <>
                <Search className="h-4 w-4" aria-hidden="true" />
                <span>Find Routes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

export default SearchForm;
