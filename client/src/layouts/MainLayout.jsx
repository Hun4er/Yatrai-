import React from 'react';
import { APP_NAME, APP_TAGLINE, APP_VERSION } from '../constants/index.js';

export function MainLayout({ children, onNavigateHome }) {
  return (
    <div className="flex min-h-screen flex-col bg-background-primary text-text-primary selection:bg-brand-primary selection:text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-background-secondary/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <button
            type="button"
            onClick={onNavigateHome}
            className="flex items-center gap-3 text-left focus:outline-none cursor-pointer group"
            aria-label={`${APP_NAME} Home`}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary font-bold text-white shadow-md shadow-brand-primary/20 group-hover:bg-brand-hover transition-colors">
              Y
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-text-primary group-hover:text-brand-primary transition-colors">
                {APP_NAME}
              </span>
              <span className="ml-2 text-xs font-mono text-brand-primary">v{APP_VERSION}</span>
            </div>
          </button>
          <div className="text-xs text-text-tertiary hidden sm:block">{APP_TAGLINE}</div>
        </div>
      </header>

      {/* Main Content Shell */}
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 sm:py-10">{children}</main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-background-secondary py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 text-xs text-text-tertiary sm:flex-row">
          <span>&copy; {new Date().getFullYear()} {APP_NAME} Platform. All rights reserved.</span>
          <span>Phase 12: Maps & Journey Visualization</span>
        </div>
      </footer>
    </div>
  );
}

export default MainLayout;
