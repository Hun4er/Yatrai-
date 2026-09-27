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

export default router;
