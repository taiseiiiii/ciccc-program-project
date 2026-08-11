import { query } from "../db/pool";

/** Shape of a row in the `attempts` table (one try at a route within a session). */
export interface Attempt {
  attempt_id: number;
  session_id: number;
  route_id: number;
  is_success: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * An attempt as the /attempts endpoints return it: the row itself plus the
 * route name and grade joined in, so clients can display an attempt without
 * fetching routes and grades separately.
 */
export interface AttemptWithRoute extends Attempt {
  route_name: string | null;
  grade_name: string;
  grade_level: number;
}

export interface UpdateAttemptInput {
  route_id?: number;
  is_success?: boolean;
  note?: string | null;
}

/**
 * Data-access layer for attempts. Every SQL statement here is parameterized
 * ($1, $2, ...) so values are never concatenated into the query string.
 *
 * Attempts have no user_id column — ownership flows through the parent
 * session, so every query joins/filters on sessions.user_id. The controller
 * passes the user_id from the verified token.
 */
export const attemptRepository = {
  /** List the user's attempts, optionally scoped to one of their sessions. */
  async findAll(userId: number, sessionId?: number): Promise<AttemptWithRoute[]> {
    if (sessionId !== undefined) {
      const { rows } = await query<AttemptWithRoute>(
        `SELECT a.*, r.route_name, g.grade_name, g.level AS grade_level
         FROM attempts a
         JOIN sessions s USING (session_id)
         JOIN routes r USING (route_id)
         JOIN grades g USING (grade_id)
         WHERE s.user_id = $1 AND a.session_id = $2
         ORDER BY a.attempt_id DESC`,
        [userId, sessionId],
      );
      return rows;
    }
    const { rows } = await query<AttemptWithRoute>(
      `SELECT a.*, r.route_name, g.grade_name, g.level AS grade_level
       FROM attempts a
       JOIN sessions s USING (session_id)
       JOIN routes r USING (route_id)
       JOIN grades g USING (grade_id)
       WHERE s.user_id = $1
       ORDER BY a.attempt_id DESC`,
      [userId],
    );
    return rows;
  },

  async findById(id: number, userId: number): Promise<AttemptWithRoute | null> {
    const { rows } = await query<AttemptWithRoute>(
      `SELECT a.*, r.route_name, g.grade_name, g.level AS grade_level
       FROM attempts a
       JOIN sessions s USING (session_id)
       JOIN routes r USING (route_id)
       JOIN grades g USING (grade_id)
       WHERE a.attempt_id = $1 AND s.user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  },

  /**
   * Partial update. Builds the SET clause only from the fields provided so a
   * missing field is left untouched (rather than overwritten with NULL).
   */
  async update(
    id: number,
    userId: number,
    input: UpdateAttemptInput,
  ): Promise<AttemptWithRoute | null> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.route_id !== undefined) {
      values.push(input.route_id);
      fields.push(`route_id = $${values.length}`);
    }
    if (input.is_success !== undefined) {
      values.push(input.is_success);
      fields.push(`is_success = $${values.length}`);
    }
    if (input.note !== undefined) {
      values.push(input.note);
      fields.push(`note = $${values.length}`);
    }

    if (fields.length === 0) {
      return this.findById(id, userId);
    }

    values.push(id);
    const idIdx = values.length;
    values.push(userId);
    const userIdx = values.length;
    // RETURNING * alone would lack the joined route/grade columns, so the
    // update feeds a CTE that joins them on. One statement, so a concurrent
    // delete can't make a committed write look like a 404.
    const { rows } = await query<AttemptWithRoute>(
      `WITH updated AS (
         UPDATE attempts SET ${fields.join(", ")}
         WHERE attempt_id = $${idIdx}
           AND session_id IN (SELECT session_id FROM sessions WHERE user_id = $${userIdx})
         RETURNING *
       )
       SELECT a.*, r.route_name, g.grade_name, g.level AS grade_level
       FROM updated a
       JOIN routes r USING (route_id)
       JOIN grades g USING (grade_id)`,
      values,
    );
    return rows[0] ?? null;
  },

  async remove(id: number, userId: number): Promise<boolean> {
    const { rowCount } = await query(
      `DELETE FROM attempts
       WHERE attempt_id = $1
         AND session_id IN (SELECT session_id FROM sessions WHERE user_id = $2)`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  },
};
