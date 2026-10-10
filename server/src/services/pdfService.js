import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to Yatrai logo in client/public
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
 * Format duration in minutes
 */
function formatDuration(minutes) {
  if (!minutes || isNaN(minutes)) return 'N/A';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

export const pdfService = {
  /**
   * Generates a PDF Document for a Booking.
   * Resolves with a Buffer containing the complete PDF.
   *
   * @param {Object} booking - Fully populated or formatted Booking document
   * @returns {Promise<Buffer>}
   */
  async generateBookingPdf(booking) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 36, // 0.5 inch margins
          info: {
            Title: `Yatrai Booking - ${booking.bookingReference}`,
            Author: 'Yatrai Journey Intelligence Platform',
            Subject: booking.isConfirmed ? 'Electronic Reservation Slip' : 'Journey Summary',
            Keywords: 'Yatrai, IRCTC, Railway, Travel, Booking',
          },
        });

        const buffers = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const isConfirmed = Boolean(booking.isConfirmed && booking.status === 'confirmed');
        const primaryPurple = '#581c87'; // Brand Purple 900
        const accentPurple = '#7c3aed';  // Brand Purple 600
        const darkGray = '#1f2937';
        const lightGray = '#4b5563';
        const borderGray = '#e5e7eb';
        const pageLeft = 36;
        const pageWidth = 595.28 - 72; // A4 width minus margins (approx 523pt)
        let currentY = 36;

        // 1. Header Banner & Branding
        if (fs.existsSync(LOGO_PATH)) {
          try {
            doc.image(LOGO_PATH, pageLeft, currentY, { width: 110 });
          } catch {
            // fallback text logo if image parsing fails
            doc.fillColor(primaryPurple).fontSize(22).font('Helvetica-Bold').text('YATRAI', pageLeft, currentY);
          }
        } else {
          doc.fillColor(primaryPurple).fontSize(22).font('Helvetica-Bold').text('YATRAI', pageLeft, currentY);
        }

        // Header Title on Right
        doc
          .fillColor(primaryPurple)
          .fontSize(12)
          .font('Helvetica-Bold')
          .text(isConfirmed ? 'ELECTRONIC RESERVATION SLIP (ERS)' : 'JOURNEY SUMMARY', pageLeft + 200, currentY, {
            width: pageWidth - 200,
            align: 'right',
          });

        doc
          .fillColor(lightGray)
          .fontSize(8.5)
          .font('Helvetica')
          .text(
            isConfirmed ? 'OFFICIAL RAILWAY CONFIRMATION' : 'NOT A CONFIRMED RAILWAY TICKET',
            pageLeft + 200,
            currentY + 16,
            { width: pageWidth - 200, align: 'right' }
          );

        currentY += 50;

        // 2. Status Banner / Warning Box
        if (isConfirmed) {
          doc
            .rect(pageLeft, currentY, pageWidth, 28)
            .fillAndStroke('#ecfdf5', '#10b981'); // Emerald green box
          doc
            .fillColor('#065f46')
            .fontSize(9.5)
            .font('Helvetica-Bold')
            .text(
              `CONFIRMED RESERVATION  ·  PNR: ${booking.pnr || 'CONFIRMED'}  ·  REF: ${booking.bookingReference}`,
              pageLeft + 12,
              currentY + 9
            );
          currentY += 38;
        } else {
          // Mandatory Requirement: Explicitly labelled Journey Summary Notice
          doc
            .roundedRect(pageLeft, currentY, pageWidth, 42, 4)
            .fillAndStroke('#fffbeb', '#f59e0b'); // Amber box
          
          doc
            .fillColor('#92400e')
            .fontSize(9)
            .font('Helvetica-Bold')
            .text('IMPORTANT TRAVEL NOTICE — NOT A VALID RAILWAY TICKET', pageLeft + 12, currentY + 7);

          doc
            .fillColor('#78350f')
            .fontSize(7.5)
            .font('Helvetica')
            .text(
              'This document is a travel itinerary and fare summary planned on Yatrai. It does NOT confirm seat reservation and CANNOT be used to board Indian Railways trains. Official reservations must be completed via IRCTC authorized channels using the train details below.',
              pageLeft + 12,
              currentY + 20,
              { width: pageWidth - 24, lineGap: 1 }
            );
          currentY += 52;
        }

        // 3. Metadata Grid (Booking Ref, Date, Contact)
        const metaBoxY = currentY;
        doc
          .roundedRect(pageLeft, metaBoxY, pageWidth, 54, 4)
          .fillAndStroke('#f9fafb', borderGray);

        const col1 = pageLeft + 12;
        const col2 = pageLeft + 140;
        const col3 = pageLeft + 270;
        const col4 = pageLeft + 400;

        doc.fillColor(lightGray).fontSize(7.5).font('Helvetica');
        doc.text('BOOKING REFERENCE', col1, metaBoxY + 8);
        doc.text('DATE GENERATED (IST)', col2, metaBoxY + 8);
        doc.text('CONTACT EMAIL', col3, metaBoxY + 8);
        doc.text('CONTACT PHONE', col4, metaBoxY + 8);

        doc.fillColor(darkGray).fontSize(8.5).font('Helvetica-Bold');
        doc.text(booking.bookingReference || 'N/A', col1, metaBoxY + 20);
        doc.text(`${formatIstDate(booking.createdAt)} ${formatIstTime(booking.createdAt)}`, col2, metaBoxY + 20);
        doc.text(booking.contactInfo?.email || 'N/A', col3, metaBoxY + 20);
        doc.text(booking.contactInfo?.phone || 'N/A', col4, metaBoxY + 20);

        doc.fillColor(lightGray).fontSize(7.5).font('Helvetica');
        doc.text('BOOKING STATUS', col1, metaBoxY + 34);
        doc.text('PROVIDER', col2, metaBoxY + 34);
        doc.text('TOTAL PASSENGERS', col3, metaBoxY + 34);

        doc.fillColor(isConfirmed ? '#059669' : '#d97706').fontSize(8.5).font('Helvetica-Bold');
        doc.text((booking.status || 'UNCONFIRMED').toUpperCase(), col1, metaBoxY + 43);
        doc.fillColor(darkGray);
        doc.text(booking.provider || 'Indian Railways / IRCTC', col2, metaBoxY + 43);
        doc.text(`${booking.passengerDetails?.length || 1} Traveller(s)`, col3, metaBoxY + 43);

        currentY += 66;

        // 4. Journey Itinerary Section
        const snap = booking.journeySnapshot || {};
        const originName = snap.origin?.name || snap.origin?.city || 'Origin';
        const destName = snap.destination?.name || snap.destination?.city || 'Destination';
        const originCode = snap.origin?.code ? `[${snap.origin.code}]` : '';
        const destCode = snap.destination?.code ? `[${snap.destination.code}]` : '';

        doc
          .fillColor(primaryPurple)
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('JOURNEY ITINERARY', pageLeft, currentY);
        currentY += 16;

        const itBoxY = currentY;
        doc
          .roundedRect(pageLeft, itBoxY, pageWidth, 56, 4)
          .fillAndStroke('#f8fafc', borderGray);

        doc.fillColor(darkGray).fontSize(10).font('Helvetica-Bold');
        doc.text(`${originName} ${originCode}`, pageLeft + 12, itBoxY + 10);
        doc.fillColor(accentPurple).text('→', pageLeft + 220, itBoxY + 10);
        doc.fillColor(darkGray).text(`${destName} ${destCode}`, pageLeft + 245, itBoxY + 10);

        doc.fillColor(lightGray).fontSize(8).font('Helvetica');
        doc.text(`Departure: ${formatIstDate(snap.departureTime)} at ${formatIstTime(snap.departureTime)} IST`, pageLeft + 12, itBoxY + 28);
        doc.text(`Arrival: ${formatIstDate(snap.arrivalTime)} at ${formatIstTime(snap.arrivalTime)} IST`, pageLeft + 245, itBoxY + 28);

        doc.text(
          `Duration: ${formatDuration(snap.duration)}  ·  Transfers: ${snap.numberOfTransfers || 0}  ·  Distance: ${snap.totalDistance ? `${Math.round(snap.totalDistance)} km` : 'N/A'}`,
          pageLeft + 12,
          itBoxY + 42
        );

        currentY += 68;

        // 5. Train Segments (Legs)
        const legs = Array.isArray(snap.legs) && snap.legs.length > 0 ? snap.legs : [];
        if (legs.length > 0) {
          doc
            .fillColor(primaryPurple)
            .fontSize(11)
            .font('Helvetica-Bold')
            .text('TRAIN & SERVICE DETAILS', pageLeft, currentY);
          currentY += 16;

          // Leg Table Header
          doc.rect(pageLeft, currentY, pageWidth, 18).fillAndStroke('#ede9fe', '#ddd6fe');
          doc.fillColor(primaryPurple).fontSize(7.5).font('Helvetica-Bold');
          doc.text('#', pageLeft + 6, currentY + 5);
          doc.text('TRAIN / SERVICE', pageLeft + 24, currentY + 5);
          doc.text('FROM', pageLeft + 155, currentY + 5);
          doc.text('TO', pageLeft + 265, currentY + 5);
          doc.text('DEP (IST)', pageLeft + 375, currentY + 5);
          doc.text('ARR (IST)', pageLeft + 430, currentY + 5);
          doc.text('CLASS', pageLeft + 485, currentY + 5);
          currentY += 18;

          legs.forEach((leg, idx) => {
            const trainNum = leg.vehicle?.identifier || leg.service?.number || leg.trainNumber || 'Special';
            const trainName = leg.service?.name || leg.vehicle?.type || 'Train';
            const fromStation = leg.origin?.name || leg.origin?.city || 'From';
            const fromStCode = leg.origin?.code ? ` (${leg.origin.code})` : '';
            const toStation = leg.destination?.name || leg.destination?.city || 'To';
            const toStCode = leg.destination?.code ? ` (${leg.destination.code})` : '';
            const travelClass = leg.service?.class || '3A / SL';

            const rowHeight = 22;
            doc.rect(pageLeft, currentY, pageWidth, rowHeight).fillAndStroke(idx % 2 === 0 ? '#ffffff' : '#f9fafb', borderGray);

            doc.fillColor(darkGray).fontSize(7.5).font('Helvetica-Bold');
            doc.text(`${idx + 1}`, pageLeft + 6, currentY + 6);
            doc.text(`${trainNum} ${trainName}`.slice(0, 26), pageLeft + 24, currentY + 6);
            doc.font('Helvetica');
            doc.text(`${fromStation}${fromStCode}`.slice(0, 24), pageLeft + 155, currentY + 6);
            doc.text(`${toStation}${toStCode}`.slice(0, 24), pageLeft + 265, currentY + 6);
            doc.text(formatIstTime(leg.departureTime), pageLeft + 375, currentY + 6);
            doc.text(formatIstTime(leg.arrivalTime), pageLeft + 430, currentY + 6);
            doc.font('Helvetica-Bold').text(travelClass, pageLeft + 485, currentY + 6);

            currentY += rowHeight;
          });

          currentY += 14;
        }

        // 6. Passenger List Table
        const passengers = Array.isArray(booking.passengerDetails) ? booking.passengerDetails : [];
        doc
          .fillColor(primaryPurple)
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('PASSENGER DETAILS', pageLeft, currentY);
        currentY += 16;

        doc.rect(pageLeft, currentY, pageWidth, 18).fillAndStroke('#ede9fe', '#ddd6fe');
        doc.fillColor(primaryPurple).fontSize(7.5).font('Helvetica-Bold');
        doc.text('#', pageLeft + 6, currentY + 5);
        doc.text('PASSENGER NAME', pageLeft + 24, currentY + 5);
        doc.text('AGE', pageLeft + 190, currentY + 5);
        doc.text('GENDER', pageLeft + 230, currentY + 5);
        doc.text('BERTH PREFERENCE', pageLeft + 295, currentY + 5);
        doc.text('CATEGORY', pageLeft + 400, currentY + 5);
        doc.text('STATUS', pageLeft + 465, currentY + 5);
        currentY += 18;

        passengers.forEach((p, idx) => {
          const rowHeight = 20;
          doc.rect(pageLeft, currentY, pageWidth, rowHeight).fillAndStroke(idx % 2 === 0 ? '#ffffff' : '#f9fafb', borderGray);

          const berth = (p.berthPreference || 'no_preference').replace('_', ' ').toUpperCase();
          const category = (p.category || 'general').replace('_', ' ').toUpperCase();
          const passStatus = isConfirmed ? 'CONFIRMED' : 'RESERVATION REQ';

          doc.fillColor(darkGray).fontSize(7.5).font('Helvetica-Bold');
          doc.text(`${idx + 1}`, pageLeft + 6, currentY + 6);
          doc.text((p.name || '').toUpperCase().slice(0, 32), pageLeft + 24, currentY + 6);
          doc.font('Helvetica');
          doc.text(`${p.age || 'N/A'}`, pageLeft + 190, currentY + 6);
          doc.text(`${(p.gender || 'N/A').toUpperCase()}`, pageLeft + 230, currentY + 6);
          doc.text(berth, pageLeft + 295, currentY + 6);
          doc.text(category, pageLeft + 400, currentY + 6);
          doc.font('Helvetica-Bold').fillColor(isConfirmed ? '#059669' : '#d97706');
          doc.text(passStatus, pageLeft + 465, currentY + 6);

          currentY += rowHeight;
        });

        currentY += 16;

        // 7. Fare Summary Box
        doc
          .fillColor(primaryPurple)
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('FARE & PAYMENT SUMMARY', pageLeft, currentY);
        currentY += 16;

        const fareBoxY = currentY;
        doc
          .roundedRect(pageLeft, fareBoxY, pageWidth, 50, 4)
          .fillAndStroke('#f8fafc', borderGray);

        const baseFare = booking.fare?.baseFare || 0;
        const taxes = booking.fare?.taxesAndFees || 0;
        const totalFare = booking.fare?.totalFare || baseFare;
        const currency = booking.fare?.currency || 'INR';

        doc.fillColor(lightGray).fontSize(8).font('Helvetica');
        doc.text('Base Journey Fare:', pageLeft + 16, fareBoxY + 10);
        doc.text(`Taxes & Partner Charges:`, pageLeft + 16, fareBoxY + 24);
        doc.text('Payment / Settlement Status:', pageLeft + 240, fareBoxY + 10);

        doc.fillColor(darkGray).fontSize(8.5).font('Helvetica-Bold');
        doc.text(`Rs. ${baseFare.toLocaleString('en-IN')}`, pageLeft + 120, fareBoxY + 10);
        doc.text(`Rs. ${taxes.toLocaleString('en-IN')}`, pageLeft + 120, fareBoxY + 24);
        doc.text(isConfirmed ? 'PAID / SETTLED' : 'NO PAYMENT COLLECTED (HANDOFF)', pageLeft + 360, fareBoxY + 10);

        // Highlight Total
        doc
          .rect(pageLeft + 240, fareBoxY + 24, pageWidth - 250, 20)
          .fillAndStroke('#ede9fe', accentPurple);
        doc.fillColor(primaryPurple).fontSize(9).font('Helvetica-Bold');
        doc.text(`TOTAL FARE (${currency}):  Rs. ${totalFare.toLocaleString('en-IN')}`, pageLeft + 250, fareBoxY + 29);

        currentY += 62;

        // 8. Footer & IRCTC Compliance Disclaimer
        doc
          .strokeColor(borderGray)
          .lineWidth(0.5)
          .moveTo(pageLeft, 770)
          .lineTo(pageLeft + pageWidth, 770)
          .stroke();

        doc
          .fillColor(lightGray)
          .fontSize(6.8)
          .font('Helvetica')
          .text(
            'Yatrai Journey Intelligence Platform  ·  One Goal. Every Route.  ·  https://yatrai.in\nCustomer Support: support@yatrai.in  ·  Operational Timings strictly calculated under Indian Standard Time (IST).',
            pageLeft,
            776,
            { width: pageWidth, align: 'center', lineGap: 1 }
          );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  },
};

export default pdfService;
