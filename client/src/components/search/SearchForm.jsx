import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Calendar,
  ArrowRight,
  Loader2,
  ArrowLeftRight,
  User,
  Plus,
  Minus,
  CheckCircle2,
} from 'lucide-react';
import api from '../../services/api.js';

/**
 * Format ISO date string (YYYY-MM-DD) into editorial reference format (e.g., "Mon, 15 Jan 2024")
 */
function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    if (Number.isNaN(dateObj.getTime())) return dateStr;
    return dateObj.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * SearchForm Component
 *
 * Fully responsive production-grade railway search panel:
 * - Desktop (>= 1024px): Sleek horizontal 1-row layout matching reference
 * - Tablet (640px - 1023px): Balanced 2-row layout [From/Swap/To] + [Date/Travellers/Submit]
 * - Mobile (< 640px): Touch-friendly stacked cards with paired [Date + Travellers] row
 * - Preserves canonical station autocomplete, keyboard navigation, debounce & validation
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
  const [passengers, setPassengers] = useState(1);
  const [showPassengerDropdown, setShowPassengerDropdown] = useState(false);

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
  const passengerContainerRef = useRef(null);
  const dateInputRef = useRef(null);
  const originRequestTokenRef = useRef(0);
  const destRequestTokenRef = useRef(0);

  // Initialize or sync from props
  useEffect(() => {
    if (initialOrigin) setOriginText(initialOrigin);
    if (initialDestination) setDestText(initialDestination);
    if (initialDate) setDepartureDate(initialDate);
  }, [initialOrigin, initialDestination, initialDate]);

  // Default date to today if none provided
  useEffect(() => {
    if (!departureDate) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      setDepartureDate(`${yyyy}-${mm}-${dd}`);
    }
  }, [departureDate]);

  // Click outside listener to close suggestion dropdowns & passenger popover
  useEffect(() => {
    function handleClickOutside(event) {
      if (originContainerRef.current && !originContainerRef.current.contains(event.target)) {
        setShowOriginDropdown(false);
      }
      if (destContainerRef.current && !destContainerRef.current.contains(event.target)) {
        setShowDestDropdown(false);
      }
      if (passengerContainerRef.current && !passengerContainerRef.current.contains(event.target)) {
        setShowPassengerDropdown(false);
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
    const displayName = station.displayName || `${station.name} (${station.stationCode || ''})`;
    setOriginText(displayName);
    setSelectedOriginStation(station);
    setShowOriginDropdown(false);
    setOriginActiveIndex(-1);
    if (errors.origin) setErrors((prev) => ({ ...prev, origin: null }));
  };

  const handleSelectDest = (station) => {
    const displayName = station.displayName || `${station.name} (${station.stationCode || ''})`;
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
      errs.origin = 'Please enter an origin station.';
    }
    if (!destText || !destText.trim()) {
      errs.destination = 'Please enter a destination station.';
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
    setShowPassengerDropdown(false);

    try {
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
        passengers: passengers || 1,
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
      className={`w-full rounded-2xl border border-[#303640] bg-[#181C22] p-2 sm:p-2.5 md:p-3 shadow-2xl transition-all font-sans ${
        compact ? 'max-w-4xl' : 'max-w-5xl'
      }`}
      aria-label="Structured Railway Journey Search Form"
    >
      {/* 
        Production Responsive Layout:
        - Mobile (< 640px): Stacked vertical with side-by-side Date & Travellers row
        - Tablet (640px - 1023px): 2 balanced rows [Stations] + [Date/Travellers/Search]
        - Desktop (>= 1024px): Seamless single horizontal row matching reference
      */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2">
        {/* ===================== STATIONS WRAPPER (Origin, Swap, Destination) ===================== */}
        <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 relative">
          {/* FROM (Origin) */}
          <div className="flex-1 relative" ref={originContainerRef}>
            <div
              onClick={() => {
                const input = originContainerRef.current?.querySelector('input');
                if (input) input.focus();
              }}
              className={`group rounded-xl border bg-[#15191F] px-3.5 sm:px-4 py-2 sm:py-2.5 min-h-[58px] sm:min-h-[64px] flex flex-col justify-center transition-all cursor-text ${
                errors.origin
                  ? 'border-red-500/80 ring-1 ring-red-500/30'
                  : 'border-[#303640] hover:border-[#3A414C] focus-within:border-[#E8B04A] focus-within:ring-1 focus-within:ring-[#E8B04A]/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <label
                  htmlFor="origin-input"
                  className="text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-[#A7AFBA]"
                >
                  From
                </label>
                {selectedOriginStation?.stationCode && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded font-mono">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    {selectedOriginStation.stationCode}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-0.5">
                <MapPin className="h-4 w-4 text-[#7E8794] shrink-0" aria-hidden="true" />
                <input
                  id="origin-input"
                  name="origin"
                  type="text"
                  required
                  autoComplete="off"
                  disabled={busy}
                  placeholder="New Delhi (NDLS)"
                  value={originText}
                  onFocus={() => setShowOriginDropdown(true)}
                  onChange={(e) => handleOriginChange(e.target.value)}
                  onKeyDown={handleOriginKeyDown}
                  role="combobox"
                  aria-expanded={showOriginDropdown && originSuggestions.length > 0}
                  aria-autocomplete="list"
                  className="w-full bg-transparent text-sm font-medium text-[#F0F1F3] placeholder:text-[#7E8794] focus:outline-none"
                  aria-invalid={Boolean(errors.origin)}
                />
                {isOriginLoading && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E8B04A] shrink-0" />
                )}
              </div>
            </div>

            {/* Autocomplete Dropdown */}
            {showOriginDropdown && originSuggestions.length > 0 && (
              <div
                role="listbox"
                id="origin-suggestions-list"
                className="absolute z-50 left-0 right-0 mt-1 max-h-60 sm:max-h-72 overflow-y-auto rounded-xl border border-[#303640] bg-[#181C22] p-1 shadow-2xl space-y-1"
              >
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#7E8794] border-b border-[#303640]/60 font-mono">
                  Railway Stations
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
                      className={`w-full flex flex-col text-left rounded-lg px-3 py-2 text-xs transition-colors cursor-pointer min-h-[40px] justify-center ${
                        isSelected
                          ? 'bg-[#E8B04A]/10 text-[#F0F1F3] border border-[#E8B04A]/30'
                          : 'hover:bg-[#15191F] text-[#A7AFBA]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold uppercase text-[#F0F1F3] tracking-wide text-xs">
                          {name} {code ? `(${code})` : ''}
                        </span>
                        {st.isMajorHub && (
                          <span className="text-[10px] font-medium text-[#A7AFBA] bg-[#12151A] border border-[#303640] px-1.5 py-0.2 rounded font-mono">
                            HUB
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#7E8794] mt-0.5">
                        {city}{city && state ? ', ' : ''}{state}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* SWAP BUTTON */}
          <div className="flex justify-center shrink-0 -my-1 sm:my-0">
            <button
              type="button"
              onClick={handleSwapStations}
              title="Swap origin and destination"
              aria-label="Swap origin and destination"
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-full border border-[#303640] bg-[#181C22] text-[#A7AFBA] hover:text-[#F0F1F3] hover:border-[#E8B04A] hover:bg-[#15191F] active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-sm"
            >
              <ArrowLeftRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </div>

          {/* TO (Destination) */}
          <div className="flex-1 relative" ref={destContainerRef}>
            <div
              onClick={() => {
                const input = destContainerRef.current?.querySelector('input');
                if (input) input.focus();
              }}
              className={`group rounded-xl border bg-[#15191F] px-3.5 sm:px-4 py-2 sm:py-2.5 min-h-[58px] sm:min-h-[64px] flex flex-col justify-center transition-all cursor-text ${
                errors.destination
                  ? 'border-red-500/80 ring-1 ring-red-500/30'
                  : 'border-[#303640] hover:border-[#3A414C] focus-within:border-[#E8B04A] focus-within:ring-1 focus-within:ring-[#E8B04A]/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <label
                  htmlFor="dest-input"
                  className="text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-[#A7AFBA]"
                >
                  To
                </label>
                {selectedDestStation?.stationCode && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded font-mono">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    {selectedDestStation.stationCode}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-0.5">
                <MapPin className="h-4 w-4 text-[#7E8794] shrink-0" aria-hidden="true" />
                <input
                  id="dest-input"
                  name="destination"
                  type="text"
                  required
                  autoComplete="off"
                  disabled={busy}
                  placeholder="Mumbai Central (MMCT)"
                  value={destText}
                  onFocus={() => setShowDestDropdown(true)}
                  onChange={(e) => handleDestChange(e.target.value)}
                  onKeyDown={handleDestKeyDown}
                  role="combobox"
                  aria-expanded={showDestDropdown && destSuggestions.length > 0}
                  aria-autocomplete="list"
                  className="w-full bg-transparent text-sm font-medium text-[#F0F1F3] placeholder:text-[#7E8794] focus:outline-none"
                  aria-invalid={Boolean(errors.destination)}
                />
                {isDestLoading && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E8B04A] shrink-0" />
                )}
              </div>
            </div>

            {/* Autocomplete Dropdown */}
            {showDestDropdown && destSuggestions.length > 0 && (
              <div
                role="listbox"
                id="dest-suggestions-list"
                className="absolute z-50 left-0 right-0 mt-1 max-h-60 sm:max-h-72 overflow-y-auto rounded-xl border border-[#303640] bg-[#181C22] p-1 shadow-2xl space-y-1"
              >
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#7E8794] border-b border-[#303640]/60 font-mono">
                  Railway Stations
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
                      className={`w-full flex flex-col text-left rounded-lg px-3 py-2 text-xs transition-colors cursor-pointer min-h-[40px] justify-center ${
                        isSelected
                          ? 'bg-[#E8B04A]/10 text-[#F0F1F3] border border-[#E8B04A]/30'
                          : 'hover:bg-[#15191F] text-[#A7AFBA]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold uppercase text-[#F0F1F3] tracking-wide text-xs">
                          {name} {code ? `(${code})` : ''}
                        </span>
                        {st.isMajorHub && (
                          <span className="text-[10px] font-medium text-[#A7AFBA] bg-[#12151A] border border-[#303640] px-1.5 py-0.2 rounded font-mono">
                            HUB
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#7E8794] mt-0.5">
                        {city}{city && state ? ', ' : ''}{state}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ===================== CONTROLS WRAPPER (Date, Travellers, Button) ===================== */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Paired Row for Mobile (Date + Travellers) */}
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 flex-1 sm:flex-initial">
            {/* DATE */}
            <div className="w-full sm:w-40 md:w-44 lg:w-44 relative">
              <label
                htmlFor="date-input"
                className="group rounded-xl border border-[#303640] hover:border-[#3A414C] focus-within:border-[#E8B04A] bg-[#15191F] px-3.5 sm:px-4 py-2 sm:py-2.5 min-h-[58px] sm:min-h-[64px] flex flex-col justify-center transition-all cursor-pointer relative block"
              >
                <div className="text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-[#A7AFBA]">
                  Date
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Calendar className="h-4 w-4 text-[#7E8794] shrink-0" aria-hidden="true" />
                  <div className="text-xs sm:text-sm font-medium text-[#F0F1F3] truncate">
                    {formatDisplayDate(departureDate) || 'Select date'}
                  </div>
                </div>

                {/* Native picker overlay for seamless interaction */}
                <input
                  ref={dateInputRef}
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
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  aria-label="Departure Date"
                />
              </label>
            </div>

            {/* TRAVELLERS */}
            <div className="w-full sm:w-36 md:w-36 lg:w-36 relative" ref={passengerContainerRef}>
              <div
                onClick={() => setShowPassengerDropdown(!showPassengerDropdown)}
                className="group rounded-xl border border-[#303640] hover:border-[#3A414C] focus-within:border-[#E8B04A] bg-[#15191F] px-3.5 sm:px-4 py-2 sm:py-2.5 min-h-[58px] sm:min-h-[64px] flex flex-col justify-center transition-all cursor-pointer"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setShowPassengerDropdown(!showPassengerDropdown);
                  }
                }}
                aria-haspopup="dialog"
                aria-expanded={showPassengerDropdown}
              >
                <div className="text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-[#A7AFBA]">
                  Travellers
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <User className="h-4 w-4 text-[#7E8794] shrink-0" aria-hidden="true" />
                  <div className="text-xs sm:text-sm font-medium text-[#F0F1F3] truncate">
                    {passengers} {passengers === 1 ? 'Adult' : 'Adults'}
                  </div>
                </div>
              </div>

              {/* Passenger Selector Popup */}
              {showPassengerDropdown && (
                <div className="absolute z-50 right-0 left-auto mt-1 w-56 rounded-xl border border-[#303640] bg-[#181C22] p-4 shadow-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-[#F0F1F3]">Adults</div>
                      <div className="text-[11px] text-[#7E8794]">Age 12+ years</div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        disabled={passengers <= 1}
                        onClick={() => setPassengers((prev) => Math.max(1, prev - 1))}
                        className="h-7 w-7 rounded-lg border border-[#303640] bg-[#15191F] text-[#F0F1F3] disabled:opacity-30 disabled:cursor-not-allowed hover:border-[#E8B04A] flex items-center justify-center cursor-pointer transition-colors"
                        aria-label="Decrease passengers"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-sm font-semibold font-mono text-[#F0F1F3] w-4 text-center">
                        {passengers}
                      </span>
                      <button
                        type="button"
                        disabled={passengers >= 6}
                        onClick={() => setPassengers((prev) => Math.min(6, prev + 1))}
                        className="h-7 w-7 rounded-lg border border-[#303640] bg-[#15191F] text-[#F0F1F3] disabled:opacity-30 disabled:cursor-not-allowed hover:border-[#E8B04A] flex items-center justify-center cursor-pointer transition-colors"
                        aria-label="Increase passengers"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPassengerDropdown(false)}
                    className="w-full text-center py-1.5 rounded-lg bg-[#15191F] hover:bg-[#303640]/50 text-xs font-medium text-[#E8B04A] transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* SUBMIT BUTTON */}
          <div className="shrink-0 w-full sm:w-auto">
            <button
              type="submit"
              id="search-submit-btn"
              disabled={busy}
              className="w-full sm:w-auto h-[54px] sm:h-[58px] lg:h-[64px] px-6 sm:px-7 rounded-xl bg-[#E8B04A] hover:bg-[#F2BE62] active:bg-[#D9A139] text-[#0B0D10] font-semibold text-sm flex items-center justify-center gap-2.5 transition-all duration-150 ease-out disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-lg whitespace-nowrap"
              aria-busy={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-[#0B0D10]" aria-hidden="true" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <span>Find trains</span>
                  <ArrowRight className="h-4 w-4 text-[#0B0D10]" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Validation feedback */}
      {(errors.origin || errors.destination || errors.departureDate) && (
        <div className="mt-2.5 px-2 text-xs text-red-400 flex flex-wrap gap-x-4 gap-y-1">
          {errors.origin && <span>• {errors.origin}</span>}
          {errors.destination && <span>• {errors.destination}</span>}
          {errors.departureDate && <span>• {errors.departureDate}</span>}
        </div>
      )}
    </form>
  );
}

export default SearchForm;
