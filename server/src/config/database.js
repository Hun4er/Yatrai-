import mongoose from 'mongoose';
import config from './index.js';
import logger from '../utils/logger.js';

let isConnecting = false;

/**
 * Connect to MongoDB database.
 *
 * @param {string} [customUri] - Optional custom connection string (used in testing)
 * @returns {Promise<typeof mongoose>}
 */
export async function connectDatabase(customUri) {
  const uri = customUri || config.database.mongodbUri;

  if (!uri) {
    const error = new Error(
      '[Database Error] MONGODB_URI is not defined. Please set MONGODB_URI in your environment file.'
    );
    logger.error(error.message);
    throw error;
  }

  // If already connected, return existing connection
  if (mongoose.connection.readyState === 1) {
    logger.debug('Reusing active MongoDB connection.');
    return mongoose;
  }

  // Prevent concurrent connection attempts
  if (isConnecting) {
    logger.debug('MongoDB connection is already in progress, awaiting...');
    while (mongoose.connection.readyState === 2) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return mongoose;
  }

  try {
    isConnecting = true;

    // Mask credentials in connection log
    const maskedUri = uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    logger.info(`Connecting to MongoDB at ${maskedUri}...`);

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: config.isDevelopment || config.isTest,
    });

    logger.info('MongoDB connected successfully.');
    return mongoose;
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    throw error;
  } finally {
    isConnecting = false;
  }
}

/**
 * Disconnect cleanly from MongoDB.
 */
export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    logger.info('Closing MongoDB connection...');
    await mongoose.disconnect();
    logger.info('MongoDB disconnected cleanly.');
  }
}

// Connection event handlers
mongoose.connection.on('error', (err) => {
  logger.error(`MongoDB runtime connection error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB connection lost/disconnected.');
});

export default {
  connectDatabase,
  disconnectDatabase,
};
