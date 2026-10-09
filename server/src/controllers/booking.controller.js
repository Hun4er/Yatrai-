import aopayAdapter from '../providers/rail/aopay.adapter.js';
import journeyService from '../services/journeyService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

export const bookingController = {
  /**
   * POST /api/booking/prepare
   * Evaluates booking feasibility for a discovered journey.
   * Enforces Section 6 & 16:
   * - Never claims an alternative is bookable unless verified.
   * - Never books multi-leg journeys as a single ticket.
   * - Truthfully reports when booking is unauthorized or unsupported.
   */
  async prepare(req, res, next) {
    try {
      const { journeyId, passengers = 1, passengerDetails = [] } = req.body || {};

      if (!journeyId) {
        return res.status(400).json(errorResponse('Journey ID is required for booking preparation.', 'VALIDATION_ERROR'));
      }

      const journey = await journeyService.findById(journeyId);
      if (!journey) {
        return res.status(404).json(errorResponse('Journey not found.', 'NOT_FOUND'));
      }

      const prepResult = await aopayAdapter.prepareBooking(journey, passengerDetails);

      if (!prepResult.allowed) {
        return res.status(200).json({
          success: false,
          allowed: false,
          reason: prepResult.reason,
          message: prepResult.message,
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
};

export default bookingController;
