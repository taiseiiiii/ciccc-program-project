import { query } from "../db/pool";

/** Shape of a row in the `trainings` table (AI-generated training plan). */
export interface Training {
  training_id: number;
  user_id: number;
  training_report: string | null;
  ai_model: string | null;
  /** Structured plan (drills etc.) + the stats snapshot it was based on (JSONB). */
  analysis_data: unknown;
  created_at: string;
  updated_at: string;
}

export interface CreateTrainingInput {
  user_id: number;
  training_report: string;
  ai_model: string;
  analysis_data: unknown;
}

/**
 * Data-access layer for AI training plans. Every SQL statement here is
 * parameterized ($1, $2, ...) so values are never concatenated into the query
 * string.
 *
 * All reads/writes are scoped to a user_id (taken from the verified token by
 * the controller) so one user can never see or touch another user's rows.
 * Plans are immutable snapshots — regenerating inserts a new row, so there is
 * no update method.
 */
export const trainingRepository = {
  async findAll(userId: number, limit = 20): Promise<Training[]> {
    const { rows } = await query<Training>(
      `SELECT * FROM trainings
       WHERE user_id = $1
       ORDER BY created_at DESC, training_id DESC
       LIMIT $2`,
      [userId, limit],
    );
    return rows;
  },

  async findById(id: number, userId: number): Promise<Training | null> {
    const { rows } = await query<Training>(
      `SELECT * FROM trainings WHERE training_id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  },

  async create(input: CreateTrainingInput): Promise<Training> {
    const { rows } = await query<Training>(
      `INSERT INTO trainings (user_id, training_report, ai_model, analysis_data)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        input.user_id,
        input.training_report,
        input.ai_model,
        JSON.stringify(input.analysis_data),
      ],
    );
    return rows[0]!;
  },

  async remove(id: number, userId: number): Promise<boolean> {
    const { rowCount } = await query(
      `DELETE FROM trainings WHERE training_id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  },
};
