import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Navigation,
  Server,
  AlertTriangle,
  Activity,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import api from '../../services/api.js';

export function AdminOverviewPage({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.getOverview();
      setData(res.data);
    } catch (err) {
      setError(err.message || 'Failed to load operational overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-surface-primary border border-border-subtle p-5" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-semantic-error/20 bg-surface-primary p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-semantic-error mx-auto mb-2" />
        <h3 className="text-base font-bold text-text-primary">Failed to load overview</h3>
        <p className="text-sm text-text-secondary mt-1">{error}</p>
        <button
          type="button"
          onClick={fetchOverview}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-elevated text-xs font-semibold text-text-primary hover:bg-surface-secondary border border-border-default transition-colors cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  const formatUptime = (seconds) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    parts.push(`${m}m`);
    return parts.join(' ');
  };

  const cards = [
    {
      title: 'Total Users',
      value: data?.users?.total ?? 0,
      subValue: `${data?.users?.active ?? 0} active accounts`,
      icon: Users,
      color: 'text-brand-primary',
      bg: 'bg-brand-soft',
      link: '/admin/users',
    },
    {
      title: 'Total Searches',
      value: data?.searches?.total ?? 0,
      subValue: 'Search requests processed',
      icon: Search,
      color: 'text-semantic-info',
      bg: 'bg-semantic-info/10',
      link: '/admin/searches',
    },
    {
      title: 'Persisted Journeys',
      value: data?.journeys?.total ?? 0,
      subValue: 'Canonical journey entities',
      icon: Navigation,
      color: 'text-semantic-success',
      bg: 'bg-semantic-success/10',
      link: '/admin/journeys',
    },
    {
      title: 'Transport Providers',
      value: data?.providers?.configured ?? 0,
      subValue: `${data?.providers?.runtimeAdapters ?? 0} active runtime adapters`,
      icon: Server,
      color: 'text-brand-primary',
      bg: 'bg-brand-soft',
      link: '/admin/providers',
    },
    {
      title: 'Recent Errors (24h)',
      value: data?.errors?.last24Hours ?? 0,
      subValue: 'Operational error records',
      icon: AlertTriangle,
      color: (data?.errors?.last24Hours ?? 0) > 0 ? 'text-semantic-warning' : 'text-semantic-success',
      bg: (data?.errors?.last24Hours ?? 0) > 0 ? 'bg-semantic-warning/10' : 'bg-semantic-success/10',
      link: '/admin/errors',
    },
    {
      title: 'System Health',
      value: data?.systemHealth?.status || 'HEALTHY',
      subValue: `DB: ${data?.systemHealth?.database || 'connected'} • Up: ${formatUptime(data?.systemHealth?.uptimeSeconds || 0)}`,
      icon: Activity,
      color: data?.systemHealth?.status === 'HEALTHY' ? 'text-semantic-success' : 'text-semantic-error',
      bg: data?.systemHealth?.status === 'HEALTHY' ? 'bg-semantic-success/10' : 'bg-semantic-error/10',
      link: '/admin/system-health',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top action row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-text-primary">Operational Overview</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Key operational metrics derived directly from system persistence.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchOverview}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-primary border border-border-default text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="rounded-2xl border border-border-subtle bg-surface-primary p-5 hover:border-border-default transition-all flex flex-col justify-between"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider block">
                    {card.title}
                  </span>
                  <span className="text-2xl font-bold tracking-tight text-text-primary mt-1 block">
                    {card.value}
                  </span>
                </div>
                <div className={`p-2.5 rounded-xl ${card.bg} ${card.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between text-xs">
                <span className="text-text-secondary">{card.subValue}</span>
                <button
                  type="button"
                  onClick={() => onNavigate(card.link)}
                  className="inline-flex items-center gap-1 text-brand-primary hover:text-brand-hover font-medium transition-colors cursor-pointer"
                >
                  <span>View</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Status Info Banner */}
      <div className="rounded-2xl border border-border-subtle bg-surface-secondary/40 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-semantic-success/10 border border-semantic-success/20 flex items-center justify-center text-semantic-success">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-text-primary">
              All Core Transport Engines Online
            </h4>
            <p className="text-xs text-text-secondary">
              Road, Rail, Bus, and Flight providers configured with concurrent fault-isolation.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('/admin/analytics')}
            className="px-3.5 py-2 rounded-xl bg-surface-elevated text-xs font-semibold text-text-primary border border-border-default hover:bg-surface-secondary transition-colors cursor-pointer"
          >
            Detailed Analytics
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/admin/system-health')}
            className="px-3.5 py-2 rounded-xl bg-brand-primary text-xs font-semibold text-white hover:bg-brand-hover transition-colors cursor-pointer"
          >
            System Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminOverviewPage;
