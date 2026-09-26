import config from '../config/index.js';
import { errorResponse } from '../utils/apiResponse.js';
import rankingRegistry from '../ranking/rankingRegistry.js';

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

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const ALLOWED_TRANSPORT_MODES = ['road', 'rail', 'bus', 'flight', 'walk', 'taxi', 'metro'];
const ALLOWED_PRIORITIES = ['fastest', 'cheapest', 'fewestTransfers', 'mostConvenient', 'balanced'];

/**
 * Validates date calendar correctness (prevents 2026-02-31 rollovers).
 */
function isValidCalendarDate(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  if (!ISO_DATE_REGEX.test(trimmed)) return false;

  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return false;

  const parts = trimmed.split(/[-T]/);
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const utcTest = new Date(Date.UTC(year, month - 1, day));
  return (
    utcTest.getUTCFullYear() === year &&
    utcTest.getUTCMonth() + 1 === month &&
    utcTest.getUTCDate() === day
  );
}

/**
 * Validates journey search request payload.
 */
export function validateJourneySearch(req, res, next) {
  const { origin, destination, departureDate, passengers, requestedModes, preferences } =
    req.body || {};
  const errors = [];

  // 1. Origin validation
  const originStr =
    typeof origin === 'string'
      ? origin.trim()
      : origin && typeof origin === 'object' && origin._id
        ? String(origin._id).trim()
        : '';

  if (!originStr) {
    errors.push('Origin location is required');
  }

  // 2. Destination validation
  const destStr =
    typeof destination === 'string'
      ? destination.trim()
      : destination && typeof destination === 'object' && destination._id
        ? String(destination._id).trim()
        : '';

  if (!destStr) {
    errors.push('Destination location is required');
  }

  // 3. Same origin and destination check
  if (originStr && destStr && originStr.toLowerCase() === destStr.toLowerCase()) {
    errors.push('Origin and destination cannot be the same');
  }

  // 4. Departure date validation
  if (!departureDate) {
    errors.push('Departure date is required');
  } else if (!isValidCalendarDate(departureDate)) {
    errors.push('Departure date must be a valid date in YYYY-MM-DD format');
  }

  // 5. Passengers validation (optional)
  if (passengers !== undefined) {
    const num = Number(passengers);
    if (!Number.isInteger(num) || num < 1) {
      errors.push('Passengers count must be a positive integer of at least 1');
    }
  }

  // 6. Requested modes validation (optional)
  if (requestedModes !== undefined) {
    if (!Array.isArray(requestedModes)) {
      errors.push('requestedModes must be an array of transport modes');
    } else {
      const invalidModes = requestedModes.filter((m) => !ALLOWED_TRANSPORT_MODES.includes(m));
      if (invalidModes.length > 0) {
        errors.push(
          `Invalid transport modes requested: ${invalidModes.join(', ')}. Supported modes: ${ALLOWED_TRANSPORT_MODES.join(', ')}`
        );
      }
    }
  }

  // 7. Preferences validation (optional)
  if (preferences !== undefined) {
    if (typeof preferences !== 'object' || preferences === null || Array.isArray(preferences)) {
      errors.push('preferences must be an object');
    } else {
      if (preferences.priority && !ALLOWED_PRIORITIES.includes(preferences.priority)) {
        errors.push(
          `Invalid priority "${preferences.priority}". Supported: ${ALLOWED_PRIORITIES.join(', ')}`
        );
      }
      if (preferences.maxBudget !== undefined && preferences.maxBudget !== null) {
        const budget = Number(preferences.maxBudget);
        if (isNaN(budget) || budget < 0) {
          errors.push('maxBudget must be a non-negative number');
        }
      }
      if (preferences.maxTransfers !== undefined && preferences.maxTransfers !== null) {
        const transfers = Number(preferences.maxTransfers);
        if (!Number.isInteger(transfers) || transfers < 0) {
          errors.push('maxTransfers must be a non-negative integer');
        }
      }
    }
  }

  // 8. Ranking strategy validation (optional)
  const rankingParam = req.body?.ranking !== undefined ? req.body.ranking : req.body?.sortBy;
  if (rankingParam !== undefined) {
    if (typeof rankingParam !== 'string' || !rankingRegistry.has(rankingParam)) {
      errors.push(
        `Invalid ranking strategy "${rankingParam}". Supported: ${rankingRegistry.getRegisteredIds().join(', ')}`
      );
    }
  }

  if (errors.length > 0) {
    return res.status(400).json(errorResponse(errors.join(', '), 'VALIDATION_ERROR', { errors }));
  }

  return next();
}

export default {
  validateRegister,
  validateLogin,
  validateRefresh,
  validateJourneySearch,
};
