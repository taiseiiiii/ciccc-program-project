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
  created_at: string;
  updated_at: string;
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
 * Reports are immutable snapshots — regenerating a period inserts a new row
 * rather than updating the old one, so there is no update method.
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
    const { rows } = await query<Performance>(
      `SELECT * FROM performances
       ${where}
       ORDER BY created_at DESC, performance_id DESC
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

  async remove(id: number, userId: number): Promise<boolean> {
    const { rowCount } = await query(
      `DELETE FROM performances WHERE performance_id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  },
};
