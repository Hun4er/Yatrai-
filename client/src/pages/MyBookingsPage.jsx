import React, { useState, useEffect } from 'react';
import {
  Ticket,
  Calendar,
  Clock,
  ArrowRight,
  Download,
  ExternalLink,
  Train,
  Users,
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';
import TicketModal from '../components/booking/TicketModal.jsx';
import {
  formatDuration,
  formatPrice,
  formatTime,
  formatDateDisplay,
  formatDayOffsetBadge,
  getDayOffset,
} from '../utils/formatters.js';

export function MyBookingsPage({ onNavigate, onNavigateHome }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'upcoming' | 'past'
  const [downloadingId, setDownloadingId] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);

  const fetchBookings = async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.booking.myBookings();
      setBookings(res?.data?.bookings || []);
    } catch (err) {
      setError(err.message || 'Unable to retrieve your bookings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      if (onNavigate) onNavigate('/profile');
      return;
    }
    fetchBookings();
  }, [isAuthenticated, authLoading]);

  const handleDownload = async (booking) => {
    if (downloadingId) return;
    setDownloadingId(booking._id);
    try {
      await api.booking.downloadPdf(booking._id, booking.bookingReference);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  // Filter bookings based on active tab
  const now = new Date();
  const filteredBookings = bookings.filter((b) => {
    if (activeTab === 'all') return true;
    const depTime = b.journeySnapshot?.departureTime ? new Date(b.journeySnapshot.departureTime) : null;
    if (!depTime || isNaN(depTime.getTime())) return true;
    if (activeTab === 'upcoming') return depTime >= now;
    if (activeTab === 'past') return depTime < now;
    return true;
  });

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-4xl py-16 px-4">
        <div className="rounded-2xl border border-white/10 bg-surface-primary p-12 text-center space-y-4 shadow-xl">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-primary" />
          <h2 className="text-base font-bold text-text-primary">Loading My Bookings...</h2>
          <p className="text-xs text-text-secondary">Retrieving your verified journeys and ticket records.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl py-6 sm:py-10 px-4 space-y-8">
      {/* Page Title & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
              <Ticket className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-text-primary">My Bookings</h1>
              <p className="text-xs text-text-secondary">
                View your planned railway itineraries, passenger details, and download PDF tickets.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchBookings}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-surface-secondary px-3.5 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
            activeTab === 'all'
              ? 'bg-brand-primary text-white shadow-md'
              : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
          }`}
        >
          All Bookings ({bookings.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('upcoming')}
          className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
            activeTab === 'upcoming'
              ? 'bg-brand-primary text-white shadow-md'
              : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
          }`}
        >
          Upcoming Journeys
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('past')}
          className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
            activeTab === 'past'
              ? 'bg-brand-primary text-white shadow-md'
              : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
          }`}
        >
          Past Journeys
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Empty State */}
      {filteredBookings.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-surface-primary p-12 text-center space-y-4 shadow-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-text-tertiary">
            <Ticket className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-text-primary">No Bookings Found</h3>
            <p className="text-xs text-text-secondary max-w-sm mx-auto">
              {activeTab === 'all'
                ? "You haven't planned any train bookings yet. Search trains to plan your journey."
                : `No ${activeTab} journeys found under your account.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => (onNavigateHome ? onNavigateHome() : onNavigate ? onNavigate('/') : (window.location.href = '/'))}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-brand-hover transition-all cursor-pointer"
          >
            <Search className="h-4 w-4" />
            <span>Search Available Trains</span>
          </button>
        </div>
      ) : (
        /* Bookings List */
        <div className="space-y-5">
          {filteredBookings.map((booking) => {
            const snap = booking.journeySnapshot || {};
            const bookingLegs = Array.isArray(booking.legs) && booking.legs.length > 0
              ? booking.legs
              : (Array.isArray(snap.legs) ? snap.legs : []);
            const isMultiLeg = bookingLegs.length > 1;
            const primaryLeg = bookingLegs[0] || {};
            const lastLeg = bookingLegs[bookingLegs.length - 1] || primaryLeg;

            const originName = snap.origin?.name || snap.origin?.city || primaryLeg.fromStationName || primaryLeg.fromName || 'Origin';
            const destName = snap.destination?.name || snap.destination?.city || lastLeg.toStationName || lastLeg.toName || 'Destination';
            const originCode = (snap.origin?.code || primaryLeg.fromStationCode || primaryLeg.fromCode || primaryLeg.from) ? `[${snap.origin?.code || primaryLeg.fromStationCode || primaryLeg.fromCode || primaryLeg.from}]` : '';
            const destCode = (snap.destination?.code || lastLeg.toStationCode || lastLeg.toCode || lastLeg.to) ? `[${snap.destination?.code || lastLeg.toStationCode || lastLeg.toCode || lastLeg.to}]` : '';

            const depTime = formatTime(snap.departureTime || primaryLeg.departureTime);
            const arrTime = formatTime(snap.arrivalTime || lastLeg.arrivalTime);
            const depDate = formatDateDisplay(snap.departureTime || primaryLeg.departureTime);
            const arrDate = formatDateDisplay(snap.arrivalTime || lastLeg.arrivalTime);
            const dayOffset = getDayOffset(snap.departureTime || primaryLeg.departureTime, snap.arrivalTime || lastLeg.arrivalTime);
            const dayOffsetBadge = formatDayOffsetBadge(dayOffset);

            const trainName = isMultiLeg
              ? bookingLegs.map((l) => l.trainNumber || l.trainNo || l.service?.number || l.trainName || l.service?.name).filter(Boolean).join(' → ')
              : (primaryLeg.trainName || primaryLeg.service?.name || 'Train Service');
            const trainNumber = isMultiLeg
              ? `${bookingLegs.length} Trains`
              : (primaryLeg.trainNumber || primaryLeg.trainNo || primaryLeg.vehicle?.identifier || primaryLeg.service?.number || '');
            const travelClass = primaryLeg.travelClass || primaryLeg.class || primaryLeg.service?.class || '3A';
            const passengers = Array.isArray(booking.passengerDetails) ? booking.passengerDetails : [];
            const isConfirmed = Boolean(booking.isConfirmed && booking.status === 'confirmed');

            return (
              <div
                key={booking._id}
                className="rounded-2xl border border-white/10 bg-surface-primary p-5 sm:p-6 shadow-xl space-y-4 hover:border-brand-primary/30 transition-colors"
              >
                {/* Header bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs font-bold text-brand-primary">
                      {booking.bookingReference}
                    </span>
                    <span className="text-[11px] text-text-tertiary">·</span>
                    <span className="text-[11px] text-text-secondary font-mono">
                      Booked on {formatDateDisplay(booking.createdAt)}
                    </span>
                  </div>

                  <div>
                    {isConfirmed ? (
                      <span className="inline-flex items-center rounded-full bg-[#4CC38A]/10 border border-[#4CC38A]/30 px-2.5 py-0.5 text-[10px] font-bold text-[#4CC38A] uppercase tracking-wider">
                        Confirmed (PNR: {booking.pnr || 'Issued'})
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                        Journey Summary (Handoff Required)
                      </span>
                    )}
                  </div>
                </div>

                {/* Train and Corridor Info */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                  <div className="sm:col-span-5 space-y-1">
                    <div className="flex items-center gap-2">
                      <Train className="h-4 w-4 text-brand-primary" />
                      <span className="text-sm font-bold text-text-primary">{trainName}</span>
                      {trainNumber && (
                        <span className="text-xs font-mono font-semibold text-text-secondary bg-white/5 px-2 py-0.5 rounded">
                          #{trainNumber}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-text-secondary">
                      Class: <strong className="text-text-primary">{travelClass}</strong> ·{' '}
                      {passengers.length} Traveller{passengers.length > 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Route */}
                  <div className="sm:col-span-4 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-text-primary">
                      <span>{originName} {originCode}</span>
                      <ArrowRight className="h-3 w-3 text-brand-primary" />
                      <span>{destName} {destCode}</span>
                    </div>
                    <div className="text-text-secondary font-mono text-[11px]">
                      {depTime} ({depDate}) → {arrTime} ({arrDate})
                      {dayOffsetBadge && (
                        <span className="ml-1 text-[9px] text-amber-400">[{dayOffsetBadge}]</span>
                      )}
                    </div>
                  </div>

                  {/* Fare */}
                  <div className="sm:col-span-3 text-left sm:text-right">
                    <span className="text-[10px] text-text-tertiary uppercase font-semibold">Total Fare</span>
                    <div className="text-base font-bold font-mono text-[#4CC38A]">
                      {formatPrice(booking.fare?.totalFare)}
                    </div>
                  </div>
                </div>

                {/* Multi-Leg Segment Details */}
                {isMultiLeg && (
                  <div className="rounded-xl border border-white/5 bg-[#12151A] p-3 text-xs space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#E8B04A]">
                      Multi-Leg Itinerary ({bookingLegs.length} Trains)
                    </div>
                    <div className="space-y-1.5">
                      {bookingLegs.map((leg, idx) => (
                        <div key={idx} className="flex flex-wrap items-center justify-between text-text-secondary">
                          <span>
                            <strong className="text-text-primary">Leg {leg.legIndex || idx + 1}:</strong> {leg.trainNumber || leg.trainNo} {leg.trainName || leg.service?.name} ({leg.fromStationCode || leg.fromCode || leg.from} → {leg.toStationCode || leg.toCode || leg.to})
                          </span>
                          <span className="font-mono text-[11px] text-[#E8B04A]">
                            {leg.departureTime ? formatTime(leg.departureTime) : '--:--'} - {leg.arrivalTime ? formatTime(leg.arrivalTime) : '--:--'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Passenger list */}
                <div className="rounded-xl border border-white/5 bg-surface-secondary/50 p-3 text-xs">
                  <div className="text-text-tertiary text-[10px] uppercase font-semibold mb-1">
                    Traveller List
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-text-secondary">
                    {passengers.map((p, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1">
                        <strong className="text-text-primary">{p.name}</strong> ({p.age}y, {p.gender})
                        {idx < passengers.length - 1 && ' · '}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Action Footer */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
                  <p className="text-[11px] text-amber-400/90 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>Summary document for IRCTC reservation.</span>
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedTicket(booking)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-text-primary hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <Ticket className="h-3.5 w-3.5 text-amber-300" />
                      <span>View Ticket</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownload(booking)}
                      disabled={downloadingId === booking._id}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-brand-hover active:scale-[0.98] disabled:opacity-50 transition-all cursor-pointer"
                    >
                      {downloadingId === booking._id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5" />
                          <span>Download PDF</span>
                        </>
                      )}
                    </button>

                    <a
                      href="https://www.irctc.co.in/nget/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-surface-secondary px-3.5 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
                    >
                      <span>IRCTC</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive E-Ticket Modal Preview */}
      {selectedTicket && (
        <TicketModal
          booking={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onDownload={handleDownload}
          isDownloading={downloadingId === selectedTicket._id}
        />
      )}
    </div>
  );
}

export default MyBookingsPage;
