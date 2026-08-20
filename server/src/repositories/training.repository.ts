import { query } from "../db/pool";
import { buildUpdate } from "../utils/buildUpdate";

/** Shape of a row in the `trainings` table (AI-generated training plan). */
export interface Training {
  training_id: number;
  user_id: number;
  training_report: string | null;
  ai_model: string | null;
  /** Structured plan (drills etc.) + the stats snapshot it was based on (JSONB). */
  analysis_data: unknown;
  /** The climber's own layer — the only part of a plan that is editable. */
  title: string | null;
  user_note: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * What a climber may change on a saved plan. Excludes training_report and
 * analysis_data on purpose: a plan is worth reviewing only if it still says
 * what it prescribed at the time.
 */
export interface UpdateTrainingInput {
  title?: string | null;
  user_note?: string | null;
  is_pinned?: boolean;
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
    // Pinned plans lead, same as performances — the review screen is for the
    // handful a climber is actually working through.
    const { rows } = await query<Training>(
      `SELECT * FROM trainings
       WHERE user_id = $1
       ORDER BY is_pinned DESC, created_at DESC, training_id DESC
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

  /**
   * Update the climber's own layer on a saved plan. Only the fields provided
   * are written; see utils/buildUpdate.
   */
  async update(
    id: number,
    userId: number,
    input: UpdateTrainingInput,
  ): Promise<Training | null> {
    const statement = buildUpdate(
      "trainings",
      {
        title: input.title,
        user_note: input.user_note,
        is_pinned: input.is_pinned,
      },
      { training_id: id, user_id: userId },
      { returning: "*" },
    );
    if (!statement) return this.findById(id, userId);

    const { rows } = await query<Training>(statement.text, statement.values);
    return rows[0] ?? null;
  },

  async remove(id: number, userId: number): Promise<boolean> {
    const { rowCount } = await query(
      `DELETE FROM trainings WHERE training_id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  },
};
