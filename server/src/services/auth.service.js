import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { User } from '../models/User.js';
import { RefreshSession } from '../models/RefreshSession.js';

/**
 * Parses time string (e.g. '7d', '15m', '1h') to milliseconds.
 *
 * @param {string|number} duration
 * @returns {number} milliseconds
 */
export function parseDurationToMs(duration) {
  if (typeof duration === 'number') return duration;
  const match = /^(\d+)([smhd])$/.exec(String(duration).trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const val = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's':
      return val * 1000;
    case 'm':
      return val * 60 * 1000;
    case 'h':
      return val * 60 * 60 * 1000;
    case 'd':
      return val * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}

/**
 * Computes SHA-256 hash of a raw token for secure database storage.
 *
 * @param {string} token
 * @returns {string} hex-encoded hash
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Helper to construct an application error with HTTP status and machine code.
 */
function createAuthError(message, status = 401, code = 'UNAUTHORIZED') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/**
 * Returns standardized cookie options for refresh token transport.
 *
 * @returns {import('express').CookieOptions}
 */
export function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: config.auth.cookieSameSite,
    path: '/api/auth',
    maxAge: parseDurationToMs(config.auth.jwtRefreshExpiresIn),
  };
}

/**
 * Returns options for clearing the refresh token cookie upon logout.
 *
 * @returns {import('express').CookieOptions}
 */
export function getClearCookieOptions() {
  return {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: config.auth.cookieSameSite,
    path: '/api/auth',
  };
}

/**
 * Issues a short-lived JWT access token containing minimal claims ({ sub: userId }).
 *
 * @param {string} userId
 * @returns {string} signed JWT
 */
function generateAccessToken(userId, role = 'user') {
  return jwt.sign({ sub: userId, role }, config.auth.jwtAccessSecret, {
    expiresIn: config.auth.jwtAccessExpiresIn,
  });
}

/**
 * Creates a cryptographically random refresh token and records its hash in a RefreshSession.
 *
 * @param {string} userId
 * @returns {Promise<{ rawRefreshToken: string, expiresAt: Date }>}
 */
async function createRefreshSession(userId) {
  const rawRefreshToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashToken(rawRefreshToken);
  const expiresAt = new Date(Date.now() + parseDurationToMs(config.auth.jwtRefreshExpiresIn));

  await RefreshSession.create({
    user: userId,
    tokenHash,
    expiresAt,
  });

  return { rawRefreshToken, expiresAt };
}

/**
 * Authentication Service
 * Implements core authentication business logic isolated from controllers and routes.
 */
export const authService = {
  /**
   * Registers a new user with email and password.
   *
   * @param {Object} params
   * @param {string} params.name
   * @param {string} params.email
   * @param {string} params.password
   * @returns {Promise<{ user: Object, accessToken: string, rawRefreshToken: string, refreshTokenExpiresAt: Date }>}
   */
  async registerUser({ name, email, password }) {
    const normalizedEmail = (email || '').trim().toLowerCase();

    // Check pre-existing account
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      throw createAuthError(
        'An account with this email address already exists.',
        409,
        'DUPLICATE_EMAIL'
      );
    }

    // Hash password with bcrypt
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    let user;
    try {
      user = new User({
        name: (name || '').trim(),
        email: normalizedEmail,
        passwordHash,
      });
      await user.save();
    } catch (err) {
      if (err.code === 11000) {
        throw createAuthError(
          'An account with this email address already exists.',
          409,
          'DUPLICATE_EMAIL'
        );
      }
      throw err;
    }

    // Issue tokens and session
    const { rawRefreshToken, expiresAt } = await createRefreshSession(user._id);
    const accessToken = generateAccessToken(user._id.toString(), user.role || 'user');

    return {
      user: user.toJSON(),
      accessToken,
      rawRefreshToken,
      refreshTokenExpiresAt: expiresAt,
    };
  },

  /**
   * Authenticates user credentials and generates access/refresh tokens.
   * Uses generic error messages to prevent user enumeration.
   *
   * @param {Object} params
   * @param {string} params.email
   * @param {string} params.password
   * @returns {Promise<{ user: Object, accessToken: string, rawRefreshToken: string, refreshTokenExpiresAt: Date }>}
   */
  async loginUser({ email, password }) {
    const normalizedEmail = (email || '').trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
    if (!user || !user.passwordHash) {
      throw createAuthError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    // Check account status
    if (user.status === 'suspended' || user.status === 'inactive') {
      throw createAuthError(
        'Your account has been deactivated or suspended.',
        403,
        'ACCOUNT_DISABLED'
      );
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw createAuthError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const { rawRefreshToken, expiresAt } = await createRefreshSession(user._id);
    const accessToken = generateAccessToken(user._id.toString(), user.role || 'user');

    return {
      user: user.toJSON(),
      accessToken,
      rawRefreshToken,
      refreshTokenExpiresAt: expiresAt,
    };
  },

  /**
   * Refreshes an active session, rotating the refresh token and issuing a new access token.
   *
   * @param {string} rawRefreshToken
   * @returns {Promise<{ user: Object, accessToken: string, rawRefreshToken: string, refreshTokenExpiresAt: Date }>}
   */
  async refreshSession(rawRefreshToken) {
    if (!rawRefreshToken) {
      throw createAuthError('Refresh token is required', 401, 'MISSING_REFRESH_TOKEN');
    }

    const tokenHash = hashToken(rawRefreshToken);
    const session = await RefreshSession.findOne({ tokenHash });

    if (!session) {
      throw createAuthError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }

    if (session.revokedAt) {
      throw createAuthError('Refresh token has been revoked', 401, 'REVOKED_REFRESH_TOKEN');
    }

    if (session.expiresAt <= new Date()) {
      throw createAuthError('Refresh token has expired', 401, 'EXPIRED_REFRESH_TOKEN');
    }

    const user = await User.findById(session.user);
    if (!user) {
      throw createAuthError('User associated with session not found', 401, 'USER_NOT_FOUND');
    }

    if (user.status === 'suspended' || user.status === 'inactive') {
      throw createAuthError(
        'Your account has been deactivated or suspended.',
        403,
        'ACCOUNT_DISABLED'
      );
    }

    // Token Rotation: revoke old session and create a new one
    session.revokedAt = new Date();
    await session.save();

    const { rawRefreshToken: newRawRefreshToken, expiresAt: newExpiresAt } =
      await createRefreshSession(user._id);
    const accessToken = generateAccessToken(user._id.toString(), user.role || 'user');

    return {
      user: user.toJSON(),
      accessToken,
      rawRefreshToken: newRawRefreshToken,
      refreshTokenExpiresAt: newExpiresAt,
    };
  },

  /**
   * Revokes the active refresh session.
   * Note: Logout revokes the server-side refresh session and clears the cookie.
   * Already-issued stateless JWT access tokens remain valid until their short-lived expiry.
   *
   * @param {string} [rawRefreshToken]
   * @returns {Promise<{ success: boolean }>}
   */
  async logoutUser(rawRefreshToken) {
    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      const session = await RefreshSession.findOne({ tokenHash });
      if (session && !session.revokedAt) {
        session.revokedAt = new Date();
        await session.save();
      }
    }

    return { success: true };
  },

  /**
   * Retrieves the current authenticated user by their ID.
   *
   * @param {string} userId
   * @returns {Promise<Object>} Safe user representation
   */
  async getCurrentUser(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw createAuthError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (user.status === 'suspended' || user.status === 'inactive') {
      throw createAuthError(
        'Your account has been deactivated or suspended.',
        403,
        'ACCOUNT_DISABLED'
      );
    }

    return user.toJSON();
  },
};

export default authService;
