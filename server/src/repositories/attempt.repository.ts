import { query } from '../db/pool';

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

export interface CreateAttemptInput {
  session_id: number;
  route_id: number;
  is_success?: boolean;
  note?: string | null;
}

export interface UpdateAttemptInput {
  route_id?: number;
  is_success?: boolean;
  note?: string | null;
}

/**
 * Data-access layer for attempts. Every SQL statement here is parameterized
 * ($1, $2, ...) so values are never concatenated into the query string.
 */
export const attemptRepository = {
  /** List all attempts, optionally scoped to a single session. */
  async findAll(sessionId?: number): Promise<Attempt[]> {
    if (sessionId !== undefined) {
      const { rows } = await query<Attempt>(
        `SELECT * FROM attempts WHERE session_id = $1 ORDER BY attempt_id DESC`,
        [sessionId],
      );
      return rows;
    }
    const { rows } = await query<Attempt>(
      `SELECT * FROM attempts ORDER BY attempt_id DESC`,
    );
    return rows;
  },

  async findById(id: number): Promise<Attempt | null> {
    const { rows } = await query<Attempt>(
      `SELECT * FROM attempts WHERE attempt_id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async create(input: CreateAttemptInput): Promise<Attempt> {
    const { rows } = await query<Attempt>(
      `INSERT INTO attempts (session_id, route_id, is_success, note)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.session_id, input.route_id, input.is_success ?? false, input.note ?? null],
    );
    return rows[0]!;
  },

  /**
   * Partial update. Builds the SET clause only from the fields provided so a
   * missing field is left untouched (rather than overwritten with NULL).
   */
  async update(id: number, input: UpdateAttemptInput): Promise<Attempt | null> {
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
      return this.findById(id);
    }

    values.push(id);
    const { rows } = await query<Attempt>(
      `UPDATE attempts SET ${fields.join(', ')} WHERE attempt_id = $${values.length} RETURNING *`,
      values,
    );
    return rows[0] ?? null;
  },

  async remove(id: number): Promise<boolean> {
    const { rowCount } = await query(
      `DELETE FROM attempts WHERE attempt_id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  },
};
