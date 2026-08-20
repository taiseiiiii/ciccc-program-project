import { query } from "../db/pool";
import { dayAfter } from "../utils/period";

/**
 * Read-only aggregation over sessions/attempts/routes/grades, for the two
 * features that need counted-up data rather than rows:
 *
 *   * the AI coach        — `forPeriod`, one snapshot over an arbitrary range
 *   * the Progress screen — `find*`, one calendar month broken down for charts
 *
 * They ask different questions of the same tables, so the queries live
 * together but stay separate: the coach wants a single narrative summary
 * (including the climber's own notes), the charts want per-day and per-grade
 * series.
 *
 * Counting note, since migration 0007: an `attempts` row is one ROUTE, not one
 * try, so "how many attempts" is `SUM(attempt_count)` and "how many sends" is
 * `SUM(send_count)`. Anywhere those read `COUNT(*)` the figure would silently
 * become "routes touched" instead.
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

/** Attempts vs. sends grouped by a route tag (wall angle or hold type). */
export interface TagBreakdown {
  code: string;
  label: string;
  attempts: number;
  sends: number;
  /** Sends / attempts as a percentage (0–100, one decimal). */
  success_rate: number;
}

/** A note the climber left on a logged climb, with just enough context to read it. */
export interface AttemptNote {
  visit_date: string;
  grade_name: string;
  route_name: string | null;
  is_success: boolean;
  note: string;
}

/** A body part the climber currently cannot load. */
export interface ActiveInjurySummary {
  body_part: string;
  status: string;
  severity: number | null;
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
  /** Distinct routes logged. Rows in `attempts`. */
  total_routes: number;
  /** Tries across every route. SUM(attempt_count). */
  total_attempts: number;
  total_sends: number;
  /** Sends / attempts as a percentage (0–100, one decimal). 0 when no attempts. */
  success_rate: number;
  /** Routes sent first try. The figure climbers actually brag about. */
  flash_count: number;
  /** Mean tries taken on the routes that were sent, one decimal. Null if none. */
  avg_tries_to_send: number | null;
  /** Total minutes on the wall across the period. 0 when nothing was recorded. */
  total_minutes: number;
  highest_sent_grade: string | null;
  highest_attempted_grade: string | null;
  grade_breakdown: GradeBreakdown[];
  wall_breakdown: TagBreakdown[];
  hold_breakdown: TagBreakdown[];
  /** What the climber themselves blamed, most cited first. */
  self_reported_weaknesses: Array<{ label: string; count: number }>;
  /** Body parts that are off-limits. Empty unless something is unhealed. */
  active_injuries: ActiveInjurySummary[];
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

/**
 * Every headline figure for one range — a month, or all of time. Used for the
 * dashboard's lifetime numbers, this month's cards, and the previous month the
 * deltas are measured against.
 */
export interface PeriodTotals {
  sessions: number;
  /** Distinct visit dates. Two sessions in one day are one climbing day. */
  climbing_days: number;
  /** Minutes on the wall. 0 when nobody recorded a duration. */
  minutes: number;
  /** Rows in `attempts` — routes touched, not tries. */
  routes: number;
  /** Tries across every route. SUM(attempt_count). */
  attempts: number;
  sends: number;
  /** Routes sent first try. The figure climbers actually brag about. */
  flashes: number;
  highest_sent_grade: string | null;
  highest_sent_level: number | null;
}

/** One calendar month of activity, for the multi-month charts. */
export interface MonthlyActivity {
  month: string; // 'YYYY-MM'
  sessions: number;
  attempts: number;
  sends: number;
  /** Hardest grade sent that month, or null for a month with no sends. */
  max_sent_level: number | null;
}

/** A hard send, with the context needed to display it. */
export interface PersonalRecord {
  attempt_id: number;
  grade_name: string;
  grade_level: number;
  route_name: string | null;
  gym_name: string | null;
  visit_date: string;
}

/* -------------------------------------------------------------------------- */

/**
 * Attempts/sends grouped by one of the route tag tables. The two tag
 * vocabularies are structurally identical, so the query is written once and
 * the table/column names come from this whitelist — never from a request.
 *
 * Counting caveat worth knowing before reading a chart built on this: a route
 * tagged both "overhang" and "roof" contributes its full try count to *each*
 * group. Every group's own success rate is meaningful; the sum across groups is
 * not the period's total.
 */
const TAG_SOURCES = {
  wall: { join: "route_wall_types", master: "wall_types", key: "wall_type_id" },
  hold: { join: "route_hold_types", master: "hold_types", key: "hold_type_id" },
} as const;

/** Attempts/sends grouped by tag over the half-open range `[start, end)`. */
async function tagBreakdown(
  kind: keyof typeof TAG_SOURCES,
  userId: number,
  start: string,
  end: string,
): Promise<TagBreakdown[]> {
  const { join, master, key } = TAG_SOURCES[kind];
  const { rows } = await query<{
    code: string;
    label: string;
    attempts: number;
    sends: number;
  }>(
    `SELECT m.code,
            m.label,
            COALESCE(SUM(a.attempt_count), 0)::int AS attempts,
            COALESCE(SUM(a.send_count), 0)::int    AS sends
       FROM attempts a
       JOIN sessions s USING (session_id)
       JOIN ${join} j ON j.route_id = a.route_id
       JOIN ${master} m USING (${key})
      WHERE s.user_id = $1 AND s.visit_date >= $2 AND s.visit_date < $3
      GROUP BY m.code, m.label, m.sort_order
      ORDER BY m.sort_order`,
    [userId, start, end],
  );
  return rows.map((r) => ({
    ...r,
    success_rate:
      r.attempts === 0 ? 0 : Math.round((r.sends / r.attempts) * 1000) / 10,
  }));
}

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
    const [
      sessionsResult,
      breakdownResult,
      shapeResult,
      notesResult,
      weaknessResult,
      injuryResult,
      wallBreakdown,
      holdBreakdown,
    ] = await Promise.all([
      query<{
        total_sessions: number;
        total_minutes: number;
        gyms: string[] | null;
      }>(
        `SELECT COUNT(*)::int AS total_sessions,
                COALESCE(SUM(duration_minutes), 0)::int AS total_minutes,
                ARRAY_AGG(DISTINCT gym_name) FILTER (WHERE gym_name IS NOT NULL) AS gyms
         FROM sessions
         WHERE user_id = $1 AND visit_date BETWEEN $2 AND $3`,
        [userId, periodStart, periodEnd],
      ),
      query<GradeBreakdown>(
        `SELECT g.grade_name,
                g.level,
                COALESCE(SUM(a.attempt_count), 0)::int AS attempts,
                COALESCE(SUM(a.send_count), 0)::int    AS sends
         FROM attempts a
         JOIN sessions s USING (session_id)
         JOIN routes r USING (route_id)
         JOIN grades g USING (grade_id)
         WHERE s.user_id = $1 AND s.visit_date BETWEEN $2 AND $3
         GROUP BY g.grade_name, g.level
         ORDER BY g.level`,
        [userId, periodStart, periodEnd],
      ),
      // Figures that need per-row shape rather than a plain sum: a flash is a
      // route sent on its only try, and tries-to-send only averages over the
      // routes that were actually sent.
      query<{
        total_routes: number;
        flash_count: number;
        avg_tries_to_send: string | null;
      }>(
        `SELECT COUNT(*)::int AS total_routes,
                COUNT(*) FILTER (WHERE a.attempt_count = 1 AND a.send_count = 1)::int
                  AS flash_count,
                AVG(a.attempt_count) FILTER (WHERE a.send_count > 0)::text
                  AS avg_tries_to_send
         FROM attempts a
         JOIN sessions s USING (session_id)
         WHERE s.user_id = $1 AND s.visit_date BETWEEN $2 AND $3`,
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
      query<{ label: string; count: number }>(
        `SELECT w.label, COUNT(*)::int AS count
           FROM attempt_weaknesses aw
           JOIN weakness_types w USING (weakness_type_id)
           JOIN attempts a       USING (attempt_id)
           JOIN sessions s       USING (session_id)
          WHERE s.user_id = $1 AND s.visit_date BETWEEN $2 AND $3
          GROUP BY w.label
          ORDER BY count DESC, w.label ASC`,
        [userId, periodStart, periodEnd],
      ),
      // Not period-scoped on purpose: an injury that is unhealed *right now*
      // constrains the plan regardless of when the analyzed month was.
      query<ActiveInjurySummary>(
        `SELECT bp.label AS body_part, i.status, i.severity
           FROM injuries i
           JOIN body_parts bp USING (body_part_id)
          WHERE i.user_id = $1 AND i.status <> 'healed'
          ORDER BY i.severity DESC NULLS LAST, bp.sort_order`,
        [userId],
      ),
      // forPeriod's bounds are inclusive on both ends (they mirror the
      // period_start/period_end columns); tagBreakdown takes a half-open range.
      tagBreakdown("wall", userId, periodStart, dayAfter(periodEnd)),
      tagBreakdown("hold", userId, periodStart, dayAfter(periodEnd)),
    ]);

    const breakdown = breakdownResult.rows;
    const totalAttempts = breakdown.reduce((sum, g) => sum + g.attempts, 0);
    const totalSends = breakdown.reduce((sum, g) => sum + g.sends, 0);
    const sentGrades = breakdown.filter((g) => g.sends > 0);
    const shape = shapeResult.rows[0];
    const avgTries = shape?.avg_tries_to_send;

    return {
      period_start: periodStart,
      period_end: periodEnd,
      total_sessions: sessionsResult.rows[0]?.total_sessions ?? 0,
      total_routes: shape?.total_routes ?? 0,
      total_attempts: totalAttempts,
      total_sends: totalSends,
      success_rate:
        totalAttempts === 0
          ? 0
          : Math.round((totalSends / totalAttempts) * 1000) / 10,
      flash_count: shape?.flash_count ?? 0,
      // AVG comes back as a numeric string (pg keeps arbitrary precision), so
      // it is parsed here rather than trusted to coerce.
      avg_tries_to_send:
        avgTries === null || avgTries === undefined
          ? null
          : Math.round(Number(avgTries) * 10) / 10,
      total_minutes: sessionsResult.rows[0]?.total_minutes ?? 0,
      // Breakdown is ordered by level, so the last entries are the hardest.
      highest_sent_grade: sentGrades.at(-1)?.grade_name ?? null,
      highest_attempted_grade: breakdown.at(-1)?.grade_name ?? null,
      grade_breakdown: breakdown,
      wall_breakdown: wallBreakdown,
      hold_breakdown: holdBreakdown,
      self_reported_weaknesses: weaknessResult.rows,
      active_injuries: injuryResult.rows,
      gyms: sessionsResult.rows[0]?.gyms ?? [],
      notes: notesResult.rows,
    };
  },

  /**
   * Sessions and attempts per day over `[start, end)`. `attempts` sums
   * attempt_count, while `sessions` counts DISTINCT sessions — the join fans
   * out one row per logged route, so a plain COUNT would report a session once
   * per route it contains.
   */
  async findDailyActivity(
    userId: number,
    start: string,
    end: string,
  ): Promise<DailyActivity[]> {
    const { rows } = await query<DailyActivity>(
      `SELECT to_char(d.day, 'YYYY-MM-DD')          AS date,
              COUNT(DISTINCT s.session_id)::int     AS sessions,
              COALESCE(SUM(a.attempt_count), 0)::int AS attempts
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
              COALESCE(SUM(a.attempt_count), 0)::int                     AS attempts,
              COALESCE(SUM(a.send_count), 0)::int                        AS sends,
              COALESCE(SUM(a.attempt_count - a.send_count), 0)::int      AS fails
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

  /** Attempts/sends by wall angle over the half-open range `[start, end)`. */
  findWallBreakdown(userId: number, start: string, end: string) {
    return tagBreakdown("wall", userId, start, end);
  },

  /** Attempts/sends by hold type over the half-open range `[start, end)`. */
  findHoldBreakdown(userId: number, start: string, end: string) {
    return tagBreakdown("hold", userId, start, end);
  },

  /**
   * Every headline figure for one range, in one round trip.
   *
   * Pass `null` for both bounds to get all-time totals — that is what the
   * dashboard's lifetime numbers are.
   *
   * Written as one CTE per grain rather than one big join, because sessions and
   * attempts are different grains: joining them and then summing
   * `duration_minutes` would count a session's length once per route logged in
   * it. Each figure below reads from exactly the grain it belongs to.
   */
  async findTotals(
    userId: number,
    start: string | null,
    end: string | null,
  ): Promise<PeriodTotals> {
    const { rows } = await query<PeriodTotals>(
      `WITH s AS (
         SELECT session_id, visit_date, duration_minutes
           FROM sessions
          WHERE user_id = $1
            AND ($2::date IS NULL OR visit_date >= $2)
            AND ($3::date IS NULL OR visit_date <  $3)
       ), a AS (
         SELECT a.attempt_count, a.send_count, r.grade_id
           FROM attempts a
           JOIN s ON s.session_id = a.session_id
           JOIN routes r USING (route_id)
       )
       SELECT (SELECT COUNT(*)::int                    FROM s) AS sessions,
              (SELECT COUNT(DISTINCT visit_date)::int  FROM s) AS climbing_days,
              (SELECT COALESCE(SUM(duration_minutes), 0)::int FROM s) AS minutes,
              (SELECT COUNT(*)::int                    FROM a) AS routes,
              (SELECT COALESCE(SUM(attempt_count), 0)::int FROM a) AS attempts,
              (SELECT COALESCE(SUM(send_count), 0)::int    FROM a) AS sends,
              (SELECT COUNT(*)::int FROM a
                WHERE attempt_count = 1 AND send_count = 1)  AS flashes,
              (SELECT g.grade_name FROM a JOIN grades g USING (grade_id)
                WHERE a.send_count > 0
                ORDER BY g.level DESC LIMIT 1)               AS highest_sent_grade,
              (SELECT g.level FROM a JOIN grades g USING (grade_id)
                WHERE a.send_count > 0
                ORDER BY g.level DESC LIMIT 1)               AS highest_sent_level`,
      [userId, start, end],
    );
    // The aggregate always yields exactly one row, even with no matching data.
    return (
      rows[0] ?? {
        sessions: 0,
        climbing_days: 0,
        minutes: 0,
        routes: 0,
        attempts: 0,
        sends: 0,
        flashes: 0,
        highest_sent_grade: null,
        highest_sent_level: null,
      }
    );
  },

  /**
   * One row per calendar month over `[startMonth, endMonth]`, inclusive, with
   * empty months present and zeroed — the charts need a continuous x-axis, and
   * `generate_series` fills the gaps far more cheaply than the client can.
   */
  async findMonthlySeries(
    userId: number,
    startMonth: string,
    endMonth: string,
  ): Promise<MonthlyActivity[]> {
    const { rows } = await query<MonthlyActivity>(
      `SELECT to_char(m.month, 'YYYY-MM')                        AS month,
              COUNT(DISTINCT s.session_id)::int                  AS sessions,
              COALESCE(SUM(a.attempt_count), 0)::int             AS attempts,
              COALESCE(SUM(a.send_count), 0)::int                AS sends,
              MAX(g.level) FILTER (WHERE a.send_count > 0)       AS max_sent_level
         FROM generate_series(
                ($2 || '-01')::date, ($3 || '-01')::date, INTERVAL '1 month'
              ) AS m(month)
         LEFT JOIN sessions s
                ON s.user_id = $1
               AND date_trunc('month', s.visit_date) = m.month
         LEFT JOIN attempts a ON a.session_id = s.session_id
         LEFT JOIN routes   r ON r.route_id   = a.route_id
         LEFT JOIN grades   g ON g.grade_id   = r.grade_id
        GROUP BY m.month
        ORDER BY m.month`,
      [userId, startMonth, endMonth],
    );
    return rows;
  },

  /**
   * How many consecutive weeks up to `today` contain a session.
   *
   * Weeks rather than days on purpose: a streak counted in days breaks the
   * moment a climber takes the rest day their fingers need, which punishes
   * exactly the behaviour the app should encourage. The current week not having
   * one yet does not break the run either — it may only be Tuesday — so the
   * count is allowed to start from last week.
   *
   * `today` comes from the client, because the server's date can be a different
   * day in the climber's timezone and a streak is exactly the figure a reader
   * would notice being off by one.
   *
   * Gaps-and-islands: numbering the distinct weeks newest-first and adding
   * `rn` weeks back onto each makes every consecutive run share one constant,
   * so the newest run is the rows whose constant matches row 1's.
   */
  async findStreakWeeks(userId: number, today: string): Promise<number> {
    const { rows } = await query<{ streak: number }>(
      `WITH bounds AS (
         SELECT date_trunc('week', $2::date)::date AS this_week
       ), weeks AS (
         SELECT DISTINCT date_trunc('week', visit_date)::date AS wk
           FROM sessions, bounds
          WHERE user_id = $1 AND visit_date <= bounds.this_week + 6
       ), ranked AS (
         SELECT wk, ROW_NUMBER() OVER (ORDER BY wk DESC) AS rn FROM weeks
       ), islands AS (
         SELECT wk, rn, wk + (rn * INTERVAL '7 days') AS run FROM ranked
       )
       SELECT COALESCE((
         SELECT COUNT(*)::int
           FROM islands, bounds
          WHERE run = (SELECT run FROM islands WHERE rn = 1)
            -- A run that ended before last week is over, not current.
            AND (SELECT wk FROM islands WHERE rn = 1) >= bounds.this_week - 7
       ), 0) AS streak`,
      [userId, today],
    );
    return rows[0]?.streak ?? 0;
  },

  /** The climber's hardest sends, hardest first. Ties break to the more recent. */
  async findPersonalRecords(
    userId: number,
    limit: number,
  ): Promise<PersonalRecord[]> {
    const { rows } = await query<PersonalRecord>(
      `SELECT a.attempt_id,
              g.grade_name,
              g.level AS grade_level,
              r.route_name,
              s.gym_name,
              s.visit_date
         FROM attempts a
         JOIN sessions s USING (session_id)
         JOIN routes   r USING (route_id)
         JOIN grades   g USING (grade_id)
        WHERE s.user_id = $1 AND a.send_count > 0
        ORDER BY g.level DESC, s.visit_date DESC, a.attempt_id DESC
        LIMIT $2`,
      [userId, limit],
    );
    return rows;
  },
};
