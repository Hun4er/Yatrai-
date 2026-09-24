import { Location } from '../models/Location.js';

export const locationService = {
  async create(locationData) {
    const location = new Location(locationData);
    return await location.save();
  },

  async findById(id) {
    return await Location.findById(id);
  },

  async findByCity(city) {
    return await Location.find({ city: new RegExp(`^${city}$`, 'i') });
  },

  async findNearby(longitude, latitude, maxDistanceMeters = 50000) {
    return await Location.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude],
          },
          $maxDistance: maxDistanceMeters,
        },
      },
    });
  },

  async update(id, updateData) {
    return await Location.findByIdAndUpdate(id, updateData, {
      returnDocument: 'after',
      runValidators: true,
    });
  },

  async delete(id) {
    return await Location.findByIdAndDelete(id);
  },
};

export default locationService;
