import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Train,
  ShieldCheck,
  Bookmark,
  Sparkles,
} from 'lucide-react';

/**
 * SignupPage Component — Yatrai Graphite & Amber Design System
 * Features a split layout matching LoginPage with clear validation,
 * inline requirement guides, duplicate account resolution, and responsive layout.
 */
export function SignupPage({ onNavigate }) {
  const { register, isAuthenticated, error: contextError, clearError } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [localError, setLocalError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [duplicateAccount, setDuplicateAccount] = useState(null);

  // If already authenticated, redirect to booking or profile
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

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: null }));
    }
    if (localError) setLocalError(null);
    if (duplicateAccount) setDuplicateAccount(null);
  };

  const validate = () => {
    const errors = {};
    const trimmedName = formData.name.trim();
    const trimmedEmail = formData.email.trim();

    if (!trimmedName) {
      errors.name = 'Full name is required';
    } else if (trimmedName.length > 100) {
      errors.name = 'Name cannot exceed 100 characters';
    }

    if (!trimmedEmail) {
      errors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Please provide a valid email address';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    } else if (formData.password.length > 128) {
      errors.password = 'Password cannot exceed 128 characters';
    }

    if (!formData.confirmPassword) {
      errors.confirmPassword = 'Confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
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
      const res = await register(
        formData.name.trim(),
        formData.email.trim(),
        formData.password
      );

      if (!res.success) {
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
    } catch (err) {
      setLocalError(err.message || 'We could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNavToLogin = () => {
    clearError();
    if (onNavigate) onNavigate('/login');
    else {
      window.history.pushState(null, '', '/login');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const activeError = localError || contextError;

  return (
    <div className="min-h-[calc(100vh-140px)] flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-5xl rounded-2xl border border-[#232830] bg-[#12151A] shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left Branding Showcase (Desktop) */}
        <div className="hidden lg:flex lg:col-span-5 flex-col justify-between p-8 sm:p-10 bg-gradient-to-br from-[#181C22] via-[#12151A] to-[#0B0D10] border-r border-[#232830] relative overflow-hidden">
          {/* Rail Graphic */}
          <div className="absolute inset-0 opacity-10 pointer-events-none" aria-hidden="true">
            <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="rail-grid-signup" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E8B04A" strokeWidth="0.75" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#rail-grid-signup)" />
              <circle cx="100" cy="100" r="4" fill="#E8B04A" />
              <circle cx="200" cy="200" r="4" fill="#E8B04A" />
              <circle cx="120" cy="320" r="4" fill="#E8B04A" />
              <line x1="100" y1="100" x2="200" y2="200" stroke="#E8B04A" strokeWidth="1.5" strokeDasharray="4 2" />
              <line x1="200" y1="200" x2="120" y2="320" stroke="#E8B04A" strokeWidth="1.5" strokeDasharray="4 2" />
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
                <span>Begin Your Journey</span>
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#EDEFF2]">
                Join Yatrai today.
              </h2>
              <p className="text-xs sm:text-sm text-[#9AA3AF] leading-relaxed">
                Create an account to explore high-probability train routes, save favorite station corridors, and manage multi-modal bookings.
              </p>
            </div>
          </div>

          {/* Feature Highlights */}
          <div className="relative z-10 space-y-4 my-6">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#181C22] border border-[#232830] text-[#E8B04A]">
                <Train className="h-4 w-4" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-[#EDEFF2]">Real-Time Seat Recovery</p>
                <p className="text-[11px] text-[#6B7480]">Automatically explore confirmed alternatives when direct trains are waitlisted.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#181C22] border border-[#232830] text-[#E8B04A]">
                <Bookmark className="h-4 w-4" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-[#EDEFF2]">Personal Travel Hub</p>
                <p className="text-[11px] text-[#6B7480]">Save itineraries, access search history, and store travel preferences.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#181C22] border border-[#232830] text-[#4CC38A]">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-[#EDEFF2]">Secure Architecture</p>
                <p className="text-[11px] text-[#6B7480]">Server-side salt encryption with automated session persistence.</p>
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
              <span className="text-xs font-medium text-[#9AA3AF]">Create Account</span>
            </div>

            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold tracking-tight text-[#EDEFF2]">
                Create Your Yatrai Account
              </h1>
              <p className="text-xs sm:text-sm text-[#9AA3AF]">
                Join thousands of travelers exploring reliable train journeys.
              </p>
            </div>

            {/* Duplicate Account Resolution Banner */}
            {duplicateAccount && (
              <div
                id="auth-duplicate-account-banner"
                className="flex flex-col gap-2 rounded-xl border border-[#E8B04A]/40 bg-[#E8B04A]/10 p-4 text-xs text-[#EDEFF2]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#E8B04A] font-semibold">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>This account already exists</span>
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
                  An account with <strong className="text-[#EDEFF2] font-mono">{duplicateAccount}</strong> is already registered. Sign in to access your profile.
                </p>
                <button
                  id="auth-switch-to-login-btn"
                  type="button"
                  onClick={handleNavToLogin}
                  className="self-start inline-flex items-center gap-1.5 mt-1 rounded-lg bg-[#E8B04A] px-3.5 py-1.5 text-xs font-semibold text-[#0B0D10] hover:bg-[#F0C066] transition-colors cursor-pointer"
                >
                  <span>Sign In to This Account</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* General Error Banner */}
            {activeError && !duplicateAccount && (
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

            {/* Registration Form */}
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {/* Full Name */}
              <div>
                <label
                  htmlFor="signup-name"
                  className="block text-xs font-medium text-[#9AA3AF] mb-1.5"
                >
                  Full Name
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#6B7480]">
                    <User className="h-4 w-4" />
                  </div>
                  <input
                    id="signup-name"
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

              {/* Email Address */}
              <div>
                <label
                  htmlFor="signup-email"
                  className="block text-xs font-medium text-[#9AA3AF] mb-1.5"
                >
                  Email Address
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#6B7480]">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="signup-email"
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

              {/* Password */}
              <div>
                <label
                  htmlFor="signup-password"
                  className="block text-xs font-medium text-[#9AA3AF] mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#6B7480]">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    id="signup-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="Minimum 8 characters"
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
                {fieldErrors.password ? (
                  <p className="mt-1 text-[11px] text-[#E5484D]">{fieldErrors.password}</p>
                ) : (
                  <p className="mt-1 text-[11px] text-[#6B7480]">Must be at least 8 characters long</p>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label
                  htmlFor="signup-confirm-password"
                  className="block text-xs font-medium text-[#9AA3AF] mb-1.5"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#6B7480]">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    id="signup-confirm-password"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    placeholder="Re-enter password"
                    className={`w-full rounded-xl border bg-[#181C22] pl-10 pr-10 py-2.5 text-sm text-[#EDEFF2] placeholder:text-[#6B7480] transition-colors focus:outline-none focus:ring-1 ${
                      fieldErrors.confirmPassword
                        ? 'border-[#E5484D] focus:border-[#E5484D] focus:ring-[#E5484D]'
                        : 'border-[#232830] focus:border-[#E8B04A] focus:ring-[#E8B04A]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#6B7480] hover:text-[#EDEFF2] cursor-pointer"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {fieldErrors.confirmPassword && (
                  <p className="mt-1 text-[11px] text-[#E5484D]">{fieldErrors.confirmPassword}</p>
                )}
              </div>

              {/* Consent Note */}
              <p className="text-[11px] text-[#6B7480] leading-relaxed pt-1">
                By creating an account, you agree to Yatrai's Terms of Service and Privacy Policy.
              </p>

              {/* Submit Button */}
              <button
                id="signup-submit-btn"
                type="submit"
                disabled={submitting}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#E8B04A] px-4 py-2.5 text-sm font-semibold text-[#0B0D10] hover:bg-[#F0C066] active:bg-[#E8B04A] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E8B04A] focus:ring-offset-2 focus:ring-offset-[#12151A]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Creating Account...</span>
                  </>
                ) : (
                  <>
                    <span>Create Account</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            {/* Switch to Login */}
            <div className="pt-4 border-t border-[#232830] text-center">
              <p className="text-xs text-[#9AA3AF]">
                Already have an account?{' '}
                <button
                  id="signup-to-login-link"
                  type="button"
                  onClick={handleNavToLogin}
                  className="font-semibold text-[#E8B04A] hover:text-[#F0C066] underline underline-offset-4 cursor-pointer transition-colors"
                >
                  Sign in
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SignupPage;
