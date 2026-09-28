import React from 'react';
import { ShieldAlert, ArrowLeft, LogIn } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';

export function AdminForbiddenPage({ onNavigateHome, onOpenAuthModal }) {
  const { user, isAuthenticated } = useAuth();

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-2xl border border-semantic-error/20 bg-surface-primary p-8 text-center shadow-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-semantic-error/10 text-semantic-error border border-semantic-error/20">
          <ShieldAlert className="h-8 w-8" aria-hidden="true" />
        </div>

        <h2 className="mt-5 text-2xl font-bold tracking-tight text-text-primary">
          Access Restricted
        </h2>
        <p className="mt-2 text-sm text-text-secondary leading-relaxed">
          {isAuthenticated
            ? `Signed in as ${user?.email || 'user'}. Your account does not possess the administrative privileges required to access this console.`
            : 'You must be signed in with an authorized administrative account to access the Yatrai Admin Console.'}
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface-elevated px-5 py-2.5 text-sm font-semibold text-text-primary border border-border-default hover:bg-surface-secondary transition-all cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Journey Discovery</span>
          </button>

          {!isAuthenticated && onOpenAuthModal && (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-hover active:bg-brand-active transition-all cursor-pointer"
            >
              <LogIn className="h-4 w-4" />
              <span>Sign In as Admin</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminForbiddenPage;
