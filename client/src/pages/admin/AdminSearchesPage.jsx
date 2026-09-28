import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  User as UserIcon,
} from 'lucide-react';
import api from '../../services/api.js';

export function AdminSearchesPage() {
  const [searches, setSearches] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const fetchSearches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.getSearches({
        page,
        limit: 15,
        status: statusFilter,
        search,
      });
      setSearches(res.data || []);
      if (res.pagination) {
        setPagination(res.pagination);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch searches');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    fetchSearches();
  }, [fetchSearches]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchSearches();
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleString('en-IN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
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
          <h2 className="text-xl font-bold tracking-tight text-text-primary">Search Activity</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Real search requests executed across the multi-modal journey orchestrator.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchSearches}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-primary border border-border-default text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-border-subtle bg-surface-primary p-4 flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <Search className="h-4 w-4 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by city or station name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-secondary border border-border-subtle text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-primary"
          />
        </form>

        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl bg-surface-secondary border border-border-subtle text-xs text-text-secondary focus:outline-none focus:border-brand-primary cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Table Section */}
      <div className="rounded-2xl border border-border-subtle bg-surface-primary overflow-hidden shadow-sm">
        {loading && (
          <div className="p-8 text-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-primary border-t-transparent mx-auto mb-2" />
            <p className="text-xs text-text-tertiary">Loading search queries...</p>
          </div>
        )}

        {!loading && error && (
          <div className="p-8 text-center">
            <AlertTriangle className="h-6 w-6 text-semantic-error mx-auto mb-2" />
            <p className="text-sm font-semibold text-text-primary">Failed to load searches</p>
            <p className="text-xs text-text-secondary mt-1">{error}</p>
          </div>
        )}

        {!loading && !error && searches.length === 0 && (
          <div className="p-8 text-center">
            <Search className="h-8 w-8 text-text-tertiary mx-auto mb-2" />
            <p className="text-sm font-semibold text-text-primary">No search requests recorded</p>
            <p className="text-xs text-text-secondary mt-1">
              Search requests will populate here as users search for journeys.
            </p>
          </div>
        )}

        {!loading && !error && searches.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-secondary/50 text-text-tertiary font-medium">
                  <th className="py-3 px-4">Corridor</th>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Departure Date</th>
                  <th className="py-3 px-4">Modes</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Requested At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle text-text-primary">
                {searches.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-elevated/40 transition-colors">
                    <td className="py-3 px-4 font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className="text-text-primary">{s.origin?.city || s.origin?.name || 'Origin'}</span>
                        <ArrowRight className="h-3 w-3 text-text-tertiary shrink-0" />
                        <span className="text-text-primary">{s.destination?.city || s.destination?.name || 'Destination'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {s.user ? (
                        <div className="flex items-center gap-1.5">
                          <UserIcon className="h-3.5 w-3.5 text-brand-primary" />
                          <span className="text-text-primary truncate max-w-[120px]">{s.user.name || s.user.email}</span>
                        </div>
                      ) : (
                        <span className="text-text-tertiary italic">Guest</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-text-secondary">
                      {formatDateTime(s.departureDate)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 flex-wrap">
                        {s.requestedModes && s.requestedModes.length > 0 ? (
                          s.requestedModes.map((m) => (
                            <span
                              key={m}
                              className="px-1.5 py-0.5 rounded bg-surface-elevated text-[10px] text-text-secondary border border-border-subtle uppercase"
                            >
                              {m}
                            </span>
                          ))
                        ) : (
                          <span className="text-text-tertiary">All</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-text-secondary capitalize">{s.priority}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          s.status === 'completed'
                            ? 'bg-semantic-success/10 text-semantic-success'
                            : s.status === 'failed'
                            ? 'bg-semantic-error/10 text-semantic-error'
                            : 'bg-semantic-info/10 text-semantic-info'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            s.status === 'completed'
                              ? 'bg-semantic-success'
                              : s.status === 'failed'
                              ? 'bg-semantic-error'
                              : 'bg-semantic-info'
                          }`}
                        />
                        <span className="capitalize">{s.status}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-text-tertiary">{formatDateTime(s.createdAt)}</td>
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

export default AdminSearchesPage;
