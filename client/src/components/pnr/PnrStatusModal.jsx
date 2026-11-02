import React, { useState, useEffect } from 'react';
import {
  X,
  Ticket,
  Search,
  Train,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  User,
  ShieldCheck,
  Download,
  Loader2,
  Sparkles,
  ExternalLink,
  Building2,
} from 'lucide-react';
import { api } from '../../services/api.js';
import {
  formatTime,
  formatDateDisplay,
  formatDuration,
  formatPrice,
} from '../../utils/formatters.js';
import TicketModal from '../booking/TicketModal.jsx';

/**
 * PnrStatusModal Component
 *
 * Implements dual-engine PNR verification:
 * 1. Yatrai Bookings & Smart Recovery Journeys (single & multi-leg connecting routes with layover checks)
 * 2. Real Indian Railways / IRCTC Tickets (direct live PRS verification, Tatkal/General quota, coach/berth)
 */
export function PnrStatusModal({ isOpen, onClose, onNavigate }) {
  const [pnrInput, setPnrInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pnrResult, setPnrResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [userBookings, setUserBookings] = useState([]);
  const [viewTicketModal, setViewTicketModal] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Fetch recent bookings for authenticated user to display quick lookup chips
  useEffect(() => {
    if (!isOpen) return;

    api.booking
      .myBookings()
      .then((res) => {
        if (res?.data?.bookings && Array.isArray(res.data.bookings)) {
          setUserBookings(res.data.bookings.slice(0, 3));
        }
      })
      .catch(() => {
        // Silently ignore if not logged in
      });
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSearch = async (queryToUse) => {
    const query = (queryToUse || pnrInput).trim();
    if (!query) return;

    setLoading(true);
    setErrorMsg(null);
    setPnrResult(null);

    try {
      const res = await api.pnr.check(query);
      if (res?.data?.pnrStatus) {
        setPnrResult(res.data.pnrStatus);
        setPnrInput(res.data.pnrStatus.pnr || query);
      } else {
        throw new Error('PNR record not found.');
      }
    } catch (err) {
      setErrorMsg(
        err.message ||
          `PNR "${query}" was not found in Yatrai bookings or live Indian Railways PRS records. Please verify the 10-digit number and try again.`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setPnrResult(null);
    setErrorMsg(null);
    setPnrInput('');
  };

  const handleDownloadPdf = async () => {
    if (!pnrResult || downloading) return;
    setDownloading(true);
    try {
      const pnrToUse = pnrResult.pnr || pnrResult.bookingId || pnrResult.bookingReference;
      await api.booking.downloadPdf(pnrToUse, pnrResult.bookingReference || pnrToUse);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  const isRealIrctc = pnrResult?.source === 'REAL_IRCTC';
  const isMultiLeg = Boolean(pnrResult?.isMultiLeg && pnrResult?.legs?.length > 1);

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pnr-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto bg-black/85 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-2xl rounded-2xl border border-[#303640] bg-[#12151A] p-5 sm:p-7 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-[#303640] pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#15191F] border border-[#303640] text-[#E8B04A]">
                <Ticket className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="pnr-modal-title" className="text-lg sm:text-xl font-serif font-bold text-[#F0F1F3]">
                    IRCTC &amp; Yatrai PNR Status
                  </h2>
                  <span className="hidden sm:inline-flex items-center rounded-full bg-[#E8B04A]/10 border border-[#E8B04A]/25 px-2 py-0.5 text-[10px] font-semibold text-[#E8B04A]">
                    Live Verification
                  </span>
                </div>
                <p className="text-xs text-[#A7AFBA] mt-0.5">
                  Inspect reservation status, train schedules, connecting layovers, and coach/berth details.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#303640] bg-[#15191F] p-2 text-[#A7AFBA] hover:text-[#F0F1F3] hover:border-[#424A56] transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Search Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="space-y-3"
          >
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 h-4 w-4 text-[#7E8794]" />
              <input
                type="text"
                placeholder="Enter 10-digit PNR or Yatrai Booking Ref (e.g. 2846526889)"
                value={pnrInput}
                onChange={(e) => {
                  setPnrInput(e.target.value.replace(/[^0-9a-zA-Z-]/g, ''));
                  if (errorMsg) setErrorMsg(null);
                }}
                className="w-full rounded-xl border border-[#303640] bg-[#15191F] pl-10 pr-28 py-3 text-sm text-[#F0F1F3] font-mono tracking-wider placeholder:text-[#7E8794] placeholder:font-sans focus:border-[#E8B04A] focus:outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={loading || !pnrInput.trim()}
                className="absolute right-1.5 px-4 py-2 rounded-lg bg-[#E8B04A] hover:bg-[#F2BE62] text-[#0B0D10] text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#0B0D10]" />
                ) : (
                  'Check Status'
                )}
              </button>
            </div>

            {/* Quick Demo & Bookings Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="text-[#7E8794] text-[11px]">Quick try:</span>

              {/* Real Ticket Chip */}
              <button
                type="button"
                onClick={() => {
                  setPnrInput('2846526889');
                  handleSearch('2846526889');
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-500/30 bg-emerald-950/30 text-[11px] font-mono text-emerald-400 hover:border-emerald-400 transition-colors cursor-pointer"
                title="Check real IRCTC ticket 2846526889"
              >
                <Train className="h-3 w-3 text-emerald-400" />
                <span>Real Ticket: 2846526889</span>
              </button>

              {/* Yatrai Multi-Leg Chip */}
              <button
                type="button"
                onClick={() => {
                  setPnrInput('2489102849');
                  handleSearch('2489102849');
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#E8B04A]/30 bg-[#E8B04A]/10 text-[11px] font-mono text-[#E8B04A] hover:border-[#E8B04A] transition-colors cursor-pointer"
                title="Check Yatrai multi-leg connection 2489102849"
              >
                <Sparkles className="h-3 w-3 text-[#E8B04A]" />
                <span>Yatrai Multi-Leg: 2489102849</span>
              </button>

              {/* User Bookings Pills */}
              {userBookings.map((b) => {
                const hasPnr = Boolean(b.pnr);
                const displayRef = b.pnr || b.bookingReference;
                return (
                  <button
                    key={b._id}
                    type="button"
                    onClick={() => {
                      const searchVal = b.pnr || b.bookingReference;
                      setPnrInput(searchVal);
                      handleSearch(searchVal);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#303640] bg-[#15191F] text-[11px] font-mono text-[#A7AFBA] hover:text-[#F0F1F3] hover:border-[#E8B04A]/50 transition-colors cursor-pointer"
                    title={hasPnr ? `Check PNR ${b.pnr}` : `Check booking ${b.bookingReference}`}
                  >
                    <Ticket className="h-3 w-3 text-[#E8B04A] shrink-0" />
                    <span className="text-[#7E8794] text-[10px]">
                      {hasPnr ? 'PNR:' : 'REF:'}
                    </span>
                    <span className={hasPnr ? 'text-[#E8B04A] font-bold' : ''}>{displayRef}</span>
                  </button>
                );
              })}
            </div>
          </form>

          {/* Loading State */}
          {loading && (
            <div className="py-10 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-[#E8B04A] mx-auto" />
              <p className="text-xs text-[#A7AFBA] font-medium">
                Querying reservation records and verifying status...
              </p>
            </div>
          )}

          {/* Error / Not Found View */}
          {errorMsg && !loading && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-300 space-y-2.5 animate-in fade-in">
              <div className="flex items-center gap-2 font-bold text-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>PNR Verification Result</span>
              </div>
              <p className="leading-relaxed text-rose-300/90">
                {errorMsg}
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPnrInput('2846526889');
                    handleSearch('2846526889');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-[11px] transition-colors cursor-pointer hover:bg-emerald-500"
                >
                  Try Real IRCTC Ticket (2846526889)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPnrInput('2489102849');
                    handleSearch('2489102849');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#E8B04A] text-[#0B0D10] font-bold text-[11px] transition-colors cursor-pointer hover:bg-[#F2BE62]"
                >
                  Try Yatrai Multi-Leg (2489102849)
                </button>
              </div>
            </div>
          )}

          {/* Success View: Rich PNR Details Card */}
          {pnrResult && !loading && (
            <div className="space-y-4 animate-in fade-in">
              {/* 1. Status Bar */}
              <div
                className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isRealIrctc
                    ? 'border-emerald-500/30 bg-emerald-950/20'
                    : 'border-[#303640] bg-[#181C22]'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[#7E8794]">
                      PNR NUMBER
                    </span>
                    {isRealIrctc ? (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <Train className="h-3 w-3" />
                        Official IRCTC Ticket (Live PRS)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-[#E8B04A]/20 text-[#E8B04A] border border-[#E8B04A]/30">
                        <Sparkles className="h-3 w-3" />
                        {isMultiLeg ? 'Yatrai Multi-Leg Connection' : 'Yatrai Verified Booking'}
                      </span>
                    )}
                  </div>
                  <div className="text-xl sm:text-2xl font-mono font-bold text-[#E8B04A] tracking-wider">
                    {pnrResult.pnr}
                  </div>
                  <div className="text-[11px] text-[#A7AFBA] font-mono mt-0.5">
                    Ref: {pnrResult.bookingReference}
                  </div>
                </div>

                <div className="flex flex-col sm:items-end gap-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{pnrResult.status || 'CONFIRMED (CNF)'}</span>
                  </span>
                  <span className="rounded-md bg-[#15191F] px-2 py-0.5 text-[10px] font-mono text-[#7E8794] border border-[#303640]">
                    Chart: {pnrResult.journey?.chartStatus || 'CHART NOT PREPARED'}
                  </span>
                </div>
              </div>

              {/* 2. Journey & Train Section */}
              {isMultiLeg ? (
                /* Yatrai Multi-Leg Connection Breakdown */
                <div className="rounded-xl border border-[#303640] bg-[#181C22] p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#303640] pb-2">
                    <div className="text-xs font-bold text-[#E8B04A] uppercase tracking-wide flex items-center gap-1.5">
                      <Train className="h-3.5 w-3.5" />
                      Connecting Train Segments ({pnrResult.legs.length} Trains)
                    </div>
                    <span className="text-[10px] text-[#A7AFBA] font-mono">
                      Total Distance: {pnrResult.journey?.totalDistance} km
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {pnrResult.legs.map((leg, idx) => (
                      <React.Fragment key={leg.legIndex || idx}>
                        <div className="rounded-lg border border-[#303640] bg-[#15191F] p-3 text-xs space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-1 border-b border-[#232830] pb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-[#E8B04A] text-[#0B0D10] px-1.5 py-0.5 text-[10px] font-bold">
                                Leg {leg.legIndex}
                              </span>
                              <span className="font-bold text-[#F0F1F3]">
                                {leg.trainNumber} &middot; {leg.trainName}
                              </span>
                              <span className="rounded bg-[#232830] px-1.5 py-0.2 text-[10px] text-[#A7AFBA]">
                                {leg.travelClass} &middot; {leg.quota}
                              </span>
                            </div>
                            <div className="font-mono font-bold text-[#E8B04A]">
                              ₹ {Number(leg.fare || 0).toFixed(2)}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-[11px]">
                            <div>
                              <div className="text-[#7E8794] text-[10px]">Boarding</div>
                              <div className="font-semibold text-[#F0F1F3]">{leg.fromName} ({leg.fromCode})</div>
                              <div className="font-mono text-[#A7AFBA] text-[10px]">
                                {formatTime(leg.departureTime)} IST &middot; {formatDateDisplay(leg.departureTime)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[#7E8794] text-[10px]">Deboarding</div>
                              <div className="font-semibold text-[#F0F1F3]">{leg.toName} ({leg.toCode})</div>
                              <div className="font-mono text-[#A7AFBA] text-[10px]">
                                {formatTime(leg.arrivalTime)} IST &middot; {formatDateDisplay(leg.arrivalTime)}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Layover transfer banner */}
                        {idx < pnrResult.legs.length - 1 && (
                          <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-2.5 text-xs text-amber-300 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Clock className="h-3.5 w-3.5 text-[#E8B04A] shrink-0" />
                              <span>
                                <strong>Transfer at {leg.toCode} ({leg.toName}):</strong> Arrive {formatTime(leg.arrivalTime)} &middot; Next train {formatTime(pnrResult.legs[idx + 1].departureTime)}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold bg-[#E8B04A]/20 text-[#E8B04A] px-2 py-0.5 rounded border border-[#E8B04A]/30 shrink-0">
                              Connection Validated
                            </span>
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ) : (
                /* Single Train (Real IRCTC ticket or Direct Train) */
                <div className="rounded-xl border border-[#303640] bg-[#181C22] p-4 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#303640] pb-2.5">
                    <div className="flex items-center gap-2">
                      <Train className="h-4 w-4 text-[#E8B04A]" />
                      <span className="text-sm font-bold text-[#F0F1F3]">
                        {pnrResult.train?.name} (#{pnrResult.train?.number})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded bg-[#15191F] px-2 py-0.5 font-bold text-[#E8B04A] border border-[#303640]">
                        Class: {pnrResult.train?.travelClass || 'SL'}
                      </span>
                      <span className="rounded bg-[#15191F] px-2 py-0.5 text-[#A7AFBA] border border-[#303640]">
                        Quota: {pnrResult.train?.quota || 'GN'}
                      </span>
                    </div>
                  </div>

                  {/* Station Timeline */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    {/* Origin */}
                    <div className="sm:col-span-5">
                      <div className="text-xs text-[#7E8794]">Boarding / From</div>
                      <div className="text-base font-bold text-[#F0F1F3]">
                        {pnrResult.journey?.origin?.name} ({pnrResult.journey?.origin?.code})
                      </div>
                      <div className="text-xs font-mono text-[#A7AFBA] mt-0.5">
                        {formatTime(pnrResult.journey?.departureTime)} &middot; {formatDateDisplay(pnrResult.journey?.departureTime)}
                      </div>
                    </div>

                    {/* Duration Line */}
                    <div className="sm:col-span-2 flex flex-col items-center justify-center py-1 sm:py-0">
                      <span className="text-[11px] font-mono font-bold text-[#E8B04A]">
                        {formatDuration(pnrResult.journey?.duration)}
                      </span>
                      <div className="relative w-full flex items-center justify-center my-1">
                        <div className="h-px w-full bg-[#303640]" />
                        <div className="absolute h-1.5 w-1.5 rounded-full bg-[#E8B04A]" />
                      </div>
                      <span className="text-[10px] text-[#7E8794]">
                        {pnrResult.journey?.totalDistance ? `${pnrResult.journey.totalDistance} km` : 'Direct'}
                      </span>
                    </div>

                    {/* Destination */}
                    <div className="sm:col-span-5 sm:text-right">
                      <div className="text-xs text-[#7E8794]">Deboarding / To</div>
                      <div className="text-base font-bold text-[#F0F1F3]">
                        {pnrResult.journey?.destination?.name} ({pnrResult.journey?.destination?.code})
                      </div>
                      <div className="text-xs font-mono text-[#A7AFBA] mt-0.5">
                        {formatTime(pnrResult.journey?.arrivalTime)} &middot; {formatDateDisplay(pnrResult.journey?.arrivalTime)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Passenger Berth Allocation Table */}
              <div className="rounded-xl border border-[#303640] bg-[#181C22] p-4 space-y-3">
                <h3 className="text-xs font-bold text-[#F0F1F3] uppercase tracking-wider flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-[#E8B04A]" />
                  <span>Passenger Reservation Details ({pnrResult.passengers?.length || 1})</span>
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#303640] text-[#7E8794]">
                        <th className="py-2 px-2">#</th>
                        <th className="py-2 px-2">Name</th>
                        <th className="py-2 px-2">Age / Sex</th>
                        <th className="py-2 px-2">Booking Status</th>
                        <th className="py-2 px-2">Current Status</th>
                        <th className="py-2 px-2">Coach / Berth</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#303640]">
                      {pnrResult.passengers?.map((p, idx) => (
                        <tr key={idx} className="text-[#F0F1F3]">
                          <td className="py-2.5 px-2 font-bold text-[#E8B04A]">{idx + 1}</td>
                          <td className="py-2.5 px-2 font-semibold uppercase">{p.name}</td>
                          <td className="py-2.5 px-2 text-[#A7AFBA]">
                            {p.age} yrs &middot; <span className="capitalize">{p.gender}</span>
                          </td>
                          <td className="py-2.5 px-2">
                            <span className="font-mono text-emerald-400 font-bold">
                              {p.bookingStatus || 'CNF'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2">
                            <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {p.currentStatus || 'CNF'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 font-mono font-bold text-[#F0F1F3]">
                            {p.coach ? (
                              <span className="inline-flex items-center gap-1.5 flex-wrap">
                                <span>Coach {p.coach}</span>
                                <span className="text-[#7E8794] font-normal">&middot;</span>
                                <span>Berth {p.berth}</span>
                                {(() => {
                                  let label = p.berthType;
                                  if (!label || /^\d+$/.test(String(label)) || String(label) === String(p.berth)) {
                                    label = p.berthPreference && p.berthPreference !== 'no_preference' && !/^\d+$/.test(p.berthPreference)
                                      ? p.berthPreference.replace('_', ' ').toUpperCase()
                                      : 'LOWER';
                                  }
                                  return <span className="text-[#A7AFBA] font-normal text-[11px]">({label})</span>;
                                })()}
                              </span>
                            ) : (
                              <span>{p.seat || 'CNF/S7/42/LOWER'}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="text-[10px] text-[#7E8794] pt-1">
                  Acronyms: <strong>RLWL:</strong> Remote Location Waitlist &middot; <strong>PQWL:</strong> Pooled Quota &middot; <strong>CNF:</strong> Confirmed
                </div>
              </div>

              {/* 4. Total Fare & Modal Footer Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="text-xs text-[#A7AFBA]">
                  Total Fare Paid:{' '}
                  <strong className="text-sm font-mono text-[#E8B04A] font-bold ml-1">
                    {formatPrice(pnrResult.fare?.totalFare || 0)}
                  </strong>
                </div>

                <div className="flex items-center gap-2">
                  {pnrResult && (
                    <button
                      type="button"
                      onClick={() => setViewTicketModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
                    >
                      <Ticket className="h-3.5 w-3.5" />
                      <span>View Authentic E-Ticket</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-4 py-2 rounded-xl border border-[#303640] bg-[#15191F] text-xs font-semibold text-[#A7AFBA] hover:text-[#F0F1F3] hover:border-[#424A56] transition-colors cursor-pointer"
                  >
                    Check Another PNR
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-[#E8B04A] hover:bg-[#F2BE62] text-[#0B0D10] text-xs font-bold transition-all cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Embedded Authentic E-Ticket Modal for Checked PNR */}
      {viewTicketModal && pnrResult && (
        <TicketModal
          booking={{
            _id: pnrResult.bookingId || pnrResult.pnr,
            pnr: pnrResult.pnr,
            bookingReference: pnrResult.bookingReference || `YTR-BK-${pnrResult.pnr}`,
            isConfirmed: pnrResult.isConfirmed !== false,
            status: pnrResult.status || 'CONFIRMED',
            createdAt: pnrResult.bookingDate || new Date(),
            journeySnapshot: pnrResult.journey || {},
            legs: pnrResult.legs || [],
            transfers: pnrResult.transfers || [],
            passengerDetails: pnrResult.passengers || [],
            fare: pnrResult.fare || {},
          }}
          onClose={() => setViewTicketModal(false)}
          onDownload={handleDownloadPdf}
          isDownloading={downloading}
        />
      )}
    </>
  );
}

export default PnrStatusModal;
