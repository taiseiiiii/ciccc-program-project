import type { ErrorRequestHandler, RequestHandler } from "express";
import { HttpError } from "../utils/HttpError";
import { isProduction } from "../config/env";
import { captureError, flushSentry } from "../observability/sentry";

/** 404 handler for unmatched routes. */
export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { message: `Route not found: ${req.method} ${req.originalUrl}` },
  });
};

/** Central error handler. Must be registered last, after all routes. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: { message: err.message, details: err.details },
    });
    return;
  }

  // Malformed JSON rejected by express.json() (body-parser).
  if ((err as { type?: unknown })?.type === "entity.parse.failed") {
    res.status(400).json({
      error: { message: "Malformed JSON in request body" },
    });
    return;
  }

  // Postgres constraint violations surface as 409s rather than opaque 500s:
  // 23001 = restrict_violation / 23503 = foreign_key_violation (e.g. deleting
  // a route that attempts still reference), 23505 = unique_violation.
  const pgCode = (err as { code?: unknown })?.code;
  if (pgCode === "23001" || pgCode === "23503") {
    res.status(409).json({
      error: {
        message:
          "Operation conflicts with related data (foreign key constraint)",
      },
    });
    return;
  }
  if (pgCode === "23505") {
    res.status(409).json({
      error: { message: "A record with the same unique value already exists" },
    });
    return;
  }

  // Tagged with the request id so a user reporting "it said 500" hands over
  // something that finds the exact line in the log — and the matching event.
  //
  // Only this branch reports. Everything above is the API saying no on purpose;
  // a 400 or a 404 is not a defect, and shipping those would bury the failures
  // that are.
  console.error(`[error] ${req.id ?? "-"}`, err);
  captureError(err, req.id);
  flushSentry();

  res.status(500).json({
    error: {
      message: "Internal Server Error",
      request_id: req.id,
      // Surface the real message in dev to make debugging easier.
      ...(isProduction
        ? {}
        : { detail: err instanceof Error ? err.message : String(err) }),
    },
  });
};
