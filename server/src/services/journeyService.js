import { Journey } from '../models/Journey.js';
import { JourneyLeg } from '../models/JourneyLeg.js';
import { Location } from '../models/Location.js';

export const journeyService = {
  /**
   * Creates a journey after validating referential integrity of origin and destination.
   */
  async create(journeyData) {
    const [originExists, destinationExists] = await Promise.all([
      Location.exists({ _id: journeyData.origin }),
      Location.exists({ _id: journeyData.destination }),
    ]);

    if (!originExists) {
      throw new Error(`Referenced origin Location '${journeyData.origin}' does not exist.`);
    }
    if (!destinationExists) {
      throw new Error(`Referenced destination Location '${journeyData.destination}' does not exist.`);
    }

    const journey = new Journey(journeyData);
    return await journey.save();
  },

  async findById(id) {
    return await Journey.findById(id).populate('origin').populate('destination');
  },

  /**
   * Retrieves journey along with its authoritative sequence of legs.
   */
  async getJourneyWithLegs(id) {
    const journey = await this.findById(id);
    if (!journey) return null;

    const legs = await JourneyLeg.find({ journey: id })
      .sort({ sequence: 1 })
      .populate('origin')
      .populate('destination')
      .populate('provider');

    return {
      ...journey.toJSON(),
      legs,
    };
  },

  async update(id, updateData) {
    if (updateData.origin) {
      const exists = await Location.exists({ _id: updateData.origin });
      if (!exists) throw new Error(`Referenced origin Location '${updateData.origin}' does not exist.`);
    }
    if (updateData.destination) {
      const exists = await Location.exists({ _id: updateData.destination });
      if (!exists) throw new Error(`Referenced destination Location '${updateData.destination}' does not exist.`);
    }

    return await Journey.findByIdAndUpdate(id, updateData, {
      returnDocument: 'after',
      runValidators: true,
    });
  },

  /**
   * Deletes journey and cascade-deletes all its child JourneyLeg records.
   */
  async delete(id) {
    const deletedJourney = await Journey.findByIdAndDelete(id);
    if (deletedJourney) {
      await JourneyLeg.deleteMany({ journey: id });
    }
    return deletedJourney;
  },
};

export default journeyService;
