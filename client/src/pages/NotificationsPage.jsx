import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';
import JourneyDetailModal from '../components/journey/JourneyDetailModal.jsx';
import {
  Bell,
  Clock,
  Tag,
  Info,
  Check,
  CheckCheck,
  Trash2,
  Loader2,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Calendar,
} from 'lucide-react';

/**
 * NotificationsPage Component (Phase 14)
 * In-app notification center for trip reminders, price drops, schedule shifts, and saved updates.
 */
export function NotificationsPage({ onNavigateHome }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [inspectingJourney, setInspectingJourney] = useState(null);
  const [journeyUnavailableNotice, setJourneyUnavailableNotice] = useState(null);
  const [sweeping, setSweeping] = useState(false);

  const fetchNotifications = useCallback(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);

    api.notifications
      .list({ page, limit: 15, unreadOnly })
      .then((res) => {
        setNotifications(res?.data?.notifications || []);
        setTotal(res?.data?.total || 0);
        setTotalPages(res?.data?.totalPages || 1);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Unable to load notifications.');
        setLoading(false);
      });
  }, [isAuthenticated, page, unreadOnly]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkRead = async (id) => {
    try {
      await api.notifications.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n))
      );
    } catch {
      // keep current state
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() }))
      );
    } catch (err) {
      setError(err.message || 'Failed to mark notifications as read.');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.notifications.delete(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setError(err.message || 'Failed to delete notification.');
    }
  };

  const handleOpenJourney = (notif) => {
    if (!notif.read) {
      handleMarkRead(notif.id);
    }

    if (notif.journey && notif.journey.id) {
      setInspectingJourney(notif.journey);
      setJourneyUnavailableNotice(null);
    } else {
      setJourneyUnavailableNotice(
        'This specific journey route is no longer available or has been updated by the provider.'
      );
    }
  };

  const handleTriggerSweep = async () => {
    setSweeping(true);
    try {
      await api.notifications.sweep();
      fetchNotifications();
    } catch {
      // keep existing
    } finally {
      setSweeping(false);
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'journey_reminder':
      case 'departure_reminder':
        return <Calendar className="h-4 w-4 text-amber-400" aria-hidden="true" />;
      case 'price_change':
        return <Tag className="h-4 w-4 text-emerald-400" aria-hidden="true" />;
      case 'schedule_change':
        return <Clock className="h-4 w-4 text-purple-400" aria-hidden="true" />;
      case 'saved_journey_update':
      default:
        return <Info className="h-4 w-4 text-blue-400" aria-hidden="true" />;
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'journey_reminder':
      case 'departure_reminder':
        return (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
            Trip Reminder
          </span>
        );
      case 'price_change':
        return (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
            Price Change
          </span>
        );
      case 'schedule_change':
        return (
          <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-400 uppercase tracking-wider">
            Schedule Shift
          </span>
        );
      case 'saved_journey_update':
      default:
        return (
          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400 uppercase tracking-wider">
            Saved Update
          </span>
        );
    }
  };

  if (authLoading || (loading && notifications.length === 0)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" aria-hidden="true" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-md space-y-6 py-12 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft border border-brand-primary/20 text-brand-primary">
          <Bell className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-text-primary">Sign In to View Notifications</h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            Stay informed on journey departure reminders, ticket price drops, and transit schedule changes.
          </p>
        </div>
        <button
          type="button"
          onClick={onNavigateHome}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-brand-hover cursor-pointer"
        >
          <span>Find Routes</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-4 sm:py-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-primary">
            <Bell className="h-4 w-4" aria-hidden="true" />
            <span>Travel Alerts</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text-primary mt-1">
            Notifications
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Real-time reminders, price movements, and schedule alterations for your saved trips.
          </p>
        </div>

        {/* Header Action CTAs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTriggerSweep}
            disabled={sweeping}
            title="Scan saved journeys for departure reminders"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-white/10 cursor-pointer disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${sweeping ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Check Reminders</span>
          </button>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary/10 border border-brand-primary/20 px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary hover:text-white transition-all cursor-pointer"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Mark All Read</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs & Count Banner */}
      <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setUnreadOnly(false)}
            className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              !unreadOnly
                ? 'bg-white/10 text-text-primary font-semibold'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            All ({total})
          </button>
          <button
            type="button"
            onClick={() => setUnreadOnly(true)}
            className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              unreadOnly
                ? 'bg-white/10 text-text-primary font-semibold'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Unread Only
          </button>
        </div>

        {unreadCount > 0 && (
          <span className="text-[11px] font-medium text-brand-primary">
            {unreadCount} unread on this page
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-400">
          {error}
        </div>
      )}

      {journeyUnavailableNotice && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-400 flex items-center justify-between">
          <span>{journeyUnavailableNotice}</span>
          <button
            type="button"
            onClick={() => setJourneyUnavailableNotice(null)}
            className="text-amber-400 hover:text-white font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Empty State */}
      {notifications.length === 0 && !loading && (
        <div className="rounded-2xl border border-white/5 bg-surface-card p-12 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-text-muted">
            <Bell className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-text-primary">
              {unreadOnly ? 'No unread notifications' : 'No notifications yet'}
            </h3>
            <p className="text-xs text-text-secondary max-w-sm mx-auto">
              Save journeys to receive automated departure reminders, fare reduction alerts, and schedule changes.
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-brand-hover cursor-pointer"
          >
            <span>Explore Routes</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Notifications List */}
      <div className="space-y-2.5">
        {notifications.map((notif) => {
          const isUnread = !notif.read;
          const formattedDate = notif.createdAt
            ? new Date(notif.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '';

          return (
            <article
              key={notif.id}
              className={`group flex items-start justify-between gap-4 rounded-xl border p-4 transition-all ${
                isUnread
                  ? 'border-brand-primary/30 bg-surface-elevated shadow-sm'
                  : 'border-white/5 bg-surface-card hover:border-white/10'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                {/* Category Icon */}
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 border border-white/5">
                  {getTypeIcon(notif.type)}
                </div>

                {/* Content */}
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {getTypeBadge(notif.type)}
                    {isUnread && (
                      <span className="flex h-2 w-2 rounded-full bg-brand-primary" aria-label="Unread notification" />
                    )}
                    <span className="text-[11px] text-text-muted">{formattedDate}</span>
                  </div>

                  <h3 className={`text-sm font-semibold tracking-tight ${isUnread ? 'text-text-primary' : 'text-text-secondary'}`}>
                    {notif.title}
                  </h3>

                  <p className="text-xs text-text-secondary leading-relaxed">
                    {notif.message}
                  </p>

                  {/* Metadata Corridor Tag */}
                  {notif.metadata?.origin && notif.metadata?.destination && (
                    <div className="pt-1 flex items-center gap-1.5 text-[11px] font-medium text-brand-primary/80">
                      <span>{notif.metadata.origin}</span>
                      <span className="text-text-muted">→</span>
                      <span>{notif.metadata.destination}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-center">
                {notif.journey && (
                  <button
                    type="button"
                    onClick={() => handleOpenJourney(notif)}
                    className="inline-flex items-center gap-1 rounded-lg border border-brand-primary/20 bg-brand-primary/10 px-2.5 py-1 text-xs font-semibold text-brand-primary hover:bg-brand-primary hover:text-white transition-all cursor-pointer"
                    aria-label={`View journey for ${notif.title}`}
                  >
                    <span>View</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}

                {isUnread && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(notif.id)}
                    title="Mark as read"
                    className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-white/5 cursor-pointer transition-colors"
                    aria-label="Mark as read"
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleDelete(notif.id)}
                  title="Delete notification"
                  className="rounded-lg p-1.5 text-text-muted hover:text-red-400 hover:bg-white/5 cursor-pointer transition-colors"
                  aria-label="Delete notification"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-white/5 pt-4 text-xs text-text-secondary">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-white/10 px-3 py-1 text-xs hover:bg-white/5 disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-white/10 px-3 py-1 text-xs hover:bg-white/5 disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Journey Detail Modal with Phase 12 Mapbox Visualization */}
      {inspectingJourney && (
        <JourneyDetailModal
          journey={inspectingJourney}
          onClose={() => setInspectingJourney(null)}
        />
      )}
    </div>
  );
}

export default NotificationsPage;
