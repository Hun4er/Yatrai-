import { Router } from 'express';
import journeyHistoryController from '../controllers/journeyHistory.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// POST /api/journey-history
router.post('/', journeyHistoryController.record);

// GET /api/journey-history
router.get('/', journeyHistoryController.list);

// DELETE /api/journey-history
router.delete('/', journeyHistoryController.clear);

export default router;
