import { Router } from 'express';
import { journeyController } from '../controllers/journey.controller.js';
import { optionalAuthenticate } from '../middleware/auth.middleware.js';
import { validateJourneySearch } from '../middleware/validate.middleware.js';

const router = Router();

/**
 * POST /api/journeys/search
 * Core internal journey-search pipeline endpoint.
 * Supports both authenticated and unauthenticated queries.
 */
router.post('/search', optionalAuthenticate, validateJourneySearch, journeyController.search);

/**
 * POST /api/journeys/search/natural
 * Natural language journey search endpoint (Phase 11).
 * Interprets user natural language into structured request and executes search.
 */
router.post('/search/natural', optionalAuthenticate, journeyController.searchNatural);

/**
 * POST /api/journeys/interpret
 * Compact travel intent parsing and candidate location resolution.
 */
router.post('/interpret', optionalAuthenticate, journeyController.interpret);

/**
 * POST /api/journeys/recover
 * On-demand railway recovery engine execution.
 */
router.post('/recover', optionalAuthenticate, validateJourneySearch, journeyController.recover);

/**
 * GET /api/journeys/:id/availability
 * Refresh real-time seat availability for a journey.
 */
router.get('/:id/availability', optionalAuthenticate, journeyController.getAvailability);

/**
 * GET /api/journeys/:id/fare
 * Refresh real-time fare calculation for a journey.
 */
router.get('/:id/fare', optionalAuthenticate, journeyController.getFare);

export default router;
