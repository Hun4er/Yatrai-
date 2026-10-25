import React, { useState, useEffect, useCallback } from 'react';
import {
  Train,
  ArrowRight,
  History,
  Sparkles,
  Trash2,
  Calendar,
  Compass,
  MapPin,
  Clock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../services/api.js';
import {
  getLocalRecentSearches,
  removeLocalRecentSearch,
  clearLocalRecentSearches,
} from '../../utils/browserCache.js';

export const POPULAR_ROUTES = [
  {
    id: 'ndls-mmct',
    origin: 'NEW DELHI - NDLS',
    originCode: 'NDLS',
    originCity: 'New Delhi',
    destination: 'MUMBAI CENTRAL - MMCT',
    destinationCode: 'MMCT',
    destinationCity: 'Mumbai',
    tag: 'Tejas Rajdhani Corridor',
    typicalDuration: '15h 40m',
  },
  {
    id: 'ndls-pnbe',
    origin: 'NEW DELHI - NDLS',
    originCode: 'NDLS',
    originCity: 'New Delhi',
    destination: 'PATNA JN - PNBE',
    destinationCode: 'PNBE',
    destinationCity: 'Patna',
    tag: 'High Frequency Corridor',
    typicalDuration: '12h 05m',
  },
  {
    id: 'hwh-bsb',
    origin: 'HOWRAH JN - HWH',
    originCode: 'HWH',
    originCity: 'Kolkata',
    destination: 'VARANASI JN - BSB',
    destinationCode: 'BSB',
    destinationCity: 'Varanasi',
    tag: 'Vande Bharat & Superfast',
    typicalDuration: '8h 05m',
  },
  {
    id: 'sbc-mas',
    origin: 'KSR BENGALURU - SBC',
    originCode: 'SBC',
    originCity: 'Bengaluru',
    destination: 'MGR CHENNAI CENTRAL - MAS',
    destinationCode: 'MAS',
    destinationCity: 'Chennai',
    tag: 'Shatabdi & Intercity',
    typicalDuration: '4h 30m',
  },
  {
    id: 'mmct-adi',
    origin: 'MUMBAI CENTRAL - MMCT',
    originCode: 'MMCT',
    originCity: 'Mumbai',
    destination: 'AHMEDABAD JN - ADI',
    destinationCode: 'ADI',
    destinationCity: 'Ahmedabad',
    tag: 'Vande Bharat Corridor',
    typicalDuration: '5h 25m',
  },
  {
    id: 'ndls-jp',
    origin: 'NEW DELHI - NDLS',
    originCode: 'NDLS',
    originCity: 'New Delhi',
    destination: 'JAIPUR - JP',
    destinationCode: 'JP',
    destinationCity: 'Jaipur',
    tag: 'Double Decker & Express',
    typicalDuration: '4h 15m',
  },
];

/**
 * Quick Discovery Section
 * Displays canonical popular routes and real recent searches with 1-click form population.
 */
export function QuickDiscoverySection({ onSelectRoute }) {
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState('popular');
  const [recentSearches, setRecentSearches] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // Load recent searches (from account if logged in, otherwise local device storage)
  const loadRecentSearches = useCallback(async () => {
    if (isAuthenticated) {
      setLoadingRecent(true);
      try {
        const res = await api.recentSearches.list(6);
        setRecentSearches(res?.data?.searches || []);
      } catch {
        setRecentSearches(getLocalRecentSearches(6));
      } finally {
        setLoadingRecent(false);
      }
    } else {
      setRecentSearches(getLocalRecentSearches(6));
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadRecentSearches();
  }, [loadRecentSearches]);

  const handleClearAllRecent = async () => {
    if (isAuthenticated) {
      try {
        await api.recentSearches.clear();
      } catch {
        // fallback
      }
    }
    clearLocalRecentSearches();
    setRecentSearches([]);
  };

  const handleRemoveOne = async (id, e) => {
    e.stopPropagation();
    if (isAuthenticated && typeof id === 'string' && !id.startsWith('local_')) {
      try {
        await api.recentSearches.remove(id);
      } catch {
        // fallback
      }
    }
    removeLocalRecentSearch(id);
    setRecentSearches((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <section className="relative z-10 w-full py-8 sm:py-12 px-3.5 sm:px-6 lg:px-8 border-b border-[#232830]/80 bg-[#0B0D10]">
      <div className="mx-auto max-w-5xl">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div className="space-y-1">
            <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-[#E8B04A] flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5" aria-hidden="true" />
              <span>QUICK DISCOVERY</span>
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl font-normal tracking-tight text-[#EDEFF2]">
              Where would you like to go?
            </h2>
            <p className="text-xs sm:text-sm text-[#9AA3AF] max-w-lg">
              Start with a popular route or continue a recent search.
            </p>
          </div>

          {/* Tab Selector */}
          <div className="inline-flex items-center rounded-lg bg-[#12151A] p-0.5 border border-[#232830]">
            <button
              type="button"
              onClick={() => setActiveTab('popular')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'popular'
                  ? 'bg-[#E8B04A] text-[#0B0D10] font-semibold shadow-sm'
                  : 'text-[#9AA3AF] hover:text-[#EDEFF2]'
              }`}
            >
              <Train className="h-3 w-3" aria-hidden="true" />
              <span>Popular Routes</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('recent')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'recent'
                  ? 'bg-[#E8B04A] text-[#0B0D10] font-semibold shadow-sm'
                  : 'text-[#9AA3AF] hover:text-[#EDEFF2]'
              }`}
            >
              <History className="h-3 w-3" aria-hidden="true" />
              <span>Recent Searches</span>
              {recentSearches.length > 0 && (
                <span className="rounded-full bg-[#181C22] px-1.5 py-0.2 text-[10px] text-[#E8B04A]">
                  {recentSearches.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tab 1: Popular Routes */}
        {activeTab === 'popular' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {POPULAR_ROUTES.map((route) => (
              <div
                key={route.id}
                onClick={() => onSelectRoute(route)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectRoute(route);
                  }
                }}
                className="group relative flex flex-col justify-between rounded-xl border border-[#232830] bg-[#12151A] p-4 text-left transition-all duration-200 hover:border-[#E8B04A]/60 hover:bg-[#181C22] hover:shadow-lg cursor-pointer"
              >
                <div>
                  {/* Tag & typical duration */}
                  <div className="flex items-center justify-between text-[11px] mb-2.5">
                    <span className="inline-flex items-center gap-1 rounded bg-[#181C22] px-2 py-0.5 text-[10px] font-medium text-[#E8B04A] border border-[#232830]">
                      <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                      {route.tag}
                    </span>
                    <span className="text-[#6B7480] flex items-center gap-1 text-[11px]">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {route.typicalDuration}
                    </span>
                  </div>

                  {/* Origin to Destination */}
                  <div className="flex items-center justify-between gap-2 py-1">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="text-[11px] text-[#6B7480] uppercase tracking-wider font-mono">
                        {route.originCode}
                      </div>
                      <div className="text-sm font-semibold text-[#EDEFF2] truncate">
                        {route.originCity}
                      </div>
                    </div>

                    <div className="flex flex-col items-center px-1 text-[#6B7480] group-hover:text-[#E8B04A] transition-colors">
                      <Train className="h-3.5 w-3.5 mb-0.5" aria-hidden="true" />
                      <div className="flex items-center gap-1">
                        <div className="h-[1px] w-6 bg-[#232830] group-hover:bg-[#E8B04A]/60 transition-colors" />
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </div>
                    </div>

                    <div className="space-y-0.5 flex-1 min-w-0 text-right">
                      <div className="text-[11px] text-[#6B7480] uppercase tracking-wider font-mono">
                        {route.destinationCode}
                      </div>
                      <div className="text-sm font-semibold text-[#EDEFF2] truncate">
                        {route.destinationCity}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer CTA */}
                <div className="mt-3 pt-2.5 border-t border-[#232830] flex items-center justify-between">
                  <span className="text-[11px] text-[#9AA3AF] group-hover:text-[#EDEFF2] transition-colors">
                    Search canonical route
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#E8B04A] group-hover:translate-x-0.5 transition-transform">
                    <span>Explore route</span>
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 2: Recent Searches */}
        {activeTab === 'recent' && (
          <div>
            {recentSearches.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1">
                  <span className="text-xs text-[#9AA3AF]">
                    {isAuthenticated
                      ? 'Saved searches from your account'
                      : 'Saved locally on your device'}
                  </span>
                  <button
                    type="button"
                    onClick={handleClearAllRecent}
                    className="inline-flex items-center gap-1 text-xs text-[#E5484D] hover:underline cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    <span>Clear history</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {recentSearches.map((s) => (
                    <div
                      key={s.id}
                      onClick={() =>
                        onSelectRoute({
                          origin: s.origin,
                          destination: s.destination,
                          departureDate: s.departureDate,
                        })
                      }
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectRoute({
                            origin: s.origin,
                            destination: s.destination,
                            departureDate: s.departureDate,
                          });
                        }
                      }}
                      className="group flex flex-col justify-between rounded-xl border border-[#232830] bg-[#12151A] p-3.5 text-left transition-all hover:border-[#E8B04A]/60 hover:bg-[#181C22] cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#EDEFF2]">
                            <MapPin className="h-3 w-3 text-[#E8B04A] shrink-0" aria-hidden="true" />
                            <span className="truncate">{s.origin}</span>
                            <span className="text-[#6B7480]">→</span>
                            <span className="truncate">{s.destination}</span>
                          </div>
                          {s.departureDate && (
                            <div className="flex items-center gap-1 text-[11px] text-[#9AA3AF]">
                              <Calendar className="h-3 w-3 text-[#6B7480]" aria-hidden="true" />
                              <span>{s.departureDate}</span>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => handleRemoveOne(s.id, e)}
                          title="Remove search"
                          className="rounded p-1 text-[#6B7480] hover:text-[#E5484D] hover:bg-[#181C22] transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-[#232830] flex items-center justify-between">
                        <span className="text-[10px] text-[#6B7480]">Click to re-run</span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#E8B04A] group-hover:translate-x-0.5 transition-transform">
                          <span>Search again</span>
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-[#232830] bg-[#12151A] p-8 text-center space-y-3">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#181C22] text-[#6B7480] border border-[#232830]">
                  <History className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-[#EDEFF2]">No recent searches yet</h3>
                  <p className="text-xs text-[#9AA3AF] max-w-sm mx-auto">
                    Searches you perform will be remembered here for easy 1-click repetition.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('popular')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#E8B04A] px-3.5 py-1.5 text-xs font-semibold text-[#0B0D10] shadow-sm hover:bg-[#F0C066] cursor-pointer"
                >
                  <span>Explore Popular Routes</span>
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default QuickDiscoverySection;
