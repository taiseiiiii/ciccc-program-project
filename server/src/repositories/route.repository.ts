import { query } from '../db/pool';
import type { PoolClient } from 'pg';

/** Shape of a row in the `routes` table (a climbing route / problem). */
export interface Route {
  route_id: number;
  grade_id: number;
  route_name: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Data-access layer for routes. Every SQL statement here is parameterized
 * ($1, $2, ...) so values are never concatenated into the query string.
 *
 * Ownership note. `routes` has no `user_id` column: the table was modelled as a
 * shared catalogue of problems. It is not one — POST /sessions inserts a fresh
 * row per logged climb, so in practice every route belongs to exactly one
 * climber. Reads therefore reach ownership the same way attempts do, by joining
 * back through `attempts` -> `sessions`, and a route nobody's attempt points at
 * is invisible to everybody.
 *
 * There are no writes here on purpose. Editing a route means editing the grade
 * and name of an already-logged climb, which belongs to PATCH /attempts (where
 * ownership is checked); a bare `UPDATE routes WHERE route_id = $1` cannot tell
 * whose climb it is rewriting.
 */
export const routeRepository = {
  /** Every route behind one climber's logged attempts, newest first. */
  async findAllForUser(userId: number): Promise<Route[]> {
    const { rows } = await query<Route>(
      `SELECT DISTINCT r.*
         FROM routes r
         JOIN attempts a USING (route_id)
         JOIN sessions s USING (session_id)
        WHERE s.user_id = $1
        ORDER BY r.route_id DESC`,
      [userId],
    );
    return rows;
  },

  /** One route, but only if it sits behind one of this climber's attempts. */
  async findByIdForUser(id: number, userId: number): Promise<Route | null> {
    const { rows } = await query<Route>(
      `SELECT r.*
         FROM routes r
         JOIN attempts a USING (route_id)
         JOIN sessions s USING (session_id)
        WHERE r.route_id = $1 AND s.user_id = $2
        LIMIT 1`,
      [id, userId],
    );
    return rows[0] ?? null;
  },

  /**
   * Delete routes that no attempt references any more.
   *
   * `routes` is the parent side of the attempts foreign key, so deleting a
   * session cascades to its attempts and leaves their routes behind forever.
   * Called after a session or attempt delete, scoped to the ids that were just
   * orphaned rather than sweeping the whole table.
   */
  async removeOrphans(
    routeIds: number[],
    client?: PoolClient,
  ): Promise<number> {
    if (routeIds.length === 0) return 0;
    const sql = `DELETE FROM routes r
                  WHERE r.route_id = ANY($1::int[])
                    AND NOT EXISTS (
                      SELECT 1 FROM attempts a WHERE a.route_id = r.route_id
                    )`;
    const { rowCount } = client
      ? await client.query(sql, [routeIds])
      : await query(sql, [routeIds]);
    return rowCount ?? 0;
  },
};
