import { Router } from 'express';
import bookingController from '../controllers/booking.controller.js';
import { optionalAuthenticate } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * POST /api/booking/prepare
 * Evaluates booking feasibility, compliance rules, and handoff.
 */
router.post('/prepare', optionalAuthenticate, bookingController.prepare);

export default router;
