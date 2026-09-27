import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';
import JourneyResultCard from '../components/journey/JourneyResultCard.jsx';
import JourneyDetailModal from '../components/journey/JourneyDetailModal.jsx';
import { Clock, Loader2, ArrowRight, Trash2, Compass } from 'lucide-react';

/**
 * JourneyHistoryPage Component (Phase 13)
 * Displays user's previously viewed travel journeys with full multi-modal details and Mapbox view.
 */
export function JourneyHistoryPage({ onNavigateHome, onViewJourneyDetail }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [historyItems, setHistoryItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [inspectingJourney, setInspectingJourney] = useState(null);

  const fetchHistory = useCallback(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);

    api.journeyHistory
      .list()
      .then((res) => {
        setHistoryItems(res?.data?.history || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Unable to load journey history.');
        setLoading(false);
      });
  }, [isAuthenticated]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleClear = async () => {
    try {
      await api.journeyHistory.clear();
      setHistoryItems([]);
    } catch (err) {
      setError(err.message || 'Failed to clear journey history.');
    }
  };

  const handleOpenDetail = (journey) => {
    setInspectingJourney(journey);
    if (onViewJourneyDetail) {
      onViewJourneyDetail(journey);
    }
  };

  if (authLoading || (loading && historyItems.length === 0)) {
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
          <Clock className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-text-primary">Sign In to View Journey History</h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            Your viewed journey options are preserved so you can revisit past itineraries.
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
            <Clock className="h-4 w-4" aria-hidden="true" />
            <span>Journey Log</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text-primary mt-1">
            Recently Viewed Journeys
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Every journey itinerary you inspect is logged for fast rediscovery.
          </p>
        </div>

        {historyItems.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
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
      {historyItems.length === 0 && !loading && (
        <div className="rounded-2xl border border-white/5 bg-surface-card p-12 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-text-muted">
            <Compass className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-text-primary">No journey history yet</h3>
            <p className="text-xs text-text-secondary max-w-sm mx-auto">
              Inspect details on any journey search result and it will automatically be remembered here.
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-brand-hover cursor-pointer"
          >
            <span>Explore Journeys</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Journeys List */}
      <div className="space-y-4">
        {historyItems.map((item) => {
          const journey = item.journey;
          if (!journey) return null;

          return (
            <div key={item.historyId || item.id || journey.id} className="relative space-y-1">
              <div className="flex items-center justify-between text-[11px] text-text-muted px-1">
                <span>Viewed on {item.viewedAt ? new Date(item.viewedAt).toLocaleString() : ''}</span>
              </div>
              <JourneyResultCard
                journey={journey}
                onSelect={() => handleOpenDetail(journey)}
                isSaved={false}
              />
            </div>
          );
        })}
      </div>

      {/* Detail Modal with Phase 12 Mapbox Visualization */}
      {inspectingJourney && (
        <JourneyDetailModal
          journey={inspectingJourney}
          onClose={() => setInspectingJourney(null)}
        />
      )}
    </div>
  );
}

export default JourneyHistoryPage;
