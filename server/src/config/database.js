import mongoose from 'mongoose';
import config from './index.js';
import logger from '../utils/logger.js';

let isConnecting = false;
let memoryServerInstance = null;

/**
 * Connect to MongoDB database.
 *
 * @param {string} [customUri] - Optional custom connection string (used in testing)
 * @returns {Promise<typeof mongoose>}
 */
export async function connectDatabase(customUri) {
  let uri = customUri || config.database.mongodbUri;

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

    // Check for unconfigured atlas placeholder
    const isPlaceholderUri = typeof uri === 'string' && uri.includes('<db_password>');
    if (isPlaceholderUri) {
      logger.warn('Detected unconfigured placeholder <db_password> in MongoDB connection string.');
      throw new Error('Placeholder password in connection URI');
    }

    if (!uri) {
      throw new Error('MONGODB_URI is not defined.');
    }

    // Mask credentials in connection log
    const maskedUri = uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    logger.info(`[Database] Connecting to MongoDB at ${maskedUri}...`);

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000,
      autoIndex: config.isDevelopment || config.isTest,
    });

    logger.info(`[Database] MongoDB connected successfully to persistent database: ${maskedUri} (db: ${mongoose.connection.name})`);
    return mongoose;
  } catch (error) {
    const maskedUri = (uri || '').replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    logger.warn(`[Database] Primary MongoDB connection to ${maskedUri} failed: ${error.message}`);
    await mongoose.disconnect().catch(() => {});

    // In unit test environments ONLY, allow in-memory MongoDB fallback
    if (config.isTest) {
      try {
        logger.info('[Database] Test environment active: spinning up in-memory MongoDB instance via mongodb-memory-server...');
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        if (!memoryServerInstance) {
          memoryServerInstance = await MongoMemoryServer.create();
        }
        const memUri = memoryServerInstance.getUri();
        logger.info(`[Database] Connecting to in-memory test MongoDB at ${memUri}...`);

        await mongoose.connect(memUri, {
          serverSelectionTimeoutMS: 3000,
        });

        logger.info('[Database] In-memory test MongoDB connected successfully.');
        return mongoose;
      } catch (memError) {
        logger.error(`[Database] Failed to initialize in-memory test database: ${memError.message}`);
        throw memError;
      }
    }

    // In development and production, fail loudly with a clear actionable message
    const fatalMsg = `[Database] FATAL: Real MongoDB is required in development (via MONGODB_URI) so that persistent cache and API usage counters survive server restarts. Failed to connect to ${maskedUri}: ${error.message}. Please start local MongoDB (mongodb://127.0.0.1:27017/yatrai_dev) or configure a reachable MongoDB Atlas connection string in server/.env.`;
    logger.error(fatalMsg);
    throw new Error(fatalMsg);
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
  if (memoryServerInstance) {
    logger.info('Stopping in-memory MongoDB instance...');
    await memoryServerInstance.stop();
    memoryServerInstance = null;
    logger.info('In-memory MongoDB instance stopped.');
  }
}

// Connection event handlers
mongoose.connection.on('error', (err) => {
  // Only log runtime errors for established connections to avoid spurious noise during failed handshakes
  if (mongoose.connection.readyState === 1) {
    logger.error(`MongoDB runtime connection error: ${err.message}`);
  }
});

mongoose.connection.on('disconnected', () => {
  if (mongoose.connection.readyState === 1) {
    logger.warn('MongoDB connection lost/disconnected.');
  }
});

export default {
  connectDatabase,
  disconnectDatabase,
};
