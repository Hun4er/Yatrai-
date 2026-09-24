import { Router } from 'express';
import healthRoutes from './health.routes.js';

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
    },
  });
});

// Mount /api/health
apiRouter.use('/health', healthRoutes);

export default apiRouter;
