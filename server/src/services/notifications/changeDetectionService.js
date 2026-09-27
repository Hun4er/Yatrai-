import notificationService from '../notificationService.js';
import { NOTIFICATION_TYPES } from '../../constants/notificationTypes.js';
import {
  priceChangeTemplate,
  scheduleChangeTemplate,
  savedJourneyUpdateTemplate,
} from './notificationTemplates.js';

/**
 * Change Detection Service (Phase 14)
 * Evaluates observed journey differences and generates notifications.
 * Respects currency safety, suppresses identical values, and ensures idempotency.
 */
export const changeDetectionService = {
  /**
   * Evaluates price change and generates notification if difference exists.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} [params.savedJourneyId]
   * @param {string} [params.journeyId]
   * @param {string} params.origin
   * @param {string} params.destination
   * @param {number} params.oldPrice
   * @param {number} params.newPrice
   * @param {string} [params.currency='INR']
   * @param {string} [params.oldCurrency]
   * @returns {Promise<Object|null>} Notification document or null if no change
   */
  async handlePriceChange({
    userId,
    savedJourneyId = null,
    journeyId = null,
    origin,
    destination,
    oldPrice,
    newPrice,
    currency = 'INR',
    oldCurrency = null,
  }) {
    // Currency Safety Rule (Section 17): Do not compare raw numbers across differing currencies
    if (oldCurrency && currency && oldCurrency !== currency) {
      return null;
    }

    if (oldPrice === newPrice || isNaN(oldPrice) || isNaN(newPrice)) {
      return null;
    }

    const template = priceChangeTemplate({
      origin,
      destination,
      oldPrice,
      newPrice,
      currency,
    });

    const refId = savedJourneyId || journeyId || 'general';
    const idempotencyKey = `price:${userId}:${refId}:${oldPrice}:${newPrice}`;

    return await notificationService.createNotification({
      userId,
      type: NOTIFICATION_TYPES.PRICE_CHANGE,
      title: template.title,
      message: template.message,
      journeyId,
      savedJourneyId,
      metadata: {
        origin,
        destination,
        oldPrice,
        newPrice,
        currency,
      },
      idempotencyKey,
    });
  },

  /**
   * Evaluates schedule change and generates notification if timing shifted.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} [params.savedJourneyId]
   * @param {string} [params.journeyId]
   * @param {string} params.origin
   * @param {string} params.destination
   * @param {string|Date} params.oldDepartureTime
   * @param {string|Date} params.newDepartureTime
   * @param {string|Date} [params.oldArrivalTime]
   * @param {string|Date} [params.newArrivalTime]
   * @returns {Promise<Object|null>}
   */
  async handleScheduleChange({
    userId,
    savedJourneyId = null,
    journeyId = null,
    origin,
    destination,
    oldDepartureTime,
    newDepartureTime,
    oldArrivalTime = null,
    newArrivalTime = null,
  }) {
    const oldDepIso = oldDepartureTime ? new Date(oldDepartureTime).toISOString() : null;
    const newDepIso = newDepartureTime ? new Date(newDepartureTime).toISOString() : null;

    if (!oldDepIso || !newDepIso || oldDepIso === newDepIso) {
      return null;
    }

    const template = scheduleChangeTemplate({
      origin,
      destination,
      oldDepartureTime,
      newDepartureTime,
      oldArrivalTime,
      newArrivalTime,
    });

    const refId = savedJourneyId || journeyId || 'general';
    const idempotencyKey = `sched:${userId}:${refId}:${newDepIso}`;

    return await notificationService.createNotification({
      userId,
      type: NOTIFICATION_TYPES.SCHEDULE_CHANGE,
      title: template.title,
      message: template.message,
      journeyId,
      savedJourneyId,
      metadata: {
        origin,
        destination,
        oldDepartureTime,
        newDepartureTime,
        oldArrivalTime,
        newArrivalTime,
      },
      idempotencyKey,
    });
  },

  /**
   * Handles general saved journey updates (e.g. status shift, provider change).
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} [params.savedJourneyId]
   * @param {string} [params.journeyId]
   * @param {string} params.origin
   * @param {string} params.destination
   * @param {string} [params.reason]
   * @returns {Promise<Object>}
   */
  async handleSavedJourneyUpdate({
    userId,
    savedJourneyId = null,
    journeyId = null,
    origin,
    destination,
    reason = '',
  }) {
    const template = savedJourneyUpdateTemplate({
      origin,
      destination,
      reason,
    });

    const refId = savedJourneyId || journeyId || 'general';
    const idempotencyKey = `update:${userId}:${refId}:${reason || 'general'}`;

    return await notificationService.createNotification({
      userId,
      type: NOTIFICATION_TYPES.SAVED_JOURNEY_UPDATE,
      title: template.title,
      message: template.message,
      journeyId,
      savedJourneyId,
      metadata: {
        origin,
        destination,
        reason,
      },
      idempotencyKey,
    });
  },
};

export default changeDetectionService;
