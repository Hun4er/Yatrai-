import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';

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
    },
  });
});

// Mount /api/health
apiRouter.use('/health', healthRoutes);

// Mount /api/auth
apiRouter.use('/auth', authRoutes);

export default apiRouter;
