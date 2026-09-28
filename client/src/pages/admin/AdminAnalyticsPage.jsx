import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  Search,
  Navigation,
  AlertTriangle,
  RefreshCw,
  Bell,
  CheckCircle2,
} from 'lucide-react';
import api from '../../services/api.js';

export function AdminAnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.getAnalytics();
      setData(res.data);
    } catch (err) {
      setError(err.message || 'Failed to calculate operational analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 rounded-2xl bg-surface-primary border border-border-subtle p-5" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-semantic-error/20 bg-surface-primary p-8 text-center">
        <AlertTriangle className="h-6 w-6 text-semantic-error mx-auto mb-2" />
        <p className="text-sm font-semibold text-text-primary">Failed to load analytics</p>
        <p className="text-xs text-text-secondary mt-1">{error}</p>
        <button
          type="button"
          onClick={fetchAnalytics}
          className="mt-4 px-4 py-2 rounded-xl bg-surface-elevated text-xs font-semibold text-text-primary hover:bg-surface-secondary cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const { users, searches, journeys, errors, notifications } = data || {};

  // Calculate maximum mode count for CSS bar charts
  const maxModeCount = Math.max(...(searches?.byRequestedMode?.map((m) => m.count) || [1]), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-text-primary">Operational Analytics</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Aggregated system metrics calculated directly via database aggregation pipelines.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchAnalytics}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-primary border border-border-default text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Top Aggregation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Search Performance */}
        <div className="rounded-2xl border border-border-subtle bg-surface-primary p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              Search Success Rate
            </span>
            <Search className="h-4 w-4 text-semantic-info" />
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-text-primary">
                {searches?.successRatePercentage ?? 0}%
              </span>
              <span className="text-xs text-text-secondary font-medium">completion rate</span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-surface-elevated overflow-hidden mt-3">
              <div
                className="h-full bg-semantic-success rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, searches?.successRatePercentage || 0)}%` }}
              />
            </div>
          </div>

          <div className="pt-3 border-t border-border-subtle flex items-center justify-between text-xs text-text-secondary">
            <span>Completed: <strong className="text-text-primary">{searches?.completed || 0}</strong></span>
            <span>Failed: <strong className="text-text-primary">{searches?.failed || 0}</strong></span>
          </div>
        </div>

        {/* Journey Statistics */}
        <div className="rounded-2xl border border-border-subtle bg-surface-primary p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              Journey Metrics
            </span>
            <Navigation className="h-4 w-4 text-semantic-success" />
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-text-primary">
                ₹{journeys?.averagePriceINR?.toLocaleString('en-IN') || 0}
              </span>
              <span className="text-xs text-text-secondary font-medium">avg ticket price</span>
            </div>

            <p className="text-xs text-text-secondary mt-1">
              Average journey duration: <strong className="text-text-primary">{journeys?.averageDurationMinutes || 0} mins</strong>
            </p>
          </div>

          <div className="pt-3 border-t border-border-subtle flex items-center justify-between text-xs text-text-secondary">
            <span>Persisted: <strong className="text-text-primary">{journeys?.total || 0}</strong></span>
            <span>Range: ₹{journeys?.minPriceINR || 0} – ₹{journeys?.maxPriceINR || 0}</span>
          </div>
        </div>

        {/* User Distribution */}
        <div className="rounded-2xl border border-border-subtle bg-surface-primary p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              Account Status Breakdown
            </span>
            <Users className="h-4 w-4 text-brand-primary" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-surface-secondary border border-border-subtle">
              <span className="text-[10px] text-text-tertiary uppercase tracking-wider block">Active</span>
              <span className="text-xl font-bold text-semantic-success mt-0.5 block">
                {users?.byStatus?.active || 0}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-surface-secondary border border-border-subtle">
              <span className="text-[10px] text-text-tertiary uppercase tracking-wider block">Suspended</span>
              <span className="text-xl font-bold text-semantic-error mt-0.5 block">
                {users?.byStatus?.suspended || 0}
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-border-subtle flex items-center justify-between text-xs text-text-secondary">
            <span>Admins: <strong className="text-text-primary">{users?.byRole?.admin || 0}</strong></span>
            <span>Regular Users: <strong className="text-text-primary">{users?.byRole?.user || 0}</strong></span>
          </div>
        </div>
      </div>

      {/* Transport Modes & Searches Over Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Searches by Requested Transport Mode */}
        <div className="rounded-2xl border border-border-subtle bg-surface-primary p-5 space-y-4">
          <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-brand-primary" />
            <span>Searches by Transport Mode</span>
          </h3>

          {searches?.byRequestedMode?.length === 0 ? (
            <p className="text-xs text-text-tertiary">No mode queries recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {searches?.byRequestedMode?.map((item) => {
                const percentage = Math.round((item.count / maxModeCount) * 100);
                return (
                  <div key={item.mode} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-text-primary capitalize">{item.mode}</span>
                      <span className="text-text-secondary font-mono">{item.count} query(s)</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-elevated overflow-hidden">
                      <div
                        className="h-full bg-brand-primary rounded-full transition-all duration-300"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Error Breakdown & Notifications */}
        <div className="rounded-2xl border border-border-subtle bg-surface-primary p-5 space-y-4">
          <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-semantic-warning" />
            <span>System Errors & Notification Queue</span>
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-surface-secondary border border-border-subtle">
              <span className="text-[10px] text-text-tertiary uppercase tracking-wider block">
                Client 4xx Errors
              </span>
              <span className="text-lg font-bold text-text-primary mt-1 block">
                {errors?.byCategory?.client_4xx || 0}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-surface-secondary border border-border-subtle">
              <span className="text-[10px] text-text-tertiary uppercase tracking-wider block">
                Server 5xx Errors
              </span>
              <span className="text-lg font-bold text-semantic-error mt-1 block">
                {errors?.byCategory?.server_5xx || 0}
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-border-subtle space-y-2 text-xs">
            <div className="flex items-center justify-between text-text-secondary">
              <span className="flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5 text-brand-primary" />
                <span>Total Notifications Dispatched</span>
              </span>
              <strong className="text-text-primary font-mono">{notifications?.total || 0}</strong>
            </div>
            <div className="flex items-center justify-between text-text-secondary">
              <span>Read vs Unread</span>
              <span className="font-mono">
                {notifications?.byReadStatus?.read || 0} read &bull; {notifications?.byReadStatus?.unread || 0} unread
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminAnalyticsPage;
