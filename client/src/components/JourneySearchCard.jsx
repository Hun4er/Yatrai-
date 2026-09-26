import React, { useState } from 'react';
import api from '../services/api.js';

const QUICK_SEARCH_EXAMPLES = [
  { origin: 'Sonipat', destination: 'Patna', departureDate: '2026-10-01' },
  { origin: 'Delhi', destination: 'Varanasi', departureDate: '2026-10-01' },
  { origin: 'Sonipat', destination: 'Delhi', departureDate: '2026-10-01' },
];

export function JourneySearchCard() {
  const [origin, setOrigin] = useState('Sonipat');
  const [destination, setDestination] = useState('Patna');
  const [departureDate, setDepartureDate] = useState('2026-10-01');
  const [passengers, setPassengers] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!origin.trim() || !destination.trim() || !departureDate) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await api.journeys.search({
        origin: origin.trim(),
        destination: destination.trim(),
        departureDate,
        passengers: Number(passengers) || 1,
      });
      setResult(res);
    } catch (err) {
      setError(err.message || 'Journey search failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleExampleSelect = (example) => {
    setOrigin(example.origin);
    setDestination(example.destination);
    setDepartureDate(example.departureDate);
    setError(null);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-surface-primary p-6 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-white/10 pb-4">
        <div>
          <h3 className="text-base font-bold text-text-primary">Journey Search Engine</h3>
          <p className="text-xs text-text-secondary mt-0.5">
            Internal provider-independent search pipeline test interface (POST
            /api/journeys/search).
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20 w-fit">
          Pipeline Active
        </span>
      </div>

      {/* Quick Example Corridors */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
          Deterministic Test Corridors
        </label>
        <div className="flex flex-wrap gap-2">
          {QUICK_SEARCH_EXAMPLES.map((ex, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleExampleSelect(ex)}
              className="rounded-lg border border-white/10 bg-surface-secondary px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-brand-primary/40 transition-colors"
            >
              {ex.origin} &rarr; {ex.destination}
            </button>
          ))}
        </div>
      </div>

      {/* Search Input Form */}
      <form onSubmit={handleSearch} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-text-secondary">Origin</label>
            <input
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="e.g. Sonipat"
              required
              className="w-full rounded-xl border border-white/10 bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-text-secondary">Destination</label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. Patna"
              required
              className="w-full rounded-xl border border-white/10 bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-text-secondary">Departure Date</label>
            <input
              type="date"
              value={departureDate}
              onChange={(e) => setDepartureDate(e.target.value)}
              required
              className="w-full rounded-xl border border-white/10 bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-text-secondary">Passengers</label>
            <input
              type="number"
              min="1"
              max="9"
              value={passengers}
              onChange={(e) => setPassengers(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !origin.trim() || !destination.trim() || !departureDate}
          className="w-full sm:w-auto rounded-xl bg-brand-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              <span>Executing Search Pipeline...</span>
            </>
          ) : (
            <span>Search Journeys</span>
          )}
        </button>
      </form>

      {/* Error Feedback */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-400">
          <p className="font-semibold">Search Request Error</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {/* Structured Search Results Display */}
      {result && (
        <div className="space-y-4 pt-4 border-t border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-text-secondary gap-1">
            <span>
              Search Request ID:{' '}
              <code className="text-text-primary font-mono font-medium">
                {result.data?.searchRequestId || 'N/A'}
              </code>
            </span>
            <span className="font-semibold text-text-primary">
              {result.data?.count ?? result.journeys?.length ?? 0} journey candidate(s) discovered
            </span>
          </div>

          {result.journeys && result.journeys.length > 0 ? (
            <div className="space-y-3">
              {result.journeys.map((j, idx) => (
                <div
                  key={j.id || idx}
                  className="rounded-xl border border-white/10 bg-surface-secondary p-4 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-text-primary">
                        {j.origin?.name || origin} &rarr; {j.destination?.name || destination}
                      </span>
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-primary border border-brand-primary/20">
                        {j.transportModes?.join(', ').toUpperCase()}
                      </span>
                      {j.metadata?.isMock && (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/20">
                          Development Mock
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-extrabold text-brand-primary">
                        {j.currency} {j.totalPrice}
                      </div>
                      <div className="text-[11px] text-text-tertiary">
                        {Math.floor(j.duration / 60)}h {j.duration % 60}m &bull;{' '}
                        {j.numberOfTransfers} transfer(s)
                      </div>
                    </div>
                  </div>

                  {/* Leg Breakdown */}
                  {j.legs && j.legs.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                        Sequential Journey Legs ({j.legs.length})
                      </span>
                      <div className="grid grid-cols-1 gap-2">
                        {j.legs.map((leg) => (
                          <div
                            key={leg.id || leg.sequence}
                            className="rounded-lg border border-white/5 bg-surface-primary/50 p-2.5 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
                          >
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-text-secondary">
                                {leg.sequence}
                              </span>
                              <span className="font-medium text-text-primary">
                                {leg.origin?.name || 'Origin'} &rarr;{' '}
                                {leg.destination?.name || 'Destination'}
                              </span>
                              <span className="text-text-tertiary">
                                ({leg.mode?.toUpperCase()})
                              </span>
                            </div>
                            <div className="text-text-secondary text-[11px] flex items-center gap-2">
                              <span>
                                {leg.service?.name ||
                                  leg.vehicle?.identifier ||
                                  'Scheduled Service'}
                              </span>
                              <span>&bull;</span>
                              <span className="font-semibold text-text-primary">
                                {leg.currency} {leg.price}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-surface-secondary/50 p-6 text-center text-text-secondary text-xs">
              No journey candidates found for this corridor on {departureDate}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default JourneySearchCard;
