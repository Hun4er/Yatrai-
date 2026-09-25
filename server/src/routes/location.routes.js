import { Router } from 'express';
import locationController from '../controllers/location.controller.js';

const router = Router();

// GET /api/locations/search?q=Delhi
router.get('/search', locationController.search);

// POST /api/locations/resolve
router.post('/resolve', locationController.resolve);

// GET /api/locations/:id
router.get('/:id', locationController.getById);

export default router;
