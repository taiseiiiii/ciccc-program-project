import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError } from '../utils/HttpError';
import { isProduction } from '../config/env';

/** 404 handler for unmatched routes. */
export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { message: `Route not found: ${req.method} ${req.originalUrl}` },
  });
};

/** Central error handler. Must be registered last, after all routes. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: { message: err.message, details: err.details },
    });
    return;
  }

  console.error('[error]', err);

  res.status(500).json({
    error: {
      message: 'Internal Server Error',
      // Surface the real message in dev to make debugging easier.
      ...(isProduction ? {} : { detail: err instanceof Error ? err.message : String(err) }),
    },
  });
};
