import { Router } from 'express';
import recentSearchController from '../controllers/recentSearch.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// POST /api/searches/recent
router.post('/', recentSearchController.record);

// GET /api/searches/recent
router.get('/', recentSearchController.list);

// DELETE /api/searches/recent/:id
router.delete('/:id', recentSearchController.remove);

// DELETE /api/searches/recent (clear all)
router.delete('/', recentSearchController.clear);

export default router;
