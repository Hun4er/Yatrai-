import { Router } from 'express';
import { journeyV2Controller } from '../controllers/journeyV2.controller.js';
import { optionalAuthenticate } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * POST /api/v2/journeys/search
 *
 * Unified search: mode=direct|auto|alternatives|deep.
 * Client sends actionId per user click and reuses it for the automatic alternatives
 * follow-up (so they share one budget cap).
 */
router.post('/search', optionalAuthenticate, journeyV2Controller.search);

/**
 * POST /api/v2/journeys/check-class
 *
 * Single-class availability check triggered by tapping a "?" chip.
 * Cap: 100 calls under its own actionId.
 */
router.post('/check-class', optionalAuthenticate, journeyV2Controller.checkClass);

/**
 * POST /api/v2/journeys/refresh-card
 *
 * Bypasses cache and returns fresh availability for a specific card.
 * Server-side rate limit: 1 call per minute per card.
 */
router.post('/refresh-card', optionalAuthenticate, journeyV2Controller.refreshCard);

/**
 * POST /api/v2/journeys/more-trains
 *
 * Checks the next batch of up to 8 waiting trains using the round-1 class rule.
 * Uses the DEFAULT (40) cap.
 */
router.post('/more-trains', optionalAuthenticate, journeyV2Controller.moreTrains);

export default router;
