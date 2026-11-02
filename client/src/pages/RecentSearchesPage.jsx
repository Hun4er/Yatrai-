import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';
import {
  getLocalRecentSearches,
  removeLocalRecentSearch,
  clearLocalRecentSearches,
} from '../utils/browserCache.js';
import { History, Loader2, ArrowRight, Trash2, Calendar, MapPin, Search, Sparkles, Smartphone, ShieldCheck } from 'lucide-react';

/**
 * RecentSearchesPage Component
 * Displays user's recent search queries (local visitor cache + synchronized account)
 * with 1-click re-run action into existing search flow.
 */
export function RecentSearchesPage({ onNavigateHome, onSearchAgain }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searches, setSearches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRecentSearches = useCallback(async () => {
    setLoading(true);
    setError(null);

    const localList = getLocalRecentSearches(25);

    if (isAuthenticated) {
      try {
        const res = await api.recentSearches.list(30);
        const remoteList = res?.data?.searches || [];

        // Merge remote and local without duplicate (origin + dest + date)
        const seen = new Set();
        const merged = [];

        for (const item of remoteList) {
          const key = `${String(item.origin).toUpperCase()}_${String(item.destination).toUpperCase()}_${item.departureDate || ''}`;
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
          }
        }

        for (const item of localList) {
          const key = `${String(item.origin).toUpperCase()}_${String(item.destination).toUpperCase()}_${item.departureDate || ''}`;
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
          }
        }

        setSearches(merged);
      } catch (err) {
        // Fallback to local
        setSearches(localList);
      } finally {
        setLoading(false);
      }
    } else {
      setSearches(localList);
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchRecentSearches();
  }, [fetchRecentSearches]);

  // Listen to cross-component sync event
  useEffect(() => {
    const handleSync = (e) => {
      if (e.detail?.type === 'recent-searches') {
        fetchRecentSearches();
      }
    };
    window.addEventListener('yatrai:sync-state', handleSync);
    return () => window.removeEventListener('yatrai:sync-state', handleSync);
  }, [fetchRecentSearches]);

  const handleRemove = async (searchId) => {
    try {
      removeLocalRecentSearch(searchId);
      if (isAuthenticated && typeof searchId === 'string' && !searchId.startsWith('local_')) {
        await api.recentSearches.remove(searchId).catch(() => {});
      }
      setSearches((prev) => prev.filter((s) => s.id !== searchId));
    } catch (err) {
      setError(err.message || 'Failed to remove search.');
    }
  };

  const handleClearAll = async () => {
    try {
      clearLocalRecentSearches();
      if (isAuthenticated) {
        await api.recentSearches.clear().catch(() => {});
      }
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
        ranking: search.ranking || 'overall',
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-4 sm:py-8 px-4 sm:px-6">
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

      {/* Guest Mode Informational Banner */}
      {!isAuthenticated && searches.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-brand-primary/20 bg-[#161B22] p-3 text-xs text-text-secondary">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-brand-primary shrink-0" />
            <span>Saved securely on this device. Sign in to sync your search history across all devices.</span>
          </div>
          <span className="shrink-0 rounded bg-brand-primary/10 px-2 py-0.5 text-[10px] font-semibold text-brand-primary font-mono">
            GUEST MODE
          </span>
        </div>
      )}

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
            <h3 className="text-base font-semibold text-text-primary">No recent searches yet</h3>
            <p className="text-xs text-text-secondary max-w-sm mx-auto">
              Your searches will automatically appear here so you can rerun them with one tap.
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
            key={s.id || `${s.origin}-${s.destination}-${s.departureDate}`}
            className="group flex flex-col justify-between rounded-xl border border-white/5 bg-surface-card p-4 hover:border-brand-primary/30 hover:bg-surface-elevated transition-all"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-text-primary">
                  <MapPin className="h-3.5 w-3.5 text-brand-primary" aria-hidden="true" />
                  <span>{s.originName || s.origin}</span>
                  <span className="text-text-muted">→</span>
                  <span>{s.destinationName || s.destination}</span>
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
                {s.departureDate && (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Calendar className="h-3 w-3 text-text-muted" aria-hidden="true" />
                    {s.departureDate}
                  </span>
                )}
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
              <span className="text-[10px] text-text-muted font-mono">
                {s.timestamp
                  ? new Date(s.timestamp).toLocaleDateString()
                  : s.searchedAt
                  ? new Date(s.searchedAt).toLocaleDateString()
                  : 'Recent'}
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
