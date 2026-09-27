/**
 * Deterministic Notification Templates (Phase 14)
 * Generates standardized, factual titles and messages for all notification categories.
 * Strict rule: NEVER use an LLM to generate notification facts.
 */

function formatTime(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return '';
  }
}

function formatDate(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return '';
  }
}

/**
 * 1. Journey Reminder Template
 * Example: "Your journey from Sonipat to Patna departs on 01 Oct 2026 at 06:30."
 */
export function journeyReminderTemplate({ origin, destination, departureTime }) {
  const orig = origin || 'Origin';
  const dest = destination || 'Destination';
  const time = formatTime(departureTime);
  const date = formatDate(departureTime);

  const timePart = date && time ? `on ${date} at ${time}` : time ? `at ${time}` : '';

  return {
    title: 'Journey Reminder',
    message: `Your journey from ${orig} to ${dest} departs ${timePart}.`.trim(),
  };
}

/**
 * 2. Price Change Template
 * Example: "The price for your saved Sonipat → Patna journey changed from ₹850 to ₹720."
 */
export function priceChangeTemplate({ origin, destination, oldPrice, newPrice, currency = 'INR' }) {
  const orig = origin || 'Origin';
  const dest = destination || 'Destination';
  const curr = currency === 'INR' ? '₹' : `${currency} `;

  const direction = newPrice < oldPrice ? 'dropped' : 'increased';

  return {
    title: 'Price Changed',
    message: `The price for your saved ${orig} → ${dest} journey ${direction} from ${curr}${oldPrice} to ${curr}${newPrice}.`,
  };
}

/**
 * 3. Schedule Change Template
 * Example: "Your saved journey from Sonipat → Patna has a new departure time: 07:10."
 */
export function scheduleChangeTemplate({
  origin,
  destination,
  oldDepartureTime,
  newDepartureTime,
}) {
  const orig = origin || 'Origin';
  const dest = destination || 'Destination';
  const newTime = formatTime(newDepartureTime);
  const oldTime = formatTime(oldDepartureTime);

  const detail =
    oldTime && newTime
      ? `new departure time: ${newTime} (previously ${oldTime})`
      : newTime
        ? `new departure time: ${newTime}`
        : 'an updated schedule';

  return {
    title: 'Schedule Changed',
    message: `Your saved journey from ${orig} → ${dest} has ${detail}.`,
  };
}

/**
 * 4. Saved Journey Update Template
 * Example: "An update is available for your saved journey from Sonipat → Patna."
 */
export function savedJourneyUpdateTemplate({ origin, destination, reason }) {
  const orig = origin || 'Origin';
  const dest = destination || 'Destination';
  const suffix = reason ? `: ${reason}` : '.';

  return {
    title: 'Saved Journey Updated',
    message: `An update is available for your saved journey from ${orig} → ${dest}${suffix}`,
  };
}
