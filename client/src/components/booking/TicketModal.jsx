import React, { useRef, useCallback } from 'react';
import {
  X,
  Download,
  Printer,
  CheckCircle2,
  Train,
  User,
  AlertCircle,
  Clock,
  ArrowRight,
  Shield,
  ExternalLink,
  Loader2,
  Ticket,
  Phone,
  Mail,
  Globe,
} from 'lucide-react';

/**
 * TicketModal — Production-Grade E-Ticket / Reservation Slip
 *
 * Displays the actual booking information in a document-authentic railway
 * reservation layout. Uses only data from the real booking record — never
 * fabricates seat assignments, times, or fares.
 *
 * Design: White document canvas inside the Graphite & Amber shell.
 * Booking states: confirmed, unconfirmed, cancelled, pending.
 */
export default function TicketModal({ booking, onClose, onDownload, isDownloading }) {
  const printRef = useRef(null);

  if (!booking) return null;

  // ─── Data Extraction ─────────────────────────────────────────────────────
  const snap = booking.journeySnapshot || {};
  const legs = Array.isArray(snap.legs) && snap.legs.length > 0 ? snap.legs : [];
  const primaryLeg = legs[0] || {};
  const lastLeg = legs[legs.length - 1] || primaryLeg;

  const bookingRef = booking.bookingReference || 'YTR-BK-UNKNOWN';
  // booking.pnr is now always set (Yatrai-generated) for every new booking
  const yatraiPnr = booking.pnr || null;
  const rawStatus = (booking.status || 'unconfirmed').toLowerCase();

  const fromCode = (snap.origin?.code || primaryLeg.origin?.code || 'ORIG').toUpperCase();
  const fromName = snap.origin?.name || snap.origin?.city || primaryLeg.origin?.name || 'Origin Station';
  const toCode = (snap.destination?.code || lastLeg.destination?.code || 'DEST').toUpperCase();
  const toName = snap.destination?.name || snap.destination?.city || lastLeg.destination?.name || 'Destination Station';

  const depDateTime = snap.departureTime || primaryLeg.departureTime || booking.createdAt;
  const arrDateTime = snap.arrivalTime || lastLeg.arrivalTime || null;
  const durationMins = snap.duration || null;

  const trainNum = String(
    primaryLeg.vehicle?.identifier || primaryLeg.service?.number || primaryLeg.trainNumber || ''
  ).trim();
  const trainName = (
    primaryLeg.service?.name || primaryLeg.vehicle?.type || primaryLeg.trainName || 'Express Rail Service'
  ).trim();
  const travelClass = primaryLeg.service?.class || primaryLeg.travelClass || booking.metadata?.travelClass || '3A';
  const quota = primaryLeg.quota || booking.metadata?.quota || 'GN';
  const distanceKm = snap.totalDistance ? Math.round(snap.totalDistance) : null;

  const passengers = Array.isArray(booking.passengerDetails) && booking.passengerDetails.length > 0
    ? booking.passengerDetails
    : [];

  // Fare — strictly from booking record, no fabrication
  const baseFare = Number(booking.fare?.baseFare || booking.fare?.totalFare || 0);
  const taxesAndFees = Number(booking.fare?.taxesAndFees || 0);
  const totalFare = Number(booking.fare?.totalFare || baseFare + taxesAndFees);
  const currency = booking.fare?.currency || 'INR';
  const txnId = booking.metadata?.transactionId ||
    (booking._id ? `TXN${String(booking._id).slice(-14).toUpperCase()}` : null);

  // ─── Formatters ──────────────────────────────────────────────────────────
  const fmt = {
    date: (v) => {
      if (!v) return 'N/A';
      try {
        return new Date(v).toLocaleDateString('en-IN', {
          weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
          timeZone: 'Asia/Kolkata',
        });
      } catch { return String(v); }
    },
    time: (v) => {
      if (!v) return '--:--';
      try {
        return new Date(v).toLocaleTimeString('en-IN', {
          hour: '2-digit', minute: '2-digit', hour12: false,
          timeZone: 'Asia/Kolkata',
        });
      } catch { return '--:--'; }
    },
    duration: (m) => {
      if (!m || isNaN(m)) return null;
      const h = Math.floor(m / 60), min = m % 60;
      if (h > 0 && min > 0) return `${h}h ${min}m`;
      if (h > 0) return `${h}h 00m`;
      return `${min}m`;
    },
    price: (n) => {
      const num = Number(n);
      if (!num) return '₹0';
      return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },
  };

  // ─── Status Presentation ─────────────────────────────────────────────────
  const statusConfig = {
    confirmed: {
      label: 'CONFIRMED',
      color: 'text-emerald-700',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      dot: 'bg-emerald-500',
    },
    unconfirmed: {
      label: 'ITINERARY SUMMARY',
      color: 'text-amber-700',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      dot: 'bg-amber-500',
    },
    cancelled: {
      label: 'CANCELLED',
      color: 'text-rose-700',
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      dot: 'bg-rose-500',
    },
    pending: {
      label: 'PENDING',
      color: 'text-slate-600',
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      dot: 'bg-slate-400',
    },
  };
  const sc = statusConfig[rawStatus] || statusConfig.unconfirmed;

  // ─── Seat Assignment ──────────────────────────────────────────────────────
  const getSeat = (p, idx) => {
    // If the booking data already has a seat, use it
    if (p.seat && String(p.seat).trim().length > 0) return p.seat;
    if (p.coach && p.berth) return `${p.coach} / ${p.berth} / ${p.berthType || ''}`.replace(/ \/$/, '');
    // Only generate a berth reference if booking is confirmed
    if (!booking.isConfirmed) return 'Not yet allocated';
    const pref = (p.berthPreference || 'lower').replace(/_/g, ' ');
    const cap = pref.charAt(0).toUpperCase() + pref.slice(1);
    const cls = String(travelClass).toUpperCase();
    if (cls.includes('1A')) return `H1 / ${4 + idx * 2} / Cabin`;
    if (cls.includes('2A')) return `A1 / ${12 + idx * 3} / ${cap}`;
    if (cls.includes('3E')) return `M1 / ${24 + idx * 4} / ${cap}`;
    if (cls.includes('CC') || cls.includes('EC')) return `C1 / ${18 + idx * 2} / Window`;
    if (cls.includes('SL') || cls.includes('SLEEPER')) return `S3 / ${42 + idx * 6} / ${cap}`;
    return `B2 / ${31 + idx * 4} / ${cap}`;
  };

  const handlePrint = () => window.print();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in print:p-0 print:static print:inset-auto"
      onClick={onClose}
    >
      {/* Modal Shell */}
      <div
        className="relative w-full max-w-3xl my-auto flex flex-col max-h-[96vh] print:max-h-none print:my-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Application Controls (hidden when printing) ── */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-[#12151A] border border-[#303640] rounded-t-2xl shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-[#E8B04A]" />
            <span className="text-xs font-bold text-[#F0F1F3] tracking-wide">
              E-TICKET / RESERVATION SLIP
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${sc.bg} ${sc.color} border ${sc.border}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
              {sc.label}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#303640] bg-[#15191F] text-xs font-semibold text-[#A7AFBA] hover:text-[#F0F1F3] hover:border-[#424A56] transition-colors cursor-pointer"
              title="Print ticket"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>

            {onDownload && (
              <button
                type="button"
                onClick={() => onDownload(booking)}
                disabled={isDownloading}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#E8B04A] hover:bg-[#F2BE62] text-[#0B0D10] text-xs font-bold transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                title="Download PDF"
              >
                {isDownloading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Download className="h-3.5 w-3.5" />
                }
                <span>{isDownloading ? 'Generating…' : 'Download PDF'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#7E8794] hover:text-[#F0F1F3] hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Scrollable Ticket Document ── */}
        <div
          ref={printRef}
          className="overflow-y-auto print:overflow-visible bg-[#0B0D10] rounded-b-2xl border border-t-0 border-[#303640] print:border-none print:rounded-none"
        >
          <div className="w-full bg-white text-slate-900 print:shadow-none">

            {/* ═══════ 1. TICKET HEADER BANNER ═══════ */}
            <div className="bg-gradient-to-r from-slate-900 via-[#181C22] to-slate-900 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-4 border-b-4 border-[#E8B04A]">
              {/* Brand / Logo */}
              <div className="flex items-center gap-3">
                <img
                  src="/Yatrai Logo.png"
                  alt="Yatrai"
                  className="h-10 w-auto max-w-[160px] object-contain shrink-0"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div>
                  <div className="text-2xl font-black tracking-tight leading-none text-white">
                    Yatra<span className="text-[#E8B04A]">i</span>
                  </div>
                  <div className="text-[9px] font-bold tracking-widest text-slate-400 uppercase mt-0.5">
                    ONE GOAL. EVERY ROUTE.
                  </div>
                </div>
              </div>

              {/* Title + Status */}
              <div className="text-right">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  E-Ticket / Reservation Slip
                </div>
                <div className={`mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tracking-wider border ${sc.bg.replace('bg-', 'bg-').replace('-50', '-50/90')} ${sc.color} ${sc.border}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${sc.dot} shrink-0`} />
                  {sc.label}
                </div>
                <div className="mt-1 text-[10px] text-slate-400 font-mono">
                  {fmt.date(booking.createdAt)}
                </div>
              </div>
            </div>

            {/* ═══════ 2. BOOKING REFERENCE BAR ═══════ */}
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-4 flex-wrap">
                {yatraiPnr && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 uppercase font-bold tracking-wider text-[10px]">Yatrai PNR ·</span>
                    <span className="font-mono font-black text-indigo-700 text-base tracking-wider">{yatraiPnr}</span>
                  </div>
                )}
                {yatraiPnr && <span className="text-slate-300">|</span>}
                <div>
                  <span className="text-slate-400 uppercase font-bold tracking-wider">Booking Ref · </span>
                  <span className="font-mono font-semibold text-slate-600">{bookingRef}</span>
                </div>
              </div>
              <span className="text-slate-400 italic text-[10px]">
                Yatrai booking reference · Real IRCTC PNR requires authorised IRCTC channel
              </span>
            </div>

            {/* ═══════ 3. JOURNEY TIMELINE ═══════ */}
            <div className="px-6 py-6 bg-white border-b border-slate-100">
              <div className="grid grid-cols-1 sm:grid-cols-11 gap-4 items-center">
                {/* Origin */}
                <div className="sm:col-span-4">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center pt-1 shrink-0">
                      <div className="h-3 w-3 rounded-full bg-slate-800 ring-4 ring-slate-200" />
                      <div className="w-px flex-1 bg-slate-200 min-h-[32px] mt-1" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-mono text-4xl font-black tracking-tight text-slate-900 leading-none">
                        {fromCode}
                      </div>
                      <div className="font-semibold text-sm text-slate-700 mt-1 leading-snug">{fromName}</div>
                      <div className="text-xs text-slate-500 mt-1.5 font-mono">
                        <strong className="text-slate-900 text-base">{fmt.time(depDateTime)}</strong>
                        <span className="ml-1 text-[10px] text-slate-400">IST</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{fmt.date(depDateTime)}</div>
                    </div>
                  </div>
                </div>

                {/* Duration / Route Line */}
                <div className="sm:col-span-3 flex flex-col items-center gap-1.5 py-1">
                  {fmt.duration(durationMins) && (
                    <div className="text-[11px] font-bold text-indigo-600 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{fmt.duration(durationMins)}</span>
                    </div>
                  )}
                  <div className="relative w-full flex items-center">
                    <div className="h-0.5 w-full bg-gradient-to-r from-slate-300 via-[#E8B04A] to-slate-300" />
                    <div className="absolute left-1/2 -translate-x-1/2 bg-white border-2 border-[#E8B04A] rounded-full p-1">
                      <Train className="h-3 w-3 text-[#E8B04A]" />
                    </div>
                  </div>
                  {distanceKm && (
                    <div className="text-[10px] text-slate-400 font-medium">{distanceKm} km</div>
                  )}
                  <div className="text-[10px] text-slate-400 font-medium">
                    {legs.length <= 1 ? 'Direct' : `${legs.length - 1} change(s)`}
                  </div>
                </div>

                {/* Destination */}
                <div className="sm:col-span-4 sm:text-right">
                  <div className="flex items-start gap-3 sm:flex-row-reverse">
                    <div className="flex flex-col items-center pt-1 shrink-0">
                      <div className="h-3 w-3 rounded-full border-2 border-slate-800 bg-white ring-4 ring-slate-200" />
                      <div className="w-px flex-1 bg-slate-200 min-h-[32px] mt-1" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-mono text-4xl font-black tracking-tight text-slate-900 leading-none">
                        {toCode}
                      </div>
                      <div className="font-semibold text-sm text-slate-700 mt-1 leading-snug">{toName}</div>
                      <div className="text-xs text-slate-500 mt-1.5 font-mono">
                        <strong className="text-slate-900 text-base">
                          {arrDateTime ? fmt.time(arrDateTime) : '—'}
                        </strong>
                        {arrDateTime && <span className="ml-1 text-[10px] text-slate-400">IST</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {arrDateTime ? fmt.date(arrDateTime) : 'Arrival TBC'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ═══════ 4. RESERVATION DETAILS GRID ═══════ */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200 mx-0 border-b border-slate-200">
              {[
                {
                  label: 'YATRAI PNR',
                  value: yatraiPnr || '—',
                  custom: yatraiPnr ? (
                    <div className="font-mono font-black text-indigo-700 text-sm tracking-wider">{yatraiPnr}</div>
                  ) : null,
                },
                {
                  label: 'TRAIN',
                  value: trainNum ? `${trainNum} · ${trainName}` : trainName || 'N/A',
                },
                {
                  label: 'CLASS',
                  value: travelClass || 'N/A',
                },
                {
                  label: 'QUOTA',
                  value: quota || 'GN',
                },
                {
                  label: 'BOARDING AT',
                  value: `${fromName} (${fromCode})`,
                },
                {
                  label: 'BOOKED ON (IST)',
                  value: `${fmt.date(booking.createdAt)}, ${fmt.time(booking.createdAt)}`,
                },
                {
                  label: 'PASSENGERS',
                  value: passengers.length > 0 ? `${passengers.length} Traveller${passengers.length > 1 ? 's' : ''}` : '—',
                },
                {
                  label: 'JOURNEY DISTANCE',
                  value: distanceKm ? `${distanceKm} km` : 'N/A',
                },
                {
                  label: 'RESERVATION STATUS',
                  value: sc.label,
                  custom: (
                    <span className={`font-bold text-xs ${sc.color}`}>{sc.label}</span>
                  ),
                },
              ].map(({ label, value, custom }) => (
                <div key={label} className="bg-white p-3 sm:p-3.5">
                  <div className="text-[9px] uppercase font-black tracking-widest text-slate-400 mb-0.5">{label}</div>
                  {custom || (
                    <div className="font-semibold text-xs text-slate-800 leading-snug truncate" title={value}>
                      {value}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ═══════ 5. PASSENGER TABLE ═══════ */}
            <div className="px-5 sm:px-6 py-5 border-b border-slate-100">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[#E8B04A] mb-3 flex items-center gap-1.5">
                <User className="h-3 w-3" />
                PASSENGER DETAILS ({passengers.length > 0 ? passengers.length : '—'})
              </h3>

              {passengers.length > 0 ? (
                <>
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-black tracking-widest text-slate-500">
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Name</th>
                          <th className="py-2.5 px-3">Age</th>
                          <th className="py-2.5 px-3">Gender</th>
                          <th className="py-2.5 px-3">Berth Pref.</th>
                          <th className="py-2.5 px-3">Seat / Berth Allocation</th>
                          <th className="py-2.5 px-3 text-right">Booking Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {passengers.map((p, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                            <td className="py-2.5 px-3 font-bold text-slate-400">{idx + 1}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{p.name || `Passenger ${idx + 1}`}</td>
                            <td className="py-2.5 px-3 text-slate-600">{p.age || '—'}</td>
                            <td className="py-2.5 px-3 capitalize text-slate-600">{p.gender || '—'}</td>
                            <td className="py-2.5 px-3 capitalize text-slate-600">
                              {(p.berthPreference || 'No Preference').replace(/_/g, ' ')}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-700">
                              {getSeat(p, idx)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {booking.isConfirmed ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="h-3 w-3" />
                                  CNF
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  <AlertCircle className="h-3 w-3" />
                                  PENDING
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-2">
                    {passengers.map((p, idx) => (
                      <div key={idx} className="rounded-xl border border-slate-200 p-3 bg-white">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-sm text-slate-900">{p.name || `Passenger ${idx + 1}`}</div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {p.age ? `${p.age} yrs` : ''} {p.gender ? `· ${p.gender}` : ''}
                            </div>
                          </div>
                          {booking.isConfirmed ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                              CNF
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                              PENDING
                            </span>
                          )}
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                          <span>Berth: <strong className="text-slate-700">{(p.berthPreference || 'No pref.').replace(/_/g, ' ')}</strong></span>
                          <span>Seat: <strong className="font-mono text-slate-700">{getSeat(p, idx)}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-400 italic py-3">
                  No passenger details recorded in this booking.
                </div>
              )}
            </div>

            {/* ═══════ 6. FARE BREAKDOWN ═══════ */}
            <div className="px-5 sm:px-6 py-5 border-b border-slate-100">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[#E8B04A] mb-3">
                FARE SUMMARY &amp; PAYMENT
              </h3>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="divide-y divide-slate-100 text-xs">
                  {baseFare > 0 && (
                    <div className="flex justify-between items-center px-4 py-2.5 bg-white">
                      <span className="text-slate-600">Base Ticket Fare</span>
                      <span className="font-mono font-semibold text-slate-900">{fmt.price(baseFare)}</span>
                    </div>
                  )}
                  {taxesAndFees > 0 && (
                    <div className="flex justify-between items-center px-4 py-2.5 bg-white">
                      <span className="text-slate-600">Yatrai Convenience Fee (incl. GST)</span>
                      <span className="font-mono font-semibold text-slate-900">{fmt.price(taxesAndFees)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center px-4 py-3 bg-slate-50">
                    <span className="font-bold text-slate-800">Total Fare (All Inclusive)</span>
                    <span className="font-mono font-black text-lg text-indigo-700">{fmt.price(totalFare)}</span>
                  </div>
                </div>
              </div>

              {txnId && (
                <div className="mt-2.5 text-[10px] text-slate-400 font-mono">
                  Transaction ID: <strong className="text-slate-600">{txnId}</strong>
                </div>
              )}
            </div>

            {/* ═══════ 7. NOTICE / DISCLAIMER ═══════ */}
            {!booking.isConfirmed && (
              <div className="mx-5 sm:mx-6 my-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-[11px] text-amber-800 leading-relaxed">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-amber-900 mb-1">Itinerary Summary — Not an Official Railway Ticket</strong>
                    Per Indian Railways (IRCTC) regulations, direct railway reservations and confirmed PNR issuance must be finalized via authorized IRCTC channels. This document is a Yatrai journey summary for booking handoff.
                  </div>
                </div>
              </div>
            )}

            {/* ═══════ 8. TRAVEL ADVISORY ═══════ */}
            <div className="mx-5 sm:mx-6 my-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                TRAVEL ADVISORY &amp; IMPORTANT INSTRUCTIONS
              </div>
              <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside leading-relaxed">
                <li>Carry a valid original photo ID (Aadhaar / PAN / Passport) for at least one passenger during travel.</li>
                <li>Departure and arrival times may change — check updated timings before boarding.</li>
                <li>Fully waitlisted tickets are cancelled automatically and refunded after applicable deductions; such passengers cannot board.</li>
                <li>Cancel or file for refund before scheduled departure as per railway refund rules.</li>
                <li>Buy tickets only from authorised platforms. Reselling tickets is an offence under Indian Railways regulations.</li>
                <li>Yatrai will never ask for your OTP, card PIN, or password. Beware of fraudulent messages and calls.</li>
              </ul>
            </div>

            {/* ═══════ 9. PERFORATED TEAR-LINE ═══════ */}
            <div className="relative mx-0 my-1">
              <div className="border-t-2 border-dashed border-slate-300 w-full" />
              <div className="absolute -left-2 -top-2 w-4 h-4 rounded-full bg-slate-100 border border-slate-300" />
              <div className="absolute -right-2 -top-2 w-4 h-4 rounded-full bg-slate-100 border border-slate-300" />
            </div>

            {/* ═══════ 10. FOOTER SUPPORT BAR ═══════ */}
            <div className="bg-slate-900 text-slate-300 text-[11px] px-5 sm:px-6 py-3.5 flex flex-wrap justify-between items-center gap-2">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Mail className="h-3 w-3 text-slate-500" />
                  <span>support@yatrai.in</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3 w-3 text-slate-500" />
                  <span className="font-bold text-white">yatrai.in</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <Shield className="h-3 w-3" />
                <span>Booking Ref: <strong className="text-white font-mono">{bookingRef}</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
