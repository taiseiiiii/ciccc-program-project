import { query } from "../db/pool";

/**
 * One calendar day inside the requested month. Days with no session are still
 * present, with zeros — the charts need a continuous x-axis, and filling the
 * gaps in SQL (generate_series) is cheaper than doing it per-render.
 */
export interface DailyActivity {
  date: string; // 'YYYY-MM-DD'
  sessions: number;
  attempts: number;
}

/** Attempt/send counts for one grade inside the requested month. */
export interface GradeBreakdown {
  grade_id: number;
  grade_name: string;
  level: number;
  attempts: number;
  sends: number;
  fails: number;
}

/** Headline counts for a whole month, used for the month-over-month deltas. */
export interface PeriodTotals {
  sessions: number;
  attempts: number;
  sends: number;
}

/**
 * Read-only aggregations for the Progress screen. Every figure is derived from
 * `sessions` / `attempts` / `routes` / `grades`, so nothing here needs a schema
 * change.
 *
 * The counting happens in SQL rather than in the browser: the alternative is
 * shipping every attempt the user has ever logged and joining four collections
 * client-side, which gets slower with every session logged.
 *
 * Every statement is parameterized ($1, $2, ...) and scoped to a user_id taken
 * from the verified token, so one user can never see another user's numbers.
 * `start` is inclusive and `end` exclusive ([start, end)) throughout.
 */
export const statsRepository = {
  /**
   * Sessions and attempts per day. `attempts` counts rows in `attempts`, while
   * `sessions` counts DISTINCT sessions — the join fans out one row per attempt,
   * so a plain COUNT would report a session once per attempt it contains.
   */
  async findDailyActivity(
    userId: number,
    start: string,
    end: string,
  ): Promise<DailyActivity[]> {
    const { rows } = await query<DailyActivity>(
      `SELECT to_char(d.day, 'YYYY-MM-DD')      AS date,
              COUNT(DISTINCT s.session_id)::int AS sessions,
              COUNT(a.attempt_id)::int          AS attempts
         FROM generate_series($2::date, $3::date - INTERVAL '1 day', INTERVAL '1 day') AS d(day)
         LEFT JOIN sessions s ON s.user_id = $1 AND s.visit_date = d.day
         LEFT JOIN attempts a ON a.session_id = s.session_id
        GROUP BY d.day
        ORDER BY d.day`,
      [userId, start, end],
    );
    return rows;
  },

  /** Attempt/send/fail counts per grade, ordered easiest to hardest. */
  async findGradeBreakdown(
    userId: number,
    start: string,
    end: string,
  ): Promise<GradeBreakdown[]> {
    const { rows } = await query<GradeBreakdown>(
      `SELECT g.grade_id,
              g.grade_name,
              g.level,
              COUNT(*)::int                                     AS attempts,
              (COUNT(*) FILTER (WHERE a.is_success))::int       AS sends,
              (COUNT(*) FILTER (WHERE NOT a.is_success))::int   AS fails
         FROM attempts a
         JOIN sessions s ON s.session_id = a.session_id
         JOIN routes   r ON r.route_id   = a.route_id
         JOIN grades   g ON g.grade_id   = r.grade_id
        WHERE s.user_id = $1
          AND s.visit_date >= $2
          AND s.visit_date <  $3
        GROUP BY g.grade_id, g.grade_name, g.level
        ORDER BY g.level`,
      [userId, start, end],
    );
    return rows;
  },

  /**
   * Whole-month totals. Used for the previous month, whose per-day and
   * per-grade detail the screen never shows — only the deltas.
   */
  async findPeriodTotals(
    userId: number,
    start: string,
    end: string,
  ): Promise<PeriodTotals> {
    const { rows } = await query<PeriodTotals>(
      `SELECT COUNT(DISTINCT s.session_id)::int                 AS sessions,
              COUNT(a.attempt_id)::int                          AS attempts,
              (COUNT(a.attempt_id) FILTER (WHERE a.is_success))::int AS sends
         FROM sessions s
         LEFT JOIN attempts a ON a.session_id = s.session_id
        WHERE s.user_id = $1
          AND s.visit_date >= $2
          AND s.visit_date <  $3`,
      [userId, start, end],
    );
    // The aggregate always yields exactly one row, even with no matching data.
    return rows[0] ?? { sessions: 0, attempts: 0, sends: 0 };
  },
};
