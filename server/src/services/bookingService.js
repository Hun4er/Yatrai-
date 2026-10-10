import { Booking } from '../models/Booking.js';
import journeyService from './journeyService.js';
import aopayAdapter from '../providers/rail/aopay.adapter.js';
import pdfService from './pdfService.js';
import logger from '../utils/logger.js';

/**
 * Generate unique Yatrai booking reference
 * Format: YTR-BK-XXXXXX-XXXX
 */
function generateBookingReference() {
  const timePart = Date.now().toString(36).toUpperCase();
  const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `YTR-BK-${timePart}-${randPart}`;
}

export const bookingService = {
  /**
   * Evaluates booking feasibility for a journey.
   */
  async prepareBooking(journeyId, passengerDetails = []) {
    const journey = await journeyService.getJourneyWithLegs(journeyId);
    if (!journey) {
      const err = new Error('Journey not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    return await aopayAdapter.prepareBooking(journey, passengerDetails);
  },

  /**
   * Creates a new booking attempt with idempotency and compliance checks.
   * Enforces Section 4: Never marks an unconfirmed railway reservation as confirmed.
   */
  async createBooking({
    userId,
    journeyId,
    journeySnapshot: clientSnapshot,
    passengerDetails = [],
    contactInfo = {},
    idempotencyKey = null,
  }) {
    if (!userId) {
      const err = new Error('User authentication is required to make a booking');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    // 1. Idempotency Check: Return existing booking if duplicate request
    if (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim()) {
      const existing = await Booking.findOne({ user: userId, idempotencyKey: idempotencyKey.trim() });
      if (existing) {
        logger.info(`[BookingService] Returning existing booking for idempotencyKey: ${idempotencyKey}`);
        return existing;
      }
    }

    // 2. Fetch authoritative journey
    let journey = null;
    if (journeyId) {
      journey = await journeyService.getJourneyWithLegs(journeyId).catch(() => null);
    }

    // Fallback to client snapshot if journey document has expired or is provided
    let snapshot = null;
    if (journey) {
      snapshot = {
        id: journey.id || journey._id,
        origin: journey.origin,
        destination: journey.destination,
        departureTime: journey.departureTime,
        arrivalTime: journey.arrivalTime,
        duration: journey.duration,
        totalDistance: journey.totalDistance,
        totalPrice: journey.totalPrice,
        currency: journey.currency || 'INR',
        numberOfTransfers: journey.numberOfTransfers,
        transportModes: journey.transportModes,
        legs: Array.isArray(journey.legs)
          ? journey.legs.map((l) => ({
              sequence: l.sequence,
              mode: l.mode,
              origin: l.origin,
              destination: l.destination,
              departureTime: l.departureTime,
              arrivalTime: l.arrivalTime,
              duration: l.duration,
              price: l.price,
              vehicle: l.vehicle,
              service: l.service,
              availability: l.booking?.status || 'VERIFIED',
            }))
          : [],
      };
    } else if (clientSnapshot && clientSnapshot.origin && clientSnapshot.destination) {
      snapshot = clientSnapshot;
    } else {
      const err = new Error('Journey details not found or expired. Please perform a fresh search.');
      err.statusCode = 404;
      err.code = 'JOURNEY_NOT_FOUND';
      throw err;
    }

    // 3. Passenger validation
    if (!Array.isArray(passengerDetails) || passengerDetails.length === 0) {
      const err = new Error('At least one passenger is required.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (passengerDetails.length > 6) {
      const err = new Error('Maximum of 6 passengers permitted per booking under IRCTC guidelines.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    const validatedPassengers = passengerDetails.map((p, idx) => {
      const name = (p.name || '').trim();
      const age = Number(p.age);
      const gender = (p.gender || '').toLowerCase().trim();

      if (!name || name.length < 2) {
        const err = new Error(`Passenger ${idx + 1}: Name must be at least 2 characters.`);
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }
      if (isNaN(age) || age < 1 || age > 120) {
        const err = new Error(`Passenger ${idx + 1}: Valid age between 1 and 120 is required.`);
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }
      if (!['male', 'female', 'other'].includes(gender)) {
        const err = new Error(`Passenger ${idx + 1}: Gender must be male, female, or other.`);
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }

      return {
        name,
        age,
        gender,
        berthPreference: p.berthPreference || 'no_preference',
        category: p.category || 'general',
      };
    });

    // 4. Contact validation
    const email = (contactInfo.email || '').trim().toLowerCase();
    const phone = (contactInfo.phone || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const err = new Error('A valid contact email address is required.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    if (!phone || phone.length < 7) {
      const err = new Error('A valid contact phone number is required.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    // 5. Fare calculation
    const passengerCount = validatedPassengers.length;
    const basePerPassenger = Number(snapshot.totalPrice) > 0 ? Number(snapshot.totalPrice) : 380;
    const baseFare = basePerPassenger * passengerCount;
    const taxesAndFees = 0; // Transparent: no hidden fees
    const totalFare = baseFare + taxesAndFees;

    // 6. Provider Verification & Compliance
    // Checks if provider integration has live authorized booking access
    let bookingStatus = 'unconfirmed';
    let isConfirmed = false;
    let pnr = null;
    let providerBookingRef = null;
    let complianceNotice =
      'Per Indian Railways (IRCTC) regulations, this document represents an itinerary and fare summary. Official railway tickets must be confirmed via authorized IRCTC channels.';

    if (journey) {
      const prepResult = await aopayAdapter.prepareBooking(journey, validatedPassengers).catch(() => null);
      if (prepResult?.allowed && prepResult?.isConfirmedBooking) {
        bookingStatus = 'confirmed';
        isConfirmed = true;
        pnr = prepResult.pnr || null;
        providerBookingRef = prepResult.bookingIntentId || null;
      } else if (prepResult?.complianceNotice) {
        complianceNotice = prepResult.complianceNotice;
      }
    }

    // 7. Persist Booking
    const booking = new Booking({
      user: userId,
      bookingReference: generateBookingReference(),
      journey: journey ? (journey.id || journey._id) : null,
      journeySnapshot: snapshot,
      passengerDetails: validatedPassengers,
      contactInfo: { email, phone },
      fare: {
        baseFare,
        taxesAndFees,
        totalFare,
        currency: snapshot.currency || 'INR',
      },
      status: bookingStatus,
      isConfirmed,
      complianceNotice,
      provider: 'Indian Railways / IRCTC',
      providerBookingReference: providerBookingRef,
      pnr,
      idempotencyKey: idempotencyKey ? idempotencyKey.trim() : null,
    });

    await booking.save();
    return booking;
  },

  /**
   * Retrieves bookings belonging to a specific user.
   */
  async getUserBookings(userId, options = {}) {
    if (!userId) return [];
    const query = { user: userId };
    if (options.status) {
      query.status = options.status;
    }
    return await Booking.find(query).sort({ createdAt: -1 });
  },

  /**
   * Retrieves a single booking with strict ownership check.
   */
  async getBookingById(bookingId, userId, userRole = 'user') {
    let booking = null;
    // Check if ID is a valid ObjectId
    if (/^[0-9a-fA-F]{24}$/.test(bookingId)) {
      booking = await Booking.findById(bookingId);
    }
    if (!booking) {
      booking = await Booking.findOne({ bookingReference: bookingId.toUpperCase() });
    }

    if (!booking) {
      const err = new Error('Booking not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    // Ownership check (IDOR Defense)
    if (userRole !== 'admin' && booking.user.toString() !== userId.toString()) {
      const err = new Error('You do not have permission to access this booking record.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    return booking;
  },

  /**
   * Generates PDF for a specific booking.
   */
  async getBookingPdf(bookingId, userId, userRole = 'user') {
    const booking = await this.getBookingById(bookingId, userId, userRole);
    return await pdfService.generateBookingPdf(booking);
  },
};

export default bookingService;
