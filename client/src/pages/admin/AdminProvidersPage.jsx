import React, { useState, useEffect } from 'react';
import {
  Server,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  Zap,
  Lock,
} from 'lucide-react';
import api from '../../services/api.js';

export function AdminProvidersPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProviders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.getProviders();
      setData(res.data);
    } catch (err) {
      setError(err.message || 'Failed to fetch provider status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-text-primary">Transport Providers</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Operational status of database-configured providers and registered runtime adapters.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchProviders}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-primary border border-border-default text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Security Invariant Banner */}
      <div className="rounded-2xl border border-brand-primary/20 bg-brand-soft p-4 flex items-center gap-3">
        <div className="p-2 rounded-xl bg-brand-primary/20 text-brand-primary shrink-0">
          <Lock className="h-5 w-5" />
        </div>
        <div>
          <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
            Operational Security Protection Active
          </h4>
          <p className="text-xs text-text-secondary mt-0.5">
            Provider API keys, client secrets, and authentication bearer tokens are deeply redacted
            and never exposed to frontend interfaces.
          </p>
        </div>
      </div>

      {loading && !data && (
        <div className="p-12 text-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-primary border-t-transparent mx-auto mb-2" />
          <p className="text-xs text-text-tertiary">Inspecting provider subsystems...</p>
        </div>
      )}

      {error && !data && (
        <div className="rounded-2xl border border-semantic-error/20 bg-surface-primary p-8 text-center">
          <AlertTriangle className="h-6 w-6 text-semantic-error mx-auto mb-2" />
          <p className="text-sm font-semibold text-text-primary">Failed to load provider status</p>
          <p className="text-xs text-text-secondary mt-1">{error}</p>
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Active Runtime Adapters */}
          <div>
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-brand-primary" />
              <span>Runtime Engine Adapters ({data.runtimeAdapters?.length || 0})</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {data.runtimeAdapters?.map((adapter) => (
                <div
                  key={adapter.mode}
                  className="rounded-2xl border border-border-subtle bg-surface-primary p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
                      {adapter.mode}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-semantic-success/10 text-semantic-success border border-semantic-success/20">
                      <span className="h-1.5 w-1.5 rounded-full bg-semantic-success" />
                      <span>Ready</span>
                    </span>
                  </div>

                  <div>
                    <span className="text-xs text-text-secondary block font-medium">
                      {adapter.name}
                    </span>
                    <span className="text-[11px] text-text-tertiary font-mono block mt-0.5">
                      Timeout: {adapter.timeoutMs}ms
                    </span>
                  </div>

                  <div className="pt-2 border-t border-border-subtle flex items-center justify-between text-[11px]">
                    <span className="text-text-tertiary">Fault Isolation</span>
                    <span className="text-semantic-success font-medium">Enabled</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Database Transport Providers */}
          <div>
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
              <Server className="h-4 w-4 text-semantic-info" />
              <span>Configured Database Providers ({data.databaseProviders?.length || 0})</span>
            </h3>

            <div className="rounded-2xl border border-border-subtle bg-surface-primary overflow-hidden">
              {data.databaseProviders?.length === 0 ? (
                <div className="p-8 text-center text-text-secondary text-xs">
                  No transport operators configured in database collection.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border-subtle bg-surface-secondary/50 text-text-tertiary font-medium">
                        <th className="py-3 px-4">Provider</th>
                        <th className="py-3 px-4">Code</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Supported Modes</th>
                        <th className="py-3 px-4">Website</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle text-text-primary">
                      {data.databaseProviders.map((p) => (
                        <tr key={p.id} className="hover:bg-surface-elevated/40 transition-colors">
                          <td className="py-3 px-4 font-semibold text-text-primary">{p.name}</td>
                          <td className="py-3 px-4 font-mono text-[11px] text-brand-primary">{p.code}</td>
                          <td className="py-3 px-4 text-text-secondary capitalize">{p.type}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1 flex-wrap">
                              {p.supportedModes?.map((m) => (
                                <span
                                  key={m}
                                  className="px-1.5 py-0.5 rounded bg-surface-elevated text-[10px] text-text-secondary border border-border-subtle uppercase"
                                >
                                  {m}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-text-tertiary">
                            {p.website ? (
                              <a
                                href={p.website}
                                target="_blank"
                                rel="noreferrer"
                                className="text-brand-primary hover:underline truncate max-w-[150px] block"
                              >
                                {p.website.replace(/^https?:\/\//, '')}
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                p.status === 'active'
                                  ? 'bg-semantic-success/10 text-semantic-success'
                                  : 'bg-surface-elevated text-text-tertiary'
                              }`}
                            >
                              <span className="capitalize">{p.status}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminProvidersPage;
