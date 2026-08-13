/** Attempts vs. sends for one grade within an analyzed period. */
export interface GradeBreakdown {
  grade_name: string;
  level: number;
  attempts: number;
  sends: number;
}

/** A climber's note on an attempt, with context. */
export interface AttemptNote {
  visit_date: string; // YYYY-MM-DD
  grade_name: string;
  route_name: string | null;
  is_success: boolean;
  note: string;
}

/**
 * The aggregated numbers an AI report was computed from. Stored inside
 * `analysis_data` as a snapshot, so a report stays interpretable even after
 * the underlying sessions are edited or deleted.
 */
export default interface ClimbingStats {
  period_start: string; // YYYY-MM-DD
  period_end: string; // YYYY-MM-DD
  total_sessions: number;
  total_attempts: number;
  total_sends: number;
  /** Sends / attempts as a percentage (0–100, one decimal). */
  success_rate: number;
  highest_sent_grade: string | null;
  highest_attempted_grade: string | null;
  grade_breakdown: GradeBreakdown[];
  gyms: string[];
  notes: AttemptNote[];
}
