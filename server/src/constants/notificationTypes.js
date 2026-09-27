/**
 * Centralized Notification Type Constants (Phase 14)
 */
export const NOTIFICATION_TYPES = Object.freeze({
  JOURNEY_REMINDER: 'journey_reminder',
  PRICE_CHANGE: 'price_change',
  SCHEDULE_CHANGE: 'schedule_change',
  SAVED_JOURNEY_UPDATE: 'saved_journey_update',
  // Backward compatibility with Phase 1 types
  JOURNEY_UPDATE: 'journey_update',
  DEPARTURE_REMINDER: 'departure_reminder',
  BOOKING_UPDATE: 'booking_update',
  SYSTEM: 'system',
});

export const ALL_NOTIFICATION_TYPES = Object.values(NOTIFICATION_TYPES);

export default NOTIFICATION_TYPES;
