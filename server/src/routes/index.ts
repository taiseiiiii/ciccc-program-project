import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { pingDatabase } from '../db/pool';
import sessionRoutes from './session.routes';

const router = Router();

/**
 * Health check. Reports server liveness and database connectivity.
 * GET /api/v1/health
 */
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const dbUp = await pingDatabase();
    res.status(dbUp ? 200 : 503).json({
      status: 'ok',
      db: dbUp ? 'up' : 'down',
    });
  }),
);

// Sample resource — the reference CRUD slice.
router.use('/sessions', sessionRoutes);

// Register additional ERD entities here as they are built out, e.g.:
// router.use('/users', userRoutes);
// router.use('/attempts', attemptRoutes);
// router.use('/routes', routeRoutes);
// router.use('/grades', gradeRoutes);
// router.use('/goals', goalRoutes);

export default router;
