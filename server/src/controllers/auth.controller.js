import config from '../config/index.js';
import authService, {
  getRefreshCookieOptions,
  getClearCookieOptions,
} from '../services/auth.service.js';
import { successResponse } from '../utils/apiResponse.js';

/**
 * Authentication Controller
 * Thin controller layer orchestrating auth requests and responses.
 */
export const authController = {
  /**
   * POST /api/auth/register
   * Registers a new user account, attaches refresh cookie, and returns access token.
   */
  async register(req, res, next) {
    try {
      const { name, email, password } = req.body;
      const { user, accessToken, rawRefreshToken } = await authService.registerUser({
        name,
        email,
        password,
      });

      res.cookie(config.auth.cookieName, rawRefreshToken, getRefreshCookieOptions());

      return res.status(201).json(
        successResponse('User registered successfully', {
          user,
          accessToken,
        })
      );
    } catch (error) {
      return next(error);
    }
  },

  /**
   * POST /api/auth/login
   * Authenticates credentials, attaches refresh cookie, and returns access token.
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const { user, accessToken, rawRefreshToken } = await authService.loginUser({
        email,
        password,
      });

      res.cookie(config.auth.cookieName, rawRefreshToken, getRefreshCookieOptions());

      return res.status(200).json(
        successResponse('User logged in successfully', {
          user,
          accessToken,
        })
      );
    } catch (error) {
      return next(error);
    }
  },

  /**
   * POST /api/auth/refresh
   * Rotates refresh session, updates cookie, and returns new access token.
   */
  async refresh(req, res, next) {
    try {
      const rawRefreshToken = req.cookies?.[config.auth.cookieName] || req.body?.refreshToken;
      const {
        user,
        accessToken,
        rawRefreshToken: newRawRefreshToken,
      } = await authService.refreshSession(rawRefreshToken);

      res.cookie(config.auth.cookieName, newRawRefreshToken, getRefreshCookieOptions());

      return res.status(200).json(
        successResponse('Token refreshed successfully', {
          user,
          accessToken,
        })
      );
    } catch (error) {
      return next(error);
    }
  },

  /**
   * POST /api/auth/logout
   * Revokes refresh session and clears HTTP-only refresh cookie.
   */
  async logout(req, res, next) {
    try {
      const rawRefreshToken = req.cookies?.[config.auth.cookieName] || req.body?.refreshToken;
      await authService.logoutUser(rawRefreshToken);

      res.clearCookie(config.auth.cookieName, getClearCookieOptions());

      return res.status(200).json(successResponse('Logged out successfully'));
    } catch (error) {
      return next(error);
    }
  },

  /**
   * GET /api/auth/me
   * Returns current authenticated user profile.
   */
  async getMe(req, res, next) {
    try {
      const user = await authService.getCurrentUser(req.user.id);

      return res.status(200).json(
        successResponse('Authenticated user retrieved successfully', {
          user,
        })
      );
    } catch (error) {
      return next(error);
    }
  },
};

export default authController;
