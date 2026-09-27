import express from 'express';
import notificationController from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// All notification endpoints are protected by authentication
router.use(authenticate);

// List notifications & unread count
router.get('/', notificationController.list);
router.get('/unread-count', notificationController.unreadCount);

// Mark read
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:id/read', notificationController.markAsRead);

// Remove notification
router.delete('/:id', notificationController.delete);

// Reminder sweep trigger
router.post('/reminders/sweep', notificationController.triggerSweep);

export default router;
