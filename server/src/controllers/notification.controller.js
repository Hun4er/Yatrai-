import notificationService from '../services/notificationService.js';
import reminderService from '../services/notifications/reminderService.js';
import { successResponse } from '../utils/apiResponse.js';

export const notificationController = {
  /**
   * GET /api/notifications
   * Retrieves paginated notifications for the authenticated user.
   */
  async list(req, res, next) {
    try {
      const { page, limit, unreadOnly } = req.query;
      const result = await notificationService.listUserNotifications(req.user.id, {
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        unreadOnly: unreadOnly === 'true',
      });

      return res.status(200).json(
        successResponse('Notifications retrieved successfully', result)
      );
    } catch (error) {
      return next(error);
    }
  },

  /**
   * GET /api/notifications/unread-count
   * Retrieves the count of unread notifications for the authenticated user.
   */
  async unreadCount(req, res, next) {
    try {
      const count = await notificationService.getUnreadCount(req.user.id);
      return res.status(200).json(
        successResponse('Unread notification count retrieved successfully', { count })
      );
    } catch (error) {
      return next(error);
    }
  },

  /**
   * PATCH /api/notifications/:id/read
   * Marks a specific notification as read.
   */
  async markAsRead(req, res, next) {
    try {
      const { id } = req.params;
      const updated = await notificationService.markAsRead(id, req.user.id);
      return res.status(200).json(
        successResponse('Notification marked as read', { notification: updated })
      );
    } catch (error) {
      return next(error);
    }
  },

  /**
   * PATCH /api/notifications/read-all
   * Marks all unread notifications for the authenticated user as read.
   */
  async markAllAsRead(req, res, next) {
    try {
      const result = await notificationService.markAllAsRead(req.user.id);
      return res.status(200).json(
        successResponse('All notifications marked as read', result)
      );
    } catch (error) {
      return next(error);
    }
  },

  /**
   * DELETE /api/notifications/:id
   * Deletes a specific notification belonging to the authenticated user.
   */
  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const result = await notificationService.deleteNotification(id, req.user.id);
      return res.status(200).json(
        successResponse('Notification removed successfully', result)
      );
    } catch (error) {
      return next(error);
    }
  },

  /**
   * POST /api/notifications/reminders/sweep
   * Triggers a reminder sweep for the authenticated user.
   */
  async triggerSweep(req, res, next) {
    try {
      const { leadTimeHours } = req.body;
      const result = await reminderService.sweepReminders({
        userId: req.user.id,
        leadTimeHours: leadTimeHours ? parseInt(leadTimeHours, 10) : undefined,
      });

      return res.status(200).json(
        successResponse('Reminder sweep executed successfully', result)
      );
    } catch (error) {
      return next(error);
    }
  },
};

export default notificationController;
