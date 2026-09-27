import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Journey from '../models/Journey.js';
import SavedJourney from '../models/SavedJourney.js';
import config from '../config/index.js';

/**
 * Notification Service (Phase 1 & Phase 14)
 * Coordinates user-scoped notification storage, read state, pagination, and idempotent delivery.
 */
export const notificationService = {
  // ============================================================================
  // PHASE 1 COMPATIBILITY METHODS
  // ============================================================================

  async create(notificationData) {
    const userExists = await User.exists({ _id: notificationData.user });
    if (!userExists) {
      throw new Error(`Referenced User '${notificationData.user}' does not exist.`);
    }

    const notification = new Notification({
      ...notificationData,
      data: notificationData.data || notificationData.metadata || {},
      metadata: notificationData.metadata || notificationData.data || {},
    });
    return await notification.save();
  },

  async findByUser(userId, unreadOnly = false) {
    const filter = { user: userId };
    if (unreadOnly) {
      filter.read = false;
    }
    return await Notification.find(filter).sort({ createdAt: -1 });
  },

  async delete(id) {
    return await Notification.findByIdAndDelete(id);
  },

  // ============================================================================
  // PHASE 14 NOTIFICATION METHODS (Scoped strictly by authenticated user)
  // ============================================================================

  /**
   * Create a notification with deterministic idempotency.
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string} params.type
   * @param {string} params.title
   * @param {string} params.message
   * @param {string|mongoose.Types.ObjectId} [params.journeyId]
   * @param {string|mongoose.Types.ObjectId} [params.savedJourneyId]
   * @param {Object} [params.metadata]
   * @param {string} [params.idempotencyKey]
   * @returns {Promise<Object>} Created or existing notification
   */
  async createNotification({
    userId,
    type,
    title,
    message,
    journeyId = null,
    savedJourneyId = null,
    metadata = {},
    idempotencyKey = null,
  }) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      const err = new Error('Invalid user identifier.');
      err.statusCode = 400;
      err.code = 'INVALID_USER_ID';
      throw err;
    }

    const userExists = await User.exists({ _id: userId });
    if (!userExists) {
      const err = new Error('User not found.');
      err.statusCode = 404;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    // Idempotency check: if notification with key already exists, return it safely
    if (idempotencyKey) {
      const existing = await Notification.findOne({ idempotencyKey });
      if (existing) {
        existing._isExisting = true;
        return existing;
      }
    }

    // Validate journey if supplied
    let validJourneyId = null;
    if (journeyId && mongoose.Types.ObjectId.isValid(journeyId)) {
      const jExists = await Journey.exists({ _id: journeyId });
      if (jExists) validJourneyId = journeyId;
    }

    // Validate saved journey if supplied
    let validSavedJourneyId = null;
    if (savedJourneyId && mongoose.Types.ObjectId.isValid(savedJourneyId)) {
      const sExists = await SavedJourney.exists({ _id: savedJourneyId, user: userId });
      if (sExists) validSavedJourneyId = savedJourneyId;
    }

    const payload = {
      user: userId,
      type,
      title,
      message,
      journey: validJourneyId,
      savedJourney: validSavedJourneyId,
      metadata,
      data: metadata,
      read: false,
      readAt: null,
    };
    if (idempotencyKey) {
      payload.idempotencyKey = idempotencyKey;
    }

    try {
      const doc = await Notification.create(payload);
      doc._isExisting = false;

      // Maintain retention limit per user
      const maxPerUser = config.notifications?.maxPerUser || 100;
      const count = await Notification.countDocuments({ user: userId });
      if (count > maxPerUser) {
        const excess = count - maxPerUser;
        const oldest = await Notification.find({ user: userId })
          .sort({ createdAt: 1 })
          .limit(excess)
          .select('_id');
        if (oldest.length > 0) {
          const idsToDelete = oldest.map((d) => d._id);
          await Notification.deleteMany({ _id: { $in: idsToDelete } });
        }
      }

      return doc;
    } catch (err) {
      // If a race condition caused duplicate idempotencyKey, return the existing record
      if (err.code === 11000 && idempotencyKey) {
        const existing = await Notification.findOne({ idempotencyKey });
        if (existing) {
          existing._isExisting = true;
          return existing;
        }
      }
      throw err;
    }
  },

  /**
   * Retrieve paginated notifications for the authenticated user.
   *
   * @param {string|mongoose.Types.ObjectId} userId
   * @param {Object} [options]
   * @param {number} [options.page=1]
   * @param {number} [options.limit=20]
   * @param {boolean} [options.unreadOnly=false]
   * @returns {Promise<Object>}
   */
  async listUserNotifications(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      const err = new Error('Invalid user identifier.');
      err.statusCode = 400;
      err.code = 'INVALID_USER_ID';
      throw err;
    }

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (safePage - 1) * safeLimit;

    const filter = { user: userId };
    if (unreadOnly) {
      filter.read = false;
    }

    const [total, notifications] = await Promise.all([
      Notification.countDocuments(filter),
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .populate({
          path: 'journey',
          select: 'origin destination departureTime arrivalTime duration totalPrice currency transportModes numberOfTransfers status',
          populate: [
            { path: 'origin', select: 'name city state coordinates' },
            { path: 'destination', select: 'name city state coordinates' },
          ],
        })
        .populate({
          path: 'savedJourney',
          select: 'name notes createdAt',
        }),
    ]);

    const formatted = notifications.map((n) => {
      const obj = n.toJSON();
      return {
        id: obj.id,
        type: obj.type,
        title: obj.title,
        message: obj.message,
        read: obj.read,
        readAt: obj.readAt,
        createdAt: obj.createdAt,
        metadata: obj.metadata || obj.data || {},
        journey: obj.journey || null,
        savedJourney: obj.savedJourney || null,
      };
    });

    return {
      notifications: formatted,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit) || 1,
    };
  },

  /**
   * Get unread notification count for an authenticated user.
   *
   * @param {string|mongoose.Types.ObjectId} userId
   * @returns {Promise<number>}
   */
  async getUnreadCount(userId) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return 0;
    }
    return await Notification.countDocuments({ user: userId, read: false });
  },

  /**
   * Mark a single notification as read (with authorization check).
   *
   * @param {string|mongoose.Types.ObjectId} notificationId
   * @param {string|mongoose.Types.ObjectId} [userId] - Required for strict IDOR authorization
   * @returns {Promise<Object>}
   */
  async markAsRead(notificationId, userId = null) {
    if (!notificationId || !mongoose.Types.ObjectId.isValid(notificationId)) {
      const err = new Error('Invalid notification identifier.');
      err.statusCode = 400;
      err.code = 'INVALID_NOTIFICATION_ID';
      throw err;
    }

    const query = { _id: notificationId };
    if (userId) {
      query.user = userId;
    }

    const updated = await Notification.findOneAndUpdate(
      query,
      { read: true, readAt: new Date() },
      { returnDocument: 'after' }
    );

    if (!updated) {
      const err = new Error('Notification not found or not owned by user.');
      err.statusCode = 404;
      err.code = 'NOTIFICATION_NOT_FOUND';
      throw err;
    }

    return updated;
  },

  /**
   * Mark all unread notifications as read for the authenticated user.
   *
   * @param {string|mongoose.Types.ObjectId} userId
   * @returns {Promise<{ updatedCount: number }>}
   */
  async markAllAsRead(userId) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      const err = new Error('Invalid user identifier.');
      err.statusCode = 400;
      err.code = 'INVALID_USER_ID';
      throw err;
    }

    const result = await Notification.updateMany(
      { user: userId, read: false },
      { read: true, readAt: new Date() }
    );

    return { updatedCount: result.modifiedCount || 0 };
  },

  /**
   * Delete a notification (with authorization check).
   *
   * @param {string|mongoose.Types.ObjectId} notificationId
   * @param {string|mongoose.Types.ObjectId} userId
   * @returns {Promise<{ deleted: boolean }>}
   */
  async deleteNotification(notificationId, userId) {
    if (!notificationId || !mongoose.Types.ObjectId.isValid(notificationId)) {
      const err = new Error('Invalid notification identifier.');
      err.statusCode = 400;
      err.code = 'INVALID_NOTIFICATION_ID';
      throw err;
    }

    const deleted = await Notification.findOneAndDelete({
      _id: notificationId,
      user: userId,
    });

    if (!deleted) {
      const err = new Error('Notification not found or not owned by user.');
      err.statusCode = 404;
      err.code = 'NOTIFICATION_NOT_FOUND';
      throw err;
    }

    return { deleted: true };
  },
};

export default notificationService;
