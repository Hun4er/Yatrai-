import { Router } from 'express';
import bookingController from '../controllers/booking.controller.js';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * POST /api/booking/prepare
 * Evaluates booking feasibility, compliance rules, and handoff.
 */
router.post('/prepare', optionalAuthenticate, bookingController.prepare);

/**
 * POST /api/booking
 * Creates a verified booking attempt with idempotency.
 */
router.post('/', authenticate, bookingController.create);

/**
 * GET /api/booking/my-bookings
 * Retrieves all bookings for the authenticated user.
 */
router.get('/my-bookings', authenticate, bookingController.getMyBookings);

/**
 * GET /api/booking/pnr/:pnr
 * Checks PNR status for Yatrai-generated bookings.
 */
router.get('/pnr/:pnr', optionalAuthenticate, bookingController.checkPnr);
router.get('/pnr', optionalAuthenticate, bookingController.checkPnr);

/**
 * GET /api/booking/:id
 * Retrieves a single booking record by ID or Reference.
 */
router.get('/:id', authenticate, bookingController.getById);

/**
 * GET /api/booking/:id/pdf
 * Generates and downloads the PDF Ticket / Journey Summary document.
 */
router.get('/:id/pdf', authenticate, bookingController.downloadPdf);

export default router;
