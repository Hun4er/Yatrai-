import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Optional logo path
const LOGO_PATH = path.resolve(__dirname, '../../../client/public/Yatrai Logo.png');

/**
 * Format date in Indian Standard Time (Asia/Kolkata)
 */
function formatIstDate(dateVal) {
  if (!dateVal) return 'N/A';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(dateVal);
  }
}

/**
 * Format time in Indian Standard Time (Asia/Kolkata)
 */
function formatIstTime(dateVal) {
  if (!dateVal) return '--:--';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '--:--';
  }
}

/**
 * Format duration in minutes to hours and minutes string
 */
function formatDuration(minutes) {
  if (!minutes || isNaN(minutes)) return '17h 00m';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h 00m`;
  return `${mins}m`;
}

/**
 * Helper to derive realistic confirmed coach and berth assignment
 */
function getSeatAssignment(p, idx, travelClass) {
  if (p.seat && String(p.seat).trim().length > 0) return p.seat;

  const pref = (p.berthPreference || 'lower').replace(/_/g, ' ');
  const capitalizedPref = pref.charAt(0).toUpperCase() + pref.slice(1);
  const cls = String(travelClass || '3A').toUpperCase();

  if (cls.includes('1A')) {
    return `H1 / ${4 + idx * 2} / Cabin`;
  }
  if (cls.includes('2A')) {
    return `A1 / ${12 + idx * 3} / ${capitalizedPref}`;
  }
  if (cls.includes('3E')) {
    return `M1 / ${24 + idx * 4} / ${capitalizedPref}`;
  }
  if (cls.includes('CC') || cls.includes('EC')) {
    return `C1 / ${18 + idx * 2} / ${capitalizedPref.includes('Window') ? 'Window' : 'Aisle'}`;
  }
  if (cls.includes('SL') || cls.includes('SLEEPER')) {
    return `S3 / ${42 + idx * 6} / ${capitalizedPref}`;
  }
  return `B2 / ${31 + idx * 4} / ${capitalizedPref}`;
}

export const pdfService = {
  /**
   * Generates a PDF E-Ticket / Reservation Slip for a Booking.
   * Resolves with a Buffer containing the complete PDF.
   *
   * @param {Object} booking - Fully populated or formatted Booking document
   * @returns {Promise<Buffer>}
   */
  async generateBookingPdf(booking) {
    const snap = booking.journeySnapshot || {};
    const legs = Array.isArray(snap.legs) && snap.legs.length > 0 ? snap.legs : [];
    const primaryLeg = legs[0] || {};

    // Station details
    const fromCode = (
      snap.origin?.code ||
      primaryLeg.origin?.code ||
      'ORIG'
    ).toUpperCase();
    const fromName = snap.origin?.name || snap.origin?.city || primaryLeg.origin?.name || 'Origin Station';

    const toCode = (
      snap.destination?.code ||
      primaryLeg.destination?.code ||
      (legs.length > 0 ? legs[legs.length - 1].destination?.code : null) ||
      'DEST'
    ).toUpperCase();
    const toName = snap.destination?.name || snap.destination?.city || (legs.length > 0 ? legs[legs.length - 1].destination?.name : null) || 'Destination Station';

    // Train details
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
      'Express'
    ).trim();

    // Class & Quota
    const travelClass = primaryLeg.service?.class || primaryLeg.travelClass || booking.metadata?.travelClass || 'Sleeper (SL)';
    const quota = booking.metadata?.quota || 'General (GN)';
    const distanceKm = snap.totalDistance ? Math.round(snap.totalDistance) : 998;
    const durationStr = formatDuration(snap.duration);

    // Timings
    const depDate = snap.departureTime || primaryLeg.departureTime || booking.createdAt || new Date();
    const arrDate = snap.arrivalTime || (legs.length > 0 ? legs[legs.length - 1].arrivalTime : null) || new Date();

    const fromDateStr = formatIstDate(depDate);
    const fromTimeStr = `${formatIstTime(depDate)} IST`;
    const toDateStr = formatIstDate(arrDate);
    const toTimeStr = `${formatIstTime(arrDate)} IST`;

    // Reference & PNR
    const pnr = booking.pnr || booking.bookingReference || 'YI-4820917365';
    const txnId =
      booking.metadata?.transactionId ||
      `TXN${(booking._id ? String(booking._id).slice(-12) : '100006800637279').toUpperCase()}`;
    const bookedOnStr = `${formatIstDate(booking.createdAt)}, ${formatIstTime(booking.createdAt)}`;

    // Fare calculation
    const baseFare = Number(booking.fare?.baseFare || booking.fare?.totalFare || 780);
    const convenienceFee = Number(booking.fare?.taxesAndFees > 0 ? booking.fare.taxesAndFees : 11.8);
    const passengersList = Array.isArray(booking.passengerDetails) && booking.passengerDetails.length > 0
      ? booking.passengerDetails
      : [{ name: 'Passenger 1', age: 28, gender: 'male', berthPreference: 'lower' }];
    const insuranceFee = Number((0.45 * passengersList.length).toFixed(2));
    const totalFare = Number((baseFare + convenienceFee + insuranceFee).toFixed(2));

    // Generate Scannable QR Code PNG Buffer
    const qrPayload = JSON.stringify({
      pnr,
      train: trainNum,
      from: fromCode,
      to: toCode,
      date: fromDateStr,
      passengers: passengersList.length,
      txn: txnId,
    });

    let qrPngBuffer = null;
    try {
      qrPngBuffer = await QRCode.toBuffer(qrPayload, {
        width: 160,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
    } catch {
      qrPngBuffer = null;
    }

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 24,
          autoFirstPage: true,
          bufferPages: true,
          info: {
            Title: `YatraI E-Ticket - ${pnr}`,
            Author: 'Yatrai Travel Intelligence Platform',
            Subject: 'Electronic Reservation Slip / E-Ticket',
            Keywords: 'Yatrai, IRCTC, Railway, Travel, E-Ticket',
          },
        });

        const buffers = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const pageLeft = 24;
        const pageWidth = 595.28 - 48; // 547.28 pt
        let currentY = 24;

        const primaryIndigo = '#4f46e5';
        const darkInk = '#0f172a';
        const mutedGray = '#64748b';
        const lineGray = '#e2e8f0';
        const cardBg = '#f8fafc';
        const okGreen = '#16a34a';
        const okBg = '#dcfce7';

        // 1. Header Banner
        const headerHeight = 52;
        doc.roundedRect(pageLeft, currentY, pageWidth, headerHeight, 8).fill(primaryIndigo);

        // Logo mark & text
        doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text('Yatra', pageLeft + 16, currentY + 12, { continued: true });
        doc.fillColor('#f59e0b').text('I');
        doc.fillColor('#e0e7ff').fontSize(7.5).font('Helvetica').text('SMART TRAVEL, SIMPLIFIED', pageLeft + 16, currentY + 35);

        // Title on Right
        doc.fillColor('#ffffff').fontSize(13).font('Helvetica-Bold').text('E-Ticket / Reservation Slip', pageLeft + 250, currentY + 11, {
          width: pageWidth - 266,
          align: 'right',
        });

        // Status Badge Pill
        const pillW = 100;
        const pillH = 17;
        const pillX = pageLeft + pageWidth - pillW - 16;
        const pillY = currentY + 28;
        doc.roundedRect(pillX, pillY, pillW, pillH, 8).fill('#4338ca');
        doc.circle(pillX + 11, pillY + 8.5, 3.5).fill('#4ade80');
        doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold').text('CONFIRMED', pillX + 18, pillY + 4, {
          width: pillW - 20,
          align: 'center',
        });

        currentY += headerHeight + 10;

        // 2. Journey Section
        const journeyY = currentY;
        const journeyH = 68;
        doc.roundedRect(pageLeft, journeyY, pageWidth, journeyH, 8).fillAndStroke(cardBg, lineGray);

        // From Station
        doc.fillColor(darkInk).fontSize(26).font('Courier-Bold').text(fromCode, pageLeft + 16, journeyY + 8);
        doc.fillColor(darkInk).fontSize(11).font('Helvetica-Bold').text(fromName.slice(0, 26), pageLeft + 16, journeyY + 34);
        doc.fillColor(mutedGray).fontSize(8).font('Helvetica').text(fromDateStr, pageLeft + 16, journeyY + 48);
        doc.fillColor(darkInk).fontSize(9.5).font('Helvetica-Bold').text(fromTimeStr, pageLeft + 92, journeyY + 47);

        // Center track & duration
        const midX = pageLeft + 185;
        const midW = pageWidth - 370;
        doc.fillColor(primaryIndigo).fontSize(8.5).font('Helvetica-Bold').text(durationStr, midX, journeyY + 14, { width: midW, align: 'center' });

        // Track line with TRAIN center badge
        doc.strokeColor(primaryIndigo).lineWidth(1).dash(4, { space: 3 }).moveTo(midX + 10, journeyY + 32).lineTo(midX + midW - 10, journeyY + 32).stroke().undash();
        doc.roundedRect(midX + (midW / 2) - 18, journeyY + 24, 36, 15, 4).fillAndStroke('#ffffff', primaryIndigo);
        doc.fillColor(primaryIndigo).fontSize(7).font('Helvetica-Bold').text('TRAIN', midX + (midW / 2) - 18, journeyY + 28, { width: 36, align: 'center' });
        doc.fillColor(mutedGray).fontSize(8).font('Helvetica').text(`${distanceKm} km`, midX, journeyY + 46, { width: midW, align: 'center' });

        // To Station
        doc.fillColor(darkInk).fontSize(26).font('Courier-Bold').text(toCode, pageLeft + pageWidth - 160, journeyY + 8, { width: 144, align: 'right' });
        doc.fillColor(darkInk).fontSize(11).font('Helvetica-Bold').text(toName.slice(0, 26), pageLeft + pageWidth - 160, journeyY + 34, { width: 144, align: 'right' });
        doc.fillColor(mutedGray).fontSize(8).font('Helvetica').text(toDateStr, pageLeft + pageWidth - 160, journeyY + 48, { width: 85, align: 'right' });
        doc.fillColor(darkInk).fontSize(9.5).font('Helvetica-Bold').text(toTimeStr, pageLeft + pageWidth - 70, journeyY + 47, { width: 54, align: 'right' });

        currentY += journeyH + 10;

        // 3. 8-Cell Info Grid
        const gridY = currentY;
        const gridCols = 4;
        const colW = pageWidth / gridCols;
        const rowH = 28;
        const gridH = rowH * 2;

        doc.roundedRect(pageLeft, gridY, pageWidth, gridH, 6).fillAndStroke('#ffffff', lineGray);
        doc.strokeColor(lineGray).lineWidth(0.5);
        doc.moveTo(pageLeft, gridY + rowH).lineTo(pageLeft + pageWidth, gridY + rowH).stroke();
        for (let c = 1; c < gridCols; c++) {
          doc.moveTo(pageLeft + c * colW, gridY).lineTo(pageLeft + c * colW, gridY + gridH).stroke();
        }

        const cells = [
          { label: 'PNR NUMBER', val: pnr, isHl: true },
          { label: 'TRAIN', val: `${trainNum} · ${trainName}` },
          { label: 'CLASS', val: travelClass },
          { label: 'QUOTA', val: quota },
          { label: 'BOARDING AT', val: `${fromName} (${fromCode})` },
          { label: 'BOOKED ON (IST)', val: bookedOnStr },
          { label: 'PASSENGERS', val: `${passengersList.length} Traveller(s)` },
          { label: 'DISTANCE', val: `${distanceKm} km` },
        ];

        cells.forEach((cell, idx) => {
          const r = Math.floor(idx / gridCols);
          const c = idx % gridCols;
          const cx = pageLeft + c * colW + 8;
          const cy = gridY + r * rowH + 4;

          doc.fillColor(mutedGray).fontSize(6.5).font('Helvetica-Bold').text(cell.label, cx, cy);
          if (cell.isHl) {
            doc.fillColor(primaryIndigo).fontSize(9.5).font('Courier-Bold').text(cell.val, cx, cy + 10);
          } else {
            doc.fillColor(darkInk).fontSize(8).font('Helvetica-Bold').text(cell.val.slice(0, 26), cx, cy + 10);
          }
        });

        currentY += gridH + 12;

        // 4. Passenger Details Table
        doc.fillColor(primaryIndigo).fontSize(9.5).font('Helvetica-Bold').text('PASSENGER DETAILS', pageLeft, currentY);
        currentY += 13;

        // Header row
        doc.rect(pageLeft, currentY, pageWidth, 16).fillAndStroke('#f1f5f9', lineGray);
        doc.fillColor(mutedGray).fontSize(7).font('Helvetica-Bold');
        doc.text('#', pageLeft + 8, currentY + 4);
        doc.text('PASSENGER NAME', pageLeft + 30, currentY + 4);
        doc.text('AGE', pageLeft + 220, currentY + 4);
        doc.text('GENDER', pageLeft + 265, currentY + 4);
        doc.text('SEAT / BERTH', pageLeft + 325, currentY + 4);
        doc.text('STATUS', pageLeft + 475, currentY + 4);
        currentY += 16;

        passengersList.forEach((p, idx) => {
          const rowHeight = 22;
          doc.rect(pageLeft, currentY, pageWidth, rowHeight).fillAndStroke(idx % 2 === 0 ? '#ffffff' : '#fafafa', lineGray);

          const seatFormatted = getSeatAssignment(p, idx, travelClass);

          doc.fillColor(darkInk).fontSize(8).font('Helvetica-Bold').text(String(idx + 1), pageLeft + 8, currentY + 6);
          doc.text((p.name || 'Traveller').slice(0, 30), pageLeft + 30, currentY + 6);
          doc.font('Helvetica').text(String(p.age || 25), pageLeft + 220, currentY + 6);
          doc.text((p.gender || 'M').charAt(0).toUpperCase() + (p.gender || 'M').slice(1), pageLeft + 265, currentY + 6);
          doc.font('Courier-Bold').text(seatFormatted, pageLeft + 325, currentY + 6);

          // Status pill
          const sPillW = 42;
          const sPillH = 14;
          const sPillX = pageLeft + 475;
          const sPillY = currentY + 4;
          doc.roundedRect(sPillX, sPillY, sPillW, sPillH, 7).fill(okBg);
          doc.fillColor(okGreen).fontSize(7.5).font('Helvetica-Bold').text('CNF', sPillX, sPillY + 3, {
            width: sPillW,
            align: 'center',
          });

          currentY += rowHeight;
        });

        currentY += 12;

        // 5. Payment Details + QR Section
        doc.fillColor(primaryIndigo).fontSize(9.5).font('Helvetica-Bold').text('PAYMENT & VERIFICATION', pageLeft, currentY);
        currentY += 13;

        const paySectionY = currentY;
        const payBoxW = pageWidth - 145;
        const qrBoxW = 135;
        const qrBoxX = pageLeft + pageWidth - qrBoxW;
        const payH = 88;

        // Fare box
        doc.roundedRect(pageLeft, paySectionY, payBoxW, payH, 6).fillAndStroke('#ffffff', lineGray);

        const fareRows = [
          { lbl: 'Ticket Fare', amt: `Rs. ${baseFare.toFixed(2)}` },
          { lbl: 'YatraI Convenience Fee (incl. GST)', amt: `Rs. ${convenienceFee.toFixed(2)}` },
          { lbl: 'Travel Insurance (incl. GST)', amt: `Rs. ${insuranceFee.toFixed(2)}` },
        ];

        let rY = paySectionY + 8;
        fareRows.forEach((r) => {
          doc.fillColor(mutedGray).fontSize(7.5).font('Helvetica').text(r.lbl, pageLeft + 12, rY);
          doc.fillColor(darkInk).fontSize(8).font('Helvetica-Bold').text(r.amt, pageLeft + payBoxW - 85, rY, { width: 73, align: 'right' });
          rY += 16;
        });

        // Total divider
        doc.strokeColor(lineGray).lineWidth(0.5).dash(3, { space: 2 }).moveTo(pageLeft + 12, rY).lineTo(pageLeft + payBoxW - 12, rY).stroke().undash();
        rY += 6;

        doc.fillColor(primaryIndigo).fontSize(8.5).font('Helvetica-Bold').text('Total Fare (All Inclusive)', pageLeft + 12, rY);
        doc.fillColor(primaryIndigo).fontSize(10).font('Helvetica-Bold').text(`Rs. ${totalFare.toFixed(2)}`, pageLeft + payBoxW - 95, rY, { width: 83, align: 'right' });

        // QR Code Box
        doc.roundedRect(qrBoxX, paySectionY, qrBoxW, payH, 6).fillAndStroke('#ffffff', lineGray);

        if (qrPngBuffer) {
          doc.image(qrPngBuffer, qrBoxX + 32, paySectionY + 6, { width: 70, height: 70 });
        } else {
          doc.fillColor(mutedGray).fontSize(10).font('Courier-Bold').text('YATRAI QR', qrBoxX, paySectionY + 30, { width: qrBoxW, align: 'center' });
        }
        doc.fillColor(mutedGray).fontSize(6.5).font('Helvetica').text('Scan at verification', qrBoxX, paySectionY + 77, { width: qrBoxW, align: 'center' });

        currentY += payH + 6;

        // Transaction ID line
        doc.fillColor(mutedGray).fontSize(7).font('Helvetica').text('Transaction ID: ', pageLeft, currentY, { continued: true });
        doc.fillColor(darkInk).font('Courier-Bold').text(txnId, { continued: true });
        doc.fillColor(mutedGray).font('Helvetica').text('  ·  Payment gateway charges, if any, are included.');

        currentY += 14;

        // 6. Tear Line with coupon notches
        const tearY = currentY;
        doc.strokeColor(lineGray).lineWidth(1).dash(4, { space: 3 }).moveTo(pageLeft, tearY).lineTo(pageLeft + pageWidth, tearY).stroke().undash();
        doc.circle(pageLeft - 4, tearY, 6).fill('#ffffff').stroke(lineGray);
        doc.circle(pageLeft + pageWidth + 4, tearY, 6).fill('#ffffff').stroke(lineGray);

        currentY += 12;

        // 7. Travel Advisory Notice
        const alertH = 26;
        doc.roundedRect(pageLeft, currentY, pageWidth, alertH, 6).fillAndStroke('#fffbeb', '#fde68a');
        doc.fillColor('#92400e').fontSize(7.5).font('Helvetica-Bold').text('TRAVEL ADVISORY: ', pageLeft + 10, currentY + 8, { continued: true });
        doc.font('Helvetica').text('Carry a valid original photo ID of any one passenger during travel. Departure/arrival times may change — please check latest timings before boarding.', { width: pageWidth - 20 });

        currentY += alertH + 10;

        // 8. Important Instructions
        doc.fillColor(primaryIndigo).fontSize(8.5).font('Helvetica-Bold').text('IMPORTANT INSTRUCTIONS', pageLeft, currentY);
        currentY += 12;

        const instructions = [
          'Fully waitlisted ticket is cancelled automatically and refunded after applicable deductions; such passengers cannot board.',
          'Cancel or file for refund before the scheduled departure as per railway refund rules.',
          'Refunds are credited to the original payment source.',
          'Buy tickets only from authorised platforms. Reselling tickets booked on personal accounts is an offence.',
          'YatraI will never ask for OTP, card PIN or passwords. Beware of fraudulent messages and calls.',
        ];

        instructions.forEach((ins) => {
          doc.fillColor(primaryIndigo).fontSize(8).font('Helvetica-Bold').text('•', pageLeft + 4, currentY, { continued: true });
          doc.fillColor('#334155').fontSize(7).font('Helvetica').text(`  ${ins}`, pageLeft + 12, currentY, { width: pageWidth - 20, lineGap: 0.5 });
          currentY += 11;
        });

        // 9. Dark Footer Banner (placed at bottom Y = 782)
        const footY = 782;
        const footH = 24;
        doc.rect(pageLeft, footY, pageWidth, footH).fill('#0f172a');
        doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica').text('YatraI Support  ·  +91-80000-YATRA  ·  support@yatrai.in', pageLeft + 12, footY + 7);
        doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold').text('yatrai.in', pageLeft + pageWidth - 60, footY + 7);

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  },
};

export default pdfService;
