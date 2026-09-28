import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Shield,
  User as UserIcon,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import api from '../../services/api.js';

export function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.getUsers({
        page,
        limit: 15,
        search,
        role: roleFilter,
        status: statusFilter,
      });
      setUsers(res.data || []);
      if (res.pagination) {
        setPagination(res.pagination);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
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
          <h2 className="text-xl font-bold tracking-tight text-text-primary">Registered Users</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Inspect verified user profiles and administrative roles.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchUsers}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-primary border border-border-default text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-border-subtle bg-surface-primary p-4 flex flex-col md:flex-row gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <Search className="h-4 w-4 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-secondary border border-border-subtle text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-primary"
          />
        </form>

        <div className="flex items-center gap-2">
          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl bg-surface-secondary border border-border-subtle text-xs text-text-secondary focus:outline-none focus:border-brand-primary cursor-pointer"
          >
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select>

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
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      {/* Table Section */}
      <div className="rounded-2xl border border-border-subtle bg-surface-primary overflow-hidden shadow-sm">
        {loading && (
          <div className="p-8 text-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-primary border-t-transparent mx-auto mb-2" />
            <p className="text-xs text-text-tertiary">Loading user directory...</p>
          </div>
        )}

        {!loading && error && (
          <div className="p-8 text-center">
            <AlertTriangle className="h-6 w-6 text-semantic-error mx-auto mb-2" />
            <p className="text-sm font-semibold text-text-primary">Failed to load users</p>
            <p className="text-xs text-text-secondary mt-1">{error}</p>
          </div>
        )}

        {!loading && !error && users.length === 0 && (
          <div className="p-8 text-center">
            <Users className="h-8 w-8 text-text-tertiary mx-auto mb-2" />
            <p className="text-sm font-semibold text-text-primary">No users found</p>
            <p className="text-xs text-text-secondary mt-1">
              No registered user accounts match the specified criteria.
            </p>
          </div>
        )}

        {!loading && !error && users.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-secondary/50 text-text-tertiary font-medium">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Registered</th>
                  <th className="py-3 px-4">Last Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle text-text-primary">
                {users.map((u) => {
                  const isAdmin = u.role === 'admin';
                  return (
                    <tr key={u.id} className="hover:bg-surface-elevated/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs font-semibold ${
                              isAdmin
                                ? 'bg-brand-primary/10 text-brand-primary border border-brand-primary/20'
                                : 'bg-surface-elevated text-text-secondary'
                            }`}
                          >
                            {isAdmin ? <Shield className="h-3.5 w-3.5" /> : <UserIcon className="h-3.5 w-3.5" />}
                          </div>
                          <div>
                            <span className="font-semibold text-text-primary block">{u.name || 'Unnamed'}</span>
                            <span className="text-[11px] text-text-tertiary font-mono block">{u.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                            isAdmin
                              ? 'bg-brand-soft text-brand-primary border border-brand-primary/20'
                              : 'bg-surface-elevated text-text-secondary border border-border-subtle'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            u.status === 'active'
                              ? 'bg-semantic-success/10 text-semantic-success'
                              : u.status === 'suspended'
                              ? 'bg-semantic-error/10 text-semantic-error'
                              : 'bg-surface-elevated text-text-tertiary'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              u.status === 'active'
                                ? 'bg-semantic-success'
                                : u.status === 'suspended'
                                ? 'bg-semantic-error'
                                : 'bg-text-tertiary'
                            }`}
                          />
                          <span className="capitalize">{u.status}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-text-secondary font-mono text-[11px]">
                        {u.phone || '—'}
                      </td>
                      <td className="py-3 px-4 text-text-secondary">{formatDate(u.createdAt)}</td>
                      <td className="py-3 px-4 text-text-tertiary">{formatDate(u.updatedAt)}</td>
                    </tr>
                  );
                })}
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

export default AdminUsersPage;
