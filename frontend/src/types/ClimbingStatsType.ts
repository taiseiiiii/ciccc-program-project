/** Attempts vs. sends for one grade within an analyzed period. */
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

/** A climber's note on a logged climb, with context. */
export interface AttemptNote {
  visit_date: string; // YYYY-MM-DD
  grade_name: string;
  route_name: string | null;
  is_success: boolean;
  note: string;
}

/** A body part that was unhealed when the report was generated. */
export interface ActiveInjurySummary {
  body_part: string;
  status: string;
  severity: number | null;
}

/**
 * The aggregated numbers an AI report was computed from. Stored inside
 * `analysis_data` as a snapshot, so a report stays interpretable even after
 * the underlying sessions are edited or deleted.
 *
 * Fields added after the first release are optional: reports generated before
 * then are still in the database and still render, they just carry less.
 */
export default interface ClimbingStats {
  period_start: string; // YYYY-MM-DD
  period_end: string; // YYYY-MM-DD
  total_sessions: number;
  /** Distinct routes logged. Added with the one-row-per-route change. */
  total_routes?: number;
  /** Tries across every route. */
  total_attempts: number;
  total_sends: number;
  /** Sends / attempts as a percentage (0–100, one decimal). */
  success_rate: number;
  /** Routes sent first try. */
  flash_count?: number;
  /** Mean tries taken on the routes that were sent. */
  avg_tries_to_send?: number | null;
  /** Total minutes on the wall across the period. */
  total_minutes?: number;
  highest_sent_grade: string | null;
  highest_attempted_grade: string | null;
  grade_breakdown: GradeBreakdown[];
  wall_breakdown?: TagBreakdown[];
  hold_breakdown?: TagBreakdown[];
  /** What the climber themselves blamed, most cited first. */
  self_reported_weaknesses?: Array<{ label: string; count: number }>;
  active_injuries?: ActiveInjurySummary[];
  gyms: string[];
  notes: AttemptNote[];
}
