import config from '../config/index.js';
import { errorResponse } from '../utils/apiResponse.js';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates registration input payload.
 */
export function validateRegister(req, res, next) {
  const { name, email, password } = req.body || {};
  const errors = [];

  // Name validation
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('Full name is required');
  } else if (name.trim().length > 100) {
    errors.push('Name cannot exceed 100 characters');
  }

  // Email validation
  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    errors.push('Email is required');
  } else if (!emailRegex.test(email.trim())) {
    errors.push('Please provide a valid email address');
  }

  // Password validation (do NOT trim or alter password)
  if (!password || typeof password !== 'string') {
    errors.push('Password is required');
  } else if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  } else if (password.length > 128) {
    errors.push('Password cannot exceed 128 characters');
  }

  if (errors.length > 0) {
    return res.status(400).json(errorResponse(errors.join(', '), 'VALIDATION_ERROR', { errors }));
  }

  return next();
}

/**
 * Validates login input payload.
 */
export function validateLogin(req, res, next) {
  const { email, password } = req.body || {};
  const errors = [];

  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    errors.push('Email is required');
  } else if (!emailRegex.test(email.trim())) {
    errors.push('Please provide a valid email address');
  }

  if (!password || typeof password !== 'string' || password.length === 0) {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    return res.status(400).json(errorResponse(errors.join(', '), 'VALIDATION_ERROR', { errors }));
  }

  return next();
}

/**
 * Validates refresh token presence in HTTP-only cookie or fallback body.
 */
export function validateRefresh(req, res, next) {
  const cookieName = config.auth.cookieName;
  const refreshToken = req.cookies?.[cookieName] || req.body?.refreshToken;

  if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim().length === 0) {
    return res.status(400).json(errorResponse('Refresh token is required', 'VALIDATION_ERROR'));
  }

  return next();
}

export default {
  validateRegister,
  validateLogin,
  validateRefresh,
};
