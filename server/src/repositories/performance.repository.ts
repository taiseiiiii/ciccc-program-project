import { query } from "../db/pool";
import { buildUpdate } from "../utils/buildUpdate";

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
export interface PerformanceFilters {
  periodType?: "daily" | "monthly";
  /** True returns only pinned reports; false only unpinned; omitted, both. */
  isPinned?: boolean;
  limit?: number;
  offset?: number;
}

export interface PerformancePage {
  rows: Performance[];
  /** Matching rows in total, so the browser can page and say how many exist. */
  total: number;
}

export const performanceRepository = {
  async findAll(
    userId: number,
    options: PerformanceFilters = {},
  ): Promise<Performance[]> {
    return (await this.findPage(userId, options)).rows;
  },

  /**
   * One page of reports, with the count of everything that matched.
   *
   * Reports used to come back as a single capped list, which was enough while
   * they were a row of buttons under the card. Browsing an archive needs to
   * know what is beyond the page, and needs the pinned ones on their own —
   * "the reports I kept" is the whole reason for pinning.
   */
  async findPage(
    userId: number,
    options: PerformanceFilters = {},
  ): Promise<PerformancePage> {
    const values: unknown[] = [userId];
    let where = `WHERE user_id = $1`;
    if (options.periodType) {
      values.push(options.periodType);
      where += ` AND period_type = $${values.length}`;
    }
    if (options.isPinned !== undefined) {
      values.push(options.isPinned);
      where += ` AND is_pinned = $${values.length}`;
    }

    const countPromise = query<{ total: string }>(
      `SELECT count(*)::text AS total FROM performances ${where}`,
      values,
    );

    // Pinned reports lead: a climber keeps a handful to check back against, and
    // those should not sink below a month of newer ones.
    const pageValues = [...values, options.limit ?? 20, options.offset ?? 0];
    const rowsPromise = query<Performance>(
      `SELECT * FROM performances
       ${where}
       ORDER BY is_pinned DESC, created_at DESC, performance_id DESC
       LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues,
    );

    const [countResult, rowsResult] = await Promise.all([
      countPromise,
      rowsPromise,
    ]);
    return {
      rows: rowsResult.rows,
      total: Number(countResult.rows[0]?.total ?? 0),
    };
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
   * Update the climber's own layer on a saved report. Only the fields
   * provided are written; see utils/buildUpdate.
   */
  async update(
    id: number,
    userId: number,
    input: UpdatePerformanceInput,
  ): Promise<Performance | null> {
    const statement = buildUpdate(
      "performances",
      {
        title: input.title,
        user_note: input.user_note,
        is_pinned: input.is_pinned,
      },
      { performance_id: id, user_id: userId },
      { returning: "*" },
    );
    if (!statement) return this.findById(id, userId);

    const { rows } = await query<Performance>(statement.text, statement.values);
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
