import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { errorResponse } from '../utils/apiResponse.js';
import { User } from '../models/User.js';

/**
 * Authentication Middleware
 * Validates Bearer JWT access tokens and attaches the authenticated user identity to req.user and req.auth.
 * Does not query the database on every request to ensure optimal latency.
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json(errorResponse('Authentication token is required', 'UNAUTHORIZED'));
  }

  if (!authHeader.startsWith('Bearer ')) {
    return res
      .status(401)
      .json(errorResponse('Authorization header must follow the Bearer format', 'UNAUTHORIZED'));
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json(errorResponse('Authentication token is malformed', 'UNAUTHORIZED'));
  }

  try {
    const decoded = jwt.verify(token, config.auth.jwtAccessSecret);

    if (!decoded || !decoded.sub) {
      return res
        .status(401)
        .json(errorResponse('Invalid token claims: missing subject identifier', 'UNAUTHORIZED'));
    }

    // Attach identity to request
    req.user = { id: decoded.sub, role: decoded.role || 'user' };
    req.auth = { userId: decoded.sub, role: decoded.role || 'user' };

    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res
        .status(401)
        .json(errorResponse('Authentication token has expired', 'TOKEN_EXPIRED'));
    }
    return res.status(401).json(errorResponse('Invalid authentication token', 'UNAUTHORIZED'));
  }
}

/**
 * Optional Authentication Middleware
 * Extracts identity from Bearer token if present and valid.
 * Does not reject unauthenticated requests.
 */
export function optionalAuthenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    req.auth = null;
    return next();
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    req.user = null;
    req.auth = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.auth.jwtAccessSecret);
    if (decoded && decoded.sub) {
      req.user = { id: decoded.sub };
      req.auth = { userId: decoded.sub };
    }
  } catch {
    req.user = null;
    req.auth = null;
  }

  return next();
}

/**
 * Admin Authorization Middleware (Phase 15)
 * Strict role-based backend verification.
 * 1. Verifies user is authenticated.
 * 2. Independently queries DB for live role and account status.
 * 3. Enforces user.role === 'admin' and user.status === 'active'.
 */
export async function requireAdmin(req, res, next) {
  if (!req.user || !req.user.id) {
    return res
      .status(401)
      .json(errorResponse('Authentication is required to access admin resources', 'UNAUTHORIZED'));
  }

  try {
    const user = await User.findById(req.user.id).select('role status name email');
    if (!user) {
      return res
        .status(401)
        .json(errorResponse('Authenticated user record not found', 'UNAUTHORIZED'));
    }

    if (user.status !== 'active') {
      return res
        .status(403)
        .json(errorResponse('Your account is deactivated or suspended', 'ACCOUNT_DISABLED'));
    }

    if (user.role !== 'admin') {
      return res
        .status(403)
        .json(errorResponse('Forbidden: Administrative privileges required', 'FORBIDDEN'));
    }

    req.adminUser = user;
    req.user.role = 'admin';
    return next();
  } catch (err) {
    return res
      .status(500)
      .json(errorResponse('Failed to verify administrative authorization', 'AUTHORIZATION_ERROR'));
  }
}

export default authenticate;

