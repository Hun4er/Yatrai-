import { TransportProvider } from '../models/TransportProvider.js';

export const providerService = {
  async create(providerData) {
    const provider = new TransportProvider(providerData);
    return await provider.save();
  },

  async findById(id) {
    return await TransportProvider.findById(id);
  },

  async findByCode(code) {
    return await TransportProvider.findOne({ code: code.toUpperCase().trim() });
  },

  async findByType(type) {
    return await TransportProvider.find({ type, status: 'active' });
  },

  async update(id, updateData) {
    return await TransportProvider.findByIdAndUpdate(id, updateData, {
      returnDocument: 'after',
      runValidators: true,
    });
  },

  async delete(id) {
    return await TransportProvider.findByIdAndDelete(id);
  },
};

export default providerService;
