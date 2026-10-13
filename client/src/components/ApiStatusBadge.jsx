import React from 'react';
import { formatTimestamp } from '../utils/index.js';

export function ApiStatusBadge({ status, data, error, lastChecked, onRetry }) {
  const isConnected = status === 'connected';
  const isChecking = status === 'checking';
  const isDisconnected = status === 'disconnected';

  return (
    <div className="rounded-card border border-border-default bg-surface-primary p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Status Indicator Dot */}
          <span className="relative flex h-3 w-3">
            {isConnected && (
              <span className="absolute inline-flex h-full w-full animate-ping motion-reduce:animate-none rounded-full bg-semantic-success opacity-75" />
            )}
            <span
              className={`relative inline-flex h-3 w-3 rounded-full ${
                isConnected
                  ? 'bg-semantic-success'
                  : isChecking
                    ? 'bg-semantic-warning animate-pulse motion-reduce:animate-none'
                    : 'bg-semantic-error'
              }`}
            />
          </span>

          <div>
            <span className="text-xs uppercase tracking-wider text-text-muted">
              Backend Status
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">Yatrai API:</span>
              <span
                className={`text-sm font-medium ${
                  isConnected
                    ? 'text-semantic-success'
                    : isChecking
                      ? 'text-semantic-warning'
                      : 'text-semantic-error'
                }`}
              >
                {isConnected ? '● Connected' : isChecking ? '○ Checking...' : '✕ Disconnected'}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={onRetry}
          disabled={isChecking}
          className="rounded-control border border-border-strong bg-surface-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-elevated active:scale-95 disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-border-strong"
        >
          {isChecking ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      {/* Details Box */}
      <div className="mt-3 border-t border-border-default pt-2 text-xs text-text-muted">
        {isConnected && data && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <span className="text-text-muted">Service:</span>{' '}
              <span className="font-mono text-text-secondary">{data.service}</span>
            </div>
            <div>
              <span className="text-text-muted">Environment:</span>{' '}
              <span className="font-mono text-text-secondary">{data.environment}</span>
            </div>
            <div>
              <span className="text-text-muted">Uptime:</span>{' '}
              <span className="font-mono text-text-secondary">{data.uptimeSeconds}s</span>
            </div>
            <div>
              <span className="text-text-muted">Checked:</span>{' '}
              <span className="font-mono text-text-secondary">{formatTimestamp(lastChecked)}</span>
            </div>
          </div>
        )}

        {isDisconnected && (
          <p className="text-semantic-error font-medium">
            {error || 'Unable to establish connection with server.'}
          </p>
        )}
      </div>
    </div>
  );
}

export default ApiStatusBadge;
