import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import locationRoutes from './location.routes.js';
import journeyRoutes from './journey.routes.js';
import savedJourneyRoutes from './savedJourney.routes.js';
import recentSearchRoutes from './recentSearch.routes.js';
import favoriteRouteRoutes from './favoriteRoute.routes.js';
import journeyHistoryRoutes from './journeyHistory.routes.js';
import notificationRoutes from './notification.routes.js';

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
      users: {
        me: '/api/users/me',
      },
      locations: {
        search: '/api/locations/search?q={query}',
        resolve: '/api/locations/resolve',
        getById: '/api/locations/:id',
      },
      journeys: {
        search: '/api/journeys/search',
        searchNatural: '/api/journeys/search/natural',
      },
      savedJourneys: '/api/saved-journeys',
      recentSearches: '/api/searches/recent',
      favoriteRoutes: '/api/favorite-routes',
      journeyHistory: '/api/journey-history',
      notifications: '/api/notifications',
    },
  });
});

// Mount /api/health
apiRouter.use('/health', healthRoutes);

// Mount /api/auth
apiRouter.use('/auth', authRoutes);

// Mount /api/users
apiRouter.use('/users', userRoutes);

// Mount /api/locations
apiRouter.use('/locations', locationRoutes);

// Mount /api/journeys
apiRouter.use('/journeys', journeyRoutes);

// Mount /api/saved-journeys
apiRouter.use('/saved-journeys', savedJourneyRoutes);

// Mount /api/searches/recent
apiRouter.use('/searches/recent', recentSearchRoutes);

// Mount /api/favorite-routes
apiRouter.use('/favorite-routes', favoriteRouteRoutes);

// Mount /api/journey-history
apiRouter.use('/journey-history', journeyHistoryRoutes);

// Mount /api/notifications
apiRouter.use('/notifications', notificationRoutes);

export default apiRouter;

