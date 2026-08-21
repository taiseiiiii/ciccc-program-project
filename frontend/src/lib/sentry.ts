import * as Sentry from "@sentry/react";

/**
 * Error reporting for the browser half.
 *
 * ErrorBoundary catches a render crash and shows the climber something, but it
 * only ever told the console — on their device, which nobody here can read. A
 * white screen someone hits on a phone at the gym leaves no trace otherwise.
 *
 * Optional and production-only: with no DSN the functions below do nothing, so
 * development and CI never send anything anywhere.
 */

let enabled = false;

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || !import.meta.env.PROD) return;

  Sentry.init({
    dsn,
    // Errors only. Tracing every page load would spend the free tier's quota on
    // the sessions where nothing went wrong.
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // A stale chunk after a deploy is expected and already self-healing —
    // ErrorBoundary reloads once. Reporting it would drown the real crashes
    // every time a new version ships.
    ignoreErrors: [
      /Failed to fetch dynamically imported module/i,
      /Importing a module script failed/i,
      /ChunkLoadError/i,
    ],
  });
  enabled = true;
}

export function captureError(err: unknown, componentStack?: string | null): void {
  if (!enabled) return;
  Sentry.captureException(err, {
    contexts: componentStack ? { react: { componentStack } } : undefined,
  });
}
