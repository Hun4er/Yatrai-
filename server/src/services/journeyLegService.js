import { JourneyLeg } from '../models/JourneyLeg.js';
import { Journey } from '../models/Journey.js';
import { Location } from '../models/Location.js';
import { TransportProvider } from '../models/TransportProvider.js';

export const journeyLegService = {
  /**
   * Creates a journey leg after validating referential integrity.
   */
  async create(legData) {
    const checks = [
      Journey.exists({ _id: legData.journey }),
      Location.exists({ _id: legData.origin }),
      Location.exists({ _id: legData.destination }),
    ];

    if (legData.provider) {
      checks.push(TransportProvider.exists({ _id: legData.provider }));
    }

    const [journeyExists, originExists, destinationExists, providerExists] = await Promise.all(checks);

    if (!journeyExists) {
      throw new Error(`Referenced Journey '${legData.journey}' does not exist.`);
    }
    if (!originExists) {
      throw new Error(`Referenced origin Location '${legData.origin}' does not exist.`);
    }
    if (!destinationExists) {
      throw new Error(`Referenced destination Location '${legData.destination}' does not exist.`);
    }
    if (legData.provider && !providerExists) {
      throw new Error(`Referenced TransportProvider '${legData.provider}' does not exist.`);
    }

    const leg = new JourneyLeg(legData);
    return await leg.save();
  },

  async findByJourney(journeyId) {
    return await JourneyLeg.find({ journey: journeyId })
      .sort({ sequence: 1 })
      .populate('origin')
      .populate('destination')
      .populate('provider');
  },

  async findById(id) {
    return await JourneyLeg.findById(id);
  },

  async update(id, updateData) {
    return await JourneyLeg.findByIdAndUpdate(id, updateData, {
      returnDocument: 'after',
      runValidators: true,
    });
  },

  async delete(id) {
    return await JourneyLeg.findByIdAndDelete(id);
  },
};

export default journeyLegService;
