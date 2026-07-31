import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import apiRoutes from './routes';
import { errorHandler, notFound } from './middleware/errorHandler';

/** Build and configure the Express application (no network binding here). */
export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins }));
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({ name: 'climb-app-server', version: '0.1.0', api: '/api/v1' });
  });

  app.use('/api/v1', apiRoutes);

  // 404 + centralized error handling — must come after all routes.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
