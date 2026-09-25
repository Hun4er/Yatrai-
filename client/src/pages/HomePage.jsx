import React from 'react';
import useApiHealth from '../hooks/useApiHealth.js';
import ApiStatusBadge from '../components/ApiStatusBadge.jsx';
import AuthCard from '../components/AuthCard.jsx';
import LocationResolverCard from '../components/LocationResolverCard.jsx';
import { APP_NAME, APP_TAGLINE, CURRENT_PHASE } from '../constants/index.js';

export function HomePage() {
  const { status, data, error, lastChecked, refetch } = useApiHealth();

  return (
    <div className="space-y-8">
      {/* Hero Welcome */}
      <div className="rounded-2xl border border-white/10 bg-surface-primary p-8 shadow-sm">
        <div className="inline-block rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-primary border border-brand-primary/20">
          {CURRENT_PHASE}
        </div>
        <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-text-primary">
          {APP_NAME}
        </h1>
        <p className="mt-2 text-lg text-brand-primary font-medium">{APP_TAGLINE}</p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-text-secondary">
          Welcome to the development environment of Yatrai. Phase 3 (Location Resolution) is active,
          converting human location text and travel phrases into canonical, structured geographic
          data for multi-modal journey planning.
        </p>
      </div>

      {/* Phase 3: Location Resolution Module */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-tertiary">
          Phase 3 — Location Resolution
        </h2>
        <LocationResolverCard />
      </div>

      {/* Phase 2: Authentication Module */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-tertiary">
          Phase 2 — Authentication &amp; Session Management
        </h2>
        <AuthCard />
      </div>

      {/* Backend API Health Status */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-tertiary">
          System Connectivity
        </h2>
        <ApiStatusBadge
          status={status}
          data={data}
          error={error}
          lastChecked={lastChecked}
          onRetry={refetch}
        />
      </div>

      {/* Foundation Architecture Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-surface-primary p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-brand-primary">
            Frontend
          </div>
          <div className="mt-2 text-base font-semibold text-text-primary">
            React + Vite + Tailwind
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            Modern ESM build system, centralized API service layer, and design tokens configured.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-surface-primary p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-brand-primary">
            Backend
          </div>
          <div className="mt-2 text-base font-semibold text-text-primary">Express + Node.js</div>
          <p className="mt-1 text-xs text-text-secondary">
            Modular route architecture, centralized configuration, structured logging, and safe
            error handling.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-surface-primary p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-brand-primary">
            API Health Check
          </div>
          <div className="mt-2 text-base font-semibold text-text-primary">GET /api/health</div>
          <p className="mt-1 text-xs text-text-secondary">
            Deterministic endpoint confirming server status, process uptime, and environment mode.
          </p>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
