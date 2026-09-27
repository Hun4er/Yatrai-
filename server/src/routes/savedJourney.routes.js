import { Router } from 'express';
import savedJourneyController from '../controllers/savedJourney.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// POST /api/saved-journeys
router.post('/', savedJourneyController.save);

// GET /api/saved-journeys
router.get('/', savedJourneyController.list);

// GET /api/saved-journeys/check/:journeyId
router.get('/check/:journeyId', savedJourneyController.check);

// DELETE /api/saved-journeys/:journeyId
router.delete('/:journeyId', savedJourneyController.remove);

export default router;
