import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';

export const notificationService = {
  async create(notificationData) {
    const userExists = await User.exists({ _id: notificationData.user });
    if (!userExists) {
      throw new Error(`Referenced User '${notificationData.user}' does not exist.`);
    }

    const notification = new Notification(notificationData);
    return await notification.save();
  },

  async findByUser(userId, unreadOnly = false) {
    const filter = { user: userId };
    if (unreadOnly) {
      filter.read = false;
    }
    return await Notification.find(filter).sort({ createdAt: -1 });
  },

  async markAsRead(id) {
    return await Notification.findByIdAndUpdate(
      id,
      { read: true, readAt: new Date() },
      { returnDocument: 'after' }
    );
  },

  async delete(id) {
    return await Notification.findByIdAndDelete(id);
  },
};

export default notificationService;
