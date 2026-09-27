import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';
import AuthCard from '../components/AuthCard.jsx';
import {
  Mail,
  Calendar,
  LogOut,
  Bookmark,
  Clock,
  Heart,
  Compass,
  ShieldCheck,
  Loader2,
  AlertCircle,
} from 'lucide-react';

/**
 * ProfilePage Component (Phase 13)
 * Displays authenticated user account details and quick navigation to user-owned features.
 */
export function ProfilePage({ onNavigate }) {
  const { user: authUser, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCancelled = false;

    if (isAuthenticated) {
      setLoading(true);
      setError(null);

      api.users
        .me()
        .then((res) => {
          if (!isCancelled) {
            setProfileData(res?.data?.user || authUser);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (!isCancelled) {
            setError(err.message || 'Unable to retrieve user profile.');
            setLoading(false);
          }
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated, authUser]);

  if (authLoading || (loading && !profileData)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" aria-hidden="true" />
      </div>
    );
  }

  // Unauthenticated view: AuthCard prompt
  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-md space-y-6 py-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-text-primary">
            Sign In to Yatrai
          </h1>
          <p className="text-xs text-text-secondary">
            Sign in to access your saved journeys, favorite routes, and travel history.
          </p>
        </div>
        <AuthCard />
      </div>
    );
  }

  const user = profileData || authUser || {};
  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      })
    : 'Active Traveler';

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-4 sm:py-8">
      {/* Profile Header Card */}
      <div className="rounded-2xl border border-white/10 bg-surface-primary p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-soft border border-brand-primary/20 text-brand-primary font-bold text-2xl shadow-inner">
              {user.name ? user.name[0].toUpperCase() : 'U'}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold text-text-primary">
                  {user.name || 'Traveler'}
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-semantic-success/10 px-2.5 py-0.5 text-[11px] font-semibold text-semantic-success border border-semantic-success/20">
                  <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                  <span>Verified Account</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" />
                  <span>{user.email}</span>
                </span>

                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" />
                  <span>Member since {memberSince}</span>
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-surface-secondary px-4 py-2.5 text-xs font-semibold text-text-secondary hover:text-semantic-error hover:border-semantic-error/30 transition-all cursor-pointer self-start sm:self-auto"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-semantic-error/30 bg-semantic-error/10 p-4 text-xs text-semantic-error">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Quick Navigation to User Features (Phase 13) */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-tertiary">
          Your Travel Hub
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Saved Journeys */}
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('/saved')}
            className="rounded-2xl border border-white/5 bg-surface-primary p-5 text-left transition-all hover:border-brand-primary/40 hover:bg-surface-elevated cursor-pointer group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand-primary border border-brand-primary/20 mb-3 group-hover:scale-105 transition-transform">
              <Bookmark className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="text-sm font-bold text-text-primary">Saved Journeys</div>
            <div className="text-[11px] text-text-secondary mt-1">
              Bookmarked multi-modal routes
            </div>
          </button>

          {/* Recent Searches */}
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('/recent')}
            className="rounded-2xl border border-white/5 bg-surface-primary p-5 text-left transition-all hover:border-brand-primary/40 hover:bg-surface-elevated cursor-pointer group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-semantic-info/10 text-semantic-info border border-semantic-info/20 mb-3 group-hover:scale-105 transition-transform">
              <Clock className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="text-sm font-bold text-text-primary">Recent Searches</div>
            <div className="text-[11px] text-text-secondary mt-1">
              Re-run your previous queries
            </div>
          </button>

          {/* Favorite Routes */}
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('/favorites')}
            className="rounded-2xl border border-white/5 bg-surface-primary p-5 text-left transition-all hover:border-brand-primary/40 hover:bg-surface-elevated cursor-pointer group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-semantic-error/10 text-semantic-error border border-semantic-error/20 mb-3 group-hover:scale-105 transition-transform">
              <Heart className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="text-sm font-bold text-text-primary">Favorite Routes</div>
            <div className="text-[11px] text-text-secondary mt-1">
              Frequent origin → destination corridors
            </div>
          </button>

          {/* Journey History */}
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('/history')}
            className="rounded-2xl border border-white/5 bg-surface-primary p-5 text-left transition-all hover:border-brand-primary/40 hover:bg-surface-elevated cursor-pointer group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-semantic-warning/10 text-semantic-warning border border-semantic-warning/20 mb-3 group-hover:scale-105 transition-transform">
              <Compass className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="text-sm font-bold text-text-primary">Journey History</div>
            <div className="text-[11px] text-text-secondary mt-1">
              Previously viewed routes & schedules
            </div>
          </button>
        </div>
      </div>

      {/* Account Preferences Card */}
      <div className="rounded-2xl border border-white/10 bg-surface-primary p-6 space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-tertiary">
          Account Settings & Preferences
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="rounded-xl border border-white/5 bg-surface-secondary p-4 space-y-1">
            <span className="text-text-tertiary">Preferred Currency</span>
            <div className="font-semibold text-text-primary text-sm">
              {user.preferences?.preferredCurrency || 'INR (₹)'}
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-surface-secondary p-4 space-y-1">
            <span className="text-text-tertiary">Preferred Transport Modes</span>
            <div className="font-semibold text-text-primary text-sm capitalize">
              {user.preferences?.preferredTransportModes?.join(', ') || 'Rail, Bus, Road'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;
