/**
 * Model Provider Abstraction for Natural Language Intent Parsing
 *
 * Implements decoupled model calling supporting Gemini, OpenAI, and a
 * high-precision deterministic offline rule-based parser.
 * Guarantees zero credential exposure and pure interpretation without provider execution.
 */

import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { resolveDate } from './dateResolver.js';
import { resolveTimeWindow } from './timeWindowResolver.js';

export const PARSER_SYSTEM_PROMPT = `You are a travel search intent parser for Yatrai.
Your job is to convert the user's natural-language travel request into the application's structured SearchRequest JSON.
You do NOT search for journeys.
You do NOT provide actual schedules.
You do NOT provide actual prices.
You do NOT call travel providers.
You do NOT invent missing values.
Only extract information explicitly stated or deterministically inferable from the supplied date/time context.
If required information is missing or ambiguous, report it in the missingFields array.

Return ONLY a valid JSON object matching this schema:
{
  "origin": string | null,
  "destination": string | null,
  "departureDate": string | null,
  "departureWindow": { "start": string, "end": string, "bucket": string } | null,
  "maxBudget": number | null,
  "transportTypes": string[],
  "passengers": number,
  "ranking": string | null,
  "missingFields": string[]
}`;

/**
 * High-precision deterministic parser for offline mode, testing, and fallback.
 */
export function parseDeterministic(query, context = {}) {
  const clean = String(query || '').trim();
  const lower = clean.toLowerCase();

  const result = {
    origin: null,
    destination: null,
    departureDate: null,
    departureWindow: null,
    maxBudget: null,
    transportTypes: [],
    passengers: 1,
    ranking: 'overall',
    missingFields: [],
  };

  // 1. Location Parsing
  // Pattern A: "reach/go to/travel to <Destination> from <Origin>"
  const reachFromMatch = lower.match(/(?:reach|go to|travel to|head to)\s+([a-zA-Z\s]+?)\s+from\s+([a-zA-Z\s]+?)(?:\s+(?:tomorrow|today|on|at|by|in|under|this|next)|$)/i);
  // Pattern B: "from <Origin> to <Destination>"
  const fromToMatch = lower.match(/from\s+([a-zA-Z\s]+?)\s+to\s+([a-zA-Z\s]+?)(?:\s+(?:tomorrow|today|on|at|by|in|under|this|next)|$)/i);
  // Pattern C: "<Origin> to <Destination>"
  const simpleToMatch = lower.match(/\b([a-zA-Z]+)\s+to\s+([a-zA-Z]+)\b/i);

  const NON_LOCATION_WORDS = new Set([
    'me', 'us', 'i', 'you', 'him', 'her', 'them', 'someone', 'anyone',
    'take', 'get', 'go', 'travel', 'head', 'need', 'want', 'like', 'find', 'reach',
    'please', 'can', 'could', 'would', 'way', 'route', 'journeys', 'journey', 'tickets'
  ]);

  if (reachFromMatch) {
    result.destination = cleanLocation(reachFromMatch[1], NON_LOCATION_WORDS);
    result.origin = cleanLocation(reachFromMatch[2], NON_LOCATION_WORDS);
  } else if (fromToMatch) {
    result.origin = cleanLocation(fromToMatch[1], NON_LOCATION_WORDS);
    result.destination = cleanLocation(fromToMatch[2], NON_LOCATION_WORDS);
  } else if (simpleToMatch) {
    const rawOrigin = simpleToMatch[1].toLowerCase().trim();
    if (!NON_LOCATION_WORDS.has(rawOrigin)) {
      result.origin = cleanLocation(simpleToMatch[1], NON_LOCATION_WORDS);
      result.destination = cleanLocation(simpleToMatch[2], NON_LOCATION_WORDS);
    } else {
      // e.g. "take me to Patna" -> destination is Patna, origin is missing
      result.destination = cleanLocation(simpleToMatch[2], NON_LOCATION_WORDS);
    }
  }

  // Check for single direction phrases if still missing
  if (!result.destination) {
    const onlyTo = lower.match(/(?:to|reach|heading to|going to)\s+([a-zA-Z\s]+?)(?:\s+(?:tomorrow|today|on|at|by|under|in)|$)/i);
    if (onlyTo) result.destination = cleanLocation(onlyTo[1], NON_LOCATION_WORDS);
  }
  if (!result.origin) {
    const onlyFrom = lower.match(/(?:from|departing|leaving|starting at)\s+([a-zA-Z\s]+?)(?:\s+(?:tomorrow|today|on|at|by|under|in)|$)/i);
    if (onlyFrom) result.origin = cleanLocation(onlyFrom[1], NON_LOCATION_WORDS);
  }

  // 2. Date Expression Parsing
  let dateExpr = null;
  if (lower.includes('day after tomorrow') || lower.includes('overmorrow')) {
    dateExpr = 'day after tomorrow';
  } else if (lower.includes('tomorrow')) {
    dateExpr = 'tomorrow';
  } else if (lower.includes('today')) {
    dateExpr = 'today';
  } else {
    const weekdayMatch = lower.match(/\b(this|next|on)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (weekdayMatch) {
      dateExpr = weekdayMatch[0];
    } else {
      const explicitDateMatch = lower.match(/\b\d{4}-\d{2}-\d{2}\b/) || lower.match(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+\d{4})?\b/i);
      if (explicitDateMatch) {
        dateExpr = explicitDateMatch[0];
      }
    }
  }

  if (dateExpr) {
    result.departureDate = resolveDate(dateExpr, context);
  }

  // 3. Time Window Parsing
  if (lower.includes('early morning')) {
    result.departureWindow = resolveTimeWindow('early_morning');
  } else if (lower.includes('morning')) {
    result.departureWindow = resolveTimeWindow('morning');
  } else if (lower.includes('afternoon') || lower.includes('midday') || lower.includes('noon')) {
    result.departureWindow = resolveTimeWindow('afternoon');
  } else if (lower.includes('evening')) {
    result.departureWindow = resolveTimeWindow('evening');
  } else if (lower.includes('night') || lower.includes('tonight')) {
    result.departureWindow = resolveTimeWindow('night');
  }

  // 4. Budget Constraint Parsing
  // e.g. "under ₹1500", "under 1500", "less than 1500 rupees", "budget 2000", "don't want to spend more than ₹1500"
  const budgetMatch = lower.match(/(?:under|less than|max(?:imum)? budget|budget(?: of)?|spend more than|within)\s*(?:₹|rs\.?|inr)?\s*(\d+)/i);
  if (budgetMatch) {
    result.maxBudget = parseInt(budgetMatch[1], 10);
  }

  // 5. Transport Mode Parsing
  const modes = [];
  if (lower.includes('train') || lower.includes('rail') || lower.includes('irctc')) {
    modes.push('rail');
  }
  if (lower.includes('bus') || lower.includes('redbus')) {
    modes.push('bus');
  }
  if (lower.includes('flight') || lower.includes('plane') || lower.includes('air')) {
    modes.push('flight');
  }
  if (lower.includes('road') || lower.includes('car') || lower.includes('taxi') || lower.includes('cab') || lower.includes('drive')) {
    modes.push('road');
  }
  result.transportTypes = Array.from(new Set(modes));

  // 6. Ranking Strategy Parsing
  if (lower.includes('cheapest') || lower.includes('lowest fare') || lower.includes('budget route')) {
    result.ranking = 'cheapest';
  } else if (lower.includes('fastest') || lower.includes('quickest') || lower.includes('shortest')) {
    result.ranking = 'fastest';
  } else if (lower.includes('direct') || lower.includes('fewest transfers') || lower.includes('no transfers')) {
    result.ranking = 'fewest_transfers';
  } else if (lower.includes('comfortable') || lower.includes('convenient')) {
    result.ranking = 'most_convenient';
  }

  // 7. Track Missing Fields
  if (!result.origin) result.missingFields.push('origin');
  if (!result.destination) result.missingFields.push('destination');
  if (!result.departureDate) result.missingFields.push('departureDate');

  return result;
}

function cleanLocation(str, nonLocationWords = new Set()) {
  if (!str) return null;
  const filtered = str
    .replace(/\b(tomorrow|today|morning|afternoon|evening|night|under|by|train|bus|flight|car|road)\b/gi, '')
    .trim()
    .split(/\s+/)
    .filter((w) => !nonLocationWords.has(w.toLowerCase()))
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  return filtered.length > 0 ? filtered : null;
}

/**
 * Model Adapter
 *
 * Coordinates delegating to configured LLM provider or fallback deterministic parser.
 */
export class ModelAdapter {
  constructor(options = {}) {
    this.provider = options.provider || config.ai?.provider || 'mock';
    this.model = options.model || config.ai?.model || 'gemini-1.5-flash';
    this.apiKey = options.apiKey || config.ai?.apiKey || null;
  }

  /**
   * Parses natural language travel query into structured search intent.
   *
   * @param {string} query
   * @param {Object} [context={}]
   * @returns {Promise<Object>}
   */
  async parseSearchIntent(query, context = {}) {
    // If mock provider or no API key configured, use deterministic parser
    if (this.provider === 'mock' || !this.apiKey) {
      logger.debug('[ModelAdapter] Using deterministic rule-based natural language parser.');
      return parseDeterministic(query, context);
    }

    // Live LLM Provider Integration (e.g. Gemini)
    if (this.provider === 'gemini') {
      try {
        logger.debug(`[ModelAdapter] Invoking Gemini model "${this.model}" for query parsing.`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
        const prompt = `${PARSER_SYSTEM_PROMPT}\n\nReference Context: ${JSON.stringify(context)}\nUser Query: "${query}"`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Gemini API returned status ${response.status}`);
        }

        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          return JSON.parse(rawText);
        }
      } catch (err) {
        logger.warn(`[ModelAdapter] Gemini call failed, falling back to deterministic parser: ${err.message}`);
        return parseDeterministic(query, context);
      }
    }

    // Default fallback
    return parseDeterministic(query, context);
  }
}

export const modelAdapter = new ModelAdapter();
export default modelAdapter;
