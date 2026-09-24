import { SavedJourney } from '../models/SavedJourney.js';
import { User } from '../models/User.js';
import { Journey } from '../models/Journey.js';

export const savedJourneyService = {
  async saveJourney(userId, journeyId, name = '', notes = '') {
    const [userExists, journeyExists] = await Promise.all([
      User.exists({ _id: userId }),
      Journey.exists({ _id: journeyId }),
    ]);

    if (!userExists) {
      throw new Error(`Referenced User '${userId}' does not exist.`);
    }
    if (!journeyExists) {
      throw new Error(`Referenced Journey '${journeyId}' does not exist.`);
    }

    const saved = new SavedJourney({
      user: userId,
      journey: journeyId,
      name,
      notes,
    });
    return await saved.save();
  },

  async findByUser(userId) {
    return await SavedJourney.find({ user: userId }).populate('journey');
  },

  async remove(userId, journeyId) {
    return await SavedJourney.findOneAndDelete({ user: userId, journey: journeyId });
  },

  async delete(id) {
    return await SavedJourney.findByIdAndDelete(id);
  },
};

export default savedJourneyService;
