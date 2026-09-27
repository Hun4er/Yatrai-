/**
 * Deterministic Date Resolver
 *
 * Resolves natural-language relative and explicit date expressions
 * against an explicit reference date and timezone context.
 * Produces strict YYYY-MM-DD strings.
 */

const DAY_NAMES = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const MONTH_NAMES = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/**
 * Format a Date object to YYYY-MM-DD string in UTC/local calendar.
 */
export function formatYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get current date string in specific timezone (default: Asia/Kolkata).
 */
export function getCurrentDateInTimezone(timezone = 'Asia/Kolkata') {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now); // en-CA gives YYYY-MM-DD
  } catch {
    return formatYMD(new Date());
  }
}

/**
 * Parse YYYY-MM-DD into a localized Date object at midnight.
 */
function parseYMD(ymdStr) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Deterministically resolves a date expression to YYYY-MM-DD.
 *
 * @param {string} expression - Date phrase (e.g. "tomorrow", "next Friday", "2026-10-01")
 * @param {Object} [context={}]
 * @param {string} [context.currentDate] - Reference date in YYYY-MM-DD (defaults to today in timezone)
 * @param {string} [context.timezone='Asia/Kolkata']
 * @returns {string|null} Resolved YYYY-MM-DD string, or null if unresolvable
 */
export function resolveDate(expression, context = {}) {
  if (!expression) return null;

  const timezone = context.timezone || 'Asia/Kolkata';
  const refDateStr = context.currentDate || getCurrentDateInTimezone(timezone);
  const refDate = parseYMD(refDateStr);

  const clean = String(expression).toLowerCase().trim();

  // 1. Direct YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const d = parseYMD(clean);
    if (!isNaN(d.getTime())) {
      return clean;
    }
  }

  // 2. Relative Keywords
  if (clean === 'today') {
    return refDateStr;
  }

  if (clean === 'tomorrow') {
    const target = new Date(refDate);
    target.setDate(target.getDate() + 1);
    return formatYMD(target);
  }

  if (clean === 'day after tomorrow' || clean === 'overmorrow') {
    const target = new Date(refDate);
    target.setDate(target.getDate() + 2);
    return formatYMD(target);
  }

  // 3. Day of Week expressions: "this friday", "next monday", "on wednesday", "friday"
  const weekdayMatch = clean.match(/(?:this|next|on)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/);
  if (weekdayMatch) {
    const targetDayName = weekdayMatch[1];
    const targetDay = DAY_NAMES[targetDayName];
    if (targetDay !== undefined) {
      const currentDay = refDate.getDay();
      let diff = targetDay - currentDay;

      const isNext = clean.includes('next');
      if (diff <= 0 || isNext) {
        diff += 7;
      }
      const target = new Date(refDate);
      target.setDate(target.getDate() + diff);
      return formatYMD(target);
    }
  }

  // 4. "in X days"
  const inDaysMatch = clean.match(/in\s+(\d+)\s+days?/);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1], 10);
    const target = new Date(refDate);
    target.setDate(target.getDate() + days);
    return formatYMD(target);
  }

  // 5. Month name + Day: e.g. "1st October", "Oct 1", "October 1 2026", "1 Oct 2026"
  const monthDayMatch = clean.match(
    /(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)(?:\s+(\d{4}))?/
  ) || clean.match(
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?/
  );

  if (monthDayMatch) {
    let day, monthName, year;
    if (isNaN(monthDayMatch[1])) {
      // Format: "October 1 2026"
      monthName = monthDayMatch[1];
      day = parseInt(monthDayMatch[2], 10);
      year = monthDayMatch[3] ? parseInt(monthDayMatch[3], 10) : refDate.getFullYear();
    } else {
      // Format: "1st October 2026"
      day = parseInt(monthDayMatch[1], 10);
      monthName = monthDayMatch[2];
      year = monthDayMatch[3] ? parseInt(monthDayMatch[3], 10) : refDate.getFullYear();
    }

    const monthNum = MONTH_NAMES[monthName];
    if (monthNum && day >= 1 && day <= 31) {
      // If no year specified and date is already past in reference year, default to next year
      const candidate = new Date(year, monthNum - 1, day);
      if (!monthDayMatch[3] && candidate < refDate) {
        candidate.setFullYear(year + 1);
      }
      return formatYMD(candidate);
    }
  }

  // 6. Generic JS Date parsing fallback (safeguarded)
  try {
    const parsed = new Date(expression);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2020) {
      return formatYMD(parsed);
    }
  } catch {
    // ignore
  }

  return null;
}

export default {
  resolveDate,
  formatYMD,
  getCurrentDateInTimezone,
};
