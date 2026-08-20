import { createApp } from './app';
import { env } from './config/env';
import { pool } from './db/pool';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`[server] listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

// How long a shutdown waits for in-flight requests before giving up. An AI
// report takes up to 60s, so this is long enough not to cut one off, and short
// enough to land inside the platform's own SIGKILL grace period.
const SHUTDOWN_TIMEOUT_MS = 15_000;

let shuttingDown = false;

/** Close the HTTP server and DB pool cleanly on shutdown. */
async function shutdown(signal: string): Promise<void> {
  // A second Ctrl-C should not start a second teardown on top of the first.
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n[server] ${signal} received, shutting down...`);

  // A keep-alive connection that never sends another request would otherwise
  // hold server.close() open until the platform kills the process — at which
  // point the pool never drains and Postgres is left holding the connections.
  const forceExit = setTimeout(() => {
    console.error('[server] shutdown timed out, exiting anyway');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close(async () => {
    await pool.end().catch((err: unknown) => {
      console.error('[server] failed to close the database pool', err);
    });
    console.log('[server] closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// Without these, a rejected promise outside a request handler takes the process
// down with no explanation at all. Log first, then let the platform restart us:
// carrying on after an unknown failure risks serving from corrupted state.
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled promise rejection', reason);
  void shutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  console.error('[server] uncaught exception', err);
  void shutdown('uncaughtException');
});
