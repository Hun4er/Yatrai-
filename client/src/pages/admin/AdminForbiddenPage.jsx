import React, { useState } from 'react';
import { ShieldAlert, ArrowLeft, LogIn, Lock, Mail, AlertCircle, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';

export function AdminForbiddenPage({ onNavigateHome }) {
  const { user, isAuthenticated, login, logout, error: authError, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setLocalError('Please enter both email and password.');
      return;
    }
    setLocalError('');
    if (clearError) clearError();
    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setLocalError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSwitchAccount = async () => {
    await logout();
    setEmail('');
    setPassword('');
    setLocalError('');
  };

  const displayError = localError || authError;

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-2xl border border-semantic-error/20 bg-surface-primary p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-semantic-error/10 text-semantic-error border border-semantic-error/20">
          <ShieldAlert className="h-8 w-8" aria-hidden="true" />
        </div>

        <h2 className="mt-5 text-2xl font-bold tracking-tight text-text-primary">
          Access Restricted
        </h2>
        <p className="mt-2 text-sm text-text-secondary leading-relaxed">
          {isAuthenticated
            ? `Signed in as "${user?.email || 'user'}". This account does not possess administrative privileges.`
            : 'You must be signed in with an authorized administrative account to access the Yatrai Admin Console.'}
        </p>

        {/* If Authenticated as a non-admin, provide Switch Account button */}
        {isAuthenticated ? (
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleSwitchAccount}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-hover active:bg-brand-active transition-all cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>Switch to Admin Account</span>
            </button>

            <button
              type="button"
              onClick={onNavigateHome}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface-elevated px-5 py-2.5 text-sm font-semibold text-text-primary border border-border-default hover:bg-surface-secondary transition-all cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Return to Journey Discovery</span>
            </button>
          </div>
        ) : (
          /* If Unauthenticated, provide direct Admin Sign-In form */
          <div className="mt-6 text-left border-t border-white/10 pt-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-tertiary mb-3 text-center">
              Sign In to Admin Console
            </h3>

            {displayError && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-semantic-error/30 bg-semantic-error/10 p-3 text-xs text-semantic-error">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{displayError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Admin Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin.yatrai@example.com"
                    autoComplete="email"
                    className="w-full rounded-xl border border-white/10 bg-surface-secondary pl-10 pr-3.5 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-white/10 bg-surface-secondary pl-10 pr-3.5 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-hover active:bg-brand-active transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    <span>Sign In to Admin</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={onNavigateHome}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Return to Home</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminForbiddenPage;
