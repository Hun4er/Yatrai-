import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';
import {
  getLocalJourneyHistory,
  clearLocalJourneyHistory,
} from '../utils/browserCache.js';
import JourneyDetailModal from '../components/journey/JourneyDetailModal.jsx';
import { Clock, Loader2, ArrowRight, Trash2, Compass, Smartphone, Train, ArrowRight as ArrowIcon } from 'lucide-react';

/**
 * JourneyHistoryPage Component
 * Displays user's previously viewed travel journeys with direct inspection and re-booking.
 * Works seamlessly in both Visitor (Local) and Authenticated (Synced) modes.
 */
export function JourneyHistoryPage({ onNavigateHome, onViewJourneyDetail }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [historyItems, setHistoryItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [inspectingJourney, setInspectingJourney] = useState(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    const localList = getLocalJourneyHistory(50);

    if (isAuthenticated) {
      try {
        const res = await api.journeyHistory.list(50);
        const remoteList = res?.data?.history || [];

        // Merge remote and local without duplicate journey IDs
        const seen = new Set();
        const merged = [];

        for (const item of remoteList) {
          const jId = String(item.journeyId || item.journey?.id || item.journey?._id || item._id);
          if (!seen.has(jId)) {
            seen.add(jId);
            merged.push(item);
          }
        }

        for (const item of localList) {
          const jId = String(item.journeyId || item.journey?.id || item.journey?._id || item.historyId);
          if (!seen.has(jId)) {
            seen.add(jId);
            merged.push(item);
          }
        }

        setHistoryItems(merged);
      } catch {
        setHistoryItems(localList);
      } finally {
        setLoading(false);
      }
    } else {
      setHistoryItems(localList);
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Sync event listener
  useEffect(() => {
    const handleSync = (e) => {
      if (e.detail?.type === 'journey-history') {
        fetchHistory();
      }
    };
    window.addEventListener('yatrai:sync-state', handleSync);
    return () => window.removeEventListener('yatrai:sync-state', handleSync);
  }, [fetchHistory]);

  const handleClear = async () => {
    try {
      clearLocalJourneyHistory();
      if (isAuthenticated) {
        await api.journeyHistory.clear().catch(() => {});
      }
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-4 sm:py-8 px-4 sm:px-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-primary">
            <Clock className="h-4 w-4" aria-hidden="true" />
            <span>Journey Log</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text-primary mt-1">
            Travel History
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Every journey itinerary you inspect or search is automatically logged for easy rediscovery.
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

      {/* Guest Mode Indicator */}
      {!isAuthenticated && historyItems.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-brand-primary/20 bg-[#161B22] p-3 text-xs text-text-secondary">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-brand-primary shrink-0" />
            <span>Travel history is stored on this device. Sign in to synchronize your itinerary log across devices.</span>
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
      {historyItems.length === 0 && !loading && (
        <div className="rounded-2xl border border-white/5 bg-surface-card p-12 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-text-muted">
            <Compass className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-text-primary">No journey history yet</h3>
            <p className="text-xs text-text-secondary max-w-sm mx-auto">
              When you search and inspect train schedules, your viewed routes will automatically appear here.
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
          const journey = item.journey || item;
          if (!journey) return null;
          const targetId = item.historyId || item.journeyId || journey.id || journey._id || journey.trainNumber;

          return (
            <div
              key={targetId}
              className="rounded-2xl border border-[#303640] bg-[#12151A] p-4 sm:p-5 shadow-lg space-y-3.5 hover:border-[#3E4654] transition-all"
            >
              {/* Header row */}
              <div className="flex items-center justify-between pb-2.5 border-b border-[#242931]">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1A1F26] border border-[#303640] text-[#E8B04A]">
                    <Train className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#F0F1F3] text-sm sm:text-base">
                      {journey.title || journey.trainName || (journey.trainNumber ? `Train ${journey.trainNumber}` : `${journey.origin?.name || journey.from || 'Origin'} to ${journey.destination?.name || journey.to || 'Dest'}`)}
                    </h3>
                    <p className="text-[11px] text-[#A7AFBA]">
                      Viewed {item.viewedAt ? new Date(item.viewedAt).toLocaleString() : 'Recently'}
                    </p>
                  </div>
                </div>

                <span className="rounded-full bg-[#181C22] border border-[#242931] px-2.5 py-0.5 text-[11px] font-semibold text-[#A7AFBA]">
                  {journey.isDirectTrain ? 'Direct Train' : 'Optimized Plan'}
                </span>
              </div>

              {/* Schedule & Route snippet */}
              <div className="grid grid-cols-3 items-center py-2 text-center sm:text-left">
                <div>
                  <div className="text-lg font-bold text-[#F0F1F3]">
                    {journey.departureTime || journey.legs?.[0]?.departureTime || '--:--'}
                  </div>
                  <div className="text-xs text-[#A7AFBA]">
                    {journey.origin?.code || journey.origin?.name || journey.from || 'Origin'}
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center">
                  <span className="text-[11px] text-[#7E8794]">
                    {journey.duration ? `${Math.round(journey.duration / 60)}h ${journey.duration % 60}m` : 'Schedule verified'}
                  </span>
                  <div className="relative flex items-center justify-center w-full max-w-[100px] my-1">
                    <div className="h-0.5 w-full bg-[#303640]" />
                    <ArrowIcon className="absolute right-0 h-3 w-3 text-[#E8B04A]" />
                  </div>
                </div>

                <div className="sm:text-right">
                  <div className="text-lg font-bold text-[#F0F1F3]">
                    {journey.arrivalTime || journey.legs?.[journey.legs.length - 1]?.arrivalTime || '--:--'}
                  </div>
                  <div className="text-xs text-[#A7AFBA]">
                    {journey.destination?.code || journey.destination?.name || journey.to || 'Destination'}
                  </div>
                </div>
              </div>

              {/* Bottom actions */}
              <div className="flex items-center justify-between pt-2 border-t border-[#242931]">
                <span className="text-sm font-bold text-[#E8B04A]">
                  {journey.totalPrice ? `₹${journey.totalPrice.toLocaleString('en-IN')}` : journey.fare ? `₹${journey.fare.toLocaleString('en-IN')}` : 'Fare on check'}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenDetail(journey)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#303640] bg-[#161B22] px-3.5 py-1.5 text-xs font-semibold text-[#EDEFF2] hover:bg-[#1F242C] transition-colors cursor-pointer"
                  >
                    <span>View Itinerary</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.setItem(
                        'yatrai_pending_booking',
                        JSON.stringify({
                          journeyId: targetId,
                          journeySnapshot: journey,
                          savedAt: Date.now(),
                        })
                      );
                      window.history.pushState(null, '', `/booking?journeyId=${targetId}`);
                      window.dispatchEvent(new PopStateEvent('popstate'));
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#E8B04A] px-4 py-1.5 text-xs font-bold text-[#0B0D10] hover:bg-[#F0C066] transition-colors cursor-pointer shadow-sm"
                  >
                    <span>Book Now</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Inspect Journey Modal */}
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
