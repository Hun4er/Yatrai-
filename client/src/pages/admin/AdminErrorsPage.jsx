import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  Code,
  CheckCircle,
} from 'lucide-react';
import api from '../../services/api.js';

export function AdminErrorsPage() {
  const [errors, setErrors] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // Filters
  const [severityFilter, setSeverityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Diagnostic Detail Modal
  const [selectedError, setSelectedError] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchErrors = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await api.admin.getErrors({
        page,
        limit: 15,
        severity: severityFilter,
        search,
      });
      setErrors(res.data || []);
      if (res.pagination) {
        setPagination(res.pagination);
      }
    } catch (err) {
      setFetchError(err.message || 'Failed to fetch operational errors');
    } finally {
      setLoading(false);
    }
  }, [page, severityFilter, search]);

  useEffect(() => {
    fetchErrors();
  }, [fetchErrors]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchErrors();
  };

  const handleViewDetails = async (id) => {
    setDetailLoading(true);
    try {
      const res = await api.admin.getErrorById(id);
      setSelectedError(res.data);
    } catch (err) {
      alert(`Could not load diagnostics: ${err.message}`);
    } finally {
      setDetailLoading(false);
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleString('en-IN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
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
          <h2 className="text-xl font-bold tracking-tight text-text-primary">Operational Errors</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Real-time backend diagnostic logs with safe message segregation.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchErrors}
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
            placeholder="Search error message, endpoint, or error code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-secondary border border-border-subtle text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-primary"
          />
        </form>

        <div className="flex items-center gap-2">
          <select
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl bg-surface-secondary border border-border-subtle text-xs text-text-secondary focus:outline-none focus:border-brand-primary cursor-pointer"
          >
            <option value="">All Severities</option>
            <option value="error">Error</option>
            <option value="warn">Warning</option>
            <option value="fatal">Fatal</option>
          </select>
        </div>
      </div>

      {/* Table Section */}
      <div className="rounded-2xl border border-border-subtle bg-surface-primary overflow-hidden shadow-sm">
        {loading && (
          <div className="p-8 text-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-primary border-t-transparent mx-auto mb-2" />
            <p className="text-xs text-text-tertiary">Scanning error records...</p>
          </div>
        )}

        {!loading && fetchError && (
          <div className="p-8 text-center">
            <AlertTriangle className="h-6 w-6 text-semantic-error mx-auto mb-2" />
            <p className="text-sm font-semibold text-text-primary">Failed to load error log</p>
            <p className="text-xs text-text-secondary mt-1">{fetchError}</p>
          </div>
        )}

        {!loading && !fetchError && errors.length === 0 && (
          <div className="p-8 text-center">
            <CheckCircle className="h-8 w-8 text-semantic-success mx-auto mb-2" />
            <p className="text-sm font-semibold text-text-primary">Zero System Errors Recorded</p>
            <p className="text-xs text-text-secondary mt-1">
              No operational errors have been captured matching your criteria.
            </p>
          </div>
        )}

        {!loading && !fetchError && errors.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-secondary/50 text-text-tertiary font-medium">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Method &bull; Endpoint</th>
                  <th className="py-3 px-4">Safe Message</th>
                  <th className="py-3 px-4">Diagnostics</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle text-text-primary">
                {errors.map((err) => (
                  <tr key={err.id} className="hover:bg-surface-elevated/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-[11px] text-text-tertiary whitespace-nowrap">
                      {formatDateTime(err.timestamp)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                          err.severity === 'fatal' || err.severity === 'error'
                            ? 'bg-semantic-error/10 text-semantic-error border border-semantic-error/20'
                            : 'bg-semantic-warning/10 text-semantic-warning border border-semantic-warning/20'
                        }`}
                      >
                        {err.severity}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-text-primary">
                      {err.statusCode}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-text-secondary max-w-[200px] truncate">
                      <span className="font-bold text-text-primary mr-1">{err.method || 'GET'}</span>
                      <span>{err.endpoint || '/'}</span>
                    </td>
                    <td className="py-3 px-4 text-text-primary max-w-xs truncate">
                      {err.message}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => handleViewDetails(err.id)}
                        className="inline-flex items-center gap-1 text-brand-primary hover:text-brand-hover font-semibold transition-colors cursor-pointer"
                      >
                        <Code className="h-3.5 w-3.5" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination bar */}
        {!loading && !fetchError && pagination.totalPages > 1 && (
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

      {/* Diagnostic Stack Modal (Admins Only) */}
      {selectedError && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-primary border border-border-default rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-border-subtle flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-semantic-error" />
                  <span>Error Diagnostic Inspection</span>
                </h3>
                <p className="text-[11px] text-text-tertiary font-mono mt-0.5">
                  ID: {selectedError.id} &bull; Code: {selectedError.errorCode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedError(null)}
                className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-elevated cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div>
                <span className="text-text-tertiary font-medium uppercase tracking-wider block text-[10px]">
                  Safe Message
                </span>
                <p className="text-text-primary mt-1 font-medium">{selectedError.message}</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-surface-secondary/40 p-3 rounded-xl border border-border-subtle">
                <div>
                  <span className="text-text-tertiary text-[10px] block">Status Code</span>
                  <span className="font-mono font-semibold text-text-primary">{selectedError.statusCode}</span>
                </div>
                <div>
                  <span className="text-text-tertiary text-[10px] block">Severity</span>
                  <span className="font-semibold capitalize text-semantic-error">{selectedError.severity}</span>
                </div>
                <div>
                  <span className="text-text-tertiary text-[10px] block">Module</span>
                  <span className="text-text-primary">{selectedError.module}</span>
                </div>
                <div>
                  <span className="text-text-tertiary text-[10px] block">Provider</span>
                  <span className="text-text-primary">{selectedError.provider || 'Core'}</span>
                </div>
              </div>

              {selectedError.stack && (
                <div>
                  <span className="text-text-tertiary font-medium uppercase tracking-wider block text-[10px] mb-1">
                    Internal Stack Trace (Privileged Diagnostic)
                  </span>
                  <pre className="p-3 rounded-xl bg-background-primary border border-border-subtle text-[11px] font-mono text-text-secondary overflow-x-auto whitespace-pre">
                    {selectedError.stack}
                  </pre>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border-subtle flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedError(null)}
                className="px-4 py-2 rounded-xl bg-surface-elevated text-xs font-semibold text-text-primary hover:bg-surface-secondary cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminErrorsPage;
