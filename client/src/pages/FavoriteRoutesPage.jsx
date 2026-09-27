import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';
import { Heart, Loader2, ArrowRight, Trash2, MapPin, Search, Plus } from 'lucide-react';

/**
 * FavoriteRoutesPage Component (Phase 13)
 * Displays user's saved Origin -> Destination corridors with 1-click execution.
 */
export function FavoriteRoutesPage({ onNavigateHome, onSearchRoute }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [originInput, setOriginInput] = useState('');
  const [destinationInput, setDestinationInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchFavoriteRoutes = useCallback(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);

    api.favoriteRoutes
      .list()
      .then((res) => {
        setRoutes(res?.data?.routes || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Unable to load favorite routes.');
        setLoading(false);
      });
  }, [isAuthenticated]);

  useEffect(() => {
    fetchFavoriteRoutes();
  }, [fetchFavoriteRoutes]);

  const handleRemove = async (routeId) => {
    try {
      await api.favoriteRoutes.remove(routeId);
      setRoutes((prev) => prev.filter((r) => r.id !== routeId));
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
      const res = await api.favoriteRoutes.add({
        origin: originInput.trim(),
        destination: destinationInput.trim(),
      });
      if (res?.data?.route) {
        setRoutes((prev) => [res.data.route, ...prev]);
      }
      setOriginInput('');
      setDestinationInput('');
      setShowAddForm(false);
    } catch (err) {
      setError(err.message || 'Failed to add favorite route.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSearchCorridor = (route) => {
    if (onSearchRoute) {
      const today = new Date().toISOString().split('T')[0];
      onSearchRoute({
        origin: route.origin,
        destination: route.destination,
        departureDate: today,
        ranking: 'balanced',
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

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-md space-y-6 py-12 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft border border-brand-primary/20 text-brand-primary">
          <Heart className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-text-primary">Sign In to View Favorite Routes</h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            Bookmark travel corridors you use frequently between cities and stations.
          </p>
        </div>
        <button
          type="button"
          onClick={onNavigateHome}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-brand-hover cursor-pointer"
        >
          <span>Find Routes</span>
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
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-400">
            <Heart className="h-4 w-4 fill-rose-400" aria-hidden="true" />
            <span>Favorite Corridors</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text-primary mt-1">
            Favorite Routes
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Quickly search your most frequent origin-destination routes across India.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-white/10 cursor-pointer transition-colors"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{showAddForm ? 'Cancel' : 'Add Route'}</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Add Route Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddRoute}
          className="rounded-2xl border border-brand-primary/20 bg-surface-card p-4 sm:p-6 space-y-4"
        >
          <h3 className="text-sm font-bold text-text-primary">Add New Favorite Corridor</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Origin City / Station</label>
              <input
                type="text"
                value={originInput}
                onChange={(e) => setOriginInput(e.target.value)}
                placeholder="e.g. Sonipat"
                required
                className="w-full rounded-xl border border-white/10 bg-surface-elevated px-3 py-2 text-xs text-text-primary focus:border-brand-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Destination City / Station</label>
              <input
                type="text"
                value={destinationInput}
                onChange={(e) => setDestinationInput(e.target.value)}
                placeholder="e.g. Patna"
                required
                className="w-full rounded-xl border border-white/10 bg-surface-elevated px-3 py-2 text-xs text-text-primary focus:border-brand-primary focus:outline-none"
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

      {/* Empty State */}
      {routes.length === 0 && !loading && (
        <div className="rounded-2xl border border-white/5 bg-surface-card p-12 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-text-muted">
            <Heart className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-text-primary">No favorite routes yet</h3>
            <p className="text-xs text-text-secondary max-w-sm mx-auto">
              Save your frequent routes like home-to-work or family travel corridors for quick 1-click searches.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-brand-hover cursor-pointer"
          >
            <span>Add First Route</span>
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Routes Grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {routes.map((r) => (
          <div
            key={r.id}
            className="group flex flex-col justify-between rounded-xl border border-white/5 bg-surface-card p-4 hover:border-rose-400/30 hover:bg-surface-elevated transition-all"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold text-text-primary">
                  <MapPin className="h-4 w-4 text-rose-400" aria-hidden="true" />
                  <span>{r.origin}</span>
                  <span className="text-text-muted">→</span>
                  <span>{r.destination}</span>
                </div>
                {r.label && (
                  <p className="text-[11px] text-text-muted">{r.label}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(r.id)}
                title="Remove favorite route"
                className="rounded-lg p-1 text-text-muted hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-[10px] text-text-muted">
                Saved {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}
              </span>
              <button
                type="button"
                onClick={() => handleSearchCorridor(r)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary/10 border border-brand-primary/20 px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary hover:text-white transition-all cursor-pointer"
              >
                <Search className="h-3 w-3" aria-hidden="true" />
                <span>Search Route</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FavoriteRoutesPage;
