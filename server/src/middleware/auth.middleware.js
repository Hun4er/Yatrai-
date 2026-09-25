import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { errorResponse } from '../utils/apiResponse.js';

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
    req.user = { id: decoded.sub };
    req.auth = { userId: decoded.sub };

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

export default authenticate;
