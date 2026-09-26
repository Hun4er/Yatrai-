import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import locationRoutes from './location.routes.js';
import journeyRoutes from './journey.routes.js';

const apiRouter = Router();

// Root API info endpoint: GET /api
apiRouter.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    service: 'yatrai-api',
    message: 'Welcome to Yatrai API — One Goal. Every Route.',
    version: 'v1',
    endpoints: {
      health: '/api/health',
      auth: {
        register: '/api/auth/register',
        login: '/api/auth/login',
        refresh: '/api/auth/refresh',
        logout: '/api/auth/logout',
        me: '/api/auth/me',
      },
      locations: {
        search: '/api/locations/search?q={query}',
        resolve: '/api/locations/resolve',
        getById: '/api/locations/:id',
      },
      journeys: {
        search: '/api/journeys/search',
      },
    },
  });
});

// Mount /api/health
apiRouter.use('/health', healthRoutes);

// Mount /api/auth
apiRouter.use('/auth', authRoutes);

// Mount /api/locations
apiRouter.use('/locations', locationRoutes);

// Mount /api/journeys
apiRouter.use('/journeys', journeyRoutes);

export default apiRouter;
