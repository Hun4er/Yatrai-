/**
 * Parser Schema and Two-Stage Validation
 *
 * Enforces strict typing, field allowlisting, numeric boundaries, and business rules
 * on structured model parser responses before any search execution can occur.
 */

export const ALLOWED_TRANSPORT_MODES = ['rail', 'bus', 'flight', 'road', 'walk', 'metro', 'taxi'];

export const ALLOWED_RANKING_STRATEGIES = [
  'overall',
  'fastest',
  'cheapest',
  'fewest_transfers',
  'most_convenient',
];

/**
 * Stage 1: Validates and sanitizes raw model output against the parser contract schema.
 *
 * @param {Object} rawOutput - Output received from LLM or rule-based parser
 * @returns {Object} Sanitized object conforming to parser contract
 */
export function validateParserSchema(rawOutput) {
  if (!rawOutput || typeof rawOutput !== 'object') {
    return {
      isValid: false,
      errors: ['Model output must be a valid JSON object.'],
      data: null,
    };
  }

  const errors = [];
  const sanitized = {};

  // 1. Origin
  if (rawOutput.origin !== undefined && rawOutput.origin !== null) {
    if (typeof rawOutput.origin !== 'string' || !rawOutput.origin.trim()) {
      errors.push('Origin must be a non-empty string.');
    } else if (rawOutput.origin.length > 100) {
      errors.push('Origin string exceeds maximum length of 100 characters.');
    } else {
      sanitized.origin = rawOutput.origin.trim();
    }
  } else {
    sanitized.origin = null;
  }

  // 2. Destination
  if (rawOutput.destination !== undefined && rawOutput.destination !== null) {
    if (typeof rawOutput.destination !== 'string' || !rawOutput.destination.trim()) {
      errors.push('Destination must be a non-empty string.');
    } else if (rawOutput.destination.length > 100) {
      errors.push('Destination string exceeds maximum length of 100 characters.');
    } else {
      sanitized.destination = rawOutput.destination.trim();
    }
  } else {
    sanitized.destination = null;
  }

  // 3. Departure Date
  if (rawOutput.departureDate !== undefined && rawOutput.departureDate !== null) {
    if (typeof rawOutput.departureDate !== 'string') {
      errors.push('Departure date must be a string representation.');
    } else {
      sanitized.departureDate = rawOutput.departureDate.trim();
    }
  } else {
    sanitized.departureDate = null;
  }

  // 4. Departure Window
  if (rawOutput.departureWindow !== undefined && rawOutput.departureWindow !== null) {
    if (typeof rawOutput.departureWindow === 'object') {
      sanitized.departureWindow = {
        start: rawOutput.departureWindow.start || null,
        end: rawOutput.departureWindow.end || null,
        bucket: rawOutput.departureWindow.bucket || 'custom',
      };
    } else if (typeof rawOutput.departureWindow === 'string') {
      sanitized.departureWindow = rawOutput.departureWindow.trim();
    } else {
      errors.push('Departure window must be an object or string.');
    }
  } else {
    sanitized.departureWindow = null;
  }

  // 5. Max Budget
  if (rawOutput.maxBudget !== undefined && rawOutput.maxBudget !== null) {
    const budgetNum = Number(rawOutput.maxBudget);
    if (isNaN(budgetNum) || budgetNum < 0) {
      errors.push('Max budget must be a non-negative number.');
    } else {
      sanitized.maxBudget = budgetNum;
    }
  } else {
    sanitized.maxBudget = null;
  }

  // 6. Transport Types / Modes
  if (rawOutput.transportTypes !== undefined && rawOutput.transportTypes !== null) {
    if (!Array.isArray(rawOutput.transportTypes)) {
      errors.push('Transport types must be an array of mode strings.');
    } else {
      const validModes = rawOutput.transportTypes
        .map((m) => String(m).toLowerCase().trim())
        .filter((m) => ALLOWED_TRANSPORT_MODES.includes(m));
      sanitized.transportTypes = Array.from(new Set(validModes));
    }
  } else {
    sanitized.transportTypes = [];
  }

  // 7. Passengers
  if (rawOutput.passengers !== undefined && rawOutput.passengers !== null) {
    const pNum = Number(rawOutput.passengers);
    if (!Number.isInteger(pNum) || pNum < 1) {
      errors.push('Passengers count must be an integer >= 1.');
    } else {
      sanitized.passengers = pNum;
    }
  } else {
    sanitized.passengers = 1;
  }

  // 8. Ranking strategy
  if (rawOutput.ranking !== undefined && rawOutput.ranking !== null) {
    const cleanRank = String(rawOutput.ranking).toLowerCase().trim();
    if (ALLOWED_RANKING_STRATEGIES.includes(cleanRank)) {
      sanitized.ranking = cleanRank;
    } else {
      sanitized.ranking = 'overall';
    }
  } else {
    sanitized.ranking = 'overall';
  }

  // 9. Missing fields array
  if (Array.isArray(rawOutput.missingFields)) {
    sanitized.missingFields = rawOutput.missingFields.map(String);
  } else {
    sanitized.missingFields = [];
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: sanitized,
  };
}

/**
 * Stage 2: Application Business Validation and Ambiguity / Clarification Detection.
 *
 * @param {Object} parsedData - Sanitized output from Stage 1
 * @returns {Object} Evaluated result with clarification prompts if required
 */
export function validateBusinessRules(parsedData) {
  const missingFields = [...(parsedData.missingFields || [])];

  if (!parsedData.origin) {
    if (!missingFields.includes('origin')) missingFields.push('origin');
  }

  if (!parsedData.destination) {
    if (!missingFields.includes('destination')) missingFields.push('destination');
  }

  if (!parsedData.departureDate) {
    if (!missingFields.includes('departureDate')) missingFields.push('departureDate');
  }

  if (
    parsedData.origin &&
    parsedData.destination &&
    parsedData.origin.toLowerCase() === parsedData.destination.toLowerCase()
  ) {
    return {
      status: 'invalid',
      isValid: false,
      message: 'Origin and destination cannot be the same place.',
      missingFields: [],
      data: parsedData,
    };
  }

  if (missingFields.length > 0) {
    let clarificationPrompt = 'Please clarify your journey details.';
    if (missingFields.includes('origin') && missingFields.includes('destination')) {
      clarificationPrompt = 'Where are you travelling from and to?';
    } else if (missingFields.includes('origin')) {
      clarificationPrompt = 'Where are you travelling from?';
    } else if (missingFields.includes('destination')) {
      clarificationPrompt = 'Where would you like to travel to?';
    } else if (missingFields.includes('departureDate')) {
      clarificationPrompt = 'When would you like to depart?';
    }

    return {
      status: 'needs_clarification',
      isValid: false,
      message: clarificationPrompt,
      missingFields,
      data: parsedData,
    };
  }

  return {
    status: 'ready',
    isValid: true,
    message: null,
    missingFields: [],
    data: parsedData,
  };
}

export default {
  validateParserSchema,
  validateBusinessRules,
  ALLOWED_TRANSPORT_MODES,
  ALLOWED_RANKING_STRATEGIES,
};
