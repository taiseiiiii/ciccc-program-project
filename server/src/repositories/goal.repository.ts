import { query } from '../db/pool';

/** Shape of a row in the `goals` table (a user's target grade). */
export interface Goal {
  goal_id: number;
  user_id: number;
  grade_id: number;
  goal_description: string | null;
  is_achieved: boolean;
  achieved_at: string | null;
  target_date: string | null; // 'YYYY-MM-DD'
  created_at: string;
  updated_at: string;
}

export interface CreateGoalInput {
  user_id: number;
  grade_id: number;
  goal_description?: string | null;
  target_date?: string | null;
}

export interface UpdateGoalInput {
  grade_id?: number;
  goal_description?: string | null;
  is_achieved?: boolean;
  target_date?: string | null;
}

/**
 * Data-access layer for goals. Every SQL statement here is parameterized
 * ($1, $2, ...) so values are never concatenated into the query string.
 */
export const goalRepository = {
  /** List all goals, optionally scoped to a single user. */
  async findAll(userId?: number): Promise<Goal[]> {
    if (userId !== undefined) {
      const { rows } = await query<Goal>(
        `SELECT * FROM goals WHERE user_id = $1 ORDER BY goal_id DESC`,
        [userId],
      );
      return rows;
    }
    const { rows } = await query<Goal>(
      `SELECT * FROM goals ORDER BY goal_id DESC`,
    );
    return rows;
  },

  async findById(id: number): Promise<Goal | null> {
    const { rows } = await query<Goal>(
      `SELECT * FROM goals WHERE goal_id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async create(input: CreateGoalInput): Promise<Goal> {
    const { rows } = await query<Goal>(
      `INSERT INTO goals (user_id, grade_id, goal_description, target_date)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.user_id, input.grade_id, input.goal_description ?? null, input.target_date ?? null],
    );
    return rows[0]!;
  },

  /**
   * Partial update. Builds the SET clause only from the fields provided so a
   * missing field is left untouched (rather than overwritten with NULL).
   *
   * `achieved_at` is derived from `is_achieved`: it is stamped with now() when a
   * goal flips to achieved and cleared when it flips back, so the two stay
   * consistent without the caller managing the timestamp.
   */
  async update(id: number, input: UpdateGoalInput): Promise<Goal | null> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.grade_id !== undefined) {
      values.push(input.grade_id);
      fields.push(`grade_id = $${values.length}`);
    }
    if (input.goal_description !== undefined) {
      values.push(input.goal_description);
      fields.push(`goal_description = $${values.length}`);
    }
    if (input.target_date !== undefined) {
      values.push(input.target_date);
      fields.push(`target_date = $${values.length}`);
    }
    if (input.is_achieved !== undefined) {
      values.push(input.is_achieved);
      fields.push(`is_achieved = $${values.length}`);
      // Keep achieved_at in lockstep with the flag.
      fields.push(`achieved_at = CASE WHEN $${values.length} THEN now() ELSE NULL END`);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const { rows } = await query<Goal>(
      `UPDATE goals SET ${fields.join(', ')} WHERE goal_id = $${values.length} RETURNING *`,
      values,
    );
    return rows[0] ?? null;
  },

  async remove(id: number): Promise<boolean> {
    const { rowCount } = await query(
      `DELETE FROM goals WHERE goal_id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  },
};
