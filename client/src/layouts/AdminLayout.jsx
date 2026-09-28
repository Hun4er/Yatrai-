import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Search,
  Navigation,
  Server,
  AlertTriangle,
  BarChart3,
  Activity,
  ArrowLeft,
  LogOut,
  Menu,
  X,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import AdminForbiddenPage from '../pages/admin/AdminForbiddenPage.jsx';

const NAV_ITEMS = [
  { path: '/admin', label: 'Overview', icon: LayoutDashboard },
  { path: '/admin/users', label: 'Users', icon: Users },
  { path: '/admin/searches', label: 'Searches', icon: Search },
  { path: '/admin/journeys', label: 'Journeys', icon: Navigation },
  { path: '/admin/providers', label: 'Providers', icon: Server },
  { path: '/admin/errors', label: 'Errors', icon: AlertTriangle },
  { path: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/admin/system-health', label: 'System Health', icon: Activity },
];

export function AdminLayout({ currentPath, onNavigate, onNavigateHome, children }) {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // If loading auth state, show a clean loading spinner
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background-primary flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
          <p className="text-xs text-text-tertiary">Verifying admin credentials...</p>
        </div>
      </div>
    );
  }

  // Security guard: Backend enforces security; frontend provides immediate feedback
  const isAdmin = isAuthenticated && user?.role === 'admin';
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background-primary text-text-primary">
        <AdminForbiddenPage onNavigateHome={onNavigateHome} />
      </div>
    );
  }

  const handleNavClick = (path) => {
    onNavigate(path);
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    onNavigateHome();
  };

  // Find active nav item label for header
  const activeNavItem = NAV_ITEMS.find(
    (item) => item.path === currentPath || (item.path === '/admin' && currentPath === '/admin/overview')
  ) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-background-primary text-text-primary flex flex-col md:flex-row">
      {/* Mobile Header Bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-surface-primary border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg tracking-tight text-white">Yatrai</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-soft text-brand-primary border border-brand-primary/20">
            Admin
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg bg-surface-elevated text-text-secondary hover:text-white"
          aria-label="Toggle admin menu"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } md:flex flex-col w-full md:w-64 bg-surface-primary border-r border-border-subtle shrink-0 min-h-screen z-20`}
      >
        {/* Brand header */}
        <div className="p-5 border-b border-border-subtle hidden md:block">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center text-brand-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <span className="font-bold text-base tracking-tight text-white block">Yatrai</span>
                <span className="text-[10px] text-text-tertiary uppercase tracking-wider block">
                  Admin Console
                </span>
              </div>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-semantic-success/10 text-semantic-success border border-semantic-success/20">
              Live
            </span>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              currentPath === item.path ||
              (item.path === '/admin' && currentPath === '/admin/overview');

            return (
              <button
                key={item.path}
                type="button"
                onClick={() => handleNavClick(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left cursor-pointer ${
                  isActive
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-text-tertiary'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Admin user identity & logout footer */}
        <div className="p-4 border-t border-border-subtle bg-surface-secondary/40 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-brand-soft border border-brand-primary/20 flex items-center justify-center text-brand-primary font-semibold text-xs">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AD'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-text-primary truncate">
                {user?.name || 'Administrator'}
              </p>
              <p className="text-[11px] text-text-tertiary truncate">{user?.email}</p>
            </div>
          </div>

          <div className="pt-2 border-t border-border-subtle flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onNavigateHome}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
              title="Return to Customer Journey Discovery"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Customer App</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center justify-center p-1.5 rounded-lg text-xs font-medium text-semantic-error/80 hover:text-semantic-error hover:bg-semantic-error/10 transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Operational Bar */}
        <header className="px-6 py-4 border-b border-border-subtle bg-surface-primary/70 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-text-primary">{activeNavItem.label}</h1>
            <p className="text-xs text-text-tertiary">
              Operational dashboard &bull; Real-time system state
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-elevated border border-border-subtle text-xs text-text-secondary">
              <span className="h-2 w-2 rounded-full bg-semantic-success animate-pulse" />
              <span>Operational</span>
            </div>
          </div>
        </header>

        {/* Page Content Body */}
        <div className="flex-1 p-6 max-w-7xl w-full mx-auto">{children}</div>
      </main>
    </div>
  );
}

export default AdminLayout;
