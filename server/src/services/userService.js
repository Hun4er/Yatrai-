import { User } from '../models/User.js';

export const userService = {
  async create(userData) {
    const user = new User(userData);
    return await user.save();
  },

  async findById(id) {
    return await User.findById(id);
  },

  async findByEmail(email) {
    return await User.findOne({ email: email.toLowerCase().trim() });
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
};

export default userService;
