import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import config from './config/index.js';
import logger from './utils/logger.js';
import apiRouter from './routes/index.js';
import notFoundHandler from './middleware/notFound.middleware.js';
import errorHandler from './middleware/error.middleware.js';

export function createApp() {
  const app = express();

  // Production-grade CORS configuration with credentials and multiple origin support
  const allowedOrigins = (config.clientUrl || 'http://localhost:5173')
    .split(',')
    .map((url) => url.trim().replace(/\/$/, ''))
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const cleanOrigin = origin.replace(/\/$/, '');
        if (
          allowedOrigins.includes(cleanOrigin) ||
          (!config.isProduction && (cleanOrigin.includes('localhost') || cleanOrigin.includes('127.0.0.1')))
        ) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    })
  );

  // Body and cookie parsers
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

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
