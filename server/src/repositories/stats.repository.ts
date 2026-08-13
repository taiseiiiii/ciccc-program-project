import { query } from "../db/pool";

/**
 * Read-only aggregation over sessions/attempts/routes/grades, for the two
 * features that need counted-up data rather than rows:
 *
 *   * the AI coach        — `forPeriod`, one snapshot over an arbitrary range
 *   * the Progress screen — `find*`, one calendar month broken down for charts
 *
 * They ask different questions of the same four tables, so the queries live
 * together but stay separate: the coach wants a single narrative summary
 * (including the climber's own notes), the charts want per-day and per-grade
 * series.
 *
 * Same ownership rule as everywhere else: every query is scoped to the user_id
 * taken from the verified token, and all values are passed as parameters
 * ($1, $2, ...), never concatenated into the SQL.
 */

/* -------------------------------------------------------------------------- */
/* AI coach — arbitrary period                                                */
/* -------------------------------------------------------------------------- */

/** Attempts vs. sends for one grade within the analyzed period. */
export interface GradeBreakdown {
  grade_name: string;
  level: number;
  attempts: number;
  sends: number;
}

/** A note the climber left on an attempt, with just enough context to read it. */
export interface AttemptNote {
  visit_date: string;
  grade_name: string;
  route_name: string | null;
  is_success: boolean;
  note: string;
}

/**
 * Aggregated climbing activity for one user over a date range. This is both
 * the input handed to the AI coach and the snapshot stored in
 * `analysis_data`, so a saved report stays interpretable even after the
 * underlying sessions are edited or deleted.
 */
export interface ClimbingStats {
  period_start: string;
  period_end: string;
  total_sessions: number;
  total_attempts: number;
  total_sends: number;
  /** Sends / attempts as a percentage (0–100, one decimal). 0 when no attempts. */
  success_rate: number;
  highest_sent_grade: string | null;
  highest_attempted_grade: string | null;
  grade_breakdown: GradeBreakdown[];
  gyms: string[];
  notes: AttemptNote[];
}

// The climber's own notes are the richest signal for the coach, but they are
// free text — cap how many we ship to keep prompts (and token cost) bounded.
const MAX_NOTES = 20;

/* -------------------------------------------------------------------------- */
/* Progress screen — one calendar month                                       */
/* -------------------------------------------------------------------------- */

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

/**
 * Attempt/send counts for one grade inside the requested month. Carries the
 * fail count and grade_id that the charts need, which the AI coach's
 * `GradeBreakdown` deliberately leaves out.
 */
export interface MonthlyGradeBreakdown {
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

/* -------------------------------------------------------------------------- */

export const statsRepository = {
  /**
   * One aggregated snapshot over `[periodStart, periodEnd]` — both ends
   * inclusive, matching the `period_start`/`period_end` columns on
   * `performances`.
   */
  async forPeriod(
    userId: number,
    periodStart: string,
    periodEnd: string,
  ): Promise<ClimbingStats> {
    const [sessionsResult, breakdownResult, notesResult] = await Promise.all([
      query<{ total_sessions: number; gyms: string[] | null }>(
        `SELECT COUNT(*)::int AS total_sessions,
                ARRAY_AGG(DISTINCT gym_name) FILTER (WHERE gym_name IS NOT NULL) AS gyms
         FROM sessions
         WHERE user_id = $1 AND visit_date BETWEEN $2 AND $3`,
        [userId, periodStart, periodEnd],
      ),
      query<GradeBreakdown>(
        `SELECT g.grade_name,
                g.level,
                COUNT(*)::int AS attempts,
                COUNT(*) FILTER (WHERE a.is_success)::int AS sends
         FROM attempts a
         JOIN sessions s USING (session_id)
         JOIN routes r USING (route_id)
         JOIN grades g USING (grade_id)
         WHERE s.user_id = $1 AND s.visit_date BETWEEN $2 AND $3
         GROUP BY g.grade_name, g.level
         ORDER BY g.level`,
        [userId, periodStart, periodEnd],
      ),
      query<AttemptNote>(
        `SELECT s.visit_date,
                g.grade_name,
                r.route_name,
                a.is_success,
                a.note
         FROM attempts a
         JOIN sessions s USING (session_id)
         JOIN routes r USING (route_id)
         JOIN grades g USING (grade_id)
         WHERE s.user_id = $1
           AND s.visit_date BETWEEN $2 AND $3
           AND a.note IS NOT NULL AND btrim(a.note) <> ''
         ORDER BY s.visit_date DESC, a.attempt_id DESC
         LIMIT $4`,
        [userId, periodStart, periodEnd, MAX_NOTES],
      ),
    ]);

    const breakdown = breakdownResult.rows;
    const totalAttempts = breakdown.reduce((sum, g) => sum + g.attempts, 0);
    const totalSends = breakdown.reduce((sum, g) => sum + g.sends, 0);
    const sentGrades = breakdown.filter((g) => g.sends > 0);

    return {
      period_start: periodStart,
      period_end: periodEnd,
      total_sessions: sessionsResult.rows[0]?.total_sessions ?? 0,
      total_attempts: totalAttempts,
      total_sends: totalSends,
      success_rate:
        totalAttempts === 0
          ? 0
          : Math.round((totalSends / totalAttempts) * 1000) / 10,
      // Breakdown is ordered by level, so the last entries are the hardest.
      highest_sent_grade: sentGrades.at(-1)?.grade_name ?? null,
      highest_attempted_grade: breakdown.at(-1)?.grade_name ?? null,
      grade_breakdown: breakdown,
      gyms: sessionsResult.rows[0]?.gyms ?? [],
      notes: notesResult.rows,
    };
  },

  /**
   * Sessions and attempts per day over `[start, end)`. `attempts` counts rows
   * in `attempts`, while `sessions` counts DISTINCT sessions — the join fans
   * out one row per attempt, so a plain COUNT would report a session once per
   * attempt it contains.
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

  /** Attempt/send/fail counts per grade over `[start, end)`, easiest first. */
  async findGradeBreakdown(
    userId: number,
    start: string,
    end: string,
  ): Promise<MonthlyGradeBreakdown[]> {
    const { rows } = await query<MonthlyGradeBreakdown>(
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
   * Whole-period totals over `[start, end)`. Used for the previous month,
   * whose per-day and per-grade detail the screen never shows — only the
   * deltas.
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
