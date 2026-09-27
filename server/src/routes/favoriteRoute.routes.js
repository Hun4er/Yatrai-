import { Router } from 'express';
import favoriteRouteController from '../controllers/favoriteRoute.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// POST /api/favorite-routes
router.post('/', favoriteRouteController.add);

// GET /api/favorite-routes
router.get('/', favoriteRouteController.list);

// GET /api/favorite-routes/check?origin=...&destination=...
router.get('/check', favoriteRouteController.check);

// DELETE /api/favorite-routes/:id
router.delete('/:id', favoriteRouteController.remove);

export default router;
