import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import config from './index.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    // In unit test and development environments, allow in-memory MongoDB fallback
    if (config.isTest || config.isDevelopment) {
      try {
        logger.info('[Database] Falling back to in-memory MongoDB instance via mongodb-memory-server...');
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        if (!memoryServerInstance) {
          if (!config.isTest && config.isDevelopment) {
            const dbDir = path.resolve(__dirname, '../../data/db');
            if (!fs.existsSync(dbDir)) {
              fs.mkdirSync(dbDir, { recursive: true });
            }
            logger.info(`[Database] Initializing persistent local MongoDB storage at ${dbDir}...`);
            memoryServerInstance = await MongoMemoryServer.create({
              instance: {
                dbPath: dbDir,
                storageEngine: 'wiredTiger',
              },
            });
          } else {
            memoryServerInstance = await MongoMemoryServer.create();
          }
        }
        const memUri = memoryServerInstance.getUri();
        logger.info(`[Database] Connecting to in-memory MongoDB at ${memUri}...`);

        await mongoose.connect(memUri, {
          serverSelectionTimeoutMS: 3000,
        });

        logger.info('[Database] In-memory MongoDB connected successfully.');

        if (config.isDevelopment) {
          try {
            const { seedDatabase } = await import('../database/seed/seed.js');
            await seedDatabase({ shouldReset: false, disconnectOnFinish: false });
            logger.info('[Database] In-memory database seeded with default development data.');
          } catch (seedErr) {
            logger.warn(`[Database] Auto-seeding in-memory database skipped: ${seedErr.message}`);
          }
        }

        return mongoose;
      } catch (memError) {
        logger.error(`[Database] Failed to initialize in-memory database: ${memError.message}`);
        throw memError;
      }
    }

    // In production, fail loudly with a clear actionable message
    const fatalMsg = `[Database] FATAL: Real MongoDB is required in production (via MONGODB_URI). Failed to connect to ${maskedUri}: ${error.message}. Please configure a reachable MongoDB connection string.`;
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
