import SavedJourney from '../../models/SavedJourney.js';
import notificationService from '../notificationService.js';
import { NOTIFICATION_TYPES } from '../../constants/notificationTypes.js';
import { journeyReminderTemplate } from './notificationTemplates.js';
import config from '../../config/index.js';

/**
 * Reminder Service (Phase 14)
 * Deterministically checks for upcoming saved journeys and generates departure reminders.
 * Strictly idempotent: multiple executions never produce duplicate notifications.
 */
export const reminderService = {
  /**
   * Sweeps eligible saved journeys and schedules reminders.
   *
   * @param {Object} [options]
   * @param {string} [options.userId] - Optional filter for specific user
   * @param {number} [options.leadTimeHours] - Configurable window in hours (defaults to config)
   * @param {Date} [options.referenceTime] - Optional reference date for testing
   * @returns {Promise<{ checked: number, created: number, skipped: number }>}
   */
  async sweepReminders({ userId = null, leadTimeHours = null, referenceTime = new Date() } = {}) {
    const hours = leadTimeHours ?? config.notifications?.reminderLeadTimeHours ?? 24;
    const now = new Date(referenceTime);
    const windowEnd = new Date(now.getTime() + hours * 60 * 60 * 1000);

    const filter = {};
    if (userId) {
      filter.user = userId;
    }

    const savedJourneys = await SavedJourney.find(filter).populate({
      path: 'journey',
      populate: [
        { path: 'origin', select: 'name city' },
        { path: 'destination', select: 'name city' },
      ],
    });

    let checked = 0;
    let created = 0;
    let skipped = 0;

    for (const item of savedJourneys) {
      checked++;
      const journey = item.journey;
      if (!journey || !journey.departureTime) {
        skipped++;
        continue;
      }

      const depTime = new Date(journey.departureTime);

      // Must be in the future, and within the lead time window
      if (depTime > now && depTime <= windowEnd) {
        const originName = journey.origin?.name || journey.origin?.city || 'Origin';
        const destName = journey.destination?.name || journey.destination?.city || 'Destination';

        const template = journeyReminderTemplate({
          origin: originName,
          destination: destName,
          departureTime: journey.departureTime,
        });

        const depDateKey = depTime.toISOString().split('T')[0];
        const idempotencyKey = `reminder:${item.user.toString()}:${item._id.toString()}:${depDateKey}`;

        const notif = await notificationService.createNotification({
          userId: item.user,
          type: NOTIFICATION_TYPES.JOURNEY_REMINDER,
          title: template.title,
          message: template.message,
          journeyId: journey._id,
          savedJourneyId: item._id,
          metadata: {
            origin: originName,
            destination: destName,
            departureTime: journey.departureTime,
            arrivalTime: journey.arrivalTime,
            totalPrice: journey.totalPrice,
            currency: journey.currency,
          },
          idempotencyKey,
        });

        if (notif._isExisting) {
          skipped++;
        } else {
          created++;
        }
      } else {
        skipped++;
      }
    }

    return { checked, created, skipped };
  },
};

export default reminderService;
