export default interface Session {
  session_id: number;
  user_id: number;
  visit_date: string; // YYYY-MM-DD
  gym_name: string | null;
  /** Time on the wall in minutes. Null for sessions logged without it. */
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * A visit as GET /sessions returns it: the row plus what happened on it.
 *
 * The counts come from the same query as the row, so a page of twenty sessions
 * renders "8 routes · 5/12 sent" without twenty follow-up requests.
 */
export interface SessionSummary extends Session {
  climb_count: number;
  total_attempts: number;
  total_sends: number;
}
