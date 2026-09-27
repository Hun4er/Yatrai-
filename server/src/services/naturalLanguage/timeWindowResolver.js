/**
 * Centralized Time Window Definitions and Resolver
 *
 * Defines canonical departure time windows and provides deterministic
 * matching and resolution for natural language travel expressions.
 */

export const TIME_WINDOWS = {
  EARLY_MORNING: 'early_morning',
  MORNING: 'morning',
  AFTERNOON: 'afternoon',
  EVENING: 'evening',
  NIGHT: 'night',
};

export const TIME_WINDOW_DEFINITIONS = {
  early_morning: {
    id: 'early_morning',
    label: 'Early Morning',
    start: '00:00',
    end: '06:00',
    startHour: 0,
    endHour: 6,
    aliases: ['early morning', 'early', 'dawn'],
  },
  morning: {
    id: 'morning',
    label: 'Morning',
    start: '06:00',
    end: '12:00',
    startHour: 6,
    endHour: 12,
    aliases: ['morning', 'in the morning', 'am', 'forenoon'],
  },
  afternoon: {
    id: 'afternoon',
    label: 'Afternoon',
    start: '12:00',
    end: '18:00',
    startHour: 12,
    endHour: 18,
    aliases: ['afternoon', 'in the afternoon', 'noon', 'midday', 'pm'],
  },
  evening: {
    id: 'evening',
    label: 'Evening',
    start: '18:00',
    end: '22:00',
    startHour: 18,
    endHour: 22,
    aliases: ['evening', 'in the evening', 'dusk', 'sundown'],
  },
  night: {
    id: 'night',
    label: 'Night',
    start: '21:00',
    end: '05:00',
    startHour: 21,
    endHour: 5,
    aliases: ['night', 'at night', 'tonight', 'late night', 'overnight'],
  },
};

/**
 * Resolves a natural-language time expression or bucket identifier
 * into a canonical time window object { start, end, bucket }.
 *
 * @param {string|Object} input
 * @returns {Object|null} { start: string, end: string, bucket: string }
 */
export function resolveTimeWindow(input) {
  if (!input) return null;

  // Already a structured window object
  if (typeof input === 'object') {
    if (input.start && input.end) {
      return {
        start: input.start,
        end: input.end,
        bucket: input.bucket || 'custom',
      };
    }
    if (input.bucket && TIME_WINDOW_DEFINITIONS[input.bucket]) {
      const def = TIME_WINDOW_DEFINITIONS[input.bucket];
      return { start: def.start, end: def.end, bucket: def.id };
    }
  }

  const clean = String(input).toLowerCase().trim();

  // Direct match by ID
  if (TIME_WINDOW_DEFINITIONS[clean]) {
    const def = TIME_WINDOW_DEFINITIONS[clean];
    return { start: def.start, end: def.end, bucket: def.id };
  }

  // Alias search
  for (const def of Object.values(TIME_WINDOW_DEFINITIONS)) {
    if (def.aliases.some((alias) => clean.includes(alias))) {
      return { start: def.start, end: def.end, bucket: def.id };
    }
  }

  return null;
}

/**
 * Checks whether a given ISO date/time string falls within a specified window.
 *
 * @param {string|Date} departureTime
 * @param {Object} window - { start, end, bucket }
 * @param {string} [timezone='Asia/Kolkata']
 * @returns {boolean}
 */
export function matchesTimeWindow(departureTime, window, timezone = 'Asia/Kolkata') {
  if (!window || !departureTime) return true;

  try {
    const date = departureTime instanceof Date ? departureTime : new Date(departureTime);
    if (isNaN(date.getTime())) return true;

    // Use Intl to get hour in designated timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const hourPart = parts.find((p) => p.type === 'hour');
    const minutePart = parts.find((p) => p.type === 'minute');

    const hour = hourPart ? parseInt(hourPart.value, 10) : date.getHours();
    const minute = minutePart ? parseInt(minutePart.value, 10) : date.getMinutes();
    const timeInMins = hour * 60 + minute;

    // Parse start and end
    const [startH, startM = 0] = window.start.split(':').map(Number);
    const [endH, endM = 0] = window.end.split(':').map(Number);

    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;

    if (startTotal <= endTotal) {
      // Normal range (e.g. 06:00 to 12:00)
      return timeInMins >= startTotal && timeInMins <= endTotal;
    } else {
      // Overnight range (e.g. 21:00 to 05:00)
      return timeInMins >= startTotal || timeInMins <= endTotal;
    }
  } catch {
    return true;
  }
}

export default {
  TIME_WINDOWS,
  TIME_WINDOW_DEFINITIONS,
  resolveTimeWindow,
  matchesTimeWindow,
};
