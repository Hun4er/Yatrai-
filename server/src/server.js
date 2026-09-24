import { createApp } from './app.js';
import config from './config/index.js';
import logger from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';

const app = createApp();

const server = app.listen(config.port, async () => {
  logger.info(`Yatrai API Server running in [${config.env}] mode on http://${config.host}:${config.port}`);
  logger.info(`Health check available at http://${config.host}:${config.port}/api/health`);

  // Attempt database connection on startup
  try {
    await connectDatabase();
  } catch (dbError) {
    logger.warn(`[Database Warning] Could not connect to MongoDB on startup: ${dbError.message}. Proceeding without active DB connection.`);
  }
});

/**
 * Graceful Shutdown Handler
 */
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  try {
    await disconnectDatabase();
  } catch (err) {
    logger.error(`Error closing database during shutdown: ${err.message}`);
  }

  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });

  // Force close after 5 seconds if connections hang
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection:', { reason: String(reason) });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception thrown:', { message: error.message, stack: error.stack });
  process.exit(1);
});

export default server;
