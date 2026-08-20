import { Pool, types, type QueryResult, type QueryResultRow } from "pg";
import { env } from "../config/env";
import { resolveSsl } from "./ssl";

// Return SQL DATE (type OID 1082) as a plain 'YYYY-MM-DD' string rather than a
// JS Date. Parsing to Date applies the server's timezone and can shift the day
// (e.g. visit_date "2026-07-01" -> "2026-06-30T..." depending on offset).
types.setTypeParser(1082, (value) => value);

/**
 * A single shared connection pool for the whole app.
 * Import `query` for one-off statements; use `pool` directly when you need a
 * dedicated client (e.g. transactions).
 */
export const pool = new Pool({
  connectionString: env.databaseUrl,
  // Off for localhost, verified TLS for hosted databases. See ./ssl.ts.
  ssl: resolveSsl(env.databaseUrl),

  // Sized for a serverless runtime, where many short-lived instances share one
  // database rather than one long-lived process owning it.
  //
  // `max` is per instance, not per app: node-postgres defaults to 10, and with
  // a handful of warm instances that multiplies straight into the database's
  // connection cap. The app runs through Supabase's transaction pooler, which
  // hands out a pooled connection per statement, so a small ceiling costs
  // nothing — GET /stats fires 11 queries at once and simply takes its turn.
  max: 5,

  // The default is 0, meaning "queue forever". A request that cannot get a
  // connection should fail while the client is still listening, not hang until
  // the platform's own timeout kills it with no error anyone can read.
  connectionTimeoutMillis: 10_000,

  // An instance can sit idle between invocations; holding a connection open
  // through that is what exhausts the pooler.
  idleTimeoutMillis: 30_000,
  allowExitOnIdle: true,

  // A backstop against one pathological query pinning a connection for the
  // life of the instance. Every statement here is indexed and sub-second; the
  // AI endpoints are slow in the model call, not in SQL.
  statement_timeout: 20_000,
});

pool.on("error", (err) => {
  // Errors on idle clients would otherwise crash the process.
  console.error("[db] unexpected error on idle client", err);
});

/** Run a parameterized query. Always pass user input via `params`, never string interpolation. */
export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params as never[]);
}

/** Simple connectivity check used by the health endpoint. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
