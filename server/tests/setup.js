import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoServer;

export async function setupTestDb() {
  try {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    return { uri, type: 'in-memory' };
  } catch (err) {
    // If in-memory fails (e.g. binary download blocked), fall back to local test DB
    const fallbackUri = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/yatrai_test';
    try {
      await mongoose.connect(fallbackUri);
      return { uri: fallbackUri, type: 'local-test' };
    } catch {
      throw new Error(`Could not initialize test database: ${err.message}`);
    }
  }
}

export async function teardownTestDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
}

export async function clearTestDb() {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
}
