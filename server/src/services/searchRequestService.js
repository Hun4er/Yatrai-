import { SearchRequest } from '../models/SearchRequest.js';
import { Location } from '../models/Location.js';
import { User } from '../models/User.js';

export const searchRequestService = {
  async create(requestData) {
    const checks = [
      Location.exists({ _id: requestData.origin }),
      Location.exists({ _id: requestData.destination }),
    ];
    if (requestData.user) {
      checks.push(User.exists({ _id: requestData.user }));
    }

    const [originExists, destinationExists, userExists] = await Promise.all(checks);

    if (!originExists) {
      throw new Error(`Referenced origin Location '${requestData.origin}' does not exist.`);
    }
    if (!destinationExists) {
      throw new Error(`Referenced destination Location '${requestData.destination}' does not exist.`);
    }
    if (requestData.user && !userExists) {
      throw new Error(`Referenced User '${requestData.user}' does not exist.`);
    }

    const searchRequest = new SearchRequest(requestData);
    return await searchRequest.save();
  },

  async findById(id) {
    return await SearchRequest.findById(id).populate('origin').populate('destination').populate('user');
  },

  async findByUser(userId) {
    return await SearchRequest.find({ user: userId }).sort({ createdAt: -1 });
  },

  async updateStatus(id, status) {
    return await SearchRequest.findByIdAndUpdate(id, { status }, { returnDocument: 'after', runValidators: true });
  },

  async delete(id) {
    return await SearchRequest.findByIdAndDelete(id);
  },
};

export default searchRequestService;
