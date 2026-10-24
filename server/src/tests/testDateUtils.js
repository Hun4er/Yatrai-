/**
 * server/src/tests/testDateUtils.js
 *
 * Deterministic test date computation utilities.
 * Ensures tests stay green regardless of when they are executed.
 */

export function getTestThursday(minDaysAhead = 14) {
  const now = new Date();
  const target = new Date(now.getTime() + minDaysAhead * 24 * 60 * 60 * 1000);
  const day = target.getDay(); // 0 is Sunday, 4 is Thursday
  const daysUntilThursday = (4 - day + 7) % 7;
  target.setDate(target.getDate() + (daysUntilThursday === 0 ? 0 : daysUntilThursday));
  return target.toISOString().slice(0, 10);
}

export function getRelativeDate(baseDateStr, daysOffset) {
  const d = new Date(baseDateStr);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

export default {
  getTestThursday,
  getRelativeDate,
};
