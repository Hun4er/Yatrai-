import { connectDatabase, disconnectDatabase } from '../config/database.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Diagnostic script to verify live connection to MongoDB.
 */
export async function testConnection() {
  logger.info(`Testing MongoDB connection with URI: ${config.database.mongodbUri}...`);

  try {
    const mongooseInstance = await connectDatabase();
    // Issue a ping command to confirm server response
    const pingResult = await mongooseInstance.connection.db.admin().ping();

    if (pingResult && pingResult.ok === 1) {
      console.log('\n========================================');
      console.log('Database connection: SUCCESS');
      console.log('========================================');
      console.log(`Database Name : ${mongooseInstance.connection.name}`);
      console.log(`Host          : ${mongooseInstance.connection.host}`);
      console.log(`Port          : ${mongooseInstance.connection.port}`);
      console.log('========================================\n');
      return true;
    } else {
      throw new Error('Ping to MongoDB server returned unexpected status.');
    }
  } catch (error) {
    console.error('\n========================================');
    console.error('Database connection: FAILED');
    console.error('========================================');
    console.error(`Reason: ${error.message}`);
    console.error('Verify that your MongoDB server is running or MONGODB_URI is valid in server/.env.');
    console.error('========================================\n');
    return false;
  } finally {
    await disconnectDatabase();
  }
}

// Auto-run if executed directly via node
const isDirectCli = process.argv[1] && process.argv[1].endsWith('testConnection.js');
if (isDirectCli) {
  testConnection()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch(() => {
      process.exit(1);
    });
}

export default testConnection;
