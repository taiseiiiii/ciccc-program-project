import { query } from "../db/pool";

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

/**
 * Read-only aggregation over sessions/attempts/routes/grades. Same ownership
 * rule as everywhere else: every query is scoped to the user_id taken from
 * the verified token, and all values are passed as parameters.
 */
export const statsRepository = {
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
};
