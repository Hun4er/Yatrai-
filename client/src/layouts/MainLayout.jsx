import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import api from '../services/api.js';
import { APP_NAME, APP_TAGLINE, APP_VERSION } from '../constants/index.js';
import { PnrStatusModal } from '../components/pnr/PnrStatusModal.jsx';
import {
  Moon,
  Sun,
  Menu,
  X,
  Shield,
  LogOut,
  ChevronDown,
  Bookmark,
  History,
  Heart,
  Clock,
  Bell,
  Ticket,
  HelpCircle,
  Search,
} from 'lucide-react';

export function MainLayout({ children, currentPath = '/', onNavigate, onNavigateHome }) {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [pnrModalOpen, setPnrModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }
    api.notifications
      .unreadCount()
      .then((res) => {
        setUnreadCount(res?.data?.count || 0);
      })
      .catch(() => { });
  }, [isAuthenticated]);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount, currentPath]);

  const handleNav = (path) => {
    setMobileMenuOpen(false);
    setMoreMenuOpen(false);
    if (path === '/' && onNavigateHome) {
      onNavigateHome();
    } else if (onNavigate) {
      onNavigate(path);
    }
  };

  const secondaryLinks = [
    { label: 'Saved Journeys', path: '/saved', icon: Bookmark },
    { label: 'Recent Searches', path: '/recent', icon: History },
    { label: 'Favorite Routes', path: '/favorites', icon: Heart },
    { label: 'Travel History', path: '/history', icon: Clock },
    { label: 'Alerts', path: '/notifications', icon: Bell, badge: unreadCount },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#0B0D10] text-[#F0F1F3] selection:bg-[#E8B04A] selection:text-[#0B0D10] font-sans">
      {/* ===================== COMPACT SLIM NAVBAR ===================== */}
      <header className="border-b border-[#303640]/50 bg-[#0B0D10]/95 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 py-3">
          {/* Left: Brand Logo / Wordmark matching reference */}
          <button
            type="button"
            onClick={() => handleNav('/')}
            className="flex items-center gap-2 text-left focus:outline-none cursor-pointer group"
            aria-label={`${APP_NAME} Home`}
          >
            <img
              src={isDark ? '/Yatrai Logo.png' : '/Yatrai Logo Light.png'}
              alt="Yatrai"
              className="h-12 w-auto max-w-[180px] object-contain shrink-0"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </button>

          {/* Center: Desktop Navigation Links matching reference */}
          <nav className="hidden md:flex items-center gap-7">
            <button
              type="button"
              onClick={() => handleNav('/')}
              className={`text-xs sm:text-[13px] font-medium transition-colors cursor-pointer ${currentPath === '/' || currentPath === '/results'
                ? 'text-[#F0F1F3] font-semibold'
                : 'text-[#A7AFBA] hover:text-[#F0F1F3]'
                }`}
            >
              Trains
            </button>

            <button
              type="button"
              onClick={() => handleNav('/my-bookings')}
              className={`text-xs sm:text-[13px] font-medium transition-colors cursor-pointer ${currentPath === '/my-bookings' || currentPath === '/bookings'
                ? 'text-[#F0F1F3] font-semibold'
                : 'text-[#A7AFBA] hover:text-[#F0F1F3]'
                }`}
            >
              My Bookings
            </button>

            <button
              type="button"
              onClick={() => setPnrModalOpen(true)}
              className="text-xs sm:text-[13px] font-medium text-[#A7AFBA] hover:text-[#F0F1F3] transition-colors cursor-pointer"
            >
              PNR Status
            </button>

            <button
              type="button"
              onClick={() => setHelpModalOpen(true)}
              className="text-xs sm:text-[13px] font-medium text-[#A7AFBA] hover:text-[#F0F1F3] transition-colors cursor-pointer"
            >
              Help
            </button>

            {/* Discreet "More" dropdown for saved journeys, history & alerts */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                className="flex items-center gap-1 text-xs sm:text-[13px] font-medium text-[#A7AFBA] hover:text-[#F0F1F3] transition-colors cursor-pointer"
              >
                <span>More</span>
                {unreadCount > 0 && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#E8B04A]" />
                )}
                <ChevronDown className="h-3 w-3" />
              </button>

              {moreMenuOpen && (
                <div className="absolute left-0 mt-2 w-48 rounded-xl border border-[#303640] bg-[#181C22] p-1.5 shadow-2xl z-50">
                  {secondaryLinks.map((link) => {
                    const Icon = link.icon;
                    const isActive = currentPath === link.path;
                    return (
                      <button
                        key={link.path}
                        type="button"
                        onClick={() => handleNav(link.path)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${isActive
                          ? 'bg-[#15191F] text-[#F0F1F3] font-semibold'
                          : 'text-[#A7AFBA] hover:text-[#F0F1F3] hover:bg-[#15191F]/70'
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-[#7E8794]" />
                          <span>{link.label}</span>
                        </div>
                        {Boolean(link.badge) && link.badge > 0 && (
                          <span className="h-4 min-w-[16px] px-1 rounded-full bg-[#E8B04A] text-[#0B0D10] text-[9px] font-bold flex items-center justify-center font-mono">
                            {link.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>

          {/* Right: Theme Toggle & Sign in Actions matching reference */}
          <div className="flex items-center gap-3">
            {/* Dark / Light Mode Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="p-1.5 rounded-lg text-[#A7AFBA] hover:text-[#F0F1F3] hover:bg-[#181C22] transition-colors cursor-pointer border border-transparent hover:border-[#303640] flex items-center justify-center group"
            >
              {isDark ? (
                <Moon className="h-4 w-4 text-[#A7AFBA] group-hover:text-[#E8B04A] transition-colors" />
              ) : (
                <Sun className="h-4 w-4 text-[#E8B04A] group-hover:text-[#D97706] transition-colors" />
              )}
            </button>

            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                {user?.role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => handleNav('/admin')}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#303640] bg-[#12151A] text-[#F0F1F3] text-xs font-medium hover:border-[#3A414C] transition-all cursor-pointer"
                    title="Access Admin Console"
                  >
                    <Shield className="h-3.5 w-3.5 text-[#E8B04A]" />
                    <span className="hidden sm:inline">Admin</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleNav('/profile')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${currentPath === '/profile'
                    ? 'border-[#E8B04A]/60 bg-[#E8B04A]/10 text-[#F0F1F3]'
                    : 'border-[#303640] bg-[#12151A] text-[#F0F1F3] hover:bg-[#181C22]'
                    }`}
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#181C22] text-[#F0F1F3] border border-[#303640] font-bold text-[10px]">
                    {user?.name ? user.name[0].toUpperCase() : 'U'}
                  </div>
                  <span className="max-w-[100px] truncate hidden sm:inline">{user?.name || 'Profile'}</span>
                </button>
                <button
                  type="button"
                  onClick={logout}
                  title="Sign out"
                  className="rounded-lg p-1.5 text-[#7E8794] hover:text-red-400 hover:bg-[#15191F] transition-colors cursor-pointer"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleNav('/login')}
                className="px-3.5 py-1.5 rounded-lg border border-[#303640] bg-[#12151A] hover:bg-[#181C22] hover:border-[#3A414C] text-xs font-medium text-[#F0F1F3] transition-all cursor-pointer shadow-sm"
              >
                Sign in
              </button>
            )}

            {/* Mobile Menu Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden rounded-lg p-1.5 text-[#A7AFBA] hover:text-[#F0F1F3] hover:bg-[#181C22] cursor-pointer"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#303640] bg-[#12151A] px-4 py-3 space-y-1">
            <button
              type="button"
              onClick={() => handleNav('/')}
              className={`flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${currentPath === '/' ? 'bg-[#181C22] text-[#F0F1F3] font-semibold' : 'text-[#A7AFBA]'
                }`}
            >
              <Search className="h-4 w-4 text-[#7E8794]" />
              <span>Trains</span>
            </button>

            <button
              type="button"
              onClick={() => handleNav('/my-bookings')}
              className={`flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${currentPath === '/my-bookings' ? 'bg-[#181C22] text-[#F0F1F3] font-semibold' : 'text-[#A7AFBA]'
                }`}
            >
              <Ticket className="h-4 w-4 text-[#7E8794]" />
              <span>My Bookings</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setPnrModalOpen(true);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[#A7AFBA] hover:text-[#F0F1F3] transition-colors cursor-pointer"
            >
              <Ticket className="h-4 w-4 text-[#7E8794]" />
              <span>PNR Status</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setHelpModalOpen(true);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[#A7AFBA] hover:text-[#F0F1F3] transition-colors cursor-pointer"
            >
              <HelpCircle className="h-4 w-4 text-[#7E8794]" />
              <span>Help</span>
            </button>

            <div className="pt-2 border-t border-[#303640]/50 space-y-1">
              {secondaryLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <button
                    key={link.path}
                    type="button"
                    onClick={() => handleNav(link.path)}
                    className="flex w-full items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-[#A7AFBA] hover:text-[#F0F1F3] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4 text-[#7E8794]" />
                      <span>{link.label}</span>
                    </div>
                    {Boolean(link.badge) && link.badge > 0 && (
                      <span className="h-4 min-w-[16px] px-1.5 rounded-full bg-[#E8B04A] text-[#0B0D10] text-[9px] font-extrabold flex items-center justify-center font-mono">
                        {link.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Mobile Dark/Light Theme Toggle */}
            <div className="pt-2 border-t border-[#303640]/50">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex w-full items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-[#A7AFBA] hover:text-[#F0F1F3] hover:bg-[#181C22] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  {isDark ? (
                    <Moon className="h-4 w-4 text-[#A7AFBA]" />
                  ) : (
                    <Sun className="h-4 w-4 text-[#E8B04A]" />
                  )}
                  <span>{isDark ? 'Dark Mode' : 'Light Mode'}</span>
                </div>
                <span className="text-[10px] font-semibold text-[#E8B04A] border border-[#303640] px-2 py-0.5 rounded">
                  Toggle
                </span>
              </button>
            </div>

            {user?.role === 'admin' && (
              <button
                type="button"
                onClick={() => handleNav('/admin')}
                className="flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[#F0F1F3] bg-[#181C22] border border-[#303640] transition-colors cursor-pointer"
              >
                <Shield className="h-4 w-4 text-[#E8B04A]" />
                <span>Admin Console</span>
              </button>
            )}
          </div>
        )}
      </header>

      {/* ===================== MAIN CONTENT ===================== */}
      <main
        className={
          currentPath === '/'
            ? 'flex-1 w-full'
            : 'flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-8'
        }
      >
        {children}
      </main>

      {/* ===================== EDITORIAL GRAPHITE & AMBER FOOTER ===================== */}
      <footer className="border-t border-[#303640]/60 bg-[#0B0D10] text-[#A7AFBA] font-sans">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-12 pb-8">
          {/* Main Footer Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-10 pb-10 border-b border-[#303640]/40">
            {/* Column 1: Brand & Mission (spans 2 cols on lg) */}
            <div className="lg:col-span-2 space-y-4">
              <button
                type="button"
                onClick={() => handleNav('/')}
                className="text-left group cursor-pointer"
                aria-label="Yatrai Home"
              >
                <span className="font-serif text-2xl font-semibold tracking-tight text-[#F0F1F3] group-hover:text-[#E8B04A] transition-colors">
                  {APP_NAME}
                </span>
              </button>

              <p className="text-xs sm:text-[13px] text-[#7E8794] leading-relaxed max-w-sm">
                Next-generation railway journey discovery across Indian Railways. Search direct trains, intelligent connecting transfers, and verified schedules with complete confidence.
              </p>

              <div className="inline-flex items-center gap-2 rounded-full border border-[#303640] bg-[#12151A] px-3 py-1 text-[11px] text-[#A7AFBA]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#E8B04A] animate-pulse" />
                <span className="font-mono">IRCTC Verified Engine</span>
                <span className="text-[#303640]">·</span>
                <span className="font-mono text-[10px] text-[#7E8794]">v{APP_VERSION}</span>
              </div>
            </div>

            {/* Column 2: Navigation */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#F0F1F3]">
                Discovery
              </h3>
              <ul className="space-y-2 text-xs">
                <li>
                  <button
                    type="button"
                    onClick={() => handleNav('/')}
                    className="hover:text-[#F0F1F3] transition-colors cursor-pointer"
                  >
                    Station Search
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleNav('/')}
                    className="hover:text-[#F0F1F3] transition-colors cursor-pointer"
                  >
                    Natural Language Discovery
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleNav('/my-bookings')}
                    className="hover:text-[#F0F1F3] transition-colors cursor-pointer"
                  >
                    My Bookings
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleNav('/saved')}
                    className="hover:text-[#F0F1F3] transition-colors cursor-pointer"
                  >
                    Saved Journeys
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleNav('/favorites')}
                    className="hover:text-[#F0F1F3] transition-colors cursor-pointer"
                  >
                    Favorite Routes
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 3: Tools & Services */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#F0F1F3]">
                Tools & Services
              </h3>
              <ul className="space-y-2 text-xs">
                <li>
                  <button
                    type="button"
                    onClick={() => setPnrModalOpen(true)}
                    className="hover:text-[#E8B04A] transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <span>PNR Status Lookup</span>
                    <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[#181C22] border border-[#303640] text-[#E8B04A]">
                      FAST
                    </span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleNav('/recent')}
                    className="hover:text-[#F0F1F3] transition-colors cursor-pointer"
                  >
                    Recent Searches
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleNav('/history')}
                    className="hover:text-[#F0F1F3] transition-colors cursor-pointer"
                  >
                    Travel History
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleNav('/notifications')}
                    className="hover:text-[#F0F1F3] transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <span>Alerts & Updates</span>
                    {unreadCount > 0 && (
                      <span className="h-4 min-w-[16px] px-1 rounded-full bg-[#E8B04A] text-[#0B0D10] text-[9px] font-bold font-mono flex items-center justify-center">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                </li>
                {user?.role === 'admin' && (
                  <li>
                    <button
                      type="button"
                      onClick={() => handleNav('/admin')}
                      className="text-[#E8B04A] hover:underline transition-colors cursor-pointer font-medium"
                    >
                      Admin Console
                    </button>
                  </li>
                )}
              </ul>
            </div>

            {/* Column 4: Help & Standards */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#F0F1F3]">
                Help & Guidelines
              </h3>
              <ul className="space-y-2 text-xs">
                <li>
                  <button
                    type="button"
                    onClick={() => setHelpModalOpen(true)}
                    className="hover:text-[#F0F1F3] transition-colors cursor-pointer"
                  >
                    Help & FAQs
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setHelpModalOpen(true)}
                    className="hover:text-[#F0F1F3] transition-colors cursor-pointer"
                  >
                    Booking Guidelines
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setHelpModalOpen(true)}
                    className="hover:text-[#F0F1F3] transition-colors cursor-pointer"
                  >
                    Canonical Station Codes
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleNav('/profile')}
                    className="hover:text-[#F0F1F3] transition-colors cursor-pointer"
                  >
                    Account & Preferences
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Copyright & Railway Disclaimer Bar */}
          <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#7E8794]">
            <div className="space-y-1 text-center md:text-left">
              <div>&copy; {new Date().getFullYear()} {APP_NAME} Platform. All rights reserved.</div>
              <div className="text-[11px] text-[#7E8794]/80 max-w-2xl">
                Yatrai is an independent railway route discovery and planning engine. Direct reservations and confirmed PNR tickets are issued via authorized Indian Railways/IRCTC channels.
              </div>
            </div>

            <div className="flex items-center gap-4 text-[11px] font-mono text-[#A7AFBA] shrink-0">
              <span className="hover:text-[#F0F1F3] transition-colors">Privacy</span>
              <span>·</span>
              <span className="hover:text-[#F0F1F3] transition-colors">Terms</span>
              <span>·</span>
              <span className="text-[#E8B04A]">Graphite & Amber</span>
            </div>
          </div>
        </div>
      </footer>

      {/* ===================== PNR STATUS MODAL ===================== */}
      <PnrStatusModal
        isOpen={pnrModalOpen}
        onClose={() => setPnrModalOpen(false)}
        onNavigate={handleNav}
      />

      {/* ===================== HELP & GUIDE MODAL ===================== */}
      {helpModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[#303640] bg-[#181C22] p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#F0F1F3] flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-[#E8B04A]" />
                <span>Yatrai Help & Information</span>
              </h2>
              <button
                type="button"
                onClick={() => setHelpModalOpen(false)}
                className="text-[#7E8794] hover:text-[#F0F1F3] p-1 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-[#A7AFBA] leading-relaxed">
              <div className="p-3 rounded-xl border border-[#303640] bg-[#15191F]">
                <div className="font-semibold text-[#F0F1F3] mb-1">
                  1. How does Train Discovery work?
                </div>
                <div>
                  Yatrai searches direct and intelligent connecting railway routes across all Indian Railways zones, evaluating schedule times, layover durations, and class availability.
                </div>
              </div>

              <div className="p-3 rounded-xl border border-[#303640] bg-[#15191F]">
                <div className="font-semibold text-[#F0F1F3] mb-1">
                  2. Natural Language vs. Station Search
                </div>
                <div>
                  Use Station Search to query canonical IRCTC stations directly (e.g., NDLS, MMCT), or switch to Natural Language to describe trips conversationally (e.g., &ldquo;Sonepat to Patna next Monday&rdquo;).
                </div>
              </div>

              <div className="p-3 rounded-xl border border-[#303640] bg-[#15191F]">
                <div className="font-semibold text-[#F0F1F3] mb-1">
                  3. Booking & Official Reservation
                </div>
                <div>
                  Yatrai discovers optimal routes and generates confirmed itinerary summaries. Final reservation and ticket issuance occur via authorized railway reservation channels.
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setHelpModalOpen(false)}
              className="w-full py-2.5 rounded-xl bg-[#15191F] border border-[#303640] text-xs font-semibold text-[#E8B04A] hover:bg-[#303640]/40 transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MainLayout;
