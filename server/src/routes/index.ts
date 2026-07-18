import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { pingDatabase } from '../db/pool';
import sessionRoutes from './session.routes';
import gradeRoutes from './grade.routes';
import routeRoutes from './route.routes';
import attemptRoutes from './attempt.routes';
import goalRoutes from './goal.routes';

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

// Core ERD entities (basic CRUD).
router.use('/sessions', sessionRoutes);
router.use('/grades', gradeRoutes); // read-only master data (V0–V17)
router.use('/routes', routeRoutes);
router.use('/attempts', attemptRoutes);
router.use('/goals', goalRoutes);

// Still to build out:
// router.use('/users', userRoutes);            // ships with the auth layer
// router.use('/performances', performanceRoutes); // AI-generated reports
// router.use('/trainings', trainingRoutes);       // AI-generated reports

export default router;
