import bookingService from '../services/bookingService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

export const bookingController = {
  /**
   * POST /api/booking/prepare
   * Evaluates booking feasibility for a discovered journey.
   */
  async prepare(req, res, next) {
    try {
      const { journeyId, passengers = 1, passengerDetails = [] } = req.body || {};

      if (!journeyId) {
        return res
          .status(400)
          .json(errorResponse('Journey ID is required for booking preparation.', 'VALIDATION_ERROR'));
      }

      const prepResult = await bookingService.prepareBooking(journeyId, passengerDetails);

      if (!prepResult.allowed) {
        return res.status(200).json({
          success: false,
          allowed: false,
          reason: prepResult.reason,
          message: prepResult.message,
          complianceNotice: prepResult.complianceNotice,
          legs: prepResult.legs || [],
        });
      }

      return res.status(200).json(
        successResponse('Booking prepared successfully', {
          allowed: true,
          bookingIntentId: prepResult.bookingIntentId,
          provider: prepResult.provider,
          journeyId,
          passengerCount: passengers,
        })
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/booking
   * Creates a booking with idempotency and passenger validation.
   */
  async create(req, res, next) {
    try {
      const {
        journeyId,
        journeySnapshot,
        passengerDetails,
        contactInfo,
        idempotencyKey,
      } = req.body || {};

      const booking = await bookingService.createBooking({
        userId: req.user.id,
        journeyId,
        journeySnapshot,
        passengerDetails,
        contactInfo,
        idempotencyKey,
      });

      return res.status(201).json(
        successResponse('Booking created successfully', {
          booking,
        })
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/booking/my-bookings
   * Lists all bookings for the authenticated user.
   */
  async getMyBookings(req, res, next) {
    try {
      const bookings = await bookingService.getUserBookings(req.user.id, {
        status: req.query.status,
      });

      return res.status(200).json(
        successResponse('Bookings retrieved successfully', {
          bookings,
          count: bookings.length,
        })
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/booking/:id
   * Retrieves single booking by ID or Reference with ownership check.
   */
  async getById(req, res, next) {
    try {
      const booking = await bookingService.getBookingById(
        req.params.id,
        req.user.id,
        req.user.role
      );

      return res.status(200).json(
        successResponse('Booking details retrieved', {
          booking,
        })
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/booking/:id/pdf
   * Generates and downloads the PDF Ticket / Journey Summary document.
   */
  async downloadPdf(req, res, next) {
    try {
      const pdfBuffer = await bookingService.getBookingPdf(
        req.params.id,
        req.user.id,
        req.user.role
      );

      const booking = await bookingService.getBookingById(
        req.params.id,
        req.user.id,
        req.user.role
      );

      const docName = booking.isConfirmed
        ? `Yatrai_Ticket_${booking.bookingReference}.pdf`
        : `Yatrai_Journey_Summary_${booking.bookingReference}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${docName}"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      return res.send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  },
};

export default bookingController;
