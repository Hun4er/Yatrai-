import userService from '../services/userService.js';
import { successResponse } from '../utils/apiResponse.js';

export const userController = {
  /**
   * GET /api/users/me
   * Retrieves profile of current authenticated user.
   */
  async getProfile(req, res, next) {
    try {
      const user = await userService.getProfile(req.user.id);
      return res.status(200).json(
        successResponse('User profile retrieved successfully', { user })
      );
    } catch (error) {
      return next(error);
    }
  },
};

export default userController;
