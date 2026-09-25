import { Router } from 'express';
import authController from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  validateRegister,
  validateLogin,
  validateRefresh,
} from '../middleware/validate.middleware.js';

const router = Router();

// POST /api/auth/register
router.post('/register', validateRegister, authController.register);

// POST /api/auth/login
router.post('/login', validateLogin, authController.login);

// POST /api/auth/refresh
router.post('/refresh', validateRefresh, authController.refresh);

// POST /api/auth/logout
router.post('/logout', authController.logout);

// GET /api/auth/me (Protected route)
router.get('/me', authenticate, authController.getMe);

export default router;
