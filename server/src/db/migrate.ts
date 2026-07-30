/**
 * Forward-only SQL migration runner.
 *
 *   pnpm db:migrate         apply every pending migration
 *   pnpm db:status          list applied / pending
 *   pnpm db:seed            load db/seed.sql (development data)
 *   pnpm db:reset           local only: drop everything, re-migrate
 *
 * Each file in db/migrations runs exactly once, inside its own transaction, in
 * filename order, and is recorded in the schema_migrations table. Applied files
 * are checksummed so editing one after the fact is caught instead of silently
 * leaving the database and the repo out of sync — add a new migration instead.
 *
 * Reads DATABASE_URL straight from the environment rather than config/env, so
 * migrating never requires the Supabase settings the API server needs.
 *
 * Caveat: statements that cannot run inside a transaction (CREATE INDEX
 * CONCURRENTLY, ALTER TYPE ... ADD VALUE on older Postgres) need their own
 * runner path; none of the current migrations use them.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import dotenv from 'dotenv';
import { resolveSsl, databaseHost, isLocalHost } from './ssl';

dotenv.config();

// db/ sits next to src/ in dev (tsx) and next to dist/ after build, so two
// levels up from __dirname resolves correctly in both cases.
const DB_DIR = path.join(__dirname, '..', '..', 'db');
const MIGRATIONS_DIR = path.join(DB_DIR, 'migrations');

// Fixed, arbitrary id: serializes concurrent migration runs (two app instances
// booting at once) without blocking any other database work.
const LOCK_ID = 947_215_003;

interface Migration {
  name: string;
  sql: string;
  checksum: string;
}

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Missing required environment variable: DATABASE_URL');
  }
  return url;
}

function loadMigrations(): Migration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((name) => {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    });
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // This table is created before any migration runs, so 0002 cannot lock it
  // down the way it does the application tables. Same reasoning applies: on
  // Supabase it sits in the Data API's schema, and leaving RLS off would also
  // keep the Security Advisor complaining. We own it, so we stay exempt.
  await client.query('ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY');
}

async function readApplied(client: Client): Promise<Map<string, string>> {
  const { rows } = await client.query<{ name: string; checksum: string }>(
    'SELECT name, checksum FROM schema_migrations',
  );
  return new Map(rows.map((row) => [row.name, row.checksum]));
}

async function migrate(client: Client): Promise<void> {
  await ensureMigrationsTable(client);
  const applied = await readApplied(client);
  const all = loadMigrations();

  for (const migration of all) {
    const recorded = applied.get(migration.name);
    if (recorded && recorded !== migration.checksum) {
      throw new Error(
        `${migration.name} has already been applied but its contents changed.\n` +
          'Migrations are immutable once applied — add a new migration instead of editing this one.',
      );
    }
  }

  const pending = all.filter((migration) => !applied.has(migration.name));
  if (pending.length === 0) {
    console.log(`[migrate] up to date (${all.length} applied)`);
    return;
  }

  for (const migration of pending) {
    console.log(`[migrate] applying ${migration.name}`);
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
        migration.name,
        migration.checksum,
      ]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(
        `${migration.name} failed and was rolled back: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  console.log(`[migrate] applied ${pending.length} migration(s)`);
}

async function status(client: Client): Promise<void> {
  await ensureMigrationsTable(client);
  const applied = await readApplied(client);
  const all = loadMigrations();

  console.log(`[status] ${databaseHost(requireDatabaseUrl()) || 'local socket'}`);
  for (const migration of all) {
    console.log(`  ${applied.has(migration.name) ? 'applied' : 'PENDING'}  ${migration.name}`);
  }
  const pending = all.length - applied.size;
  console.log(`[status] ${applied.size} applied, ${pending > 0 ? pending : 0} pending`);
}

async function seed(client: Client): Promise<void> {
  await client.query(readFileSync(path.join(DB_DIR, 'seed.sql'), 'utf8'));
  console.log('[seed] development data loaded');
}

/**
 * Refuse to run a local-only command against a remote database. Checked before
 * connecting, so a mistyped or production DATABASE_URL is rejected without a
 * single round trip to that server.
 *
 * `reset` drops every table; `seed` inserts a fake demo user. Neither belongs
 * anywhere but a local database.
 */
function assertLocalOnly(command: string, databaseUrl: string, force: boolean): void {
  const host = databaseHost(databaseUrl);
  if (isLocalHost(host)) return;

  const consequence =
    command === 'reset' ? 'db:reset drops every table' : 'db:seed inserts development fixtures';
  if (!force) {
    throw new Error(
      `Refusing to run "${command}" against "${host}" — ${consequence}.\n` +
        'It is meant for local databases only. If you really mean it, re-run with --force.',
    );
  }
  console.warn(`[${command}] --force given: running against ${host}`);
}

async function reset(client: Client): Promise<void> {
  await client.query(readFileSync(path.join(DB_DIR, 'reset.sql'), 'utf8'));
  console.log('[reset] schema dropped');
  await migrate(client);
}

async function main(): Promise<void> {
  const [command = 'migrate', ...flags] = process.argv.slice(2);
  const connectionString = requireDatabaseUrl();

  // Validate local-only commands before opening a connection.
  if (command === 'reset' || command === 'seed') {
    assertLocalOnly(command, connectionString, flags.includes('--force'));
  }

  const client = new Client({ connectionString, ssl: resolveSsl(connectionString) });
  // Surface RAISE NOTICE from migrations (0002 reports which roles it touched).
  client.on('notice', (notice) => {
    if (notice.message) console.log(`  ${notice.message}`);
  });
  await client.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    switch (command) {
      case 'migrate':
        await migrate(client);
        break;
      case 'status':
        await status(client);
        break;
      case 'seed':
        await seed(client);
        break;
      case 'reset':
        await reset(client);
        break;
      default:
        throw new Error(`Unknown command "${command}". Expected: migrate | status | seed | reset`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => undefined);
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(`[migrate] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
