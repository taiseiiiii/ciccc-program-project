import { Pool, types, type QueryResult, type QueryResultRow } from 'pg';
import { env } from '../config/env';

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
});

pool.on('error', (err) => {
  // Errors on idle clients would otherwise crash the process.
  console.error('[db] unexpected error on idle client', err);
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
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
