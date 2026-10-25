/**
 * server/src/tests/testDateUtils.js
 *
 * Deterministic test date computation utilities.
 * Ensures tests stay green regardless of when they are executed.
 */

export function getTestThursday(minDaysAhead = 14) {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const target = new Date(now.getTime() + minDaysAhead * 24 * 60 * 60 * 1000);
  const day = target.getUTCDay(); // 0 is Sunday, 4 is Thursday
  const daysUntilThursday = (4 - day + 7) % 7;
  target.setUTCDate(target.getUTCDate() + (daysUntilThursday === 0 ? 0 : daysUntilThursday));
  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, '0');
  const d = String(target.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getRelativeDate(baseDateStr, daysOffset) {
  const [y, m, d] = baseDateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + daysOffset));
  const ry = dt.getUTCFullYear();
  const rm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const rd = String(dt.getUTCDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

export default {
  getTestThursday,
  getRelativeDate,
};
