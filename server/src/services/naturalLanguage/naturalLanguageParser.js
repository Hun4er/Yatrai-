/**
 * Natural Language Parser Service
 *
 * Master coordinator for natural language search queries in Yatrai.
 * Enforces sanitization, timezone context injection, model abstraction execution,
 * and two-stage validation before returning a canonical structured SearchRequest.
 */

import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { modelAdapter } from './modelAdapter.js';
import { resolveDate, getCurrentDateInTimezone } from './dateResolver.js';
import { resolveTimeWindow } from './timeWindowResolver.js';
import { validateParserSchema, validateBusinessRules } from './parserSchema.js';

export class NaturalLanguageParser {
  constructor(options = {}) {
    this.adapter = options.adapter || modelAdapter;
    this.maxQueryLength = options.maxQueryLength || config.ai?.maxQueryLength || 500;
    this.defaultTimezone = options.timezone || config.ai?.timezone || 'Asia/Kolkata';
  }

  /**
   * Sanitizes untrusted user query string.
   */
  sanitizeQuery(query) {
    if (!query || typeof query !== 'string') {
      const err = new Error('Natural language query must be a non-empty string.');
      err.statusCode = 400;
      err.code = 'INVALID_QUERY';
      throw err;
    }

    const trimmed = query.trim();
    if (trimmed.length === 0) {
      const err = new Error('Query string cannot be empty.');
      err.statusCode = 400;
      err.code = 'INVALID_QUERY';
      throw err;
    }

    if (trimmed.length > this.maxQueryLength) {
      const err = new Error(`Query length (${trimmed.length}) exceeds maximum limit of ${this.maxQueryLength} characters.`);
      err.statusCode = 400;
      err.code = 'QUERY_TOO_LONG';
      throw err;
    }

    // Strip control characters (except common whitespace)
    return trimmed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  /**
   * Parses natural language query into validated structured search request.
   *
   * @param {string} rawQuery
   * @param {Object} [options={}]
   * @param {string} [options.currentDate] - Reference date (YYYY-MM-DD)
   * @param {string} [options.timezone] - Timezone
   * @returns {Promise<Object>}
   */
  async parse(rawQuery, options = {}) {
    const startTime = Date.now();
    const query = this.sanitizeQuery(rawQuery);
    const timezone = options.timezone || this.defaultTimezone;
    const currentDate = options.currentDate || getCurrentDateInTimezone(timezone);

    logger.debug(`[NaturalLanguageParser] Parsing query: "${query}" (refDate=${currentDate}, tz=${timezone})`);

    // 1. Invoke Model / Deterministic Adapter
    const rawModelOutput = await this.adapter.parseSearchIntent(query, {
      currentDate,
      timezone,
    });

    // 2. Stage 1: Schema Validation
    const schemaValidation = validateParserSchema(rawModelOutput);
    if (!schemaValidation.isValid) {
      logger.warn('[NaturalLanguageParser] Stage 1 schema validation rejected model output:', schemaValidation.errors);
      const err = new Error(`Model parser output invalid: ${schemaValidation.errors.join('; ')}`);
      err.statusCode = 422;
      err.code = 'PARSER_SCHEMA_ERROR';
      throw err;
    }

    const sanitizedData = schemaValidation.data;

    // 3. Deterministically ensure date and time-window resolution
    if (sanitizedData.departureDate) {
      const resolved = resolveDate(sanitizedData.departureDate, { currentDate, timezone });
      sanitizedData.departureDate = resolved || sanitizedData.departureDate;
    }

    if (sanitizedData.departureWindow) {
      sanitizedData.departureWindow = resolveTimeWindow(sanitizedData.departureWindow);
    }

    // 4. Stage 2: Business Rules & Missing Fields Validation
    const businessValidation = validateBusinessRules(sanitizedData);

    const latencyMs = Date.now() - startTime;
    logger.debug(`[NaturalLanguageParser] Parsed with status "${businessValidation.status}" in ${latencyMs}ms`);

    // 5. Build Canonical Structured Request
    const structuredRequest = {
      origin: sanitizedData.origin,
      destination: sanitizedData.destination,
      departureDate: sanitizedData.departureDate,
      passengers: sanitizedData.passengers || 1,
      requestedModes: sanitizedData.transportTypes || [],
      ranking: sanitizedData.ranking || 'overall',
      preferences: {
        maxBudget: sanitizedData.maxBudget,
        departureWindow: sanitizedData.departureWindow,
        priority: sanitizedData.ranking || 'balanced',
      },
    };

    return {
      status: businessValidation.status, // 'ready' | 'needs_clarification' | 'invalid'
      isValid: businessValidation.isValid,
      message: businessValidation.message,
      missingFields: businessValidation.missingFields,
      structuredRequest,
      rawQuery: query,
      meta: {
        latencyMs,
        currentDate,
        timezone,
      },
    };
  }
}

export const naturalLanguageParser = new NaturalLanguageParser();
export default naturalLanguageParser;
