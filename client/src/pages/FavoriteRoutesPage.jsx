import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';
import {
  getLocalFavoriteRoutes,
  saveLocalFavoriteRoute,
  removeLocalFavoriteRoute,
} from '../utils/browserCache.js';
import { Heart, Loader2, ArrowRight, Trash2, MapPin, Search, Plus, Sparkles, Smartphone } from 'lucide-react';

/**
 * FavoriteRoutesPage Component
 * Displays user's saved Origin -> Destination corridors with 1-click execution.
 * Works seamlessly in both Visitor (Local) and Authenticated (Synced) modes.
 */
export function FavoriteRoutesPage({ onNavigateHome, onSearchRoute }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [originInput, setOriginInput] = useState('');
  const [destinationInput, setDestinationInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchFavoriteRoutes = useCallback(async () => {
    setLoading(true);
    setError(null);

    const localList = getLocalFavoriteRoutes();

    if (isAuthenticated) {
      try {
        const res = await api.favoriteRoutes.list();
        const remoteList = res?.data?.routes || [];

        // Merge remote and local without duplicate (origin + dest)
        const seen = new Set();
        const merged = [];

        for (const item of remoteList) {
          const key = `${String(item.origin).toUpperCase()}_${String(item.destination).toUpperCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
          }
        }

        for (const item of localList) {
          const key = `${String(item.origin).toUpperCase()}_${String(item.destination).toUpperCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
          }
        }

        setRoutes(merged);
      } catch {
        setRoutes(localList);
      } finally {
        setLoading(false);
      }
    } else {
      setRoutes(localList);
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchFavoriteRoutes();
  }, [fetchFavoriteRoutes]);

  // Sync event listener
  useEffect(() => {
    const handleSync = (e) => {
      if (e.detail?.type === 'favorite-routes') {
        fetchFavoriteRoutes();
      }
    };
    window.addEventListener('yatrai:sync-state', handleSync);
    return () => window.removeEventListener('yatrai:sync-state', handleSync);
  }, [fetchFavoriteRoutes]);

  const handleRemove = async (routeId) => {
    try {
      removeLocalFavoriteRoute(routeId);
      if (isAuthenticated && typeof routeId === 'string' && !routeId.startsWith('local_') && !routeId.startsWith('fav_default_')) {
        await api.favoriteRoutes.remove(routeId).catch(() => {});
      }
      setRoutes((prev) => prev.filter((r) => r.id !== routeId && r._id !== routeId));
    } catch (err) {
      setError(err.message || 'Failed to remove favorite route.');
    }
  };

  const handleAddRoute = async (e) => {
    e.preventDefault();
    if (!originInput.trim() || !destinationInput.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const cleanOrigin = originInput.trim().toUpperCase();
      const cleanDest = destinationInput.trim().toUpperCase();

      const localAdded = saveLocalFavoriteRoute({
        origin: cleanOrigin,
        destination: cleanDest,
        label: labelInput.trim() || `${cleanOrigin} → ${cleanDest}`,
      });

      if (isAuthenticated) {
        await api.favoriteRoutes.add({
          origin: cleanOrigin,
          destination: cleanDest,
          label: labelInput.trim() || `${cleanOrigin} → ${cleanDest}`,
        }).catch(() => {});
      }

      if (localAdded) {
        setRoutes((prev) => [localAdded, ...prev.filter((r) => r.origin !== cleanOrigin || r.destination !== cleanDest)]);
      }

      setOriginInput('');
      setDestinationInput('');
      setLabelInput('');
      setShowAddForm(false);
    } catch (err) {
      setError(err.message || 'Failed to add favorite route.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickAdd = (origin, destination, label) => {
    const saved = saveLocalFavoriteRoute({ origin, destination, label });
    if (isAuthenticated) {
      api.favoriteRoutes.add({ origin, destination, label }).catch(() => {});
    }
    if (saved) {
      setRoutes((prev) => [saved, ...prev.filter((r) => r.origin !== origin || r.destination !== destination)]);
    }
  };

  const handleSearchCorridor = (route) => {
    if (onSearchRoute) {
      // Travel date: tomorrow or today
      const d = new Date();
      d.setDate(d.getDate() + 1);
      const tomorrow = d.toISOString().split('T')[0];

      onSearchRoute({
        origin: route.origin,
        destination: route.destination,
        departureDate: tomorrow,
        ranking: 'overall',
      });
    }
  };

  if (authLoading || (loading && routes.length === 0)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" aria-hidden="true" />
      </div>
    );
  }

  const SUGGESTED_CORRIDORS = [
    { origin: 'NDLS', destination: 'PNBE', label: 'Delhi ↔ Patna Trunk Line' },
    { origin: 'NDLS', destination: 'MMCT', label: 'Delhi ↔ Mumbai Tejas Corridor' },
    { origin: 'HWH', destination: 'NDLS', label: 'Kolkata ↔ Delhi Rajdhani Route' },
    { origin: 'SBC', destination: 'MAS', label: 'Bengaluru ↔ Chennai Shatabdi' },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-4 sm:py-8 px-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-400">
            <Heart className="h-4 w-4 fill-rose-400" aria-hidden="true" />
            <span>Frequent Corridors</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text-primary mt-1">
            Favorite Routes
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Quickly search your most frequent origin-destination routes across India with 1 click.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-white/10 cursor-pointer transition-colors"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{showAddForm ? 'Cancel' : 'Add Corridor'}</span>
        </button>
      </div>

      {/* Guest Mode Indicator */}
      {!isAuthenticated && (
        <div className="flex items-center justify-between rounded-xl border border-brand-primary/20 bg-[#161B22] p-3 text-xs text-text-secondary">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-brand-primary shrink-0" />
            <span>Favorite routes are preserved locally. Sign in to sync across your devices.</span>
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

      {/* Add Route Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddRoute}
          className="rounded-2xl border border-brand-primary/20 bg-[#15191F] p-4 sm:p-6 space-y-4 shadow-xl"
        >
          <h3 className="text-sm font-bold text-text-primary">Add New Favorite Corridor</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Origin (Station / City)</label>
              <input
                type="text"
                value={originInput}
                onChange={(e) => setOriginInput(e.target.value)}
                placeholder="e.g. NDLS or New Delhi"
                required
                className="w-full rounded-xl border border-white/10 bg-[#12151A] px-3 py-2 text-xs text-text-primary focus:border-brand-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Destination (Station / City)</label>
              <input
                type="text"
                value={destinationInput}
                onChange={(e) => setDestinationInput(e.target.value)}
                placeholder="e.g. PNBE or Patna"
                required
                className="w-full rounded-xl border border-white/10 bg-[#12151A] px-3 py-2 text-xs text-text-primary focus:border-brand-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Custom Label (Optional)</label>
              <input
                type="text"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                placeholder="e.g. Family Visits"
                className="w-full rounded-xl border border-white/10 bg-[#12151A] px-3 py-2 text-xs text-text-primary focus:border-brand-primary focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-xl border border-white/10 px-4 py-2 text-xs text-text-secondary hover:text-text-primary cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2 text-xs font-semibold text-white hover:bg-brand-hover cursor-pointer disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
              <span>Save Favorite</span>
            </button>
          </div>
        </form>
      )}

      {/* Suggested Corridors Quick-Add Strip */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#7E8794] flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-[#E8B04A]" />
          Popular IRCTC Trunk Corridors (Tap to Add)
        </span>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_CORRIDORS.map((sc) => {
            const alreadyAdded = routes.some(
              (r) =>
                String(r.origin).toUpperCase() === sc.origin &&
                String(r.destination).toUpperCase() === sc.destination
            );
            return (
              <button
                key={`${sc.origin}-${sc.destination}`}
                type="button"
                onClick={() => !alreadyAdded && handleQuickAdd(sc.origin, sc.destination, sc.label)}
                disabled={alreadyAdded}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                  alreadyAdded
                    ? 'border-white/5 bg-white/5 text-[#7E8794] cursor-default'
                    : 'border-[#303640] bg-[#161B22] text-[#F0F1F3] hover:border-[#E8B04A] hover:bg-[#1E232B]'
                }`}
              >
                <span>{sc.origin} → {sc.destination}</span>
                {alreadyAdded ? (
                  <span className="text-[10px] text-emerald-400">✓ Added</span>
                ) : (
                  <Plus className="h-3 w-3 text-[#E8B04A]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Routes Grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {routes.map((r) => (
          <div
            key={r.id || r._id || `${r.origin}-${r.destination}`}
            className="group flex flex-col justify-between rounded-xl border border-white/5 bg-surface-card p-4 hover:border-rose-400/30 hover:bg-surface-elevated transition-all"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold text-text-primary">
                  <MapPin className="h-4 w-4 text-rose-400" aria-hidden="true" />
                  <span>{r.originName || r.origin}</span>
                  <span className="text-text-muted">→</span>
                  <span>{r.destinationName || r.destination}</span>
                </div>
                {r.label && (
                  <p className="text-[11px] text-text-muted">{r.label}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(r.id || r._id)}
                title="Remove favorite route"
                className="rounded-lg p-1 text-text-muted hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-[10px] text-text-muted font-mono">
                {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : 'Favorite'}
              </span>
              <button
                type="button"
                onClick={() => handleSearchCorridor(r)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary/10 border border-brand-primary/20 px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary hover:text-white transition-all cursor-pointer"
              >
                <Search className="h-3 w-3" aria-hidden="true" />
                <span>Search Corridor</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FavoriteRoutesPage;
