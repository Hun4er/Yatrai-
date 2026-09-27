import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';
import JourneyResultCard from '../components/journey/JourneyResultCard.jsx';
import JourneyDetailModal from '../components/journey/JourneyDetailModal.jsx';
import { Bookmark, Loader2, ArrowRight, AlertCircle, Compass, Trash2 } from 'lucide-react';

/**
 * SavedJourneysPage Component (Phase 13)
 * Displays user's saved multi-modal journeys with direct detail inspection and removal.
 */
export function SavedJourneysPage({ onNavigateHome, onViewJourneyDetail }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [savedItems, setSavedItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [inspectingJourney, setInspectingJourney] = useState(null);

  const fetchSavedJourneys = useCallback(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);

    api.savedJourneys
      .list()
      .then((res) => {
        setSavedItems(res?.data?.journeys || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Unable to load saved journeys.');
        setLoading(false);
      });
  }, [isAuthenticated]);

  useEffect(() => {
    fetchSavedJourneys();
  }, [fetchSavedJourneys]);

  const handleRemove = async (journeyId) => {
    try {
      await api.savedJourneys.remove(journeyId);
      setSavedItems((prev) => prev.filter((item) => item.journey.id !== journeyId && item.savedJourneyId !== journeyId));
    } catch (err) {
      setError(err.message || 'Failed to remove saved journey.');
    }
  };

  const handleOpenDetail = (journey) => {
    setInspectingJourney(journey);
    if (onViewJourneyDetail) {
      onViewJourneyDetail(journey);
    }
  };

  if (authLoading || (loading && savedItems.length === 0)) {
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
          <Bookmark className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-text-primary">Sign In to View Saved Journeys</h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            Your saved journeys are synchronized with your account. Sign in to review bookmarked trips.
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
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-primary">
            <Bookmark className="h-4 w-4" aria-hidden="true" />
            <span>Saved Journeys</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text-primary mt-1">
            Bookmarked Travel Options
          </h1>
        </div>

        <span className="text-xs text-text-tertiary">
          {savedItems.length} {savedItems.length === 1 ? 'journey' : 'journeys'} saved
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-semantic-error/30 bg-semantic-error/10 p-4 text-xs text-semantic-error">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty State */}
      {savedItems.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-surface-primary p-12 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-secondary text-text-tertiary border border-white/5">
            <Compass className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-text-primary">No Saved Journeys Yet</h3>
            <p className="text-xs text-text-secondary max-w-md mx-auto">
              When searching for routes, save journeys you want to remember or compare later.
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-brand-hover transition-colors cursor-pointer"
          >
            <span>Explore Routes</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        /* Saved Journeys Grid */
        <div className="space-y-4">
          {savedItems.map((item) => (
            <div key={item.savedJourneyId || item.journey.id} className="relative group">
              <JourneyResultCard
                journey={item.journey}
                onViewJourney={() => handleOpenDetail(item.journey)}
              />

              {/* Action Overlay: Remove from Saved */}
              <div className="mt-2 flex items-center justify-between px-2 text-xs">
                <span className="text-[11px] text-text-tertiary">
                  Saved on {new Date(item.savedAt).toLocaleDateString()}
                </span>

                <button
                  type="button"
                  onClick={() => handleRemove(item.journey.id)}
                  className="inline-flex items-center gap-1.5 text-text-tertiary hover:text-semantic-error text-[11px] font-medium transition-colors cursor-pointer"
                  title="Remove from saved journeys"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inspect Journey Modal with Phase 12 Mapbox */}
      {inspectingJourney && (
        <JourneyDetailModal
          journey={inspectingJourney}
          onClose={() => setInspectingJourney(null)}
        />
      )}
    </div>
  );
}

export default SavedJourneysPage;
