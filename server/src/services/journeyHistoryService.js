import mongoose from 'mongoose';
import JourneyHistory from '../models/JourneyHistory.js';
import Journey from '../models/Journey.js';
import JourneyLeg from '../models/JourneyLeg.js';

/**
 * Format a populated Location document safely
 */
function formatLocation(loc) {
  if (!loc) return null;
  return {
    id: loc._id ? loc._id.toString() : loc.id || null,
    name: loc.name || '',
    displayName: loc.displayName || loc.name || '',
    city: loc.city || '',
    state: loc.state || '',
    type: loc.type || 'station',
    coordinates: loc.location?.coordinates || loc.coordinates || null,
  };
}

/**
 * Formats a canonical Journey and its legs into the standard response shape
 */
function formatJourneyPayload(journeyDoc, legs = []) {
  if (!journeyDoc) return null;
  const raw = typeof journeyDoc.toJSON === 'function' ? journeyDoc.toJSON() : journeyDoc;

  return {
    id: raw._id ? raw._id.toString() : raw.id,
    origin: formatLocation(raw.origin),
    destination: formatLocation(raw.destination),
    departureTime: raw.departureTime ? new Date(raw.departureTime).toISOString() : null,
    arrivalTime: raw.arrivalTime ? new Date(raw.arrivalTime).toISOString() : null,
    duration: raw.duration,
    totalDistance: raw.totalDistance || 0,
    totalPrice: raw.totalPrice,
    currency: raw.currency || 'INR',
    numberOfTransfers: raw.numberOfTransfers || 0,
    transportModes: raw.transportModes || [],
    status: raw.status || 'scheduled',
    legs: legs.map((leg) => {
      const legRaw = typeof leg.toJSON === 'function' ? leg.toJSON() : leg;
      return {
        id: legRaw._id ? legRaw._id.toString() : legRaw.id,
        sequence: legRaw.sequence,
        origin: formatLocation(legRaw.origin),
        destination: formatLocation(legRaw.destination),
        mode: legRaw.mode,
        provider: legRaw.provider
          ? {
              id: legRaw.provider._id?.toString() || legRaw.provider.id,
              name: legRaw.provider.name,
              code: legRaw.provider.code,
            }
          : null,
        departureTime: legRaw.departureTime ? new Date(legRaw.departureTime).toISOString() : null,
        arrivalTime: legRaw.arrivalTime ? new Date(legRaw.arrivalTime).toISOString() : null,
        duration: legRaw.duration,
        distance: legRaw.distance || 0,
        price: legRaw.price || 0,
        currency: legRaw.currency || 'INR',
        vehicle: legRaw.vehicle || {},
        service: {
          ...(legRaw.service || {}),
          number: legRaw.service?.number || legRaw.vehicle?.identifier || '',
        },
        booking: legRaw.booking || {},
      };
    }),
    metadata: raw.metadata || {},
    createdAt: raw.createdAt,
  };
}

/**
 * Journey History Service (Phase 13)
 * Records and retrieves verified journey viewings for authenticated users.
 */
export const journeyHistoryService = {
  /**
   * Record viewing of a journey.
   * Updates viewedAt timestamp if already viewed to prevent unlimited row growth.
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.userId
   * @param {string|mongoose.Types.ObjectId} params.journeyId
   * @returns {Promise<Object>}
   */
  async recordJourneyView({ userId, journeyId }) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      const err = new Error('Invalid user identifier.');
      err.statusCode = 400;
      err.code = 'INVALID_USER_ID';
      throw err;
    }
    if (!journeyId || !mongoose.Types.ObjectId.isValid(journeyId)) {
      const err = new Error('Invalid journey identifier.');
      err.statusCode = 400;
      err.code = 'INVALID_JOURNEY_ID';
      throw err;
    }

    const journeyExists = await Journey.exists({ _id: journeyId });
    if (!journeyExists) {
      const err = new Error('Journey not found.');
      err.statusCode = 404;
      err.code = 'JOURNEY_NOT_FOUND';
      throw err;
    }

    const historyDoc = await JourneyHistory.findOneAndUpdate(
      { user: userId, journey: journeyId },
      { $set: { viewedAt: new Date() } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    return {
      recorded: true,
      historyId: historyDoc._id.toString(),
      viewedAt: historyDoc.viewedAt,
    };
  },

  /**
   * List journey history for an authenticated user.
   *
   * @param {string|mongoose.Types.ObjectId} userId
   * @param {number} [limit=30]
   * @returns {Promise<Array<Object>>}
   */
  async listJourneyHistory(userId, limit = 30) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      const err = new Error('Invalid user identifier.');
      err.statusCode = 400;
      err.code = 'INVALID_USER_ID';
      throw err;
    }

    const maxLimit = Math.min(Number(limit) || 30, 50);
    const historyRecords = await JourneyHistory.find({ user: userId })
      .sort({ viewedAt: -1 })
      .limit(maxLimit)
      .populate({
        path: 'journey',
        populate: [
          { path: 'origin' },
          { path: 'destination' },
        ],
      });

    const results = [];
    for (const record of historyRecords) {
      if (!record.journey) continue;

      const legs = await JourneyLeg.find({ journey: record.journey._id })
        .sort({ sequence: 1 })
        .populate('origin')
        .populate('destination')
        .populate('provider');

      const formattedJourney = formatJourneyPayload(record.journey, legs);
      if (formattedJourney) {
        results.push({
          historyId: record._id.toString(),
          viewedAt: record.viewedAt,
          journey: formattedJourney,
        });
      }
    }

    return results;
  },

  /**
   * Clear journey history for an authenticated user.
   *
   * @param {string|mongoose.Types.ObjectId} userId
   * @returns {Promise<Object>}
   */
  async clearJourneyHistory(userId) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      const err = new Error('Invalid user identifier.');
      err.statusCode = 400;
      err.code = 'INVALID_USER_ID';
      throw err;
    }

    await JourneyHistory.deleteMany({ user: userId });
    return { cleared: true };
  },
};

export default journeyHistoryService;
