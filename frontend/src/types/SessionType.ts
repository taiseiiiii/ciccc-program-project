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
