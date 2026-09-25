import React, { useState } from 'react';
import api from '../services/api.js';

const QUICK_EXAMPLES = [
  'Delhi',
  'Sonipat',
  'Patna Junction',
  'SRM University Delhi NCR',
  'I need to go from Sonipat to Patna',
];

export function LocationResolverCard() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);

  const handleResolve = async (textToResolve) => {
    const target = textToResolve || query;
    if (!target || !target.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedLocation(null);

    try {
      const res = await api.locations.resolve(target.trim());
      setResult(res.data);
      if (!res.data.isNaturalLanguage && res.data.location) {
        setSelectedLocation(res.data.location);
      }
    } catch (err) {
      setError(err.message || 'Failed to resolve location.');
    } finally {
      setLoading(false);
    }
  };

  const handleExampleClick = (example) => {
    setQuery(example);
    handleResolve(example);
  };

  const renderLocationBadge = (type) => {
    const styles = {
      city: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      railway_station: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      airport: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      bus_station: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      landmark: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      address: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    };
    const badgeStyle = styles[type] || 'bg-brand-soft text-brand-primary border-brand-primary/20';

    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${badgeStyle}`}
      >
        {type ? type.replace('_', ' ').toUpperCase() : 'LOCATION'}
      </span>
    );
  };

  const renderLocationDetails = (loc, label) => {
    if (!loc) return null;
    const [lng, lat] = loc.location?.coordinates || [0, 0];

    return (
      <div className="rounded-xl border border-white/10 bg-surface-secondary p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            {label && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-primary block mb-1">
                {label}
              </span>
            )}
            <h4 className="text-sm font-bold text-text-primary">{loc.name}</h4>
            <p className="text-xs text-text-secondary mt-0.5 leading-snug">{loc.displayName}</p>
          </div>
          {renderLocationBadge(loc.type)}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/5 text-[11px]">
          <div>
            <span className="text-text-tertiary block">State / Region</span>
            <span className="text-text-primary font-medium">{loc.state || 'N/A'}</span>
          </div>
          <div>
            <span className="text-text-tertiary block">Country</span>
            <span className="text-text-primary font-medium">
              {loc.country} ({loc.countryCode})
            </span>
          </div>
          <div>
            <span className="text-text-tertiary block">Latitude</span>
            <span className="font-mono text-text-primary">{lat?.toFixed(4)}° N</span>
          </div>
          <div>
            <span className="text-text-tertiary block">Longitude</span>
            <span className="font-mono text-text-primary">{lng?.toFixed(4)}° E</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-surface-primary p-6 shadow-sm space-y-6">
      <div>
        <h2 className="text-base font-semibold text-text-primary">Location Resolution Engine</h2>
        <p className="text-xs text-text-tertiary mt-0.5">
          Converts place names and natural-language travel queries into structured canonical
          locations with GeoJSON coordinates.
        </p>
      </div>

      {/* Quick Example Chips */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-medium text-text-tertiary">Quick Try Examples:</span>
        <div className="flex flex-wrap gap-2">
          {QUICK_EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => handleExampleClick(ex)}
              className="rounded-lg border border-white/10 bg-surface-secondary px-2.5 py-1 text-xs text-text-secondary hover:border-brand-primary/40 hover:text-text-primary transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Search Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleResolve();
        }}
        className="flex gap-2"
      >
        <input
          id="location-search-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter a city, landmark, station, or 'from X to Y'..."
          className="flex-1 rounded-lg border border-white/10 bg-surface-secondary px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
        />
        <button
          id="location-resolve-btn"
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-primary/20 hover:bg-brand-hover active:bg-brand-active transition-all disabled:opacity-50"
        >
          {loading ? 'Resolving...' : 'Resolve'}
        </button>
      </form>

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-semantic-error/30 bg-semantic-error/10 p-3 text-xs text-semantic-error">
          {error}
        </div>
      )}

      {/* Results View */}
      {result && (
        <div className="space-y-4 pt-2 border-t border-white/10">
          {result.isNaturalLanguage ? (
            /* Natural Language Travel Intent Extraction View */
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Natural-Language Intent Extraction
                </span>
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-primary border border-brand-primary/20">
                  Deterministic Travel Pattern
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderLocationDetails(result.extraction?.origin?.location, 'Origin')}
                {renderLocationDetails(result.extraction?.destination?.location, 'Destination')}
              </div>
            </div>
          ) : (
            /* Single Location & Candidate List View */
            <div className="space-y-4">
              {selectedLocation &&
                renderLocationDetails(selectedLocation, 'Canonical Selected Location')}

              {result.candidates && result.candidates.length > 1 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    Alternative Matches ({result.candidates.length})
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {result.candidates.map((cand) => (
                      <button
                        key={cand._id || cand.placeId || cand.name}
                        type="button"
                        onClick={() => setSelectedLocation(cand)}
                        className={`text-left rounded-lg p-3 border transition-colors ${
                          selectedLocation?.name === cand.name &&
                          selectedLocation?.placeId === cand.placeId
                            ? 'border-brand-primary bg-brand-soft/20'
                            : 'border-white/5 bg-surface-secondary hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-text-primary">
                            {cand.name}
                          </span>
                          {renderLocationBadge(cand.type)}
                        </div>
                        <p className="text-[11px] text-text-tertiary mt-1 truncate">
                          {cand.displayName}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LocationResolverCard;
