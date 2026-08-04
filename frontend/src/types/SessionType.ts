export default interface Session {
  session_id: number;
  user_id: number;
  visit_date: string; // YYYY-MM-DD
  gym_name: string | null;
  created_at: string;
  updated_at: string;
  attempts?: AttemptInSession[];
}

export interface AttemptInSession {
  attempt_id?: number | string;
  session_id?: number | string;
  route_id?: number | string;
  route_name?: string;
  is_success: boolean;
  note?: string;
  grade?: {
    grade_id: number | string;
    grade_name: string;
  };
  grade_name?: string;
}
