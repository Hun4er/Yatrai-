import React, { useState, useEffect, useCallback } from 'react';
import {
  Navigation,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  Clock,
  IndianRupee,
} from 'lucide-react';
import api from '../../services/api.js';

export function AdminJourneysPage() {
  const [journeys, setJourneys] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [modeFilter, setModeFilter] = useState('');
  const [page, setPage] = useState(1);

  const fetchJourneys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.getJourneys({
        page,
        limit: 15,
        mode: modeFilter,
      });
      setJourneys(res.data || []);
      if (res.pagination) {
        setPagination(res.pagination);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch journeys');
    } finally {
      setLoading(false);
    }
  }, [page, modeFilter]);

  useEffect(() => {
    fetchJourneys();
  }, [fetchJourneys]);

  const formatDuration = (mins) => {
    if (!mins) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '—';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-text-primary">Persisted Journeys</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Canonical journey records stored across multi-modal segments and providers.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchJourneys}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-primary border border-border-default text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl border border-border-subtle bg-surface-primary p-4 flex items-center justify-between">
        <span className="text-xs text-text-tertiary">Filter by transport mode:</span>
        <select
          value={modeFilter}
          onChange={(e) => {
            setModeFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl bg-surface-secondary border border-border-subtle text-xs text-text-secondary focus:outline-none focus:border-brand-primary cursor-pointer"
        >
          <option value="">All Transport Modes</option>
          <option value="rail">Rail</option>
          <option value="bus">Bus</option>
          <option value="flight">Flight</option>
          <option value="road">Road</option>
        </select>
      </div>

      {/* Table Section */}
      <div className="rounded-2xl border border-border-subtle bg-surface-primary overflow-hidden shadow-sm">
        {loading && (
          <div className="p-8 text-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-primary border-t-transparent mx-auto mb-2" />
            <p className="text-xs text-text-tertiary">Loading persisted journeys...</p>
          </div>
        )}

        {!loading && error && (
          <div className="p-8 text-center">
            <AlertTriangle className="h-6 w-6 text-semantic-error mx-auto mb-2" />
            <p className="text-sm font-semibold text-text-primary">Failed to load journeys</p>
            <p className="text-xs text-text-secondary mt-1">{error}</p>
          </div>
        )}

        {!loading && !error && journeys.length === 0 && (
          <div className="p-8 text-center">
            <Navigation className="h-8 w-8 text-text-tertiary mx-auto mb-2" />
            <p className="text-sm font-semibold text-text-primary">No journeys persisted</p>
            <p className="text-xs text-text-secondary mt-1">
              Journeys are persisted atomically when searches yield verified itineraries.
            </p>
          </div>
        )}

        {!loading && !error && journeys.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-secondary/50 text-text-tertiary font-medium">
                  <th className="py-3 px-4">Journey ID</th>
                  <th className="py-3 px-4">Route</th>
                  <th className="py-3 px-4">Modes</th>
                  <th className="py-3 px-4">Departure &bull; Arrival</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Price</th>
                  <th className="py-3 px-4">Transfers</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle text-text-primary">
                {journeys.map((j) => (
                  <tr key={j.id} className="hover:bg-surface-elevated/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-[11px] text-text-tertiary">
                      {j.id.slice(-8)}
                    </td>
                    <td className="py-3 px-4 font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className="text-text-primary">{j.origin?.city || j.origin?.name || 'Origin'}</span>
                        <ArrowRight className="h-3 w-3 text-text-tertiary shrink-0" />
                        <span className="text-text-primary">{j.destination?.city || j.destination?.name || 'Destination'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 flex-wrap">
                        {j.transportModes.map((m) => (
                          <span
                            key={m}
                            className="px-1.5 py-0.5 rounded bg-brand-soft text-[10px] text-brand-primary border border-brand-primary/20 uppercase font-semibold"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-text-secondary">
                      {formatDateTime(j.departureTime)} &rarr; {formatDateTime(j.arrivalTime)}
                    </td>
                    <td className="py-3 px-4 text-text-secondary">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-text-tertiary" />
                        <span>{formatDuration(j.duration)}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-text-primary">
                      ₹{j.totalPrice.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4 text-text-secondary">
                      {j.numberOfTransfers === 0 ? 'Direct' : `${j.numberOfTransfers} transfer(s)`}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-semantic-success/10 text-semantic-success capitalize">
                        {j.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination bar */}
        {!loading && !error && pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-border-subtle flex items-center justify-between text-xs text-text-secondary bg-surface-secondary/20">
            <span>
              Showing Page <strong className="text-text-primary">{pagination.page}</strong> of{' '}
              <strong className="text-text-primary">{pagination.totalPages}</strong> ({pagination.total} total)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
                className="p-1.5 rounded-lg border border-border-subtle bg-surface-elevated text-text-secondary hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={pagination.page >= pagination.totalPages}
                className="p-1.5 rounded-lg border border-border-subtle bg-surface-elevated text-text-secondary hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminJourneysPage;
