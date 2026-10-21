import { formatInIST } from './railwayTime.js';

/**
 * Indian Railways Advance Reservation Period (ARP) helper.
 * Default ADVANCE_DAYS = 60 (excluding journey day), configurable via process.env.ADVANCE_DAYS.
 */
export function getAdvanceBookingWindow(now = new Date()) {
  const advanceDays = parseInt(process.env.ADVANCE_DAYS, 10) || 60;
  const todayIST = formatInIST(now).localDate;
  const maxBookingEpoch = now.getTime() + advanceDays * 24 * 60 * 60 * 1000;
  const maxDateIST = formatInIST(new Date(maxBookingEpoch)).localDate;

  return {
    advanceDays,
    todayIST,
    maxDateIST,
    isPast: (dateStr) => Boolean(dateStr && dateStr < todayIST),
    isBeyondWindow: (dateStr) => Boolean(dateStr && dateStr > maxDateIST),
  };
}

export default {
  getAdvanceBookingWindow,
};
