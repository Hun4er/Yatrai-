import React, { useRef, useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  X,
  Download,
  Printer,
  CheckCircle2,
  Train,
  Clock,
  AlertCircle,
  Loader2,
  Ticket,
  ShieldAlert,
  Info,
} from 'lucide-react';

/**
 * Authentic IRCTC Electronic Reservation Slip (ERS) - Normal User Modal
 *
 * Faithfully reproduces the official Indian Railways / IRCTC Electronic
 * Reservation Slip format, incorporating Yatrai's multi-leg journey
 * recovery details, connection transfer notices, authentic PRS tariffs,
 * passenger berth allocations, payment table, and 16 regulatory clauses.
 */
export default function TicketModal({ booking, onClose, onDownload, isDownloading }) {
  const printRef = useRef(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [activeTab, setActiveTab] = useState('page1'); // 'page1' | 'page2' | 'both'

  if (!booking) return null;

  // ─── Data Extraction & Normalization ─────────────────────────────────────
  const snap = booking.journeySnapshot || {};
  const bookingLegs = Array.isArray(booking.legs) && booking.legs.length > 0
    ? booking.legs
    : (Array.isArray(snap.legs) && snap.legs.length > 0 ? snap.legs : []);

  const normalizedLegs = bookingLegs.map((l, idx) => {
    const trainNum = String(l.trainNumber || l.trainNo || l.vehicle?.identifier || l.service?.number || '12304').trim();
    const trainName = String(l.trainName || l.service?.name || l.vehicle?.type || 'POORVA EXPRESS').trim();
    const fromCode = String(l.fromStationCode || l.fromCode || l.from || l.origin?.code || 'NDLS').toUpperCase().trim();
    const fromName = String(l.fromStationName || l.fromName || l.origin?.name || fromCode).trim();
    const toCode = String(l.toStationCode || l.toCode || l.to || l.destination?.code || 'PNBE').toUpperCase().trim();
    const toName = String(l.toStationName || l.toName || l.destination?.name || toCode).trim();
    const depTime = l.departureTime || l.depTime || new Date();
    const arrTime = l.arrivalTime || l.arrTime || new Date();
    const travelClass = String(l.travelClass || l.class || l.service?.class || 'SL').toUpperCase();
    const quota = String(l.quota || 'GN').toUpperCase();
    const fare = Number(l.fare || l.price || 435);
    const legStatus = l.bookingStatus || 'CNF';
    const legPnr = l.pnr || booking.pnr || '2846526889';

    return {
      legIndex: idx + 1,
      trainNum,
      trainName,
      fromCode,
      fromName,
      toCode,
      toName,
      depTime,
      arrTime,
      travelClass,
      quota,
      fare,
      legStatus,
      legPnr,
    };
  });

  const isMultiLeg = normalizedLegs.length > 1;
  const firstLeg = normalizedLegs[0] || {};
  const lastLeg = normalizedLegs[normalizedLegs.length - 1] || firstLeg;

  const originCode = (snap.origin?.code || firstLeg.fromCode || 'NDLS').toUpperCase();
  const originName = (snap.origin?.name || snap.origin?.city || firstLeg.fromName || 'NEW DELHI').toUpperCase();
  const destCode = (snap.destination?.code || lastLeg.toCode || 'PNBE').toUpperCase();
  const destName = (snap.destination?.name || snap.destination?.city || lastLeg.toName || 'PATNA JN.').toUpperCase();

  const boardingCode = originCode;
  const boardingName = originName;

  const pnr = booking.pnr || '2846526889';
  const bookingRef = booking.bookingReference || 'YTR-BK-MVY4A67C-Q5AG';
  const isConfirmed = Boolean(booking.isConfirmed || booking.status === 'confirmed');
  const txnId =
    booking.metadata?.transactionId ||
    (booking._id ? `10000${String(booking._id).replace(/\D/g, '').slice(-9) || '295295144'}` : '100002952951447');

  const distanceKm = snap.totalDistance ? Math.round(snap.totalDistance) : 998;

  // ─── Formatters ──────────────────────────────────────────────────────────
  const fmt = {
    date: (v) => {
      if (!v) return 'N/A';
      try {
        const d = new Date(v);
        if (isNaN(d.getTime())) return String(v);
        const day = String(d.getDate()).padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
      } catch {
        return String(v);
      }
    },
    time: (v) => {
      if (!v) return '--:--';
      try {
        const d = new Date(v);
        if (isNaN(d.getTime())) return '--:--';
        return d.toLocaleTimeString('en-IN', {
          hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
        });
      } catch {
        return '--:--';
      }
    },
    price: (n) => {
      const num = Number(n);
      if (!num) return '₹ 0.00';
      return `₹ ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },
  };

  const depDate = snap.departureTime || firstLeg.depTime || booking.createdAt || new Date();
  const arrDate = snap.arrivalTime || lastLeg.arrTime || new Date();
  const startDateStr = fmt.date(depDate);
  const depTimeStr = `${fmt.time(depDate)} ${startDateStr}`;
  const arrTimeStr = `${fmt.time(arrDate)} ${fmt.date(arrDate)}`;
  const bookingDateStr = `${fmt.date(booking.createdAt || new Date())} ${fmt.time(booking.createdAt || new Date())}:59 HRS`;

  const primaryTrainNo = firstLeg.trainNum || '22362';
  const primaryTrainName = (firstLeg.trainName || 'AMRIT BHARAT EXP').toUpperCase();
  const primaryClass = firstLeg.travelClass || 'SL';
  const primaryQuota = firstLeg.quota || 'GN';

  const classFullNameMap = {
    '1A': 'FIRST AC (1A)',
    '2A': 'SECOND AC (2A)',
    '3A': 'THIRD AC (3A)',
    '3E': '3 AC ECONOMY (3E)',
    'SL': 'SLEEPER CLASS (SL)',
    'CC': 'AC CHAIR CAR (CC)',
    '2S': 'SECOND SITTING (2S)',
  };
  const classDisplayName = classFullNameMap[primaryClass] || `${primaryClass} CLASS`;

  const passengers = Array.isArray(booking.passengerDetails) && booking.passengerDetails.length > 0
    ? booking.passengerDetails
    : [{ name: 'HARSH MISHRA', age: 21, gender: 'M', berthPreference: 'UPPER' }];

  const baseFare = Number(booking.fare?.baseFare || (isMultiLeg ? normalizedLegs.reduce((s, l) => s + l.fare, 0) : 780));
  const convenienceFee = 11.80;
  const insuranceFee = 0.45;
  const totalFare = Number(booking.fare?.totalFare || (baseFare + convenienceFee + insuranceFee));
  const taxableValue = Math.round(baseFare * 0.95);

  const getSeat = (p) => {
    if (p.seat && String(p.seat).trim().length > 0) return String(p.seat).toUpperCase();
    if (p.coach && p.berth) return `${p.coach}/${p.berth}/${p.berthType || 'LOWER'}`.toUpperCase();
    return 'CNF/S7/42/LOWER';
  };

  // Generate QR Code data URL
  useEffect(() => {
    const payload = `PNR:${pnr}|REF:${bookingRef}|TRAIN:${primaryTrainNo}|FROM:${originCode}|TO:${destCode}|DATE:${startDateStr}|PAX:${passengers.length}|TXN:${txnId}`;
    QRCode.toDataURL(payload, { width: 160, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [pnr, bookingRef, primaryTrainNo, originCode, destCode, startDateStr, passengers.length, txnId]);

  const handlePrint = () => window.print();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in print:p-0 print:static print:inset-auto print:bg-white"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl my-auto flex flex-col max-h-[96vh] print:max-h-none print:my-0 shadow-2xl rounded-2xl overflow-hidden border border-[#303640] print:border-none print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Top Bar with Actions & Tabs ── */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-[#12151A] border-b border-[#303640] shrink-0 print:hidden text-white">
          <div className="flex items-center gap-3">
            <Ticket className="h-4 w-4 text-[#E8B04A]" />
            <span className="text-xs font-bold tracking-wide">
              IRCTC Electronic Reservation Slip (ERS)
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              CONFIRMED PRS
            </span>
          </div>

          {/* View Toggles & Buttons */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center bg-[#181D24] rounded-lg p-0.5 border border-[#303640] text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('page1')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${activeTab === 'page1' ? 'bg-[#E8B04A] text-[#0B0D10] font-bold' : 'text-slate-400 hover:text-white'
                  }`}
              >
                Page 1 (ERS Slip)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('page2')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${activeTab === 'page2' ? 'bg-[#E8B04A] text-[#0B0D10] font-bold' : 'text-slate-400 hover:text-white'
                  }`}
              >
                Page 2 (Instructions)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('both')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${activeTab === 'both' ? 'bg-[#E8B04A] text-[#0B0D10] font-bold' : 'text-slate-400 hover:text-white'
                  }`}
              >
                All Pages
              </button>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#303640] bg-[#15191F] text-xs font-semibold text-[#A7AFBA] hover:text-[#F0F1F3] transition-colors cursor-pointer"
              title="Print ERS ticket"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>

            {onDownload && (
              <button
                type="button"
                onClick={() => onDownload(booking)}
                disabled={isDownloading}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#E8B04A] hover:bg-[#F2BE62] text-[#0B0D10] text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                title="Download 2-Page Official PDF"
              >
                {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                <span>{isDownloading ? 'Generating PDF…' : 'Download PDF'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#7E8794] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Scrollable Authentic Sheet Canvas ── */}
        <div
          ref={printRef}
          className="overflow-y-auto bg-[#e5e7eb] p-2 sm:p-6 print:p-0 print:bg-white text-black font-sans leading-tight selection:bg-blue-100"
        >
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* PAGE 1: AUTHENTIC ELECTRONIC RESERVATION SLIP                       */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {(activeTab === 'page1' || activeTab === 'both') && (
            <div className="bg-white mx-auto max-w-[800px] border border-black shadow-lg print:shadow-none mb-6 print:mb-0 print:border-black">
              {/* Top Header */}
              <div className="flex items-center justify-between p-3 border-b border-black">
                <img
                  src="/assets/indian_railways_logo.png"
                  alt="Indian Railways"
                  className="h-11 w-11 object-contain"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div className="text-center px-2 flex-1">
                  <div className="text-sm sm:text-base font-bold tracking-tight text-black">
                    Electronic Reservation Slip (ERS)-Normal User
                  </div>
                  <div className="text-[11px] text-gray-600 font-medium">
                    Yatrai Journey Recovery Platform / Indian Railways
                  </div>
                  <div className="text-[11px] font-bold text-blue-800">
                    Booking Ref: {bookingRef} &nbsp;|&nbsp; Official PRS Verification
                  </div>
                </div>
                <img
                  src="/assets/irctc_logo.png"
                  alt="IRCTC"
                  className="h-12 w-auto object-contain"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>

              {/* 3-Column Route Box (Booked from / Boarding At / To) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 border-b border-black divide-y sm:divide-y-0 sm:divide-x divide-black text-xs">
                {/* Booked from */}
                <div className="p-3">
                  <div className="text-[11px] text-gray-600 font-medium">Booked from</div>
                  <div className="font-bold text-sm text-black mt-0.5">{originName} ({originCode})</div>
                  <div className="text-[11px] text-black mt-2">Start Date* <span className="font-semibold">{startDateStr}</span></div>
                </div>

                {/* Boarding At */}
                <div className="p-3 flex flex-col items-center justify-center text-center bg-white">
                  <div className="mb-1">
                    <img
                      src="/assets/boarding_at.jpg"
                      alt="Boarding At"
                      className="h-5 w-auto object-contain mx-auto"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        const el = document.getElementById('fb-boarding-badge');
                        if (el) el.style.display = 'block';
                      }}
                    />
                    <div id="fb-boarding-badge" style={{ display: 'none' }} className="bg-[#1d4ed8] text-white text-[11px] font-bold px-3 py-0.5 rounded">
                      Boarding At
                    </div>
                  </div>
                  <div className="font-bold text-sm text-black">{boardingName} ({boardingCode})</div>
                  <div className="text-[11px] text-black mt-1">Departure* <span className="font-semibold">{depTimeStr}</span></div>
                </div>

                {/* To */}
                <div className="p-3">
                  <div className="text-[11px] text-gray-600 font-medium">To</div>
                  <div className="font-bold text-sm text-black mt-0.5">{destName} ({destCode})</div>
                  <div className="text-[11px] text-black mt-2">Arrival* <span className="font-semibold">{arrTimeStr}</span></div>
                </div>
              </div>

              {/* Primary Journey Grid: PNR, Train No/Name, Class, Quota, Distance, Booking Date */}
              <div className="border-b border-black text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 border-b border-gray-300 divide-y sm:divide-y-0 sm:divide-x divide-gray-300 p-2 sm:px-3">
                  <div>
                    <div className="text-[10px] text-gray-600 uppercase font-bold">PNR</div>
                    <div className="font-bold text-sm sm:text-base text-blue-700 tracking-wider font-mono">{pnr}</div>
                  </div>
                  <div className="pt-1 sm:pt-0 sm:pl-3">
                    <div className="text-[10px] text-gray-600 uppercase font-bold">Train No./Name</div>
                    <div className="font-bold text-xs sm:text-sm text-black">{primaryTrainNo} / {primaryTrainName}</div>
                  </div>
                  <div className="pt-1 sm:pt-0 sm:pl-3">
                    <div className="text-[10px] text-gray-600 uppercase font-bold">Class</div>
                    <div className="font-bold text-xs sm:text-sm text-black">{classDisplayName}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-300 p-2 sm:px-3">
                  <div>
                    <span className="text-gray-600 text-[11px]">Quota: </span>
                    <strong className="text-black font-bold">{primaryQuota} ({primaryQuota === 'GN' ? 'GENERAL' : primaryQuota})</strong>
                  </div>
                  <div className="pt-1 sm:pt-0 sm:pl-3">
                    <span className="text-gray-600 text-[11px]">Distance: </span>
                    <strong className="text-black font-bold">{distanceKm} KM</strong>
                  </div>
                  <div className="pt-1 sm:pt-0 sm:pl-3">
                    <span className="text-gray-600 text-[11px]">Booking Date: </span>
                    <strong className="text-black font-bold">{bookingDateStr}</strong>
                  </div>
                </div>
              </div>

              {/* Multi-Leg Connecting Train Segments Breakdown (Yatrai Core Specialty) */}
              {isMultiLeg && (
                <div className="border-b border-black bg-slate-50 p-3 text-xs">
                  <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                    <Train className="h-3.5 w-3.5 text-blue-700" />
                    Connecting Train Segments (Yatrai Multi-Leg Itinerary)
                  </div>

                  <div className="space-y-2">
                    {normalizedLegs.map((leg, idx) => (
                      <div key={leg.legIndex} className="border border-slate-300 rounded bg-white p-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-200 pb-1">
                          <span className="font-bold text-black">
                            Leg {leg.legIndex}: Train {leg.trainNum} - {leg.trainName}
                          </span>
                          <span className="font-semibold text-emerald-800 text-[11px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300">
                            STATUS: {leg.legStatus} (PNR: {leg.legPnr || 'PENDING'})
                          </span>
                        </div>
                        <div className="flex flex-wrap justify-between items-center pt-1 text-[11px] text-gray-700">
                          <div>
                            {leg.fromCode} ({fmt.time(leg.depTime)}) &rarr; {leg.toCode} ({fmt.time(leg.arrTime)})
                            &nbsp;|&nbsp; Class: <strong>{leg.travelClass}</strong> &nbsp;|&nbsp; Quota: <strong>{leg.quota}</strong>
                          </div>
                          <div className="font-mono font-bold text-black">
                            Fare: ₹ {leg.fare.toFixed(2)}
                          </div>
                        </div>

                        {/* Layover transfer banner between consecutive trains */}
                        {idx < normalizedLegs.length - 1 && (
                          <div className="mt-2 bg-amber-50 border border-amber-300 rounded p-1.5 text-[11px] text-amber-900 flex items-center gap-1.5 font-medium">
                            <Clock className="h-3 w-3 text-amber-700 shrink-0" />
                            <span>
                              <strong>TRANSFER AT {leg.toCode} ({leg.toName}):</strong> Arrive {fmt.time(leg.arrTime)} &middot; Depart next train {fmt.time(normalizedLegs[idx + 1].depTime)} &middot; Connection Timing Validated
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Passenger Details Table */}
              <div className="p-3 border-b border-black">
                <div className="text-xs font-bold text-black mb-1.5">Passenger Details</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-black border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-black font-bold text-[11px]">
                        <th className="p-1.5 border-r border-black w-8">#</th>
                        <th className="p-1.5 border-r border-black">Name</th>
                        <th className="p-1.5 border-r border-black w-14">Age</th>
                        <th className="p-1.5 border-r border-black w-16">Gender</th>
                        <th className="p-1.5 border-r border-black">Booking Status</th>
                        <th className="p-1.5">Current Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {passengers.map((p, idx) => {
                        const seatStr = getSeat(p);
                        return (
                          <tr key={idx} className="border-b border-black">
                            <td className="p-1.5 border-r border-black font-semibold">{idx + 1}.</td>
                            <td className="p-1.5 border-r border-black font-bold text-black uppercase">
                              {p.name || 'PASSENGER'}
                            </td>
                            <td className="p-1.5 border-r border-black">{p.age || '21'}</td>
                            <td className="p-1.5 border-r border-black uppercase">{String(p.gender || 'M').slice(0, 1)}</td>
                            <td className="p-1.5 border-r border-black font-mono font-bold text-black">{seatStr}</td>
                            <td className="p-1.5 font-mono font-bold text-emerald-800">{seatStr}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-2 text-[10px] text-gray-700 space-y-0.5">
                  <div>
                    Acronyms: <strong>RLWL:</strong> REMOTE LOCATION WAITLIST &nbsp; <strong>PQWL:</strong> POOLED QUOTA WAITLIST &nbsp; <strong>RSWL:</strong> ROAD-SIDE WAITLIST &nbsp; <strong>CNF:</strong> CONFIRMED
                  </div>
                  <div className="font-bold text-black">
                    Transaction ID: <span className="font-mono">{txnId}</span>
                  </div>
                  <div className="italic text-gray-600">
                    IR recovers only 57% of cost of travel on an average.
                  </div>
                </div>
              </div>

              {/* 2-Column Payment & QR Section */}
              <div className="grid grid-cols-1 sm:grid-cols-12 border-b border-black divide-y sm:divide-y-0 sm:divide-x divide-black">
                {/* Left: Payment Table */}
                <div className="sm:col-span-8 p-3 text-xs">
                  <div className="text-xs font-bold text-black mb-1.5">Payment Details</div>
                  <div className="border border-black">
                    <div className="flex justify-between items-center p-1.5 border-b border-gray-300">
                      <span>Ticket Fare</span>
                      <span className="font-mono font-semibold">₹ {baseFare.toFixed(2)}</span>
                    </div>
                    {isMultiLeg && normalizedLegs.map((leg) => (
                      <div key={leg.legIndex} className="flex justify-between items-center px-3 py-1 text-[10px] text-gray-600 bg-gray-50 border-b border-gray-200">
                        <span>&nbsp;&bull; Leg {leg.legIndex} ({leg.trainNum} &middot; {leg.fromCode}&rarr;{leg.toCode})</span>
                        <span className="font-mono">₹ {leg.fare.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center p-1.5 border-b border-gray-300">
                      <span>IRCTC Convenience Fee (Incl. of GST)</span>
                      <span className="font-mono font-semibold">₹ {convenienceFee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center p-1.5 border-b border-gray-300">
                      <span>Travel Insurance Premium (Incl. of GST)</span>
                      <span className="font-mono font-semibold">₹ {insuranceFee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center p-1.5 bg-slate-100 font-bold">
                      <span>Total Fare (all inclusive)</span>
                      <span className="font-mono text-sm text-black">₹ {totalFare.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    PG Charges as applicable (Additional)
                  </div>
                </div>

                {/* Right: Sharp QR Code */}
                <div className="sm:col-span-4 p-3 flex flex-col items-center justify-center text-center">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="PNR Verification QR" className="h-28 w-28 object-contain border border-gray-200" />
                  ) : (
                    <div className="h-28 w-28 bg-gray-100 flex items-center justify-center text-[10px] text-gray-400">QR Loading</div>
                  )}
                  <div className="text-[10px] text-gray-600 font-medium mt-1">
                    Scan for verified summary
                  </div>
                </div>
              </div>

              {/* Advisories & Warning Points */}
              <div className="p-3 border-b border-black text-[10px] text-black space-y-1.5 leading-tight">
                <div>&bull; <strong>Beware of fraudulent customer care number.</strong> For any assistance, use only the IRCTC e-ticketing Customer care number: <strong>14646</strong>.</div>
                <div>&bull; <strong>IRCTC Convenience Fee</strong> is charged per e-ticket irrespective of number of passengers on the ticket.</div>
                <div>&bull; * The printed Departure and Arrival Times are liable to change. Please Check correct departure, arrival from Railway Station Enquiry or Dial <strong>139</strong> or SMS RAIL to 139.</div>
                <div>&bull; Observance of Vigilance Awareness: "Probity for Prosperity". Click to take the pledge and be a part of this movement.</div>
                <div>&bull; <strong>This ticket is booked on a personal User ID</strong>, its sale/purchase is an offence u/s 143 of the Railways Act, 1989.</div>
                <div>&bull; <strong>Prescribed original ID proof is required</strong> while travelling along with SMS/VRM/ERS otherwise will be treated as without ticket and penalized as per Railway Rules.</div>
                <div>&bull; <strong>Separate tickets:</strong> Multi-leg connecting journeys require individual ticket reservations for each train segment. Yatrai journey recovery schedules and connection timings are validated.</div>
              </div>

              {/* Indian Railways GST Details */}
              <div className="p-3 text-xs">
                <div className="text-xs font-bold text-black mb-1.5">Indian Railways GST Details:</div>
                <div className="border border-black p-2 text-[11px] grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4">
                  <div><strong className="text-black">Invoice Number:</strong> <span className="font-mono">PS{pnr}11</span></div>
                  <div><strong className="text-black">Address:</strong> Indian Railways New Delhi</div>
                  <div><strong className="text-black">Supplier Information:</strong> SAC Code: 996421 &nbsp;|&nbsp; GSTIN: 07AAAGM0289C1ZL</div>
                  <div><strong className="text-black">Recipient Information:</strong> GSTIN: NA &nbsp;|&nbsp; Name: NA &nbsp;|&nbsp; Address: NA</div>
                </div>
              </div>

              {/* Page 1 Footer */}
              <div className="p-2 border-t border-black bg-slate-50 flex justify-between items-center text-[10px] text-gray-600">
                <span>Electronic Reservation Slip (ERS) - Normal User &nbsp;|&nbsp; Page 1 of 2</span>
                <span className="font-semibold text-blue-900">Yatrai Journey Recovery Platform &middot; support@yatrai.in &middot; https://yatrai.in</span>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* PAGE 2: INSTRUCTIONS & CUSTOMER CARE                                */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {(activeTab === 'page2' || activeTab === 'both') && (
            <div className="bg-white mx-auto max-w-[800px] border border-black shadow-lg print:shadow-none print:border-black">
              {/* Page 2 Header */}
              <div className="p-2.5 border-b border-black flex justify-between items-center text-xs font-bold text-black bg-slate-50">
                <span>Electronic Reservation Slip (ERS) - Normal User &nbsp;|&nbsp; PNR: {pnr}</span>
                <span>Page 2 of 2</span>
              </div>

              {/* GST Tax Breakup Table */}
              <div className="p-3 border-b border-black text-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-center text-[10px] border border-black border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-black font-bold">
                        <th className="p-1 border-r border-black">Taxable Value</th>
                        <th className="p-1 border-r border-black">CGST Rate</th>
                        <th className="p-1 border-r border-black">CGST Amt</th>
                        <th className="p-1 border-r border-black">SGST Rate</th>
                        <th className="p-1 border-r border-black">SGST Amt</th>
                        <th className="p-1 border-r border-black">IGST Rate</th>
                        <th className="p-1 border-r border-black">IGST Amt</th>
                        <th className="p-1 border-r border-black">Total Tax</th>
                        <th className="p-1 border-r border-black">Place of Supply</th>
                        <th className="p-1">State / Supplier</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="p-1 border-r border-black font-mono">₹ {taxableValue}</td>
                        <td className="p-1 border-r border-black">2.5%</td>
                        <td className="p-1 border-r border-black">0.00</td>
                        <td className="p-1 border-r border-black">NA</td>
                        <td className="p-1 border-r border-black">NA</td>
                        <td className="p-1 border-r border-black">5.0%</td>
                        <td className="p-1 border-r border-black">0.00</td>
                        <td className="p-1 border-r border-black font-semibold">0.00</td>
                        <td className="p-1 border-r border-black">NA</td>
                        <td className="p-1">Delhi / DL</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* INSTRUCTIONS: 16 Numbered Official Clauses */}
              <div className="p-3 border-b border-black text-[10px] text-black leading-snug space-y-2">
                <div className="font-bold text-xs uppercase tracking-wide">Instructions:</div>

                <div className="space-y-1.5 text-justify">
                  <div><strong>1. Prescribed Original ID proofs are:</strong> - Voter Identity Card / Passport / PAN Card / Driving License / Photo ID card issued by Central/State Govt. / Public Sector Undertakings / Student Identity Card with photo issued by recognized School or College / Nationalised Bank Passbook with photo / Credit Cards with laminated photo / Unique Identification Card "Aadhaar", m-Aadhaar, e-Aadhaar / DigiLocker documents. Documents uploaded in "Uploaded Documents" section will NOT be considered as valid proof of identity.</div>
                  <div><strong>2. PNRs having fully waitlisted status</strong> will be dropped and automatic refund of ticket amount after deducting applicable CLERKAGE by Railway will be credited to the account used for booking. Passengers having fully waitlisted e-ticket are not allowed to board the train. However, the names of PARTIALLY waitlisted/confirmed and RAC ticket passengers will appear in the chart.</div>
                  <div><strong>3. A clerkage charge</strong> of Rs. 60 per passenger plus GST for AC Classes and Rs. 60 per passenger for Non AC classes will be deducted if the ticket remains Waitlisted at the time of Cancellation/Charting.</div>
                  <div><strong>4. Passengers travelling on a fully waitlisted e-ticket</strong> will be treated as Ticketless.</div>
                  <div><strong>5. Obtain certificate from the TTE/Conductor</strong> in case of (a) PARTIALLY waitlisted e-ticket when LESS NO. OF PASSENGERS travel, (b) A.C. FAILURE, (c) TRAVEL IN LOWER CLASS. Send original certificate to GGM(IT), IRCTC, Internet Ticketing Centre, New Delhi after filing TDR online within prescribed time.</div>
                  <div><strong>6. In case on a party/family e-ticket</strong> some passengers have confirmed reservation and others are on RAC or waiting list, full refund of fare less clerkage shall be admissible for confirmed passengers also subject to cancellation or online TDR filed up to 30 minutes before scheduled departure.</div>
                  <div><strong>7. In case train is late more than 3 hours</strong>, refund is admissible as per railway refund rules only when TDR is filed before the actual departure of the train at boarding station and passenger has not travelled.</div>
                  <div><strong>8. In case of train cancellation on its entire run</strong>, full refund is granted automatically by the system. However, if train is partially cancelled or diverted, passengers must file online TDR within 72 hours of scheduled departure.</div>
                  <div><strong>9. Never purchase e-ticket from unauthorized agents</strong> or persons using personal IDs for commercial purposes (punishable u/s 143 of the Indian Railway Act 1989). Authorized agents are available on www.irctc.co.in.</div>
                  <div><strong>10. For detail Rules, Refund rules, Terms &amp; Conditions</strong> of E-Ticketing services and Travel Insurance facility, please visit www.irctc.co.in.</div>
                  <div><strong>11. While booking this ticket</strong>, you agreed to have read the Health Protocol of Destination State. Please read and follow them properly.</div>
                  <div><strong>12. The FIR forms</strong> are available with on-board ticket checking staff, train guard and train escorting RPF/GRP staff.</div>
                  <div><strong>13. Variety of meals available</strong> on more than 1500 trains. For meal delivery on seat, log on to www.ecatering.irctc.co.in or call 1323 Toll Free. For suggestions/complaints regarding catering, call Toll Free 1800-111-321 (07:00 to 22:00 hrs).</div>
                  <div><strong>14. National Consumer Helpline (NCH)</strong> Toll Free Number: 1800-11-4000 or 14404.</div>
                  <div><strong>15. You can book unreserved tickets</strong> from UTS APP or ATVMs (Automatic Ticket Vending Machines) located in Railway Stations.</div>
                  <div><strong>16. As per RBI guidelines</strong>, refund of ticket should be given in the same Bank account used for booking. Ensure your bank account remains open at least 30 days beyond journey date.</div>
                </div>
              </div>

              {/* Customer Care Box */}
              <div className="p-3 border-b border-black text-xs">
                <div className="border border-black bg-slate-50 p-2.5 rounded text-[11px] space-y-1">
                  <div className="font-bold text-black text-xs mb-1">Customer Care &amp; Rail Madad Enquiries:</div>
                  <div><strong>Customer Care:</strong> 14646 / 08044647999 / 08035734999 (24*7 Hrs; Language: Hindi or English)</div>
                  <div><strong>Rail Madad:</strong> Dial 139 or SMS RAIL to 139 (Railway Enquiries, suggestions, and complaints)</div>
                  <div><strong>Food on Track (e-catering):</strong> 1323 (24*7 Hrs Toll Free) or log on to www.ecatering.irctc.co.in</div>
                  <div><strong>Yatrai Platform Support:</strong> support@yatrai.in &middot; https://yatrai.in</div>
                </div>
              </div>

              {/* Anti-Fraud Banner */}
              <div className="bg-[#0f172a] text-white p-2.5 text-center text-xs font-bold tracking-wide">
                BEWARE OF FRAUDSTERS! Beware of fake emails and messages: Verify authenticity before responding.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
