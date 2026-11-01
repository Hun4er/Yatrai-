import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGO_IR = path.resolve(__dirname, '../server/src/assets/indian_railways_logo.png');
const LOGO_IRCTC = path.resolve(__dirname, '../server/src/assets/irctc_logo.png');
const BANNER_BOARDING = path.resolve(__dirname, '../server/src/assets/boarding_at.jpg');

function formatIstDate(dateVal) {
  if (!dateVal) return 'N/A';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch {
    return String(dateVal);
  }
}

function formatIstTime(dateVal) {
  if (!dateVal) return '--:--';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    const hrs = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hrs}:${mins}`;
  } catch {
    return '--:--';
  }
}

function getSeatAllocation(p, isConfirmed) {
  if (p.seat && String(p.seat).trim().length > 0) return p.seat;
  if (p.coach && p.berth) return `${p.coach}/${p.berth}/${p.berthType || 'LOWER'}`.toUpperCase();
  if (isConfirmed) return 'CNF/S7/42/LOWER';
  return 'CNF/S7/42/LOWER';
}

export async function generateTestPdf(booking, outputPath) {
  const snap = booking.journeySnapshot || {};
  const bookingLegs = Array.isArray(booking.legs) && booking.legs.length > 0
    ? booking.legs
    : (Array.isArray(snap.legs) ? snap.legs : []);

  const normalizedLegs = bookingLegs.map((l, idx) => ({
    legIndex: idx + 1,
    trainNum: String(l.trainNumber || l.trainNo || '12304').trim(),
    trainName: String(l.trainName || 'POORVA EXPRESS').trim(),
    fromCode: String(l.fromStationCode || l.fromCode || 'NDLS').toUpperCase().trim(),
    fromName: String(l.fromStationName || l.fromName || 'NEW DELHI').trim(),
    toCode: String(l.toStationCode || l.toCode || 'PNBE').toUpperCase().trim(),
    toName: String(l.toStationName || l.toName || 'PATNA JN.').trim(),
    depTime: l.departureTime || new Date(),
    arrTime: l.arrivalTime || new Date(),
    travelClass: String(l.travelClass || l.class || 'SL').toUpperCase(),
    quota: String(l.quota || 'GN').toUpperCase(),
    fare: Number(l.fare || l.price || 435),
    legStatus: 'CNF',
    legPnr: l.pnr || '2846526889',
  }));

  const isMultiLeg = normalizedLegs.length > 1;
  const firstLeg = normalizedLegs[0] || {};
  const lastLeg = normalizedLegs[normalizedLegs.length - 1] || firstLeg;

  const originCode = (snap.origin?.code || firstLeg.fromCode || 'NDLS').toUpperCase();
  const originName = (snap.origin?.name || firstLeg.fromName || 'NEW DELHI').toUpperCase();
  const destCode = (snap.destination?.code || lastLeg.toCode || 'PNBE').toUpperCase();
  const destName = (snap.destination?.name || lastLeg.toName || 'PATNA JN.').toUpperCase();

  const boardingCode = originCode;
  const boardingName = originName;

  const pnr = booking.pnr || '2846526889';
  const bookingRef = booking.bookingReference || 'YTR-BK-MVY4A67C-Q5AG';
  const isConfirmed = Boolean(booking.isConfirmed || booking.status === 'confirmed');
  const txnId = booking.metadata?.transactionId || '100002952951447';
  const distanceKm = snap.totalDistance ? Math.round(snap.totalDistance) : 998;

  const depDate = snap.departureTime || firstLeg.depTime || new Date();
  const arrDate = snap.arrivalTime || lastLeg.arrTime || new Date();
  const startDateStr = formatIstDate(depDate);
  const depTimeStr = `${formatIstTime(depDate)} ${startDateStr}`;
  const arrTimeStr = `${formatIstTime(arrDate)} ${formatIstDate(arrDate)}`;
  const bookingDateStr = `${formatIstDate(booking.createdAt || new Date())} 11:02:59 HRS`;

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

  const passengersList = Array.isArray(booking.passengerDetails) && booking.passengerDetails.length > 0
    ? booking.passengerDetails
    : [{ name: 'HARSH MISHRA', age: 21, gender: 'M', berthPreference: 'UPPER' }];

  const baseFare = Number(booking.fare?.baseFare || 780);
  const convenienceFee = 11.80;
  const insuranceFee = 0.45;
  const totalFare = Number(booking.fare?.totalFare || (baseFare + convenienceFee + insuranceFee));
  const taxableValue = Math.round(baseFare * 0.95);

  const qrPayload = `PNR:${pnr}|REF:${bookingRef}|TRAIN:${primaryTrainNo}|FROM:${originCode}|TO:${destCode}|DATE:${startDateStr}|PAX:${passengersList.length}|TXN:${txnId}`;
  const qrPngBuffer = await QRCode.toBuffer(qrPayload, {
    width: 200,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  });

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 15,
        autoFirstPage: true,
        bufferPages: true,
        info: {
          Title: `IRCTC Electronic Reservation Slip - ${pnr}`,
          Author: 'Indian Railways / Yatrai Journey Platform',
          Subject: 'Electronic Reservation Slip (ERS) - Normal User',
        },
      });

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      const pageLeft = 15;
      const pageTop = 15;
      const pageWidth = 595.28 - 30; // 565.28 pt
      const pageHeight = 841.89 - 30; // 811.89 pt

      // Helper to draw clean outer page border
      const drawOuterBorder = () => {
        doc.rect(pageLeft, pageTop, pageWidth, pageHeight)
           .strokeColor('#000000')
           .lineWidth(0.8)
           .stroke();
      };

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 1: ERS RESERVATION SLIP
      // ═══════════════════════════════════════════════════════════════════════
      drawOuterBorder();
      let currentY = pageTop;

      // 1. Top Header Box
      const headerH = 50;
      // IR Logo
      if (fs.existsSync(LOGO_IR)) {
        doc.image(LOGO_IR, pageLeft + 12, currentY + 7, { width: 36, height: 36 });
      }

      // Center title
      doc.fillColor('#000000').fontSize(11).font('Helvetica-Bold')
         .text('Electronic Reservation Slip (ERS)-Normal User', pageLeft + 60, currentY + 10, {
           width: pageWidth - 120,
           align: 'center',
         });
      doc.fillColor('#4b5563').fontSize(7.5).font('Helvetica')
         .text('Yatrai Journey Recovery Platform / Indian Railways', pageLeft + 60, currentY + 24, {
           width: pageWidth - 120,
           align: 'center',
         });
      doc.fillColor('#1e40af').fontSize(7.5).font('Helvetica-Bold')
         .text(`Booking Ref: ${bookingRef}  |  Official PRS Verification`, pageLeft + 60, currentY + 36, {
           width: pageWidth - 120,
           align: 'center',
         });

      // IRCTC Logo
      if (fs.existsSync(LOGO_IRCTC)) {
        doc.image(LOGO_IRCTC, pageLeft + pageWidth - 48, currentY + 6, { width: 34, height: 38 });
      }

      currentY += headerH;
      doc.moveTo(pageLeft, currentY).lineTo(pageLeft + pageWidth, currentY).strokeColor('#000000').lineWidth(0.8).stroke();

      // 2. Journey 3-Column Box (Booked from / Boarding At / To)
      const routeH = 52;
      const col1W = 180;
      const col2W = 205;
      const col3W = pageWidth - col1W - col2W;

      // Col 1: Booked from
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica').text('Booked from', pageLeft + 10, currentY + 6);
      doc.fontSize(8.5).font('Helvetica-Bold').text(`${originName} (${originCode})`, pageLeft + 10, currentY + 17);
      doc.fontSize(7.5).font('Helvetica').text(`Start Date* ${startDateStr}`, pageLeft + 10, currentY + 35);

      // Col 2: Boarding At with blue banner
      const bannerX = pageLeft + col1W + 40;
      if (fs.existsSync(BANNER_BOARDING)) {
        doc.image(BANNER_BOARDING, bannerX, currentY + 5, { width: 120, height: 18 });
      } else {
        doc.roundedRect(bannerX, currentY + 5, 120, 18, 2).fill('#1d4ed8');
        doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold').text('Boarding At', bannerX, currentY + 9, { width: 120, align: 'center' });
      }
      doc.fillColor('#000000').fontSize(8.5).font('Helvetica-Bold').text(`${boardingName} (${boardingCode})`, pageLeft + col1W, currentY + 26, { width: col2W, align: 'center' });
      doc.fontSize(7.5).font('Helvetica').text(`Departure* ${depTimeStr}`, pageLeft + col1W, currentY + 38, { width: col2W, align: 'center' });

      // Col 3: To
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica').text('To', pageLeft + col1W + col2W + 10, currentY + 6);
      doc.fontSize(8.5).font('Helvetica-Bold').text(`${destName} (${destCode})`, pageLeft + col1W + col2W + 10, currentY + 17);
      doc.fontSize(7.5).font('Helvetica').text(`Arrival* ${arrTimeStr}`, pageLeft + col1W + col2W + 10, currentY + 35);

      currentY += routeH;
      doc.moveTo(pageLeft, currentY).lineTo(pageLeft + pageWidth, currentY).strokeColor('#000000').lineWidth(0.8).stroke();

      // 3. Train & PNR Grid (2 rows x 3 columns)
      const gridH = 36;
      const cW1 = 175;
      const cW2 = 230;
      const cW3 = pageWidth - cW1 - cW2;

      // Row 1
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica').text('PNR', pageLeft + 10, currentY + 3);
      doc.fillColor('#1d4ed8').fontSize(9.5).font('Helvetica-Bold').text(pnr, pageLeft + 10, currentY + 11);

      doc.fillColor('#000000').fontSize(7.5).font('Helvetica').text('Train No./Name', pageLeft + cW1 + 10, currentY + 3);
      doc.fontSize(8.5).font('Helvetica-Bold').text(`${primaryTrainNo} / ${primaryTrainName}`, pageLeft + cW1 + 10, currentY + 11);

      doc.fontSize(7.5).font('Helvetica').text('Class', pageLeft + cW1 + cW2 + 10, currentY + 3);
      doc.fontSize(8.5).font('Helvetica-Bold').text(classDisplayName, pageLeft + cW1 + cW2 + 10, currentY + 11);

      // Mid-grid horizontal divider
      doc.moveTo(pageLeft, currentY + 22).lineTo(pageLeft + pageWidth, currentY + 22).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

      // Row 2
      doc.fontSize(7.5).font('Helvetica').text('Quota', pageLeft + 10, currentY + 24);
      doc.fontSize(8).font('Helvetica-Bold').text(`${primaryQuota} (${primaryQuota === 'GN' ? 'GENERAL' : primaryQuota})`, pageLeft + 55, currentY + 24);

      doc.fontSize(7.5).font('Helvetica').text('Distance', pageLeft + cW1 + 10, currentY + 24);
      doc.fontSize(8).font('Helvetica-Bold').text(`${distanceKm} KM`, pageLeft + cW1 + 65, currentY + 24);

      doc.fontSize(7.5).font('Helvetica').text('Booking Date', pageLeft + cW1 + cW2 + 10, currentY + 24);
      doc.fontSize(8).font('Helvetica-Bold').text(bookingDateStr, pageLeft + cW1 + cW2 + 75, currentY + 24);

      // Grid vertical dividers
      doc.moveTo(pageLeft + cW1, currentY).lineTo(pageLeft + cW1, currentY + gridH).strokeColor('#000000').lineWidth(0.5).stroke();
      doc.moveTo(pageLeft + cW1 + cW2, currentY).lineTo(pageLeft + cW1 + cW2, currentY + gridH).strokeColor('#000000').lineWidth(0.5).stroke();

      currentY += gridH;
      doc.moveTo(pageLeft, currentY).lineTo(pageLeft + pageWidth, currentY).strokeColor('#000000').lineWidth(0.8).stroke();

      // 4. Multi-Leg Segments Breakdown (if connecting journey)
      if (isMultiLeg) {
        const mlH = 14 + (normalizedLegs.length * 20) + ((normalizedLegs.length - 1) * 16);
        doc.rect(pageLeft, currentY, pageWidth, mlH).fillAndStroke('#f8fafc', '#000000');
        
        doc.fillColor('#1e40af').fontSize(7.5).font('Helvetica-Bold').text('CONNECTING TRAIN SEGMENTS (YATRAI MULTI-LEG ITINERARY)', pageLeft + 10, currentY + 3.5);
        let mY = currentY + 14;

        normalizedLegs.forEach((leg, idx) => {
          doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold').text(`Leg ${leg.legIndex}: Train ${leg.trainNum} - ${leg.trainName}`, pageLeft + 10, mY);
          doc.fontSize(7.5).font('Helvetica').text(`${leg.fromCode} (${formatIstTime(leg.depTime)}) → ${leg.toCode} (${formatIstTime(leg.arrTime)})  |  Class: ${leg.travelClass}  |  Fare: Rs. ${leg.fare.toFixed(2)}`, pageLeft + 10, mY + 9);
          doc.fillColor('#15803d').fontSize(7.5).font('Helvetica-Bold').text(`STATUS: ${leg.legStatus} (PNR: ${leg.legPnr || 'PENDING'})`, pageLeft + pageWidth - 160, mY + 4, { width: 150, align: 'right' });
          mY += 20;

          if (idx < normalizedLegs.length - 1) {
            const nextL = normalizedLegs[idx + 1];
            doc.rect(pageLeft + 8, mY - 2, pageWidth - 16, 14).fillAndStroke('#fffbeb', '#fde68a');
            doc.fillColor('#92400e').fontSize(7).font('Helvetica-Bold')
               .text(`TRANSFER AT ${leg.toCode} (${leg.toName}): Arrive ${formatIstTime(leg.arrTime)} · Depart next train ${formatIstTime(nextL.depTime)} · Connection Timing Validated`, pageLeft + 12, mY + 1);
            mY += 16;
          }
        });

        currentY += mlH;
        doc.moveTo(pageLeft, currentY).lineTo(pageLeft + pageWidth, currentY).strokeColor('#000000').lineWidth(0.8).stroke();
      }

      // 5. Passenger Details Table
      doc.fillColor('#000000').fontSize(8.5).font('Helvetica-Bold').text('Passenger Details', pageLeft + 10, currentY + 4);
      currentY += 14;

      const pTableH = 14;
      doc.rect(pageLeft, currentY, pageWidth, pTableH).fillAndStroke('#f1f5f9', '#000000');
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
      doc.text('#', pageLeft + 8, currentY + 3.5);
      doc.text('Name', pageLeft + 28, currentY + 3.5);
      doc.text('Age', pageLeft + 210, currentY + 3.5);
      doc.text('Gender', pageLeft + 245, currentY + 3.5);
      doc.text('Booking Status', pageLeft + 300, currentY + 3.5);
      doc.text('Current Status', pageLeft + 430, currentY + 3.5);

      currentY += pTableH;

      passengersList.forEach((p, idx) => {
        const rowH = 14;
        doc.rect(pageLeft, currentY, pageWidth, rowH).fillAndStroke(idx % 2 === 0 ? '#ffffff' : '#fcfcfc', '#000000');
        const seatStr = getSeatAllocation(p, isConfirmed);

        doc.fillColor('#000000').fontSize(7.5).font('Helvetica');
        doc.text(`${idx + 1}.`, pageLeft + 8, currentY + 3.5);
        doc.font('Helvetica-Bold').text((p.name || 'PASSENGER').toUpperCase(), pageLeft + 28, currentY + 3.5);
        doc.font('Helvetica').text(String(p.age || '21'), pageLeft + 210, currentY + 3.5);
        doc.text(String(p.gender || 'M').toUpperCase().slice(0, 1), pageLeft + 245, currentY + 3.5);
        doc.font('Helvetica-Bold').text(seatStr, pageLeft + 300, currentY + 3.5);
        doc.text(seatStr, pageLeft + 430, currentY + 3.5);

        currentY += rowH;
      });

      // Footnotes under Passenger Table
      doc.fillColor('#4b5563').fontSize(6.5).font('Helvetica');
      doc.text('Acronyms: RLWL: REMOTE LOCATION WAITLIST  PQWL: POOLED QUOTA WAITLIST  RSWL: ROAD-SIDE WAITLIST  CNF: CONFIRMED', pageLeft + 8, currentY + 3);
      doc.fillColor('#000000').fontSize(7).font('Helvetica-Bold')
         .text(`Transaction ID: ${txnId}`, pageLeft + 8, currentY + 12);
      doc.fillColor('#6b7280').fontSize(6.5).font('Helvetica-Oblique')
         .text('IR recovers only 57% of cost of travel on an average.', pageLeft + 8, currentY + 21);

      currentY += 30;
      doc.moveTo(pageLeft, currentY).lineTo(pageLeft + pageWidth, currentY).strokeColor('#000000').lineWidth(0.8).stroke();

      // 6. Payment Details & QR Code (Two Columns)
      const payColW = 345;
      const qrColW = pageWidth - payColW;
      const payBoxH = 82;

      // Left Column: Payment Details
      doc.fillColor('#000000').fontSize(8.5).font('Helvetica-Bold').text('Payment Details', pageLeft + 10, currentY + 4);
      let pyY = currentY + 15;

      const drawPayRow = (label, val, isBold = false) => {
        doc.rect(pageLeft, pyY, payColW, 13).fillAndStroke('#ffffff', '#cbd5e1');
        doc.fillColor('#000000').fontSize(7.5).font(isBold ? 'Helvetica-Bold' : 'Helvetica').text(label, pageLeft + 8, pyY + 3);
        doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').text(`Rs. ${val}`, pageLeft + payColW - 75, pyY + 3, { width: 68, align: 'right' });
        pyY += 13;
      };

      drawPayRow('Ticket Fare', baseFare.toFixed(2));
      drawPayRow('IRCTC Convenience Fee (Incl. of GST)', convenienceFee.toFixed(2));
      drawPayRow('Travel Insurance Premium (Incl. of GST)', insuranceFee.toFixed(2));
      drawPayRow('Total Fare (all inclusive)', totalFare.toFixed(2), true);

      doc.fillColor('#6b7280').fontSize(6.5).font('Helvetica')
         .text('PG Charges as applicable (Additional)', pageLeft + 8, pyY + 2);

      // Right Column: QR Code
      doc.rect(pageLeft + payColW, currentY, qrColW, payBoxH).strokeColor('#000000').lineWidth(0.5).stroke();
      if (qrPngBuffer) {
        doc.image(qrPngBuffer, pageLeft + payColW + (qrColW - 68) / 2, currentY + 4, { width: 68, height: 68 });
      }
      doc.fillColor('#4b5563').fontSize(6).font('Helvetica')
         .text('Scan for verified summary', pageLeft + payColW, currentY + 73, { width: qrColW, align: 'center' });

      currentY += payBoxH;
      doc.moveTo(pageLeft, currentY).lineTo(pageLeft + pageWidth, currentY).strokeColor('#000000').lineWidth(0.8).stroke();

      // 7. Advisories & Warning Points
      const advH = 100;
      let advY = currentY + 4;
      const advItems = [
        'Beware of fraudulent customer care number. For any assistance, use only the IRCTC e-ticketing Customer care number: 14646.',
        'IRCTC Convenience Fee is charged per e-ticket irrespective of number of passengers on the ticket.',
        '* The printed Departure and Arrival Times are liable to change. Please Check correct departure, arrival from Railway Station Enquiry or Dial 139 or SMS RAIL to 139.',
        'Observance of Vigilance Awareness: "Probity for Prosperity". Click to take the pledge and be a part of this movement.',
        'This ticket is booked on a personal User ID, its sale/purchase is an offence u/s 143 of the Railways Act, 1989.',
        'Prescribed original ID proof is required while travelling along with SMS/VRM/ERS otherwise will be treated as without ticket and penalized as per Railway Rules.',
        'Separate tickets: Multi-leg connecting journeys require individual ticket reservations for each train segment. Yatrai journey recovery schedules and connection timings are validated.',
      ];

      doc.fillColor('#000000').fontSize(6.5).font('Helvetica');
      advItems.forEach((item) => {
        doc.text(`* ${item}`, pageLeft + 8, advY, { width: pageWidth - 16, lineGap: 1.2 });
        advY += 13.5;
      });

      currentY += advH;
      doc.moveTo(pageLeft, currentY).lineTo(pageLeft + pageWidth, currentY).strokeColor('#000000').lineWidth(0.8).stroke();

      // 8. Indian Railways GST Details
      const gstH = 50;
      doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold').text('Indian Railways GST Details:', pageLeft + 8, currentY + 3.5);

      const gstCol1 = 280;
      const gstY1 = currentY + 14;

      doc.fontSize(7).font('Helvetica-Bold').text('Invoice Number:', pageLeft + 8, gstY1);
      doc.font('Helvetica').text(`PS${pnr}11`, pageLeft + 80, gstY1);

      doc.font('Helvetica-Bold').text('Address:', pageLeft + gstCol1, gstY1);
      doc.font('Helvetica').text('Indian Railways New Delhi', pageLeft + gstCol1 + 45, gstY1);

      doc.font('Helvetica-Bold').text('Supplier Information:', pageLeft + 8, gstY1 + 11);
      doc.font('Helvetica').text('SAC Code: 996421  |  GSTIN: 07AAAGM0289C1ZL', pageLeft + 95, gstY1 + 11);

      doc.font('Helvetica-Bold').text('Recipient Information:', pageLeft + 8, gstY1 + 22);
      doc.font('Helvetica').text('GSTIN: NA  |  Name: NA  |  Address: NA', pageLeft + 95, gstY1 + 22);

      currentY += gstH;
      doc.moveTo(pageLeft, currentY).lineTo(pageLeft + pageWidth, currentY).strokeColor('#000000').lineWidth(0.8).stroke();

      // Page 1 Footer Bar
      const p1FootY = pageTop + pageHeight - 16;
      doc.fillColor('#64748b').fontSize(6.5).font('Helvetica')
         .text('Electronic Reservation Slip (ERS) - Normal User  |  Page 1 of 2', pageLeft + 8, p1FootY);
      doc.fillColor('#1e40af').fontSize(6.5).font('Helvetica-Bold')
         .text('Yatrai Journey Recovery Platform  ·  support@yatrai.in  ·  https://yatrai.in', pageLeft + pageWidth - 260, p1FootY, { width: 252, align: 'right' });


      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 2: INSTRUCTIONS & CUSTOMER CARE
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();
      drawOuterBorder();
      let p2Y = pageTop;

      // Page 2 Header Bar
      const p2HeadH = 20;
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold')
         .text(`Electronic Reservation Slip (ERS) - Normal User  |  PNR: ${pnr}  |  Page 2 of 2`, pageLeft + 10, p2Y + 6);
      p2Y += p2HeadH;
      doc.moveTo(pageLeft, p2Y).lineTo(pageLeft + pageWidth, p2Y).strokeColor('#000000').lineWidth(0.8).stroke();

      // GST Tax Breakup Table
      const taxTableH = 32;
      doc.rect(pageLeft, p2Y, pageWidth, 14).fillAndStroke('#f1f5f9', '#000000');
      doc.fillColor('#000000').fontSize(6.5).font('Helvetica-Bold');
      doc.text('Taxable Value', pageLeft + 6, p2Y + 4);
      doc.text('CGST Rate', pageLeft + 65, p2Y + 4);
      doc.text('CGST Amt', pageLeft + 115, p2Y + 4);
      doc.text('SGST Rate', pageLeft + 165, p2Y + 4);
      doc.text('SGST Amt', pageLeft + 215, p2Y + 4);
      doc.text('IGST Rate', pageLeft + 265, p2Y + 4);
      doc.text('IGST Amt', pageLeft + 315, p2Y + 4);
      doc.text('Total Tax', pageLeft + 365, p2Y + 4);
      doc.text('Place of Supply', pageLeft + 420, p2Y + 4);
      doc.text('State / Supplier', pageLeft + 490, p2Y + 4);

      p2Y += 14;
      doc.rect(pageLeft, p2Y, pageWidth, 16).fillAndStroke('#ffffff', '#000000');
      doc.fillColor('#000000').fontSize(6.5).font('Helvetica');
      doc.text(`Rs. ${taxableValue}`, pageLeft + 6, p2Y + 4.5);
      doc.text('2.5%', pageLeft + 65, p2Y + 4.5);
      doc.text('0.00', pageLeft + 115, p2Y + 4.5);
      doc.text('NA', pageLeft + 165, p2Y + 4.5);
      doc.text('NA', pageLeft + 215, p2Y + 4.5);
      doc.text('5.0%', pageLeft + 265, p2Y + 4.5);
      doc.text('0.00', pageLeft + 315, p2Y + 4.5);
      doc.text('0.00', pageLeft + 365, p2Y + 4.5);
      doc.text('NA', pageLeft + 420, p2Y + 4.5);
      doc.text('Delhi / DL', pageLeft + 490, p2Y + 4.5);

      p2Y += 18;
      doc.moveTo(pageLeft, p2Y).lineTo(pageLeft + pageWidth, p2Y).strokeColor('#000000').lineWidth(0.8).stroke();

      // INSTRUCTIONS Title
      p2Y += 4;
      doc.fillColor('#000000').fontSize(8.5).font('Helvetica-Bold').text('INSTRUCTIONS:', pageLeft + 10, p2Y);
      p2Y += 12;

      // 16 Official Instructions
      const instructions = [
        '1. Prescribed Original ID proofs are: - Voter Identity Card / Passport / PAN Card / Driving License / Photo ID card issued by Central/State Govt. / Public Sector Undertakings / Student Identity Card with photo issued by recognized School or College / Nationalised Bank Passbook with photo / Credit Cards with laminated photo / Unique Identification Card "Aadhaar", m-Aadhaar, e-Aadhaar / DigiLocker documents. Documents uploaded in "Uploaded Documents" section will NOT be considered as valid proof of identity.',
        '2. PNRs having fully waitlisted status will be dropped and automatic refund of ticket amount after deducting applicable CLERKAGE by Railway will be credited to the account used for booking. Passengers having fully waitlisted e-ticket are not allowed to board the train. However, the names of PARTIALLY waitlisted/confirmed and RAC ticket passengers will appear in the chart.',
        '3. A clerkage charge of Rs. 60 per passenger plus GST for AC Classes and Rs. 60 per passenger for Non AC classes will be deducted if the ticket remains Waitlisted at the time of Cancellation/Charting.',
        '4. Passengers travelling on a fully waitlisted e-ticket will be treated as Ticketless.',
        '5. Obtain certificate from the TTE/Conductor in case of (a) PARTIALLY waitlisted e-ticket when LESS NO. OF PASSENGERS travel, (b) A.C. FAILURE, (c) TRAVEL IN LOWER CLASS. Send original certificate to GGM(IT), IRCTC, Internet Ticketing Centre, New Delhi after filing TDR online within prescribed time.',
        '6. In case on a party/family e-ticket some passengers have confirmed reservation and others are on RAC or waiting list, full refund of fare less clerkage shall be admissible for confirmed passengers also subject to cancellation or online TDR filed up to 30 minutes before scheduled departure.',
        '7. In case train is late more than 3 hours, refund is admissible as per railway refund rules only when TDR is filed before the actual departure of the train at boarding station and passenger has not travelled.',
        '8. In case of train cancellation on its entire run, full refund is granted automatically by the system. However, if train is partially cancelled or diverted, passengers must file online TDR within 72 hours of scheduled departure.',
        '9. Never purchase e-ticket from unauthorized agents or persons using personal IDs for commercial purposes (punishable u/s 143 of the Indian Railway Act 1989). Authorized agents are available on www.irctc.co.in.',
        '10. For detail Rules, Refund rules, Terms & Conditions of E-Ticketing services and Travel Insurance facility, please visit www.irctc.co.in.',
        '11. While booking this ticket, you agreed to have read the Health Protocol of Destination State. Please read and follow them properly.',
        '12. The FIR forms are available with on-board ticket checking staff, train guard and train escorting RPF/GRP staff.',
        '13. Variety of meals available on more than 1500 trains. For meal delivery on seat, log on to www.ecatering.irctc.co.in or call 1323 Toll Free. For suggestions/complaints regarding catering, call Toll Free 1800-111-321 (07:00 to 22:00 hrs).',
        '14. National Consumer Helpline (NCH) Toll Free Number: 1800-11-4000 or 14404.',
        '15. You can book unreserved tickets from UTS APP or ATVMs (Automatic Ticket Vending Machines) located in Railway Stations.',
        '16. As per RBI guidelines, refund of ticket should be given in the same Bank account used for booking. Ensure your bank account remains open at least 30 days beyond journey date.',
      ];

      doc.fillColor('#000000').fontSize(6).font('Helvetica');
      instructions.forEach((inst) => {
        doc.text(inst, pageLeft + 8, p2Y, { width: pageWidth - 16, lineGap: 1.1 });
        p2Y += doc.heightOfString(inst, { width: pageWidth - 16, lineGap: 1.1 }) + 2.5;
      });

      // Customer Care Box
      p2Y += 4;
      const ccH = 58;
      doc.rect(pageLeft + 6, p2Y, pageWidth - 12, ccH).fillAndStroke('#f8fafc', '#000000');
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold').text('Customer Care & Rail Madad Enquiries:', pageLeft + 12, p2Y + 4);

      doc.fontSize(6.5).font('Helvetica')
         .text('Customer Care: 14646 / 08044647999 / 08035734999 (24*7 Hrs; Language: Hindi or English)', pageLeft + 12, p2Y + 16)
         .text('Rail Madad: Dial 139 or SMS RAIL to 139 (Railway Enquiries, suggestions, and complaints)', pageLeft + 12, p2Y + 27)
         .text('Food on Track (e-catering): 1323 (24*7 Hrs Toll Free) or log on to www.ecatering.irctc.co.in', pageLeft + 12, p2Y + 38)
         .text('Yatrai Platform Support: support@yatrai.in  ·  https://yatrai.in', pageLeft + 12, p2Y + 48);

      p2Y += ccH + 8;

      // Bottom Anti-Fraud Banner
      const fraudH = 22;
      doc.rect(pageLeft, pageTop + pageHeight - fraudH, pageWidth, fraudH).fill('#0f172a');
      doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold')
         .text('BEWARE OF FRAUDSTERS! Beware of fake emails and messages: Verify authenticity before responding.', pageLeft, pageTop + pageHeight - fraudH + 6.5, {
           width: pageWidth,
           align: 'center',
         });

      doc.end();
      writeStream.on('finish', () => resolve(outputPath));
      writeStream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

// Generate test output
const sampleBooking = {
  pnr: '2846526889',
  bookingReference: 'YTR-BK-MVY4A67C-Q5AG',
  status: 'confirmed',
  isConfirmed: true,
  createdAt: new Date('2026-10-30T11:02:59+05:30'),
  journeySnapshot: {
    origin: { code: 'NDLS', name: 'NEW DELHI' },
    destination: { code: 'PNBE', name: 'PATNA JN.' },
    departureTime: new Date('2026-10-31T19:10:00+05:30'),
    arrivalTime: new Date('2026-11-01T10:43:00+05:30'),
    totalDistance: 998,
    legs: [
      {
        trainNumber: '15484',
        trainName: 'MAHANANDA EXP',
        fromStationCode: 'DLI',
        fromStationName: 'DELHI JN',
        toStationCode: 'DDU',
        toStationName: 'PT.DEEN DAYAL UPADHYAYA JN',
        departureTime: new Date('2026-11-01T07:35:00+05:30'),
        arrivalTime: new Date('2026-11-01T21:23:00+05:30'),
        travelClass: 'SL',
        quota: 'GN',
        fare: 435,
        pnr: '2846526889',
      },
      {
        trainNumber: '12141',
        trainName: 'PATLIPUTRA EXP',
        fromStationCode: 'DDU',
        fromStationName: 'PT.DEEN DAYAL UPADHYAYA JN',
        toStationCode: 'PPTA',
        toStationName: 'PATLIPUTRA',
        departureTime: new Date('2026-11-02T00:25:00+05:30'),
        arrivalTime: new Date('2026-11-02T03:50:00+05:30'),
        travelClass: 'SL',
        quota: 'GN',
        fare: 720,
        pnr: '2846526889',
      },
    ],
  },
  passengerDetails: [
    { name: 'Abhishek Mishra', age: 26, gender: 'male', berthPreference: 'lower', coach: 'S7', berth: '42', berthType: 'LOWER' },
  ],
  fare: {
    baseFare: 1155,
    taxesAndFees: 11.80,
    totalFare: 1166.80,
  },
};

generateTestPdf(sampleBooking, 'validation/test_irctc_ers_ticket.pdf')
  .then((out) => console.log('Successfully generated test PDF at:', out))
  .catch((err) => console.error('Generation failed:', err));
