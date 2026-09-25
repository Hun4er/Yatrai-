import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';

export function AuthCard() {
  const { user, status, error, login, register, logout, clearError } = useAuth();

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [testResponse, setTestResponse] = useState(null);
  const [testingProtected, setTestingProtected] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) clearError();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    if (mode === 'login') {
      await login(formData.email, formData.password);
    } else {
      await register(formData.name, formData.email, formData.password);
    }
    setSubmitting(false);
  };

  const handleTestProtectedRoute = async () => {
    setTestingProtected(true);
    setTestResponse(null);
    try {
      const res = await api.auth.me();
      setTestResponse({
        success: true,
        status: 200,
        data: res.data,
      });
    } catch (err) {
      setTestResponse({
        success: false,
        status: err.status || 500,
        message: err.message,
      });
    } finally {
      setTestingProtected(false);
    }
  };

  // 1. Loading / Session Restoration State
  if (status === 'loading') {
    return (
      <div className="rounded-2xl border border-white/10 bg-surface-primary p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
          <span className="text-sm font-medium text-text-secondary">
            Verifying authentication session...
          </span>
        </div>
      </div>
    );
  }

  // 2. Authenticated State
  if (status === 'authenticated' && user) {
    return (
      <div className="rounded-2xl border border-white/10 bg-surface-primary p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand-primary font-bold text-lg border border-brand-primary/20">
              {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-text-primary">{user.name}</span>
                <span className="inline-flex items-center rounded-full bg-semantic-success/15 px-2 py-0.5 text-[11px] font-medium text-semantic-success border border-semantic-success/20">
                  {user.status || 'active'}
                </span>
              </div>
              <p className="text-xs text-text-tertiary">{user.email}</p>
            </div>
          </div>

          <button
            id="auth-logout-btn"
            onClick={logout}
            className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-surface-secondary px-4 py-2 text-xs font-medium text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition-colors"
          >
            Sign Out
          </button>
        </div>

        {/* Authenticated Controls / Protected Route Verification */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Backend Authentication Guard
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Verify Bearer access token dispatch against the protected{' '}
                <code className="text-brand-primary font-mono text-[11px]">GET /api/auth/me</code>{' '}
                endpoint.
              </p>
            </div>

            <button
              id="auth-test-me-btn"
              onClick={handleTestProtectedRoute}
              disabled={testingProtected}
              className="inline-flex items-center justify-center rounded-lg bg-brand-primary px-3.5 py-1.5 text-xs font-medium text-white hover:bg-brand-hover active:bg-brand-active transition-colors disabled:opacity-50"
            >
              {testingProtected ? 'Verifying...' : 'Test GET /api/auth/me'}
            </button>
          </div>

          {testResponse && (
            <div
              className={`rounded-lg p-3 text-xs font-mono border ${
                testResponse.success
                  ? 'border-semantic-success/30 bg-semantic-success/10 text-semantic-success'
                  : 'border-semantic-error/30 bg-semantic-error/10 text-semantic-error'
              }`}
            >
              <div className="flex items-center justify-between pb-1 mb-1 border-b border-white/5 font-sans font-semibold">
                <span>Response [{testResponse.status}]</span>
                <span>{testResponse.success ? 'Protected Route Verified' : 'Access Denied'}</span>
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(testResponse.data || testResponse.message, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 3. Unauthenticated State (Login / Register Form)
  return (
    <div className="rounded-2xl border border-white/10 bg-surface-primary p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">
            {mode === 'login' ? 'Sign In to Yatrai' : 'Create an Account'}
          </h2>
          <p className="text-xs text-text-tertiary mt-0.5">
            Phase 2 Email + Password Authentication
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-lg bg-surface-secondary p-1 border border-white/5">
          <button
            id="auth-tab-login"
            type="button"
            onClick={() => {
              setMode('login');
              clearError();
            }}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              mode === 'login'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Sign In
          </button>
          <button
            id="auth-tab-register"
            type="button"
            onClick={() => {
              setMode('register');
              clearError();
            }}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              mode === 'register'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Register
          </button>
        </div>
      </div>

      {/* Error notification */}
      {error && (
        <div
          id="auth-error-banner"
          className="flex items-start justify-between rounded-lg border border-semantic-error/30 bg-semantic-error/10 p-3 text-xs text-semantic-error"
        >
          <span>{error}</span>
          <button type="button" onClick={clearError} className="ml-2 font-bold hover:opacity-75">
            &times;
          </button>
        </div>
      )}

      {/* Auth Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'register' && (
          <div>
            <label
              htmlFor="auth-name"
              className="block text-xs font-medium text-text-secondary mb-1"
            >
              Full Name
            </label>
            <input
              id="auth-name"
              name="name"
              type="text"
              required
              value={formData.name}
              onChange={handleInputChange}
              placeholder="e.g. Aarav Sharma"
              className="w-full rounded-lg border border-white/10 bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
        )}

        <div>
          <label
            htmlFor="auth-email"
            className="block text-xs font-medium text-text-secondary mb-1"
          >
            Email Address
          </label>
          <input
            id="auth-email"
            name="email"
            type="email"
            required
            value={formData.email}
            onChange={handleInputChange}
            placeholder="e.g. traveler@example.com"
            className="w-full rounded-lg border border-white/10 bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </div>

        <div>
          <label
            htmlFor="auth-password"
            className="block text-xs font-medium text-text-secondary mb-1"
          >
            Password
          </label>
          <input
            id="auth-password"
            name="password"
            type="password"
            required
            minLength={8}
            value={formData.password}
            onChange={handleInputChange}
            placeholder={mode === 'register' ? 'Minimum 8 characters' : 'Enter your password'}
            className="w-full rounded-lg border border-white/10 bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </div>

        <button
          id="auth-submit-btn"
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-primary/20 hover:bg-brand-hover active:bg-brand-active transition-all disabled:opacity-50"
        >
          {submitting
            ? mode === 'login'
              ? 'Authenticating...'
              : 'Creating Account...'
            : mode === 'login'
              ? 'Sign In'
              : 'Register Account'}
        </button>
      </form>
    </div>
  );
}

export default AuthCard;
