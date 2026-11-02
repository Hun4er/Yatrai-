import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';
import {
  getLocalNotifications,
  markLocalNotificationRead,
  markAllLocalNotificationsRead,
  deleteLocalNotification,
} from '../utils/browserCache.js';
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
  Smartphone,
  ShieldAlert,
} from 'lucide-react';

/**
 * NotificationsPage Component
 * In-app operational alert center for railway schedule alerts, ARP booking windows,
 * Tatkal opening timings, and saved journey updates.
 */
export function NotificationsPage({ onNavigateHome }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [inspectingJourney, setInspectingJourney] = useState(null);
  const [journeyUnavailableNotice, setJourneyUnavailableNotice] = useState(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);

    const localList = getLocalNotifications();

    if (isAuthenticated) {
      try {
        const res = await api.notifications.list({ page: 1, limit: 30, unreadOnly: false });
        const remoteList = res?.data?.notifications || [];

        // If remote has items, merge with local operational notices
        const seen = new Set();
        const merged = [];

        for (const item of remoteList) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        }

        for (const item of localList) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        }

        setNotifications(merged);
      } catch {
        setNotifications(localList);
      } finally {
        setLoading(false);
      }
    } else {
      setNotifications(localList);
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Sync listener
  useEffect(() => {
    const handleSync = (e) => {
      if (!e.detail?.type || e.detail.type === 'notifications') {
        fetchNotifications();
      }
    };
    window.addEventListener('yatrai:sync-state', handleSync);
    return () => window.removeEventListener('yatrai:sync-state', handleSync);
  }, [fetchNotifications]);

  const handleMarkRead = async (id) => {
    markLocalNotificationRead(id);
    if (isAuthenticated && typeof id === 'string' && !id.startsWith('notif_')) {
      await api.notifications.markRead(id).catch(() => {});
    }
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n))
    );
  };

  const handleMarkAllRead = async () => {
    markAllLocalNotificationsRead();
    if (isAuthenticated) {
      await api.notifications.markAllRead().catch(() => {});
    }
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() }))
    );
  };

  const handleDelete = async (id) => {
    deleteLocalNotification(id);
    if (isAuthenticated && typeof id === 'string' && !id.startsWith('notif_')) {
      await api.notifications.delete(id).catch(() => {});
    }
    setNotifications((prev) => prev.filter((n) => n.id !== id));
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
        'This specific itinerary schedule has been verified. Perform a fresh search to view live seat availability.'
      );
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
            PRS Window
          </span>
        );
      case 'price_change':
        return (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
            Fare Update
          </span>
        );
      case 'schedule_change':
        return (
          <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-400 uppercase tracking-wider">
            Timetable Sync
          </span>
        );
      case 'saved_journey_update':
      default:
        return (
          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400 uppercase tracking-wider">
            System Notice
          </span>
        );
    }
  };

  const displayedNotifications = unreadOnly
    ? notifications.filter((n) => !n.read)
    : notifications;

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (authLoading || (loading && notifications.length === 0)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-4 sm:py-8 px-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-primary">
            <Bell className="h-4 w-4" aria-hidden="true" />
            <span>Travel Alerts & Operational Notices</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text-primary mt-1">
            Alerts & Updates
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Real-time PRS booking windows, Tatkal opening reminders, and railway timetable updates.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/10 hover:text-text-primary transition-colors cursor-pointer"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Mark all as read</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setUnreadOnly(!unreadOnly)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              unreadOnly
                ? 'border-brand-primary/40 bg-brand-primary/10 text-brand-primary'
                : 'border-white/10 bg-white/5 text-text-secondary hover:bg-white/10'
            }`}
          >
            <span>Unread only ({unreadCount})</span>
          </button>
        </div>
      </div>

      {/* Guest Mode Banner */}
      {!isAuthenticated && (
        <div className="flex items-center justify-between rounded-xl border border-brand-primary/20 bg-[#161B22] p-3 text-xs text-text-secondary">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-brand-primary shrink-0" />
            <span>Operational travel alerts are active. Sign in to subscribe to personalized SMS/Email trip reminders.</span>
          </div>
          <span className="shrink-0 rounded bg-brand-primary/10 px-2 py-0.5 text-[10px] font-semibold text-brand-primary font-mono">
            LIVE ALERTS
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-400">
          {error}
        </div>
      )}

      {journeyUnavailableNotice && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-center justify-between">
          <span>{journeyUnavailableNotice}</span>
          <button
            type="button"
            onClick={() => setJourneyUnavailableNotice(null)}
            className="text-xs font-bold text-amber-200 underline ml-2 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Empty State */}
      {displayedNotifications.length === 0 && !loading && (
        <div className="rounded-2xl border border-white/5 bg-surface-card p-12 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-text-muted">
            <Bell className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-text-primary">
              {unreadOnly ? 'No unread alerts' : 'No notifications'}
            </h3>
            <p className="text-xs text-text-secondary max-w-sm mx-auto">
              You are all caught up! New PRS quota openings and schedule shifts will appear here.
            </p>
          </div>
          {unreadOnly && (
            <button
              type="button"
              onClick={() => setUnreadOnly(false)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-brand-hover cursor-pointer"
            >
              <span>View All Alerts</span>
            </button>
          )}
        </div>
      )}

      {/* Notifications List */}
      <div className="space-y-3">
        {displayedNotifications.map((notif) => {
          const isRead = Boolean(notif.read);

          return (
            <div
              key={notif.id}
              className={`group flex items-start justify-between rounded-xl border p-4 transition-all ${
                isRead
                  ? 'border-white/5 bg-[#12151A] opacity-80 hover:opacity-100 hover:border-white/10'
                  : 'border-brand-primary/30 bg-[#161B22] shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3 flex-1 min-w-0 pr-4">
                <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-[#1A1F26] border border-[#303640] shrink-0">
                  {getTypeIcon(notif.type)}
                </div>

                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {getTypeBadge(notif.type)}
                    <h3 className={`text-sm font-semibold truncate ${isRead ? 'text-text-primary' : 'text-[#F0F1F3] font-bold'}`}>
                      {notif.title}
                    </h3>
                    {!isRead && (
                      <span className="h-2 w-2 rounded-full bg-brand-primary animate-pulse" />
                    )}
                  </div>

                  <p className="text-xs text-text-secondary leading-relaxed">
                    {notif.message}
                  </p>

                  <div className="flex items-center gap-3 pt-1 text-[11px] text-text-muted">
                    <span>
                      {notif.createdAt ? new Date(notif.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }) : 'Recent'}
                    </span>

                    {notif.actionLabel && (
                      <button
                        type="button"
                        onClick={() => handleOpenJourney(notif)}
                        className="font-medium text-brand-primary hover:underline cursor-pointer"
                      >
                        {notif.actionLabel} →
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons on right */}
              <div className="flex items-center gap-1 shrink-0">
                {!isRead && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(notif.id)}
                    title="Mark as read"
                    className="p-1.5 rounded-lg text-text-muted hover:text-emerald-400 hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(notif.id)}
                  title="Delete alert"
                  className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Inspect Journey Modal if applicable */}
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
