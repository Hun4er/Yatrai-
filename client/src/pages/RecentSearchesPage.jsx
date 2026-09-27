import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';
import { History, Loader2, ArrowRight, Trash2, Calendar, MapPin, Search, Sparkles } from 'lucide-react';

/**
 * RecentSearchesPage Component (Phase 13)
 * Displays user's recent search queries with 1-click re-run action into existing search flow.
 */
export function RecentSearchesPage({ onNavigateHome, onSearchAgain }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searches, setSearches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRecentSearches = useCallback(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);

    api.recentSearches
      .list()
      .then((res) => {
        setSearches(res?.data?.searches || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Unable to load recent searches.');
        setLoading(false);
      });
  }, [isAuthenticated]);

  useEffect(() => {
    fetchRecentSearches();
  }, [fetchRecentSearches]);

  const handleRemove = async (searchId) => {
    try {
      await api.recentSearches.remove(searchId);
      setSearches((prev) => prev.filter((s) => s.id !== searchId));
    } catch (err) {
      setError(err.message || 'Failed to remove search.');
    }
  };

  const handleClearAll = async () => {
    try {
      await api.recentSearches.clear();
      setSearches([]);
    } catch (err) {
      setError(err.message || 'Failed to clear search history.');
    }
  };

  const handleRerun = (search) => {
    if (onSearchAgain) {
      onSearchAgain({
        origin: search.origin,
        destination: search.destination,
        departureDate: search.departureDate,
        ranking: search.ranking || 'balanced',
        maxBudget: search.maxBudget,
        transportTypes: search.transportTypes,
        passengers: search.passengers || 1,
      });
    }
  };

  if (authLoading || (loading && searches.length === 0)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" aria-hidden="true" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-md space-y-6 py-12 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft border border-brand-primary/20 text-brand-primary">
          <History className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-text-primary">Sign In to View Recent Searches</h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            Your journey searches are automatically synchronized when you are logged in.
          </p>
        </div>
        <button
          type="button"
          onClick={onNavigateHome}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-brand-hover cursor-pointer"
        >
          <span>Explore Routes</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-4 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-primary">
            <History className="h-4 w-4" aria-hidden="true" />
            <span>Search History</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text-primary mt-1">
            Recent Searches
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Repeat previous searches instantly with real-time route orchestration.
          </p>
        </div>

        {searches.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Empty State */}
      {searches.length === 0 && !loading && (
        <div className="rounded-2xl border border-white/5 bg-surface-card p-12 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-text-muted">
            <Search className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-text-primary">No recent searches</h3>
            <p className="text-xs text-text-secondary max-w-sm mx-auto">
              Your searches will appear here automatically so you can rerun them anytime.
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-brand-hover cursor-pointer"
          >
            <span>Start a Search</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* List */}
      <div className="grid gap-3 sm:grid-cols-2">
        {searches.map((s) => (
          <div
            key={s.id}
            className="group flex flex-col justify-between rounded-xl border border-white/5 bg-surface-card p-4 hover:border-brand-primary/30 hover:bg-surface-elevated transition-all"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-text-primary">
                  <MapPin className="h-3.5 w-3.5 text-brand-primary" aria-hidden="true" />
                  <span>{s.origin}</span>
                  <span className="text-text-muted">→</span>
                  <span>{s.destination}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(s.id)}
                  title="Remove search"
                  className="rounded-lg p-1 text-text-muted hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-secondary">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-text-muted" aria-hidden="true" />
                  {s.departureDate}
                </span>
                {s.ranking && (
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase font-mono tracking-wider text-text-muted">
                    {s.ranking}
                  </span>
                )}
                {s.maxBudget && (
                  <span className="rounded-full bg-emerald-500/10 text-emerald-400 px-2 py-0.5 text-[10px] font-medium">
                    Max ₹{s.maxBudget}
                  </span>
                )}
                {s.query && (
                  <div className="w-full flex items-center gap-1 text-[11px] text-brand-primary/80 italic mt-1">
                    <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">"{s.query}"</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-[10px] text-text-muted">
                {s.searchedAt ? new Date(s.searchedAt).toLocaleDateString() : ''}
              </span>
              <button
                type="button"
                onClick={() => handleRerun(s)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary/10 border border-brand-primary/20 px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary hover:text-white transition-all cursor-pointer"
              >
                <Search className="h-3 w-3" aria-hidden="true" />
                <span>Search Again</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RecentSearchesPage;
