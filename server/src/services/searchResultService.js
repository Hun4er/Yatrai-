import { SearchResult } from '../models/SearchResult.js';
import { SearchRequest } from '../models/SearchRequest.js';
import { Journey } from '../models/Journey.js';
import { TransportProvider } from '../models/TransportProvider.js';

export const searchResultService = {
  async create(resultData) {
    const checks = [
      SearchRequest.exists({ _id: resultData.searchRequest }),
      Journey.exists({ _id: resultData.journey }),
    ];
    if (resultData.provider) {
      checks.push(TransportProvider.exists({ _id: resultData.provider }));
    }

    const [requestExists, journeyExists, providerExists] = await Promise.all(checks);

    if (!requestExists) {
      throw new Error(`Referenced SearchRequest '${resultData.searchRequest}' does not exist.`);
    }
    if (!journeyExists) {
      throw new Error(`Referenced Journey '${resultData.journey}' does not exist.`);
    }
    if (resultData.provider && !providerExists) {
      throw new Error(`Referenced TransportProvider '${resultData.provider}' does not exist.`);
    }

    const searchResult = new SearchResult(resultData);
    return await searchResult.save();
  },

  async findBySearchRequest(searchRequestId) {
    return await SearchResult.find({ searchRequest: searchRequestId })
      .populate('journey')
      .populate('provider');
  },

  async findById(id) {
    return await SearchResult.findById(id).populate('journey').populate('provider');
  },

  async delete(id) {
    return await SearchResult.findByIdAndDelete(id);
  },
};

export default searchResultService;
