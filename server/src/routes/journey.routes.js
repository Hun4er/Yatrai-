import { Router } from 'express';
import { journeyController } from '../controllers/journey.controller.js';
import { journeyV2Controller } from '../controllers/journeyV2.controller.js';
import { optionalAuthenticate } from '../middleware/auth.middleware.js';
import { validateJourneySearch } from '../middleware/validate.middleware.js';

const router = Router();

/**
 * POST /api/journeys/search
 * Core internal journey-search pipeline endpoint.
 * Supports both legacy orchestrator search and P0 v2 budget-aware search.
 */
router.post('/search', optionalAuthenticate, (req, res, next) => {
  if (req.body?.actionId || req.body?.origins) {
    return journeyV2Controller.search(req, res, next);
  }
  return validateJourneySearch(req, res, () => journeyController.search(req, res, next));
});

/**
 * P0 v2 endpoints aliased on /api/journeys for compatibility
 */
router.post('/check-class', optionalAuthenticate, journeyV2Controller.checkClass);
router.post('/refresh-card', optionalAuthenticate, journeyV2Controller.refreshCard);
router.post('/more-trains', optionalAuthenticate, journeyV2Controller.moreTrains);

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
 * Legacy endpoint retired in P0 v2 (HTTP 410 Gone).
 */
router.get('/:id/availability', (req, res) => {
  return res.status(410).json({
    success: false,
    error: {
      code: 'ENDPOINT_RETIRED',
      message: 'This endpoint is retired (HTTP 410 Gone). Seat availability is now bundled in /api/v2/journeys/search and check-class responses.',
    },
  });
});

/**
 * GET /api/journeys/:id/fare
 * Legacy endpoint retired in P0 v2 (HTTP 410 Gone).
 */
router.get('/:id/fare', (req, res) => {
  return res.status(410).json({
    success: false,
    error: {
      code: 'ENDPOINT_RETIRED',
      message: 'This endpoint is retired (HTTP 410 Gone). Fares are now bundled in /api/v2/journeys/search and check-class responses.',
    },
  });
});

/**
 * GET /api/journeys/:id
 * Retrieve authoritative journey with legs.
 */
router.get('/:id', optionalAuthenticate, journeyController.getById);

export default router;
