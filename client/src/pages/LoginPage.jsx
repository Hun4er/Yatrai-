import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Clock,
  ArrowRight,
  Loader2,
  Compass,
  Train,
  ShieldCheck,
  Bookmark,
  Sparkles,
} from 'lucide-react';

/**
 * LoginPage Component — Yatrai Graphite & Amber Design System
 * Features a split layout with railway-inspired brand showcase on desktop
 * and an accessible, responsive credentials form on mobile and desktop.
 */
export function LoginPage({ onNavigate }) {
  const { login, isAuthenticated, status, error: contextError, clearError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [fieldErrors, setFieldErrors] = useState({});
  const [localError, setLocalError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // If already authenticated, redirect to intended target or profile
  useEffect(() => {
    if (isAuthenticated) {
      const pendingRaw = sessionStorage.getItem('yatrai_pending_booking');
      if (pendingRaw) {
        try {
          const parsed = JSON.parse(pendingRaw);
          const jId = parsed?.journeyId || parsed?.journeySnapshot?.id || parsed?.journeySnapshot?._id;
          if (jId) {
            if (onNavigate) onNavigate(`/booking?journeyId=${jId}`);
            else window.location.href = `/booking?journeyId=${jId}`;
            return;
          }
        } catch {
          // fallback
        }
      }
      if (onNavigate) {
        onNavigate('/profile');
      } else {
        window.history.pushState(null, '', '/profile');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  }, [isAuthenticated, onNavigate]);

  const validate = () => {
    const errors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Please provide a valid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await login(email.trim(), password);
      if (!res.success) {
        setLocalError(res.error || 'Invalid email or password');
      }
    } catch (err) {
      setLocalError(err.message || 'We could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNavToSignup = () => {
    clearError();
    if (onNavigate) onNavigate('/signup');
    else {
      window.history.pushState(null, '', '/signup');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const activeError = localError || contextError;
  const isSessionExpired = activeError && activeError.toLowerCase().includes('session has expired');

  return (
    <div className="min-h-[calc(100vh-140px)] flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-5xl rounded-2xl border border-[#232830] bg-[#12151A] shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left Branding Showcase (Desktop) */}
        <div className="hidden lg:flex lg:col-span-5 flex-col justify-between p-8 sm:p-10 bg-gradient-to-br from-[#181C22] via-[#12151A] to-[#0B0D10] border-r border-[#232830] relative overflow-hidden">
          {/* Subtle Ambient Rail Network Graphic */}
          <div className="absolute inset-0 opacity-10 pointer-events-none" aria-hidden="true">
            <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="rail-grid-login" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E8B04A" strokeWidth="0.75" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#rail-grid-login)" />
              <circle cx="80" cy="120" r="4" fill="#E8B04A" />
              <circle cx="240" cy="220" r="4" fill="#E8B04A" />
              <circle cx="160" cy="340" r="4" fill="#E8B04A" />
              <line x1="80" y1="120" x2="240" y2="220" stroke="#E8B04A" strokeWidth="1.5" strokeDasharray="4 2" />
              <line x1="240" y1="220" x2="160" y2="340" stroke="#E8B04A" strokeWidth="1.5" strokeDasharray="4 2" />
            </svg>
          </div>

          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-3">
              <img
                src="/Yatrai Logo.png"
                alt="Yatrai Logo"
                className="h-10 w-auto object-contain"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8B04A]/10 px-3 py-1 text-[11px] font-semibold text-[#E8B04A] border border-[#E8B04A]/25">
                <Sparkles className="h-3 w-3" />
                <span>Railway Intelligence Platform</span>
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#EDEFF2]">
                One goal.<br />Every route.
              </h2>
              <p className="text-xs sm:text-sm text-[#9AA3AF] leading-relaxed">
                Synchronized train discovery, intelligent seat recovery, and multi-modal journey planning across Indian Railways.
              </p>
            </div>
          </div>

          {/* Value Highlights */}
          <div className="relative z-10 space-y-4 my-8">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#181C22] border border-[#232830] text-[#E8B04A]">
                <Train className="h-4 w-4" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-[#EDEFF2]">Smart Alternate Routes</p>
                <p className="text-[11px] text-[#6B7480]">Bypass waitlists using same-train station extension and hub transfers.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#181C22] border border-[#232830] text-[#E8B04A]">
                <Bookmark className="h-4 w-4" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-[#EDEFF2]">Saved Journeys & Corridors</p>
                <p className="text-[11px] text-[#6B7480]">Access your saved multi-modal itineraries across any device.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#181C22] border border-[#232830] text-[#4CC38A]">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-[#EDEFF2]">Persistent Sessions</p>
                <p className="text-[11px] text-[#6B7480]">Safe, encrypted credential transport with automated single-flight refresh.</p>
              </div>
            </div>
          </div>

          <div className="relative z-10 pt-4 border-t border-[#232830] flex items-center justify-between text-[11px] text-[#6B7480]">
            <span>© {new Date().getFullYear()} Yatrai Platform</span>
            <span>Indian Railways Network</span>
          </div>
        </div>

        {/* Right Form Card */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center bg-[#12151A]">
          <div className="max-w-md w-full mx-auto space-y-6">
            {/* Mobile Header / Brand */}
            <div className="lg:hidden flex items-center justify-between pb-4 border-b border-[#232830]">
              <img
                src="/Yatrai Logo.png"
                alt="Yatrai"
                className="h-8 w-auto object-contain"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
              <span className="text-xs font-medium text-[#9AA3AF]">One goal. Every route.</span>
            </div>

            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold tracking-tight text-[#EDEFF2]">
                Sign In to Yatrai
              </h1>
              <p className="text-xs sm:text-sm text-[#9AA3AF]">
                Enter your credentials to access your journeys and railway preferences.
              </p>
            </div>

            {/* Session Expired Banner */}
            {isSessionExpired && (
              <div
                id="auth-session-expired-banner"
                className="flex items-center gap-2.5 rounded-xl border border-[#E8B04A]/40 bg-[#E8B04A]/10 p-3.5 text-xs text-[#E8B04A]"
              >
                <Clock className="h-4 w-4 shrink-0" />
                <span>Your session has expired. Please sign in again.</span>
              </div>
            )}

            {/* General Error Notification */}
            {activeError && !isSessionExpired && (
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
                  aria-label="Dismiss error"
                >
                  &times;
                </button>
              </div>
            )}

            {/* Sign In Form */}
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {/* Email Address */}
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-medium text-[#9AA3AF] mb-1.5"
                >
                  Email Address
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#6B7480]">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) {
                        setFieldErrors((prev) => ({ ...prev, email: null }));
                      }
                      if (localError) setLocalError(null);
                    }}
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

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-medium text-[#9AA3AF]"
                  >
                    Password
                  </label>
                </div>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#6B7480]">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) {
                        setFieldErrors((prev) => ({ ...prev, password: null }));
                      }
                      if (localError) setLocalError(null);
                    }}
                    placeholder="Enter your password"
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

              {/* Remember session checkbox */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-[#232830] bg-[#181C22] text-[#E8B04A] focus:ring-[#E8B04A] focus:ring-offset-0"
                  />
                  <span className="text-xs text-[#9AA3AF]">Keep me signed in</span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                id="login-submit-btn"
                type="submit"
                disabled={submitting}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#E8B04A] px-4 py-2.5 text-sm font-semibold text-[#0B0D10] hover:bg-[#F0C066] active:bg-[#E8B04A] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E8B04A] focus:ring-offset-2 focus:ring-offset-[#12151A]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            {/* Switch to Signup */}
            <div className="pt-4 border-t border-[#232830] text-center">
              <p className="text-xs text-[#9AA3AF]">
                Don't have an account?{' '}
                <button
                  id="login-to-signup-link"
                  type="button"
                  onClick={handleNavToSignup}
                  className="font-semibold text-[#E8B04A] hover:text-[#F0C066] underline underline-offset-4 cursor-pointer transition-colors"
                >
                  Create an account
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
