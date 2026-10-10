import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MapPin,
  Navigation,
  Calendar,
  Search,
  Loader2,
  ArrowLeftRight,
  Train,
  CheckCircle2,
} from 'lucide-react';
import api from '../../services/api.js';

/**
 * SearchForm Component
 *
 * Implements IRCTC-Style Station Autocomplete (Phase 6):
 * - Prominent "STATION NAME - CODE" in uppercase bold, city/state beneath.
 * - Selected station object is kept separate from text typed.
 * - Invalidation on text edit until a new valid item is selected.
 * - Keyboard navigation (ArrowUp, ArrowDown, Enter, Escape).
 * - Swap button swaps complete station objects (codes and IDs).
 * - Single-flight submission lock to prevent double clicks.
 * - Shared visual card width (max-w-4xl) for seamless alignment with Natural Search.
 */
export function SearchForm({
  initialOrigin = '',
  initialDestination = '',
  initialDate = '',
  onSearch,
  isLoading = false,
  compact = false,
}) {
  // Input text values
  const [originText, setOriginText] = useState(initialOrigin);
  const [destText, setDestText] = useState(initialDestination);
  const [departureDate, setDepartureDate] = useState(initialDate);

  // Selected station objects (IRCTC canonical station identity)
  const [selectedOriginStation, setSelectedOriginStation] = useState(null);
  const [selectedDestStation, setSelectedDestStation] = useState(null);

  // Autocomplete suggestions
  const [originSuggestions, setOriginSuggestions] = useState([]);
  const [destSuggestions, setDestSuggestions] = useState([]);
  const [isOriginLoading, setIsOriginLoading] = useState(false);
  const [isDestLoading, setIsDestLoading] = useState(false);
  const [showOriginDropdown, setShowOriginDropdown] = useState(false);
  const [showDestDropdown, setShowDestDropdown] = useState(false);
  const [originActiveIndex, setOriginActiveIndex] = useState(-1);
  const [destActiveIndex, setDestActiveIndex] = useState(-1);

  // Form submission lock
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const originContainerRef = useRef(null);
  const destContainerRef = useRef(null);
  const originRequestTokenRef = useRef(0);
  const destRequestTokenRef = useRef(0);

  // Initialize or sync from props
  useEffect(() => {
    if (initialOrigin) setOriginText(initialOrigin);
    if (initialDestination) setDestText(initialDestination);
    if (initialDate) setDepartureDate(initialDate);
  }, [initialOrigin, initialDestination, initialDate]);

  // Default date
  useEffect(() => {
    if (!departureDate) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      setDepartureDate(`${yyyy}-${mm}-${dd}`);
    }
  }, [departureDate]);

  // Click outside listener to close suggestion dropdowns
  useEffect(() => {
    function handleClickOutside(event) {
      if (originContainerRef.current && !originContainerRef.current.contains(event.target)) {
        setShowOriginDropdown(false);
      }
      if (destContainerRef.current && !destContainerRef.current.contains(event.target)) {
        setShowDestDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch Origin Autocomplete with Debounce & Stale Request Cancellation
  useEffect(() => {
    const query = originText.trim();
    if (!query || query.length < 2) {
      setOriginSuggestions([]);
      setIsOriginLoading(false);
      return;
    }

    const currentToken = ++originRequestTokenRef.current;
    setIsOriginLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await api.locations.search(query, 6, { railwayOnly: true });
        if (currentToken === originRequestTokenRef.current) {
          const locs = res?.data?.locations || [];
          setOriginSuggestions(locs);
          setOriginActiveIndex(locs.length > 0 ? 0 : -1);
        }
      } catch {
        if (currentToken === originRequestTokenRef.current) {
          setOriginSuggestions([]);
        }
      } finally {
        if (currentToken === originRequestTokenRef.current) {
          setIsOriginLoading(false);
        }
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [originText]);

  // Fetch Destination Autocomplete with Debounce & Stale Request Cancellation
  useEffect(() => {
    const query = destText.trim();
    if (!query || query.length < 2) {
      setDestSuggestions([]);
      setIsDestLoading(false);
      return;
    }

    const currentToken = ++destRequestTokenRef.current;
    setIsDestLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await api.locations.search(query, 6, { railwayOnly: true });
        if (currentToken === destRequestTokenRef.current) {
          const locs = res?.data?.locations || [];
          setDestSuggestions(locs);
          setDestActiveIndex(locs.length > 0 ? 0 : -1);
        }
      } catch {
        if (currentToken === destRequestTokenRef.current) {
          setDestSuggestions([]);
        }
      } finally {
        if (currentToken === destRequestTokenRef.current) {
          setIsDestLoading(false);
        }
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [destText]);

  // Selection handlers
  const handleSelectOrigin = (station) => {
    const displayName = station.displayName || `${station.name} - ${station.stationCode || ''}`;
    setOriginText(displayName);
    setSelectedOriginStation(station);
    setShowOriginDropdown(false);
    setOriginActiveIndex(-1);
    if (errors.origin) setErrors((prev) => ({ ...prev, origin: null }));
  };

  const handleSelectDest = (station) => {
    const displayName = station.displayName || `${station.name} - ${station.stationCode || ''}`;
    setDestText(displayName);
    setSelectedDestStation(station);
    setShowDestDropdown(false);
    setDestActiveIndex(-1);
    if (errors.destination) setErrors((prev) => ({ ...prev, destination: null }));
  };

  // Keyboard navigation for Origin
  const handleOriginKeyDown = (e) => {
    if (!showOriginDropdown || originSuggestions.length === 0) {
      if (e.key === 'ArrowDown' && originSuggestions.length > 0) {
        setShowOriginDropdown(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOriginActiveIndex((prev) => (prev + 1) % originSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOriginActiveIndex((prev) => (prev <= 0 ? originSuggestions.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (originActiveIndex >= 0 && originActiveIndex < originSuggestions.length) {
        handleSelectOrigin(originSuggestions[originActiveIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowOriginDropdown(false);
    }
  };

  // Keyboard navigation for Destination
  const handleDestKeyDown = (e) => {
    if (!showDestDropdown || destSuggestions.length === 0) {
      if (e.key === 'ArrowDown' && destSuggestions.length > 0) {
        setShowDestDropdown(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDestActiveIndex((prev) => (prev + 1) % destSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDestActiveIndex((prev) => (prev <= 0 ? destSuggestions.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (destActiveIndex >= 0 && destActiveIndex < destSuggestions.length) {
        handleSelectDest(destSuggestions[destActiveIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowDestDropdown(false);
    }
  };

  // Swapping stations swaps the complete station objects and text
  const handleSwapStations = () => {
    const tempText = originText;
    const tempStation = selectedOriginStation;

    setOriginText(destText);
    setSelectedOriginStation(selectedDestStation);

    setDestText(tempText);
    setSelectedDestStation(tempStation);

    setShowOriginDropdown(false);
    setShowDestDropdown(false);

    if (errors.origin || errors.destination) {
      setErrors((prev) => ({ ...prev, origin: null, destination: null }));
    }
  };

  // Invalidate old station object when user edits text
  const handleOriginChange = (val) => {
    setOriginText(val);
    setShowOriginDropdown(true);
    if (selectedOriginStation && selectedOriginStation.displayName !== val) {
      setSelectedOriginStation(null);
    }
    if (errors.origin) setErrors((prev) => ({ ...prev, origin: null }));
  };

  const handleDestChange = (val) => {
    setDestText(val);
    setShowDestDropdown(true);
    if (selectedDestStation && selectedDestStation.displayName !== val) {
      setSelectedDestStation(null);
    }
    if (errors.destination) setErrors((prev) => ({ ...prev, destination: null }));
  };

  const validate = () => {
    const errs = {};
    if (!originText || !originText.trim()) {
      errs.origin = 'Please enter an origin railway station or city.';
    }
    if (!destText || !destText.trim()) {
      errs.destination = 'Please enter a destination railway station or city.';
    }

    const cleanOrigin = (selectedOriginStation?.stationCode || originText).trim().toLowerCase();
    const cleanDest = (selectedDestStation?.stationCode || destText).trim().toLowerCase();

    if (cleanOrigin && cleanDest && cleanOrigin === cleanDest) {
      errs.destination = 'Origin and destination cannot be the same station.';
    }
    if (!departureDate) {
      errs.departureDate = 'Please select a travel date.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading || isSubmitting) return;

    if (!validate()) return;

    setIsSubmitting(true);
    setShowOriginDropdown(false);
    setShowDestDropdown(false);

    try {
      // Pass canonical station code or canonical name if available
      const finalOrigin =
        selectedOriginStation?.name ||
        selectedOriginStation?.stationCode ||
        originText.trim();
      const finalDest =
        selectedDestStation?.name ||
        selectedDestStation?.stationCode ||
        destText.trim();

      await onSearch({
        origin: finalOrigin,
        destination: finalDest,
        originCode: selectedOriginStation?.stationCode || null,
        destinationCode: selectedDestStation?.stationCode || null,
        originStation: selectedOriginStation || null,
        destinationStation: selectedDestStation || null,
        departureDate,
        passengers: 1,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const busy = isLoading || isSubmitting;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className={`w-full rounded-2xl border border-white/10 bg-surface-primary p-5 sm:p-7 shadow-xl transition-all ${
        compact ? 'max-w-4xl' : 'max-w-4xl'
      }`}
      aria-label="Structured Railway Journey Search Form"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:gap-3 items-end">
        {/* ===================== FROM (Origin) ===================== */}
        <div className="lg:col-span-4 relative" ref={originContainerRef}>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="origin-input"
              className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-1.5"
            >
              <span>From</span>
              {selectedOriginStation && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded">
                  <CheckCircle2 className="h-3 w-3" />
                  {selectedOriginStation.stationCode || 'SELECTED'}
                </span>
              )}
            </label>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-text-tertiary">
              <Train className="h-4 w-4 text-brand-primary" aria-hidden="true" />
            </div>

            <input
              id="origin-input"
              name="origin"
              type="text"
              required
              autoComplete="off"
              disabled={busy}
              placeholder="e.g. New Delhi or NDLS"
              value={originText}
              onFocus={() => setShowOriginDropdown(true)}
              onChange={(e) => handleOriginChange(e.target.value)}
              onKeyDown={handleOriginKeyDown}
              role="combobox"
              aria-expanded={showOriginDropdown && originSuggestions.length > 0}
              aria-autocomplete="list"
              className={`w-full rounded-xl border bg-surface-secondary pl-10 pr-9 py-3 text-sm text-text-primary placeholder:text-text-disabled transition-all focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary ${
                errors.origin ? 'border-semantic-error' : 'border-white/10'
              }`}
              aria-invalid={Boolean(errors.origin)}
              aria-describedby={errors.origin ? 'origin-error' : undefined}
            />

            {isOriginLoading && (
              <div className="absolute inset-y-0 right-3 flex items-center">
                <Loader2 className="h-4 w-4 animate-spin text-brand-primary" />
              </div>
            )}

            {/* Desktop Station Swap Button */}
            <button
              type="button"
              onClick={handleSwapStations}
              title="Swap origin and destination"
              aria-label="Swap origin and destination"
              className="hidden lg:flex absolute -right-3.5 bottom-2.5 z-30 h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-surface-elevated text-text-secondary hover:text-brand-primary hover:border-brand-primary active:scale-95 transition-all cursor-pointer shadow-md"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* IRCTC-Style Autocomplete Dropdown */}
          {showOriginDropdown && originSuggestions.length > 0 && (
            <div
              role="listbox"
              id="origin-suggestions-list"
              className="absolute z-50 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl border border-white/15 bg-surface-elevated p-1 shadow-2xl space-y-1"
            >
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-text-tertiary border-b border-white/5">
                Indian Railways Stations
              </div>
              {originSuggestions.map((st, idx) => {
                const isSelected = idx === originActiveIndex;
                const code = st.stationCode || '';
                const name = st.name || '';
                const state = st.state || '';
                const city = st.city || '';
                return (
                  <button
                    key={st.id || st.stationCode || idx}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelectOrigin(st)}
                    className={`w-full flex flex-col text-left rounded-lg px-3 py-2 text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-brand-primary/20 text-text-primary border border-brand-primary/30'
                        : 'hover:bg-white/5 text-text-secondary'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold uppercase text-text-primary tracking-wide text-xs">
                        {name} {code ? `- ${code}` : ''}
                      </span>
                      {st.isMajorHub && (
                        <span className="text-[10px] font-semibold text-brand-primary bg-brand-primary/10 px-1.5 py-0.2 rounded">
                          MAIN HUB
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-text-tertiary mt-0.5">
                      {city}{city && state ? ', ' : ''}{state}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {errors.origin && (
            <p id="origin-error" className="mt-1 text-xs text-semantic-error" role="alert">
              {errors.origin}
            </p>
          )}
        </div>

        {/* Mobile Station Swap Button */}
        <div className="flex lg:hidden justify-center -my-2 relative z-10">
          <button
            type="button"
            onClick={handleSwapStations}
            title="Swap origin and destination"
            aria-label="Swap origin and destination"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-surface-elevated text-text-secondary hover:text-brand-primary hover:border-brand-primary active:scale-95 transition-all cursor-pointer shadow-md"
          >
            <ArrowLeftRight className="h-3.5 w-3.5 rotate-90" />
          </button>
        </div>

        {/* ===================== TO (Destination) ===================== */}
        <div className="lg:col-span-4 relative" ref={destContainerRef}>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="dest-input"
              className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-1.5"
            >
              <span>To</span>
              {selectedDestStation && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded">
                  <CheckCircle2 className="h-3 w-3" />
                  {selectedDestStation.stationCode || 'SELECTED'}
                </span>
              )}
            </label>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-text-tertiary">
              <Navigation className="h-4 w-4 text-brand-primary" aria-hidden="true" />
            </div>

            <input
              id="dest-input"
              name="destination"
              type="text"
              required
              autoComplete="off"
              disabled={busy}
              placeholder="e.g. Prayagraj or PRYJ"
              value={destText}
              onFocus={() => setShowDestDropdown(true)}
              onChange={(e) => handleDestChange(e.target.value)}
              onKeyDown={handleDestKeyDown}
              role="combobox"
              aria-expanded={showDestDropdown && destSuggestions.length > 0}
              aria-autocomplete="list"
              className={`w-full rounded-xl border bg-surface-secondary pl-10 pr-9 py-3 text-sm text-text-primary placeholder:text-text-disabled transition-all focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary ${
                errors.destination ? 'border-semantic-error' : 'border-white/10'
              }`}
              aria-invalid={Boolean(errors.destination)}
              aria-describedby={errors.destination ? 'dest-error' : undefined}
            />

            {isDestLoading && (
              <div className="absolute inset-y-0 right-3 flex items-center">
                <Loader2 className="h-4 w-4 animate-spin text-brand-primary" />
              </div>
            )}
          </div>

          {/* IRCTC-Style Autocomplete Dropdown */}
          {showDestDropdown && destSuggestions.length > 0 && (
            <div
              role="listbox"
              id="dest-suggestions-list"
              className="absolute z-50 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl border border-white/15 bg-surface-elevated p-1 shadow-2xl space-y-1"
            >
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-text-tertiary border-b border-white/5">
                Indian Railways Stations
              </div>
              {destSuggestions.map((st, idx) => {
                const isSelected = idx === destActiveIndex;
                const code = st.stationCode || '';
                const name = st.name || '';
                const state = st.state || '';
                const city = st.city || '';
                return (
                  <button
                    key={st.id || st.stationCode || idx}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelectDest(st)}
                    className={`w-full flex flex-col text-left rounded-lg px-3 py-2 text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-brand-primary/20 text-text-primary border border-brand-primary/30'
                        : 'hover:bg-white/5 text-text-secondary'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold uppercase text-text-primary tracking-wide text-xs">
                        {name} {code ? `- ${code}` : ''}
                      </span>
                      {st.isMajorHub && (
                        <span className="text-[10px] font-semibold text-brand-primary bg-brand-primary/10 px-1.5 py-0.2 rounded">
                          MAIN HUB
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-text-tertiary mt-0.5">
                      {city}{city && state ? ', ' : ''}{state}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {errors.destination && (
            <p id="dest-error" className="mt-1 text-xs text-semantic-error" role="alert">
              {errors.destination}
            </p>
          )}
        </div>

        {/* ===================== DATE ===================== */}
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
              disabled={busy}
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

        {/* ===================== SUBMIT BUTTON ===================== */}
        <div className="sm:col-span-1 lg:col-span-2">
          <button
            type="submit"
            id="search-submit-btn"
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 py-3 text-sm font-semibold text-white shadow-md shadow-brand-primary/25 transition-all hover:bg-brand-hover active:bg-brand-active disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 focus:ring-offset-background-primary cursor-pointer"
            aria-busy={busy}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Searching...</span>
              </>
            ) : (
              <>
                <Search className="h-4 w-4" aria-hidden="true" />
                <span>Find Journeys</span>
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

export default SearchForm;
