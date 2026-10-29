import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Clock,
  ArrowRight,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

/**
 * AuthCard Component — Embedded Authentication Card
 * Supports seamless switching between 'login' and 'register' modes,
 * inline validation, show/hide password, and Graphite & Amber design system styling.
 */
export function AuthCard({ initialMode = 'login', onAuthSuccess, onNavigate }) {
  const { user, status, error: contextError, login, register, logout, clearError } = useAuth();

  const [mode, setMode] = useState(initialMode); // 'login' | 'register'
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [localError, setLocalError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [duplicateAccount, setDuplicateAccount] = useState(null);

  useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
    }
  }, [initialMode]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: null }));
    }
    if (localError) setLocalError(null);
    if (duplicateAccount) setDuplicateAccount(null);
    if (contextError) clearError();
  };

  const validate = () => {
    const errors = {};
    const trimmedEmail = formData.email.trim();

    if (mode === 'register') {
      const trimmedName = formData.name.trim();
      if (!trimmedName) {
        errors.name = 'Full name is required';
      } else if (trimmedName.length > 100) {
        errors.name = 'Name cannot exceed 100 characters';
      }
    }

    if (!trimmedEmail) {
      errors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Please provide a valid email address';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (mode === 'register' && formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    setDuplicateAccount(null);
    clearError();

    if (!validate()) return;

    setSubmitting(true);
    try {
      if (mode === 'login') {
        const res = await login(formData.email.trim(), formData.password);
        if (res?.success) {
          if (onAuthSuccess) onAuthSuccess(res.user);
        } else {
          setLocalError(res.error || 'Invalid email or password');
        }
      } else {
        const res = await register(
          formData.name.trim(),
          formData.email.trim(),
          formData.password
        );
        if (res?.success) {
          if (onAuthSuccess) onAuthSuccess(res.user);
        } else {
          const errorMsg = res.error || 'Registration failed';
          if (
            res.code === 'DUPLICATE_EMAIL' ||
            errorMsg.toLowerCase().includes('already exists') ||
            errorMsg.toLowerCase().includes('duplicate_email')
          ) {
            setDuplicateAccount(formData.email.trim());
          } else {
            setLocalError(errorMsg);
          }
        }
      }
    } catch (err) {
      setLocalError(err.message || 'We could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // 1. Loading / Session Verification State
  if (status === 'loading') {
    return (
      <div className="rounded-2xl border border-[#232830] bg-[#12151A] p-6 sm:p-8 text-center space-y-3 shadow-xl">
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-[#E8B04A]" />
          <span className="text-sm font-medium text-[#9AA3AF]">
            Verifying your authentication session...
          </span>
        </div>
      </div>
    );
  }

  // 2. Authenticated State View
  if (status === 'authenticated' && user) {
    return (
      <div className="rounded-2xl border border-[#232830] bg-[#12151A] p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#232830] pb-5">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#181C22] text-[#E8B04A] font-bold text-xl border border-[#232830]">
              {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-[#EDEFF2]">{user.name}</span>
                <span className="inline-flex items-center rounded-full bg-[#4CC38A]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#4CC38A] border border-[#4CC38A]/30">
                  {user.status || 'active'}
                </span>
              </div>
              <p className="text-xs text-[#9AA3AF] mt-0.5">{user.email}</p>
            </div>
          </div>

          <button
            id="auth-logout-btn"
            type="button"
            onClick={logout}
            className="inline-flex items-center justify-center rounded-xl border border-[#232830] bg-[#181C22] px-4 py-2 text-xs font-semibold text-[#EDEFF2] hover:bg-[#232830] hover:text-[#E5484D] transition-colors cursor-pointer"
          >
            Sign Out
          </button>
        </div>

        <div className="rounded-xl border border-[#232830] bg-[#181C22] p-4 text-xs text-[#9AA3AF] space-y-1">
          <p className="font-semibold text-[#EDEFF2]">Authenticated with Indian Railways Engine</p>
          <p className="text-[11px] text-[#6B7480]">Your session is safely encrypted with automatic token refresh.</p>
        </div>
      </div>
    );
  }

  const activeError = localError || contextError;
  const isSessionExpiredNotice = activeError && activeError.toLowerCase().includes('session has expired');

  // 3. Unauthenticated State (Form)
  return (
    <div className="rounded-2xl border border-[#232830] bg-[#12151A] p-6 sm:p-8 space-y-6 shadow-xl">
      {/* Tab Switcher Header */}
      <div className="flex items-center justify-between border-b border-[#232830] pb-4">
        <div>
          <h2 className="text-base font-bold text-[#EDEFF2]">
            {mode === 'login' ? 'Sign In to Yatrai' : 'Create an Account'}
          </h2>
          <p className="text-xs text-[#6B7480] mt-0.5">
            {mode === 'login'
              ? 'Access saved journeys, corridors & bookings'
              : 'Join Yatrai for intelligent railway discovery'}
          </p>
        </div>

        <div className="flex rounded-xl bg-[#181C22] p-1 border border-[#232830]">
          <button
            id="auth-tab-login"
            type="button"
            onClick={() => {
              setMode('login');
              setLocalError(null);
              setDuplicateAccount(null);
              clearError();
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              mode === 'login'
                ? 'bg-[#E8B04A] text-[#0B0D10] font-semibold shadow-sm'
                : 'text-[#9AA3AF] hover:text-[#EDEFF2]'
            }`}
          >
            Sign In
          </button>
          <button
            id="auth-tab-register"
            type="button"
            onClick={() => {
              setMode('register');
              setLocalError(null);
              setDuplicateAccount(null);
              clearError();
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              mode === 'register'
                ? 'bg-[#E8B04A] text-[#0B0D10] font-semibold shadow-sm'
                : 'text-[#9AA3AF] hover:text-[#EDEFF2]'
            }`}
          >
            Register
          </button>
        </div>
      </div>

      {/* Session Expired Banner */}
      {isSessionExpiredNotice && (
        <div
          id="auth-session-expired-banner"
          className="flex items-center gap-2.5 rounded-xl border border-[#E8B04A]/40 bg-[#E8B04A]/10 p-3.5 text-xs text-[#E8B04A]"
        >
          <Clock className="h-4 w-4 shrink-0" />
          <span>Your session has expired. Please sign in again.</span>
        </div>
      )}

      {/* Duplicate Account Resolution Banner */}
      {duplicateAccount && (
        <div
          id="auth-duplicate-account-banner"
          className="flex flex-col gap-2 rounded-xl border border-[#E8B04A]/40 bg-[#E8B04A]/10 p-3.5 text-xs text-[#EDEFF2]"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#E8B04A] font-semibold">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>This account already exists. Sign in instead.</span>
            </div>
            <button
              type="button"
              onClick={() => setDuplicateAccount(null)}
              className="text-[#9AA3AF] hover:text-[#EDEFF2] font-bold cursor-pointer"
            >
              &times;
            </button>
          </div>
          <p className="text-[#9AA3AF] text-[11px]">
            An account with <strong className="text-[#EDEFF2] font-mono">{duplicateAccount}</strong> is already registered.
          </p>
          <button
            id="auth-switch-to-login-btn"
            type="button"
            onClick={() => {
              setMode('login');
              setDuplicateAccount(null);
              setLocalError(null);
              clearError();
            }}
            className="self-start inline-flex items-center gap-1.5 mt-1 rounded-lg bg-[#E8B04A] px-3.5 py-1.5 text-xs font-semibold text-[#0B0D10] hover:bg-[#F0C066] transition-colors cursor-pointer"
          >
            <span>Sign In to This Account</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* General Error banner */}
      {activeError && !duplicateAccount && !isSessionExpiredNotice && (
        <div
          id="auth-error-banner"
          className="flex items-start justify-between rounded-xl border border-[#E5484D]/30 bg-[#E5484D]/10 p-3.5 text-xs text-[#E5484D]"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{activeError}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setLocalError(null);
              clearError();
            }}
            className="font-bold text-[#E5484D] hover:opacity-75 cursor-pointer ml-2"
          >
            &times;
          </button>
        </div>
      )}

      {/* Auth Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {mode === 'register' && (
          <div>
            <label
              htmlFor="auth-name"
              className="block text-xs font-medium text-[#9AA3AF] mb-1.5"
            >
              Full Name
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#6B7480]">
                <User className="h-4 w-4" />
              </div>
              <input
                id="auth-name"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g. Aarav Sharma"
                className={`w-full rounded-xl border bg-[#181C22] pl-10 pr-3.5 py-2.5 text-sm text-[#EDEFF2] placeholder:text-[#6B7480] transition-colors focus:outline-none focus:ring-1 ${
                  fieldErrors.name
                    ? 'border-[#E5484D] focus:border-[#E5484D] focus:ring-[#E5484D]'
                    : 'border-[#232830] focus:border-[#E8B04A] focus:ring-[#E8B04A]'
                }`}
              />
            </div>
            {fieldErrors.name && (
              <p className="mt-1 text-[11px] text-[#E5484D]">{fieldErrors.name}</p>
            )}
          </div>
        )}

        <div>
          <label
            htmlFor="auth-email"
            className="block text-xs font-medium text-[#9AA3AF] mb-1.5"
          >
            Email Address
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#6B7480]">
              <Mail className="h-4 w-4" />
            </div>
            <input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={formData.email}
              onChange={handleInputChange}
              placeholder="traveler@example.com"
              className={`w-full rounded-xl border bg-[#181C22] pl-10 pr-3.5 py-2.5 text-sm text-[#EDEFF2] placeholder:text-[#6B7480] transition-colors focus:outline-none focus:ring-1 ${
                fieldErrors.email
                  ? 'border-[#E5484D] focus:border-[#E5484D] focus:ring-[#E5484D]'
                  : 'border-[#232830] focus:border-[#E8B04A] focus:ring-[#E8B04A]'
              }`}
            />
          </div>
          {fieldErrors.email && (
            <p className="mt-1 text-[11px] text-[#E5484D]">{fieldErrors.email}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="auth-password"
            className="block text-xs font-medium text-[#9AA3AF] mb-1.5"
          >
            Password
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#6B7480]">
              <Lock className="h-4 w-4" />
            </div>
            <input
              id="auth-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              value={formData.password}
              onChange={handleInputChange}
              placeholder={mode === 'register' ? 'Minimum 8 characters' : 'Enter your password'}
              className={`w-full rounded-xl border bg-[#181C22] pl-10 pr-10 py-2.5 text-sm text-[#EDEFF2] placeholder:text-[#6B7480] transition-colors focus:outline-none focus:ring-1 ${
                fieldErrors.password
                  ? 'border-[#E5484D] focus:border-[#E5484D] focus:ring-[#E5484D]'
                  : 'border-[#232830] focus:border-[#E8B04A] focus:ring-[#E8B04A]'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#6B7480] hover:text-[#EDEFF2] cursor-pointer"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {fieldErrors.password && (
            <p className="mt-1 text-[11px] text-[#E5484D]">{fieldErrors.password}</p>
          )}
        </div>

        <button
          id="auth-submit-btn"
          type="submit"
          disabled={submitting}
          className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#E8B04A] px-4 py-2.5 text-sm font-semibold text-[#0B0D10] hover:bg-[#F0C066] active:bg-[#E8B04A] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E8B04A] focus:ring-offset-2 focus:ring-offset-[#12151A]"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{mode === 'login' ? 'Signing in...' : 'Creating Account...'}</span>
            </>
          ) : (
            <>
              <span>{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}

export default AuthCard;
