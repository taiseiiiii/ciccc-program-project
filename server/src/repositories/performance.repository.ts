import { query } from "../db/pool";

/** Shape of a row in the `performances` table (AI-generated report snapshot). */
export interface Performance {
  performance_id: number;
  user_id: number;
  period_type: "daily" | "monthly";
  period_start: string; // 'YYYY-MM-DD'
  period_end: string; // 'YYYY-MM-DD'
  performance_report: string | null;
  ai_model: string | null;
  /** Structured analysis + the stats snapshot it was computed from (JSONB). */
  analysis_data: unknown;
  /** The climber's own layer — the only part of a report that is editable. */
  title: string | null;
  user_note: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * What a climber may change on a saved report. Deliberately excludes
 * performance_report and analysis_data: reviewing an old report is only
 * worth anything if it still says what it said at the time, so the AI's
 * words stay frozen and the climber's go beside them.
 */
export interface UpdatePerformanceInput {
  title?: string | null;
  user_note?: string | null;
  is_pinned?: boolean;
}

export interface CreatePerformanceInput {
  user_id: number;
  period_type: "daily" | "monthly";
  period_start: string;
  period_end: string;
  performance_report: string;
  ai_model: string;
  analysis_data: unknown;
}

/**
 * Data-access layer for AI performance reports. Every SQL statement here is
 * parameterized ($1, $2, ...) so values are never concatenated into the query
 * string.
 *
 * All reads/writes are scoped to a user_id (taken from the verified token by
 * the controller) so one user can never see or touch another user's rows.
 * The AI-generated part of a report is an immutable snapshot — regenerating a
 * period inserts a new row rather than updating the old one, and `update`
 * reaches only the climber's own title/note/pin.
 */
export const performanceRepository = {
  async findAll(
    userId: number,
    options: { periodType?: "daily" | "monthly"; limit?: number } = {},
  ): Promise<Performance[]> {
    const values: unknown[] = [userId];
    let where = `WHERE user_id = $1`;
    if (options.periodType) {
      values.push(options.periodType);
      where += ` AND period_type = $${values.length}`;
    }
    values.push(options.limit ?? 20);
    // Pinned reports lead: the review screen exists so a climber can keep a
    // handful of reports to check back against, not to scroll a full archive.
    const { rows } = await query<Performance>(
      `SELECT * FROM performances
       ${where}
       ORDER BY is_pinned DESC, created_at DESC, performance_id DESC
       LIMIT $${values.length}`,
      values,
    );
    return rows;
  },

  async findById(id: number, userId: number): Promise<Performance | null> {
    const { rows } = await query<Performance>(
      `SELECT * FROM performances WHERE performance_id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  },

  async create(input: CreatePerformanceInput): Promise<Performance> {
    const { rows } = await query<Performance>(
      `INSERT INTO performances
         (user_id, period_type, period_start, period_end,
          performance_report, ai_model, analysis_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.user_id,
        input.period_type,
        input.period_start,
        input.period_end,
        input.performance_report,
        input.ai_model,
        JSON.stringify(input.analysis_data),
      ],
    );
    return rows[0]!;
  },

  /**
   * Update the climber's own layer on a saved report. Builds the SET clause
   * only from the fields provided so a missing field is left untouched.
   */
  async update(
    id: number,
    userId: number,
    input: UpdatePerformanceInput,
  ): Promise<Performance | null> {
    const fields: string[] = [];
    const values: unknown[] = [];

    const push = (column: string, value: unknown) => {
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    };

    if (input.title !== undefined) push("title", input.title);
    if (input.user_note !== undefined) push("user_note", input.user_note);
    if (input.is_pinned !== undefined) push("is_pinned", input.is_pinned);

    if (fields.length === 0) {
      return this.findById(id, userId);
    }

    values.push(id);
    const idIdx = values.length;
    values.push(userId);
    const userIdx = values.length;
    const { rows } = await query<Performance>(
      `UPDATE performances SET ${fields.join(", ")}
       WHERE performance_id = $${idIdx} AND user_id = $${userIdx}
       RETURNING *`,
      values,
    );
    return rows[0] ?? null;
  },

  async remove(id: number, userId: number): Promise<boolean> {
    const { rowCount } = await query(
      `DELETE FROM performances WHERE performance_id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  },
};
