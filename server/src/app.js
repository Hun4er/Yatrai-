import express from 'express';
import cors from 'cors';
import config from './config/index.js';
import logger from './utils/logger.js';
import apiRouter from './routes/index.js';
import notFoundHandler from './middleware/notFound.middleware.js';
import errorHandler from './middleware/error.middleware.js';

export function createApp() {
  const app = express();

  // Basic Security & CORS configuration
  app.use(
    cors({
      origin: config.clientUrl,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true,
    })
  );

  // Body parsers
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Development request logger
  app.use((req, res, next) => {
    logger.debug(`Incoming request: ${req.method} ${req.originalUrl}`);
    next();
  });

  // Mount API router under /api
  app.use('/api', apiRouter);

  // 404 handler for unknown routes
  app.use(notFoundHandler);

  // Global centralized error handler
  app.use(errorHandler);

  return app;
}

export default createApp;
