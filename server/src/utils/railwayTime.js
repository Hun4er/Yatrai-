/**
 * Centralized Indian Railways Date and Time Normalization Utility
 *
 * Indian Railways operates strictly in Indian Standard Time (IST, UTC+05:30).
 * This module ensures deterministic, timezone-accurate normalization across
 * the entire pipeline (raw provider -> normalization -> serialization -> rendering).
 *
 * Rules:
 * 1. Never treat HH:mm strings as UTC hours.
 * 2. Never append 'Z' to timezone-free local time strings.
 * 3. Never parse HH:mm strings directly using the bare Date constructor.
 * 4. Overnight journeys and day offsets are calculated strictly in calendar dates (Asia/Kolkata).
 * 5. Durations are calculated as exact elapsed minutes from normalized Date timestamps.
 */

export const IST_OFFSET_STR = '+05:30';
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 19800000 ms

/**
 * Normalizes an Indian Railway time and date into a UTC Date object and IST metadata.
 *
 * @param {string|Date|number} timeVal - 'HH:mm', 'HH:mm:ss', ISO string, or Date
 * @param {string|Date} [baseDateStr] - Travel date 'YYYY-MM-DD' or Date
 * @param {number} [dayOffset=0] - Additional calendar days (e.g. for arrival next day)
 * @returns {{ date: Date, iso: string, localTime: string, localDate: string, dayOffset: number }}
 */
export function normalizeRailwayDateTime(timeVal, baseDateStr = null, dayOffset = 0) {
  if (!timeVal) {
    throw new Error('Railway time value is required for normalization');
  }

  // Determine base date in YYYY-MM-DD
  let yyyy = '2026';
  let mm = '10';
  let dd = '01';

  if (baseDateStr) {
    if (baseDateStr instanceof Date && !isNaN(baseDateStr.getTime())) {
      // Extract UTC date components of baseDateStr to avoid local timezone skew
      yyyy = String(baseDateStr.getUTCFullYear());
      mm = String(baseDateStr.getUTCMonth() + 1).padStart(2, '0');
      dd = String(baseDateStr.getUTCDate()).padStart(2, '0');
    } else if (typeof baseDateStr === 'string') {
      const dateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(baseDateStr.trim());
      if (dateMatch) {
        yyyy = dateMatch[1];
        mm = dateMatch[2];
        dd = dateMatch[3];
      }
    }
  }

  // Case 1: timeVal is already a Date object
  if (timeVal instanceof Date) {
    if (isNaN(timeVal.getTime())) {
      throw new Error('Invalid Date object provided to normalizeRailwayDateTime');
    }
    const istInfo = formatInIST(timeVal);
    return {
      date: timeVal,
      iso: timeVal.toISOString(),
      localTime: istInfo.localTime,
      localDate: istInfo.localDate,
      dayOffset: Math.max(0, Number(dayOffset) || 0),
    };
  }

  const trimmed = String(timeVal).trim();

  // Case 2: Time of day only, e.g. "06:15", "17:30", "06:15:00"
  const timeOnlyMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (timeOnlyMatch) {
    const hours = parseInt(timeOnlyMatch[1], 10);
    const minutes = parseInt(timeOnlyMatch[2], 10);
    const seconds = timeOnlyMatch[3] ? parseInt(timeOnlyMatch[3], 10) : 0;

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
      throw new Error(`Invalid railway time string values: ${trimmed}`);
    }

    // Anchor to base date + dayOffset
    // Compute year, month, day after dayOffset
    const baseUtcEpoch = Date.UTC(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10) + (Number(dayOffset) || 0));
    const offsetDate = new Date(baseUtcEpoch);
    const oYyyy = String(offsetDate.getUTCFullYear());
    const oMm = String(offsetDate.getUTCMonth() + 1).padStart(2, '0');
    const oDd = String(offsetDate.getUTCDate()).padStart(2, '0');

    const hStr = String(hours).padStart(2, '0');
    const mStr = String(minutes).padStart(2, '0');
    const sStr = String(seconds).padStart(2, '0');

    const istIso = `${oYyyy}-${oMm}-${oDd}T${hStr}:${mStr}:${sStr}${IST_OFFSET_STR}`;
    const dateObj = new Date(istIso);

    if (isNaN(dateObj.getTime())) {
      throw new Error(`Failed to parse constructed IST ISO string: ${istIso}`);
    }

    return {
      date: dateObj,
      iso: dateObj.toISOString(),
      localTime: `${hStr}:${mStr}`,
      localDate: `${oYyyy}-${oMm}-${oDd}`,
      dayOffset: Math.max(0, Number(dayOffset) || 0),
    };
  }

  // Case 3: ISO string with explicit timezone offset (Z or +HH:mm or -HH:mm)
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) {
      throw new Error(`Invalid offset-aware timestamp: ${trimmed}`);
    }
    const istInfo = formatInIST(parsed);
    return {
      date: parsed,
      iso: parsed.toISOString(),
      localTime: istInfo.localTime,
      localDate: istInfo.localDate,
      dayOffset: Math.max(0, Number(dayOffset) || 0),
    };
  }

  // Case 4: Timezone-free local date/time string, e.g. "2026-10-15T17:30:00" or "2026-10-15 17:30"
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?/i.test(trimmed)) {
    let normalized = trimmed.replace(' ', 'T');
    if (/T\d{2}:\d{2}$/.test(normalized)) {
      normalized = `${normalized}:00`;
    }
    // Never append Z! Append IST (+05:30) for Indian railway context
    const istIso = `${normalized}${IST_OFFSET_STR}`;
    const parsed = new Date(istIso);
    if (isNaN(parsed.getTime())) {
      throw new Error(`Failed to parse timezone-free railway timestamp: ${trimmed}`);
    }
    const istInfo = formatInIST(parsed);
    return {
      date: parsed,
      iso: parsed.toISOString(),
      localTime: istInfo.localTime,
      localDate: istInfo.localDate,
      dayOffset: Math.max(0, Number(dayOffset) || 0),
    };
  }

  // Fallback
  const fallback = new Date(trimmed);
  if (isNaN(fallback.getTime())) {
    throw new Error(`Unrecognized date/time format: ${trimmed}`);
  }
  const istInfo = formatInIST(fallback);
  return {
    date: fallback,
    iso: fallback.toISOString(),
    localTime: istInfo.localTime,
    localDate: istInfo.localDate,
    dayOffset: Math.max(0, Number(dayOffset) || 0),
  };
}

/**
 * Extracts local 24-hr time 'HH:mm' and calendar date 'YYYY-MM-DD' in Asia/Kolkata timezone.
 *
 * @param {Date} dateObj
 * @returns {{ localTime: string, localDate: string }}
 */
export function formatInIST(dateObj) {
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    return { localTime: '--:--', localDate: '' };
  }

  // Use epoch math + IST offset to be 100% deterministic and platform-independent
  const istEpoch = dateObj.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istEpoch);

  const yyyy = istDate.getUTCFullYear();
  const mm = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(istDate.getUTCDate()).padStart(2, '0');
  const hh = String(istDate.getUTCHours()).padStart(2, '0');
  const min = String(istDate.getUTCMinutes()).padStart(2, '0');

  return {
    localTime: `${hh}:${min}`,
    localDate: `${yyyy}-${mm}-${dd}`,
  };
}

/**
 * Calculates complete, verified journey timing between departure and arrival.
 *
 * Correctly accounts for:
 * - Provider-reported day offsets (e.g. item.to.day - item.from.day)
 * - Automatic midnight crossing detection (arrival time earlier in the day than departure)
 * - Multi-day train runs
 * - Accurate duration calculation in elapsed minutes
 *
 * @param {string|Date} departureVal - Departure time or timestamp
 * @param {string|Date} arrivalVal - Arrival time or timestamp
 * @param {string|Date} travelDate - Base departure travel date
 * @param {number|null} [explicitDayOffset=null] - Explicit day offset from provider metadata
 * @param {number|null} [reportedDurationMinutes=null] - Duration from provider if trustworthy
 * @returns {{
 *   departureTime: Date,
 *   arrivalTime: Date,
 *   durationMinutes: number,
 *   dayOffset: number,
 *   departureLocalTime: string,
 *   arrivalLocalTime: string,
 *   departureLocalDate: string,
 *   arrivalLocalDate: string,
 *   departureTimeIso: string,
 *   arrivalTimeIso: string
 * }}
 */
export function calculateJourneyTiming(
  departureVal,
  arrivalVal,
  travelDate,
  explicitDayOffset = null,
  reportedDurationMinutes = null
) {
  const dep = normalizeRailwayDateTime(departureVal, travelDate, 0);

  // Determine day offset for arrival
  let dayOffset = 0;
  if (explicitDayOffset !== null && explicitDayOffset !== undefined && !isNaN(Number(explicitDayOffset))) {
    dayOffset = Math.max(0, Number(explicitDayOffset));
  } else {
    // If arrival is only time-of-day, compare hours to detect midnight rollover
    const depTimeMatch = /^(\d{1,2}):(\d{2})/.exec(String(departureVal).trim());
    const arrTimeMatch = /^(\d{1,2}):(\d{2})/.exec(String(arrivalVal).trim());
    if (depTimeMatch && arrTimeMatch) {
      const depHour = parseInt(depTimeMatch[1], 10);
      const arrHour = parseInt(arrTimeMatch[1], 10);
      if (arrHour < depHour) {
        dayOffset = 1;
      }
    }
  }

  const arr = normalizeRailwayDateTime(arrivalVal, travelDate, dayOffset);

  // If arrival timestamp is still before or equal to departure timestamp, increment day offset
  let finalArr = arr;
  if (finalArr.date.getTime() <= dep.date.getTime()) {
    dayOffset += 1;
    finalArr = normalizeRailwayDateTime(arrivalVal, travelDate, dayOffset);
  }

  let durationMinutes = Number(reportedDurationMinutes) || 0;
  if (durationMinutes <= 0) {
    durationMinutes = Math.max(1, Math.round((finalArr.date.getTime() - dep.date.getTime()) / 60000));
  }

  return {
    departureTime: dep.date,
    arrivalTime: finalArr.date,
    durationMinutes,
    dayOffset,
    departureLocalTime: dep.localTime,
    arrivalLocalTime: finalArr.localTime,
    departureLocalDate: dep.localDate,
    arrivalLocalDate: finalArr.localDate,
    departureTimeIso: dep.iso,
    arrivalTimeIso: finalArr.iso,
  };
}

/**
 * Converts any date representation (JS Date, ISO string, timestamp, or string)
 * into a valid YYYY-MM-DD calendar date in Indian Standard Time (IST).
 * Never uses string slicing on arbitrary Date objects.
 *
 * @param {string|Date|number} dateVal
 * @returns {string} YYYY-MM-DD
 */
export function formatJourneyDate(dateVal) {
  if (!dateVal) return '';

  if (typeof dateVal === 'string') {
    const trimmed = dateVal.trim();
    // 1. If already in YYYY-MM-DD format
    const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (ymdMatch) {
      return `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
    }
    // 2. If in DD-MM-YYYY or DD/MM/YYYY format
    const dmyMatch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(trimmed);
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch;
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return formatInIST(parsed).localDate;
    }
  }

  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    return formatInIST(dateVal).localDate;
  }

  if (typeof dateVal === 'number' && !isNaN(dateVal)) {
    const parsed = new Date(dateVal);
    if (!isNaN(parsed.getTime())) {
      return formatInIST(parsed).localDate;
    }
  }

  return '';
}

export default {
  normalizeRailwayDateTime,
  formatInIST,
  calculateJourneyTiming,
  formatJourneyDate,
  IST_OFFSET_STR,
  IST_OFFSET_MS,
};
