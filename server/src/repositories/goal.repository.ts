import { query } from "../db/pool";
import { buildUpdate } from "../utils/buildUpdate";

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

/** A goal joined with its target grade's label. */
export interface GoalWithGrade extends Goal {
  grade_name: string;
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
 *
 * All reads/writes are scoped to a user_id (taken from the verified token by
 * the controller) so one user can never see or touch another user's rows.
 */
export const goalRepository = {
  async findAll(userId: number): Promise<Goal[]> {
    const { rows } = await query<Goal>(
      `SELECT * FROM goals WHERE user_id = $1 ORDER BY goal_id DESC`,
      [userId],
    );
    return rows;
  },

  /** Goals with the target grade's label joined in (for the AI coach prompt). */
  async findAllWithGrade(userId: number): Promise<GoalWithGrade[]> {
    const { rows } = await query<GoalWithGrade>(
      `SELECT g.*, gr.grade_name
       FROM goals g
       JOIN grades gr USING (grade_id)
       WHERE g.user_id = $1
       ORDER BY g.goal_id DESC`,
      [userId],
    );
    return rows;
  },

  async findById(id: number, userId: number): Promise<Goal | null> {
    const { rows } = await query<Goal>(
      `SELECT * FROM goals WHERE goal_id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  },

  async create(input: CreateGoalInput): Promise<Goal> {
    const { rows } = await query<Goal>(
      `INSERT INTO goals (user_id, grade_id, goal_description, target_date)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        input.user_id,
        input.grade_id,
        input.goal_description ?? null,
        input.target_date ?? null,
      ],
    );
    return rows[0]!;
  },

  /**
   * Partial update. Only the fields provided are written, so a missing field is
   * left untouched rather than overwritten with NULL. See utils/buildUpdate.
   *
   * `achieved_at` is derived from `is_achieved`: it is stamped with now() when a
   * goal flips to achieved and cleared when it flips back, so the two stay
   * consistent without the caller managing the timestamp.
   */
  async update(
    id: number,
    userId: number,
    input: UpdateGoalInput,
  ): Promise<Goal | null> {
    const statement = buildUpdate(
      "goals",
      {
        grade_id: input.grade_id,
        goal_description: input.goal_description,
        target_date: input.target_date,
        is_achieved: input.is_achieved,
      },
      { goal_id: id, user_id: userId },
      {
        returning: "*",
        // Keep achieved_at in lockstep with the flag.
        extra: (bind) =>
          input.is_achieved === undefined
            ? []
            : [
                `achieved_at = CASE WHEN ${bind(input.is_achieved)} THEN now() ELSE NULL END`,
              ],
      },
    );
    if (!statement) return this.findById(id, userId);

    const { rows } = await query<Goal>(statement.text, statement.values);
    return rows[0] ?? null;
  },

  async remove(id: number, userId: number): Promise<boolean> {
    const { rowCount } = await query(
      `DELETE FROM goals WHERE goal_id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  },
};
