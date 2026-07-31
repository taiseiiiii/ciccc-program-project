import { createApp } from './app';
import { env } from './config/env';
import { pool } from './db/pool';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`[server] listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

/** Close the HTTP server and DB pool cleanly on shutdown. */
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[server] ${signal} received, shutting down...`);
  server.close(async () => {
    await pool.end();
    console.log('[server] closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
