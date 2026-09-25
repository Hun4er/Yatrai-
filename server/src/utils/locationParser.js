/**
 * Deterministic Natural Language Travel Intent Parser for Phase 3
 * Extracts simple origin and destination pairs without relying on complex AI/NLP dependencies.
 */

const FILLER_DESTINATIONS = new Set([
  'somewhere',
  'anywhere',
  'nowhere',
  'there',
  'here',
  'home',
  'away',
]);

/**
 * Strips leading/trailing conversational filler words from location names.
 *
 * @param {string} text
 * @returns {string}
 */
function cleanLocationName(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/^(?:from|to|towards|at|in|near|by)\s+/i, '')
    .replace(
      /\s+(?:tomorrow|today|tonight|now|next\s+week|by\s+train|by\s+flight|by\s+bus|by\s+road)\s*$/i,
      ''
    )
    .replace(/[?.!,;:]+$/, '')
    .trim();
}

/**
 * Parses input text to detect simple travel phrases (e.g. "from Sonipat to Patna").
 *
 * @param {string} input
 * @returns {{ isTravelIntent: boolean, origin?: string, destination?: string, query: string }}
 */
export function parseTravelIntent(input) {
  if (!input || typeof input !== 'string') {
    return { isTravelIntent: false, query: '' };
  }

  const normalized = input.trim().replace(/\s+/g, ' ');

  // Reject overly short or single-phrase queries immediately
  if (normalized.length < 3) {
    return { isTravelIntent: false, query: normalized };
  }

  // Pattern A: "How to reach <DESTINATION> from <ORIGIN>"
  const reachFromRegex =
    /^(?:how\s+(?:can\s+i|do\s+i|to)\s+)?(?:reach|get\s+to)\s+(.+?)\s+from\s+(.+)$/i;
  const matchA = reachFromRegex.exec(normalized);
  if (matchA) {
    const destination = cleanLocationName(matchA[1]);
    const origin = cleanLocationName(matchA[2]);
    if (isValidLocationCandidate(origin) && isValidLocationCandidate(destination)) {
      return {
        isTravelIntent: true,
        origin,
        destination,
        query: normalized,
      };
    }
  }

  // Pattern B: "[I need/want to go/travel] [from] <ORIGIN> to <DESTINATION>"
  // Handles:
  // "I need to go from Sonipat to Patna"
  // "Travel from Delhi to Varanasi"
  // "Sonipat to Patna"
  // "from Sonipat to Patna"
  const fromToRegex =
    /^(?:(?:i\s+(?:need|want)\s+to\s+)?(?:go|travel|commute|ride)\s+)?(?:from\s+)?(.+?)\s+(?:to|towards)\s+(.+)$/i;

  const matchB = fromToRegex.exec(normalized);
  if (matchB) {
    const origin = cleanLocationName(matchB[1]);
    const destination = cleanLocationName(matchB[2]);

    if (isValidLocationCandidate(origin) && isValidLocationCandidate(destination)) {
      return {
        isTravelIntent: true,
        origin,
        destination,
        query: normalized,
      };
    }
  }

  // Not a natural-language origin-destination travel phrase; treat as a direct location query
  return {
    isTravelIntent: false,
    query: normalized,
  };
}

/**
 * Validates whether a candidate string is a plausible location name.
 *
 * @param {string} str
 * @returns {boolean}
 */
function isValidLocationCandidate(str) {
  if (!str || str.length < 2 || str.length > 100) return false;
  if (FILLER_DESTINATIONS.has(str.toLowerCase())) return false;
  // If the string contains only common conversational words, reject
  if (/^(?:travel|trip|journey|somewhere|nowhere|anywhere)$/i.test(str)) return false;
  return true;
}

export default {
  parseTravelIntent,
};
