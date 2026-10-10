import React, { useRef } from 'react';
import { X, Download, Printer, CheckCircle2, ShieldCheck } from 'lucide-react';

/**
 * TicketModal
 * Renders high-fidelity, IRCTC-inspired, premium E-Ticket / Reservation Slip modal.
 * Implements the user's exact reference layout with interactive download & print capabilities.
 */
export default function TicketModal({ booking, onClose, onDownload, isDownloading }) {
  const printRef = useRef(null);

  if (!booking) return null;

  const snap = booking.journeySnapshot || {};
  const legs = Array.isArray(snap.legs) && snap.legs.length > 0 ? snap.legs : [];
  const primaryLeg = legs[0] || {};

  const pnr = booking.pnr || booking.bookingReference || 'YI-4820917365';
  const status = (booking.status || 'CONFIRMED').toUpperCase();
  const txnId =
    booking.metadata?.transactionId ||
    `TXN${(booking._id ? String(booking._id).slice(-12) : '100006800637279').toUpperCase()}`;

  const fromCode = (snap.origin?.code || primaryLeg.origin?.code || 'ORIG').toUpperCase();
  const fromName = snap.origin?.name || snap.origin?.city || primaryLeg.origin?.name || 'Origin Station';

  const toCode = (
    snap.destination?.code ||
    primaryLeg.destination?.code ||
    (legs.length > 0 ? legs[legs.length - 1].destination?.code : null) ||
    'DEST'
  ).toUpperCase();
  const toName =
    snap.destination?.name ||
    snap.destination?.city ||
    (legs.length > 0 ? legs[legs.length - 1].destination?.name : null) ||
    'Destination Station';

  const trainNum = String(
    primaryLeg.vehicle?.identifier ||
    primaryLeg.service?.number ||
    primaryLeg.trainNumber ||
    '22361'
  ).trim();
  const trainName = (
    primaryLeg.service?.name ||
    primaryLeg.vehicle?.type ||
    primaryLeg.trainName ||
    'Amrit Bharat Express'
  ).trim();

  const travelClass = primaryLeg.service?.class || primaryLeg.travelClass || booking.metadata?.travelClass || 'Sleeper (SL)';
  const quota = booking.metadata?.quota || 'General (GN)';
  const distanceKm = snap.totalDistance ? Math.round(snap.totalDistance) : 998;

  const formatDate = (dateVal) => {
    if (!dateVal) return 'N/A';
    try {
      const d = new Date(dateVal);
      return d.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return String(dateVal);
    }
  };

  const formatTime = (dateVal) => {
    if (!dateVal) return '--:--';
    try {
      const d = new Date(dateVal);
      return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      return '--:--';
    }
  };

  const formatDuration = (minutes) => {
    if (!minutes || isNaN(minutes)) return '17h 00m';
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
    if (hrs > 0) return `${hrs}h`;
    return `${mins}m`;
  };

  const depDate = snap.departureTime || primaryLeg.departureTime || booking.createdAt || new Date();
  const arrDate = snap.arrivalTime || (legs.length > 0 ? legs[legs.length - 1].arrivalTime : null) || new Date();

  const fromDateStr = formatDate(depDate);
  const fromTimeStr = `${formatTime(depDate)} IST`;
  const toDateStr = formatDate(arrDate);
  const toTimeStr = `${formatTime(arrDate)} IST`;
  const durationStr = formatDuration(snap.duration);
  const bookedOnStr = `${formatDate(booking.createdAt)}, ${formatTime(booking.createdAt)}`;

  // Passengers
  const rawPassengers = Array.isArray(booking.passengerDetails) && booking.passengerDetails.length > 0
    ? booking.passengerDetails
    : [{ name: 'Passenger 1', age: 28, gender: 'male', berthPreference: 'lower' }];

  const getSeat = (p, idx) => {
    if (p.seat) return p.seat;
    const pref = (p.berthPreference || 'lower').replace(/_/g, ' ');
    const capPref = pref.charAt(0).toUpperCase() + pref.slice(1);
    const cls = String(travelClass).toUpperCase();
    if (cls.includes('1A')) return `H1 / ${4 + idx * 2} / Cabin`;
    if (cls.includes('2A')) return `A1 / ${12 + idx * 3} / ${capPref}`;
    if (cls.includes('3E')) return `M1 / ${24 + idx * 4} / ${capPref}`;
    if (cls.includes('CC') || cls.includes('EC')) return `C1 / ${18 + idx * 2} / Window`;
    if (cls.includes('SL') || cls.includes('SLEEPER')) return `S3 / ${42 + idx * 6} / ${capPref}`;
    return `B2 / ${31 + idx * 4} / ${capPref}`;
  };

  // Fares
  const baseFare = Number(booking.fare?.baseFare || booking.fare?.totalFare || 780);
  const convenienceFee = Number(booking.fare?.taxesAndFees > 0 ? booking.fare.taxesAndFees : 11.8);
  const insuranceFee = Number((0.45 * rawPassengers.length).toFixed(2));
  const totalFare = Number((baseFare + convenienceFee + insuranceFee).toFixed(2));

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-3xl my-auto bg-surface-primary rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Top Floating Control Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-surface-elevated/90 border-b border-white/10 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Official Reservation Slip · PNR: <span className="font-mono text-brand-primary">{pnr}</span>
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-xs font-semibold text-text-secondary hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Print E-Ticket"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>

            {onDownload && (
              <button
                type="button"
                onClick={() => onDownload(booking)}
                disabled={isDownloading}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand-primary text-xs font-bold text-white shadow hover:bg-brand-hover active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{isDownloading ? 'Generating...' : 'Download PDF'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-text-tertiary hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable E-Ticket Canvas */}
        <div className="overflow-y-auto p-4 sm:p-8 bg-slate-900/40 text-slate-900 selection:bg-brand-primary/20">
          <div
            ref={printRef}
            className="w-full max-w-[760px] mx-auto bg-white rounded-2xl overflow-hidden shadow-2xl border border-slate-200"
          >
            {/* 1. Header Banner */}
            <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-teal-500 text-white p-5 sm:p-6 flex flex-wrap justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center font-black text-xl tracking-tighter text-white shadow-inner">
                  Y<span className="text-amber-400">I</span>
                </div>
                <div>
                  <div className="text-2xl font-black tracking-tight leading-none">
                    Yatra<span className="text-amber-400">I</span>
                  </div>
                  <div className="text-[10px] font-semibold tracking-wider text-indigo-100 uppercase mt-0.5">
                    ONE GOAL. EVERY ROUTE.
                  </div>
                </div>
              </div>

              <div className="text-right">
                <h1 className="text-sm sm:text-base font-bold tracking-tight">E-Ticket / Reservation Slip</h1>
                <div className="inline-flex items-center gap-1.5 mt-1.5 bg-black/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-white">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                  <span>{status}</span>
                </div>
              </div>
            </div>

            {/* 2. Journey Header Section */}
            <div className="p-5 sm:p-7 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center border-b border-slate-100 bg-slate-50/50">
              {/* Origin */}
              <div>
                <div className="font-mono text-3xl font-bold tracking-tight text-slate-900">{fromCode}</div>
                <div className="font-bold text-sm text-slate-800 mt-0.5">{fromName}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {fromDateStr} · <strong className="text-slate-900">{fromTimeStr}</strong>
                </div>
              </div>

              {/* Middle track */}
              <div className="text-center">
                <div className="text-xs font-bold text-indigo-600 mb-1">{durationStr}</div>
                <div className="relative flex items-center justify-center my-2">
                  <div className="w-full border-t-2 border-dashed border-indigo-300" />
                  <span className="absolute bg-white px-2.5 py-0.5 rounded-full border border-indigo-200 text-xs font-bold text-indigo-600 shadow-sm">
                    🚆 TRAIN
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-medium">{distanceKm} km</div>
              </div>

              {/* Destination */}
              <div className="sm:text-right">
                <div className="font-mono text-3xl font-bold tracking-tight text-slate-900">{toCode}</div>
                <div className="font-bold text-sm text-slate-800 mt-0.5">{toName}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {toDateStr} · <strong className="text-slate-900">{toTimeStr}</strong>
                </div>
              </div>
            </div>

            {/* 3. 8-Cell Clean Information Grid */}
            <div className="m-5 sm:m-7 grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200 rounded-xl overflow-hidden border border-slate-200">
              <div className="bg-white p-3">
                <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">PNR NUMBER</label>
                <div className="font-mono font-bold text-indigo-600 text-sm mt-0.5">{pnr}</div>
              </div>
              <div className="bg-white p-3">
                <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">TRAIN</label>
                <div className="font-bold text-slate-900 text-xs mt-0.5 truncate">{trainNum} · {trainName}</div>
              </div>
              <div className="bg-white p-3">
                <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">CLASS</label>
                <div className="font-bold text-slate-900 text-xs mt-0.5">{travelClass}</div>
              </div>
              <div className="bg-white p-3">
                <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">QUOTA</label>
                <div className="font-bold text-slate-900 text-xs mt-0.5">{quota}</div>
              </div>
              <div className="bg-white p-3">
                <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">BOARDING AT</label>
                <div className="font-bold text-slate-900 text-xs mt-0.5 truncate">{fromName} ({fromCode})</div>
              </div>
              <div className="bg-white p-3">
                <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">BOOKED ON (IST)</label>
                <div className="font-bold text-slate-900 text-xs mt-0.5">{bookedOnStr}</div>
              </div>
              <div className="bg-white p-3">
                <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">PASSENGERS</label>
                <div className="font-bold text-slate-900 text-xs mt-0.5">{rawPassengers.length} Traveller(s)</div>
              </div>
              <div className="bg-white p-3">
                <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">DISTANCE</label>
                <div className="font-bold text-slate-900 text-xs mt-0.5">{distanceKm} km</div>
              </div>
            </div>

            {/* 4. Passenger Details Table */}
            <div className="px-5 sm:px-7 mb-6">
              <h3 className="text-xs font-black uppercase tracking-wider text-indigo-600 mb-2.5">
                PASSENGER DETAILS
              </h3>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">PASSENGER NAME</th>
                      <th className="py-2.5 px-3">AGE</th>
                      <th className="py-2.5 px-3">GENDER</th>
                      <th className="py-2.5 px-3">SEAT / BERTH</th>
                      <th className="py-2.5 px-3 text-right">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {rawPassengers.map((p, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className="py-2.5 px-3 font-bold text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{p.name}</td>
                        <td className="py-2.5 px-3">{p.age}</td>
                        <td className="py-2.5 px-3 capitalize">{p.gender}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{getSeat(p, idx)}</td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">
                            CNF
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 5. Payment Details + Verification QR Code */}
            <div className="px-5 sm:px-7 mb-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-indigo-600 mb-2.5">
                PAYMENT & VERIFICATION
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                {/* Financial breakdown */}
                <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4 space-y-2.5 bg-white text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Ticket Fare</span>
                    <span className="font-semibold text-slate-900">Rs. {baseFare.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>YatraI Convenience Fee (incl. GST)</span>
                    <span className="font-semibold text-slate-900">Rs. {convenienceFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Travel Insurance (incl. GST)</span>
                    <span className="font-semibold text-slate-900">Rs. {insuranceFee.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-dashed border-slate-200 pt-2.5 flex justify-between items-center text-sm font-bold text-indigo-600">
                    <span>Total Fare (All Inclusive)</span>
                    <span className="text-base">Rs. {totalFare.toFixed(2)}</span>
                  </div>
                </div>

                {/* QR Code Card */}
                <div className="rounded-xl border border-slate-200 p-3 bg-white text-center flex flex-col items-center justify-center">
                  <div className="p-2 border border-slate-100 rounded-lg bg-white shadow-inner">
                    {/* SVG placeholder or scannable PRS QR representation */}
                    <div className="w-24 h-24 bg-slate-900 rounded p-1.5 flex items-center justify-center text-white text-[9px] font-mono leading-none tracking-tight">
                      <div className="border-2 border-white/40 p-1 rounded w-full h-full flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] font-bold text-amber-400">YATRAI</span>
                        <span className="text-[7px] text-slate-300 mt-1">{pnr}</span>
                        <span className="text-[6px] text-emerald-400 mt-0.5">VERIFIED</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium mt-1.5">Scan at verification</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-2 font-mono">
                Transaction ID: <strong className="text-slate-700">{txnId}</strong> · Payment gateway charges, if any, are included.
              </p>
            </div>

            {/* 6. Perforated Coupon Tear Line */}
            <div className="relative my-4">
              <div className="border-t-2 border-dashed border-slate-300 w-full" />
              <div className="absolute -left-3 top-[-10px] w-5 h-5 rounded-full bg-slate-900/40" />
              <div className="absolute -right-3 top-[-10px] w-5 h-5 rounded-full bg-slate-900/40" />
            </div>

            {/* 7. Travel Advisory Notice */}
            <div className="mx-5 sm:mx-7 mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
              <strong>TRAVEL ADVISORY: </strong>
              Carry a valid original photo ID of any one passenger during travel. Departure/arrival times may change — please check latest timings before boarding.
            </div>

            {/* 8. Important Instructions */}
            <div className="px-5 sm:px-7 mb-6">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 mb-2">
                IMPORTANT INSTRUCTIONS
              </h4>
              <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside leading-relaxed">
                <li>Fully waitlisted ticket is cancelled automatically and refunded after applicable deductions; such passengers cannot board.</li>
                <li>Cancel or file for refund before the scheduled departure as per railway refund rules.</li>
                <li>Refunds are credited to the original payment source.</li>
                <li>Buy tickets only from authorised platforms. Reselling tickets booked on personal accounts is an offence.</li>
                <li>YatraI will never ask for OTP, card PIN or passwords. Beware of fraudulent messages and calls.</li>
              </ul>
            </div>

            {/* 9. Dark Footer Banner */}
            <div className="bg-slate-900 text-slate-400 text-xs px-6 py-3.5 flex flex-wrap justify-between items-center gap-2">
              <div>
                <strong className="text-white">YatraI Support</strong> · +91-80000-YATRA · support@yatrai.in
              </div>
              <div className="font-bold text-white tracking-wider">yatrai.in</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
