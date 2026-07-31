import { query } from "../db/pool";

/** Shape of a row in the `sessions` table. */
export interface Session {
  session_id: number;
  user_id: number;
  visit_date: string; // 'YYYY-MM-DD'
  gym_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSessionInput {
  user_id: number;
  visit_date: string;
  gym_name?: string | null;
}

export interface UpdateSessionInput {
  visit_date?: string;
  gym_name?: string | null;
}

/**
 * Data-access layer for sessions. Every SQL statement here is parameterized
 * ($1, $2, ...) so values are never concatenated into the query string.
 *
 * All reads/writes are scoped to a user_id (taken from the verified token by
 * the controller) so one user can never see or touch another user's rows.
 */
export const sessionRepository = {
  async findAll(userId: number): Promise<Session[]> {
    const { rows } = await query<Session>(
      `SELECT * FROM sessions
       WHERE user_id = $1
       ORDER BY visit_date DESC, session_id DESC`,
      [userId],
    );
    return rows;
  },

  async findById(id: number, userId: number): Promise<Session | null> {
    const { rows } = await query<Session>(
      `SELECT * FROM sessions WHERE session_id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  },

  async create(input: CreateSessionInput): Promise<Session> {
    const { rows } = await query<Session>(
      `INSERT INTO sessions (user_id, visit_date, gym_name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.user_id, input.visit_date, input.gym_name ?? null],
    );
    return rows[0]!;
  },

  /**
   * Partial update. Builds the SET clause only from the fields provided so a
   * missing field is left untouched (rather than overwritten with NULL).
   */
  async update(
    id: number,
    userId: number,
    input: UpdateSessionInput,
  ): Promise<Session | null> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.visit_date !== undefined) {
      values.push(input.visit_date);
      fields.push(`visit_date = $${values.length}`);
    }
    if (input.gym_name !== undefined) {
      values.push(input.gym_name);
      fields.push(`gym_name = $${values.length}`);
    }

    if (fields.length === 0) {
      return this.findById(id, userId);
    }

    values.push(id);
    const idIdx = values.length;
    values.push(userId);
    const userIdx = values.length;
    const { rows } = await query<Session>(
      `UPDATE sessions SET ${fields.join(", ")}
       WHERE session_id = $${idIdx} AND user_id = $${userIdx}
       RETURNING *`,
      values,
    );
    return rows[0] ?? null;
  },

  async remove(id: number, userId: number): Promise<boolean> {
    const { rowCount } = await query(
      `DELETE FROM sessions WHERE session_id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  },
};
