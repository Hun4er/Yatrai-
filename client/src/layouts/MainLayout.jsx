import React from 'react';
import { APP_NAME, APP_TAGLINE, APP_VERSION } from '../constants/index.js';

export function MainLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-background-primary text-text-primary selection:bg-brand-primary selection:text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-background-secondary/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary font-bold text-white shadow-md shadow-brand-primary/20">
              Y
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-text-primary">
                {APP_NAME}
              </span>
              <span className="ml-2 text-xs font-mono text-brand-primary">
                v{APP_VERSION}
              </span>
            </div>
          </div>
          <div className="text-xs text-text-tertiary hidden sm:block">
            {APP_TAGLINE}
          </div>
        </div>
      </header>

      {/* Main Content Shell */}
      <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-10">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-background-secondary py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 text-xs text-text-tertiary sm:flex-row">
          <span>&copy; {new Date().getFullYear()} Yatrai Platform. All rights reserved.</span>
          <span>Phase 0: Project Foundation</span>
        </div>
      </footer>
    </div>
  );
}

export default MainLayout;
