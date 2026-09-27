import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import naturalLanguageParser from '../server/src/services/naturalLanguage/naturalLanguageParser.js';
import { resolveDate } from '../server/src/services/naturalLanguage/dateResolver.js';
import { resolveTimeWindow, matchesTimeWindow } from '../server/src/services/naturalLanguage/timeWindowResolver.js';
import { validateParserSchema, validateBusinessRules } from '../server/src/services/naturalLanguage/parserSchema.js';

describe('Phase 11 — Natural Language Parser & Resolution Unit Tests', () => {
  const context = {
    currentDate: '2026-09-28',
    timezone: 'Asia/Kolkata',
  };

  it('1. Deterministic date resolution handles relative expressions accurately', () => {
    assert.equal(resolveDate('today', context), '2026-09-28');
    assert.equal(resolveDate('tomorrow', context), '2026-09-29');
    assert.equal(resolveDate('day after tomorrow', context), '2026-09-30');
    assert.equal(resolveDate('2026-10-01', context), '2026-10-01');
    assert.equal(resolveDate('1st October 2026', context), '2026-10-01');
  });

  it('2. Time window resolution maps expressions to canonical boundaries', () => {
    const morning = resolveTimeWindow('morning');
    assert.equal(morning.bucket, 'morning');
    assert.equal(morning.start, '06:00');
    assert.equal(morning.end, '12:00');

    const afternoon = resolveTimeWindow('afternoon');
    assert.equal(afternoon.bucket, 'afternoon');

    const evening = resolveTimeWindow('evening');
    assert.equal(evening.bucket, 'evening');

    // matchesTimeWindow evaluation
    assert.equal(matchesTimeWindow('2026-10-01T08:30:00.000Z', morning, 'UTC'), true);
    assert.equal(matchesTimeWindow('2026-10-01T15:30:00.000Z', morning, 'UTC'), false);
  });

  it('3. Parses full natural-language travel query with budget and time window', async () => {
    const query = "I need to reach Patna from Sonipat tomorrow morning and I don't want to spend more than ₹1500.";
    const result = await naturalLanguageParser.parse(query, context);

    assert.equal(result.status, 'ready');
    assert.equal(result.isValid, true);
    assert.equal(result.structuredRequest.origin, 'Sonipat');
    assert.equal(result.structuredRequest.destination, 'Patna');
    assert.equal(result.structuredRequest.departureDate, '2026-09-29');
    assert.equal(result.structuredRequest.preferences.maxBudget, 1500);
    assert.equal(result.structuredRequest.preferences.departureWindow.bucket, 'morning');
  });

  it('4. Detects missing origin and requests clarification', async () => {
    const query = 'Take me to Patna tomorrow morning.';
    const result = await naturalLanguageParser.parse(query, context);

    assert.equal(result.status, 'needs_clarification');
    assert.equal(result.isValid, false);
    assert.ok(result.missingFields.includes('origin'));
    assert.ok(result.message.includes('from'));
  });

  it('5. Detects missing destination and requests clarification', async () => {
    const query = 'Find journeys from Sonipat tomorrow.';
    const result = await naturalLanguageParser.parse(query, context);

    assert.equal(result.status, 'needs_clarification');
    assert.equal(result.isValid, false);
    assert.ok(result.missingFields.includes('destination'));
  });

  it('6. Detects transport preferences and ranking signals', async () => {
    const query = 'Find cheapest train from Sonipat to Patna on 2026-10-01';
    const result = await naturalLanguageParser.parse(query, context);

    assert.equal(result.status, 'ready');
    assert.deepEqual(result.structuredRequest.requestedModes, ['rail']);
    assert.equal(result.structuredRequest.ranking, 'cheapest');
  });

  it('7. Schema validation rejects malformed values', () => {
    const invalidBudget = validateParserSchema({ maxBudget: -500 });
    assert.equal(invalidBudget.isValid, false);

    const nonStringOrigin = validateParserSchema({ origin: 12345 });
    assert.equal(nonStringOrigin.isValid, false);
  });

  it('8. Business rules reject identical origin and destination', () => {
    const sameLoc = validateBusinessRules({
      origin: 'Patna',
      destination: 'Patna',
      departureDate: '2026-10-01',
    });
    assert.equal(sameLoc.status, 'invalid');
    assert.equal(sameLoc.isValid, false);
  });

  it('9. Sanitizer rejects empty or excessively long queries', () => {
    assert.throws(() => naturalLanguageParser.sanitizeQuery(''), /non-empty string|cannot be empty/);
    assert.throws(() => naturalLanguageParser.sanitizeQuery('a'.repeat(600)), /exceeds maximum limit/);
  });
});
