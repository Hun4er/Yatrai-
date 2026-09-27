import mongoose from 'mongoose';
import User from '../models/User.js';

/**
 * User Profile & Account Service (Phase 1 & Phase 13)
 * Handles account lifecycle, safe profile retrieval, and user metadata scoping.
 */
export const userService = {
  // ============================================================================
  // PHASE 1 CRUD METHODS (Preserved for Backward Compatibility)
  // ============================================================================

  async create(userData) {
    const user = new User(userData);
    return await user.save();
  },

  async findById(id) {
    return await User.findById(id);
  },

  async findByEmail(email) {
    return await User.findOne({ email });
  },

  async update(id, updateData) {
    return await User.findByIdAndUpdate(id, updateData, {
      returnDocument: 'after',
      runValidators: true,
    });
  },

  async delete(id) {
    return await User.findByIdAndDelete(id);
  },

  // ============================================================================
  // PHASE 13 PROFILE METHODS
  // ============================================================================

  /**
   * Retrieves safe user profile for an authenticated user.
   * Strips passwordHash and internal security fields.
   *
   * @param {string|mongoose.Types.ObjectId} userId
   * @returns {Promise<Object>} Safe user profile
   */
  async getProfile(userId) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      const err = new Error('Invalid user identifier.');
      err.statusCode = 400;
      err.code = 'INVALID_USER_ID';
      throw err;
    }

    const user = await User.findById(userId).select('-passwordHash');
    if (!user) {
      const err = new Error('User profile not found.');
      err.statusCode = 404;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    return user.toJSON();
  },
};

export default userService;
