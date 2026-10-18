import { createApp } from './app.js';
import config from './config/index.js';
import logger from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import railKitAdapter from './providers/rail/railKit.adapter.js';

const app = createApp();

const server = app.listen(config.port, async () => {
  logger.info(
    `Yatrai API Server running in [${config.env}] mode on http://${config.host}:${config.port}`
  );
  logger.info(`Health check available at http://${config.host}:${config.port}/api/health`);
  logger.info(`[Startup] LIVE_REQUESTS_ALLOWED: ${process.env.LIVE_REQUESTS_ALLOWED}`);

  // Attempt database connection on startup
  try {
    await connectDatabase();
    await railKitAdapter.syncUsage();
  } catch (dbError) {
    logger.warn(
      `[Database Warning] Could not connect to MongoDB on startup: ${dbError.message}. Proceeding without active DB connection.`
    );
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(
      `[Server Startup Error] Port ${config.port} is already in use by another process. Please terminate the existing process or choose a different PORT.`
    );
    process.exit(1);
  } else {
    logger.error(`[Server Startup Error] Failed to start HTTP server: ${err.message}`, {
      stack: err.stack,
    });
    process.exit(1);
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
