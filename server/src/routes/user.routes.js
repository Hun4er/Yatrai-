import { Router } from 'express';
import userController from '../controllers/user.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// GET /api/users/me (Protected route)
router.get('/me', authenticate, userController.getProfile);

export default router;
