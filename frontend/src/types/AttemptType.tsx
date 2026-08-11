/** Draft attempt as edited in the LogSession form (not yet persisted). */
export default interface Attempt {
  id: number;
  grade_name: string;
  is_success: boolean;
  route_name: string;
  note: string;
}

/**
 * Attempt as returned by GET /api/v1/attempts — the `attempts` row plus the
 * route name and grade the server joins in for display.
 */
export interface AttemptRecord {
  attempt_id: number;
  session_id: number;
  route_id: number;
  is_success: boolean;
  note: string | null;
  route_name: string | null;
  grade_name: string;
  grade_level: number;
  created_at: string;
  updated_at: string;
}
