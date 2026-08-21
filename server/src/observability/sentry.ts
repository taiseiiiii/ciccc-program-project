import * as Sentry from "@sentry/node";
import { env, isProduction } from "../config/env";

/**
 * Error reporting.
 *
 * Until this existed, a 500 in production was one line in a log stream nobody
 * was watching. The climber saw "Internal Server Error", and unless they said
 * so, that was the entire record of it.
 *
 * Optional on purpose: with no DSN configured every function here is a no-op,
 * so local development and the test suite never talk to anything, and a missing
 * environment variable degrades reporting rather than breaking the server.
 */

let enabled = false;

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || !isProduction) return;

  Sentry.init({
    dsn,
    environment: env.nodeEnv,
    // No performance tracing: the useful signal here is "what broke", and
    // tracing every request would spend the free tier's quota on the ordinary
    // ones. Errors are sampled at 100% because they should be rare.
    tracesSampleRate: 0,
    // Bodies can carry a climber's notes and their email; neither belongs in a
    // third-party error report.
    sendDefaultPii: false,
  });
  enabled = true;
}

/**
 * Report an unexpected failure, tagged with the request id that is also in the
 * log line and in the response the climber saw — so a bug report saying "it
 * said 500, id abc123" lands on the exact event.
 */
export function captureError(err: unknown, requestId?: string): void {
  if (!enabled) return;
  Sentry.captureException(err, requestId ? { tags: { requestId } } : undefined);
}

/**
 * Push anything buffered before the runtime freezes the instance.
 *
 * A serverless function can stop executing the moment it responds, which is
 * long before an event queued in the background would be sent. Callers do not
 * await this — a slow report should never hold up a response — so it swallows
 * its own failures.
 */
export function flushSentry(): void {
  if (!enabled) return;
  void Sentry.flush(2000).catch(() => {});
}
