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
} from 'lucide-react';
import { api } from '../../services/api.js';
import {
  formatTime,
  formatDateDisplay,
  formatDuration,
  formatPrice,
} from '../../utils/formatters.js';

/**
 * PnrStatusModal Component
 *
 * Implements interactive PNR status verification for Yatrai-generated journeys.
 * Displays high-fidelity journey confirmation, train metadata, and passenger berth allocation.
 * Explicitly notifies passengers that for now only Yatrai-generated PNR details are shown,
 * and live IRCTC PNR synchronization will be connected in an upcoming phase.
 */
export function PnrStatusModal({ isOpen, onClose, onNavigate }) {
  const [pnrInput, setPnrInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pnrResult, setPnrResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [userBookings, setUserBookings] = useState([]);

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
          `No Yatrai booking found for PNR "${query}". For now, only Yatrai-generated PNRs are supported. Real Indian Railways (IRCTC) live PNR data will be integrated once external provider sync is connected.`
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pnr-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto bg-black/80 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-[#303640] bg-[#12151A] p-5 sm:p-7 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
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
                  IRCTC / Yatrai PNR Status
                </h2>
                <span className="hidden sm:inline-flex items-center rounded-full bg-[#E8B04A]/10 border border-[#E8B04A]/25 px-2 py-0.5 text-[10px] font-semibold text-[#E8B04A]">
                  Yatrai Verified
                </span>
              </div>
              <p className="text-xs text-[#A7AFBA] mt-0.5">
                Inspect reservation status, train schedule, and coach/berth details.
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
              placeholder="Enter 10-digit PNR (e.g. 2489102849)"
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
            <button
              type="button"
              onClick={() => {
                setPnrInput('2489102849');
                handleSearch('2489102849');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#303640] bg-[#15191F] text-[11px] font-mono text-[#E8B04A] hover:border-[#E8B04A] transition-colors cursor-pointer"
            >
              <Sparkles className="h-3 w-3" />
              <span>Sample: 2489102849</span>
            </button>

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

        {/* Notice on Current Phase Scope */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-[#A7AFBA] flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-[#E8B04A] shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-[#F0F1F3]">Current Scope:</strong> Only Yatrai-generated booking PNRs and reference numbers are verifiable in this preview phase. Live Indian Railways (IRCTC) external PNR synchronization will be connected once the official data provider is activated.
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="py-10 text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-[#E8B04A] mx-auto" />
            <p className="text-xs text-[#A7AFBA] font-medium">
              Verifying PNR record with Yatrai Engine...
            </p>
          </div>
        )}

        {/* Error / Not Found View */}
        {errorMsg && !loading && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-300 space-y-2.5 animate-in fade-in">
            <div className="flex items-center gap-2 font-bold text-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>PNR Not Found in Yatrai Records</span>
            </div>
            <p className="leading-relaxed text-rose-300/90">
              {errorMsg}
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPnrInput('2489102849');
                  handleSearch('2489102849');
                }}
                className="px-3 py-1.5 rounded-lg bg-[#E8B04A] text-[#0B0D10] font-bold text-[11px] transition-colors cursor-pointer"
              >
                Try Sample Yatrai PNR (2489102849)
              </button>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigate('/my-bookings');
                  }}
                  className="px-3 py-1.5 rounded-lg border border-[#303640] bg-[#15191F] text-[#F0F1F3] text-[11px] transition-colors cursor-pointer"
                >
                  View My Bookings
                </button>
              )}
            </div>
          </div>
        )}

        {/* Success View: Rich PNR Details Card */}
        {pnrResult && !loading && (
          <div className="space-y-4 animate-in fade-in">
            {/* 1. Status Bar */}
            <div className="rounded-xl border border-[#303640] bg-[#181C22] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#7E8794]">
                  PNR NUMBER
                </span>
                <div className="text-xl sm:text-2xl font-mono font-bold text-[#E8B04A] tracking-wider">
                  {pnrResult.pnr}
                </div>
                <div className="text-[11px] text-[#A7AFBA] font-mono mt-0.5">
                  Ref: {pnrResult.bookingReference}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{pnrResult.status || 'CONFIRMED (CNF)'}</span>
                </span>
                <span className="rounded-md bg-[#15191F] px-2 py-1 text-[11px] font-mono text-[#7E8794] border border-[#303640]">
                  Chart: {pnrResult.journey?.chartStatus || 'NOT PREPARED'}
                </span>
              </div>
            </div>

            {/* 2. Train & Schedule Section */}
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
                    Class: {pnrResult.train?.travelClass || '3A'}
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
                    {formatTime(pnrResult.journey?.departureTime)} · {formatDateDisplay(pnrResult.journey?.departureTime)}
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
                    {formatTime(pnrResult.journey?.arrivalTime)} · {formatDateDisplay(pnrResult.journey?.arrivalTime)}
                  </div>
                </div>
              </div>
            </div>

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
                        <td className="py-2.5 px-2 font-semibold">{p.name}</td>
                        <td className="py-2.5 px-2 text-[#A7AFBA]">
                          {p.age} yrs · <span className="capitalize">{p.gender}</span>
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
                          {p.coach ? `Coach ${p.coach} · Berth ${p.berth} (${p.berthType})` : 'Confirmed'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
  );
}

export default PnrStatusModal;
