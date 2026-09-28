import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';
import { APP_NAME, APP_VERSION } from '../constants/index.js';
import {
  Search,
  Bookmark,
  History,
  Heart,
  Clock,
  Bell,
  LogIn,
  LogOut,
  Menu,
  X,
  Shield,
} from 'lucide-react';

export function MainLayout({ children, currentPath = '/', onNavigate, onNavigateHome }) {
  const { user, isAuthenticated, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
      .catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount, currentPath]);

  const handleNav = (path) => {
    setMobileMenuOpen(false);
    if (path === '/' && onNavigateHome) {
      onNavigateHome();
    } else if (onNavigate) {
      onNavigate(path);
    }
  };

  const navLinks = [
    { label: 'Search', path: '/', icon: Search },
    { label: 'Saved', path: '/saved', icon: Bookmark },
    { label: 'Recent', path: '/recent', icon: History },
    { label: 'Favorites', path: '/favorites', icon: Heart },
    { label: 'History', path: '/history', icon: Clock },
    { label: 'Alerts', path: '/notifications', icon: Bell, badge: unreadCount },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background-primary text-text-primary selection:bg-brand-primary selection:text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-background-secondary/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-3.5">
          {/* Logo */}
          <button
            type="button"
            onClick={() => handleNav('/')}
            className="flex items-center gap-2.5 text-left focus:outline-none cursor-pointer group"
            aria-label={`${APP_NAME} Home`}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary font-bold text-white shadow-md shadow-brand-primary/20 group-hover:bg-brand-hover transition-colors">
              Y
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold tracking-tight text-text-primary group-hover:text-brand-primary transition-colors">
                  {APP_NAME}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-brand-primary">v{APP_VERSION}</span>
              </div>
            </div>
          </button>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = currentPath === link.path || (link.path === '/' && currentPath === '/results');
              return (
                <button
                  key={link.path}
                  type="button"
                  onClick={() => handleNav(link.path)}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-brand-primary/10 text-brand-primary font-semibold'
                      : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{link.label}</span>
                  {Boolean(link.badge) && link.badge > 0 && (
                    <span className="ml-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-primary px-1 text-[9px] font-extrabold text-white">
                      {link.badge > 99 ? '99+' : link.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Auth & Profile Actions */}
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                {user?.role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => handleNav('/admin')}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-brand-primary/30 bg-brand-soft text-brand-primary text-xs font-semibold hover:bg-brand-primary hover:text-white transition-all cursor-pointer"
                    title="Access Admin Console"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Admin</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleNav('/profile')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-colors cursor-pointer ${
                    currentPath === '/profile'
                      ? 'border-brand-primary/40 bg-brand-primary/10 text-brand-primary'
                      : 'border-white/10 bg-white/5 text-text-primary hover:bg-white/10'
                  }`}
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-primary/20 text-brand-primary font-bold text-[10px]">
                    {user?.name ? user.name[0].toUpperCase() : 'U'}
                  </div>
                  <span className="max-w-[100px] truncate hidden sm:inline">{user?.name || 'Profile'}</span>
                </button>
                <button
                  type="button"
                  onClick={logout}
                  title="Sign out"
                  className="rounded-lg p-1.5 text-text-muted hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleNav('/profile')}
                className="flex items-center gap-1.5 rounded-xl bg-brand-primary/10 border border-brand-primary/30 px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary hover:text-white transition-all cursor-pointer"
              >
                <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sign In</span>
              </button>
            )}

            {/* Mobile Menu Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden rounded-lg p-1.5 text-text-secondary hover:text-text-primary hover:bg-white/5 cursor-pointer relative"
              aria-label="Toggle navigation menu"
            >
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-brand-primary" />
              )}
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/5 bg-background-secondary px-4 py-3 space-y-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = currentPath === link.path || (link.path === '/' && currentPath === '/results');
              return (
                <button
                  key={link.path}
                  type="button"
                  onClick={() => handleNav(link.path)}
                  className={`flex w-full items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-brand-primary/10 text-brand-primary font-semibold'
                      : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{link.label}</span>
                  </div>
                  {Boolean(link.badge) && link.badge > 0 && (
                    <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-primary px-1.5 text-[9px] font-extrabold text-white">
                      {link.badge > 99 ? '99+' : link.badge}
                    </span>
                  )}
                </button>
              );
            })}

            {user?.role === 'admin' && (
              <button
                type="button"
                onClick={() => handleNav('/admin')}
                className="flex w-full items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-brand-primary bg-brand-soft border border-brand-primary/20 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Shield className="h-4 w-4" aria-hidden="true" />
                  <span>Admin Console</span>
                </div>
              </button>
            )}
          </div>
        )}
      </header>

      {/* Main Content Shell */}
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-8">{children}</main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-background-secondary py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 text-xs text-text-tertiary sm:flex-row">
          <span>&copy; {new Date().getFullYear()} {APP_NAME} Platform. All rights reserved.</span>
          <span>Phase 14: Notifications</span>
        </div>
      </footer>
    </div>
  );
}

export default MainLayout;
