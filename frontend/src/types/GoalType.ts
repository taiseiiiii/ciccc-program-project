export default interface Goal {
  goal_id: number;
  user_id: number;
  grade_id: number;
  goal_description: string | null;
  is_achieved: boolean;
  achieved_at: string | null;
  target_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoalCreate {
  grade_id: number;
  goal_description?: string | null;
  target_date?: string | null;
}

export interface GoalUpdate {
  grade_id?: number;
  goal_description?: string | null;
  is_achieved?: boolean;
  target_date?: string | null;
}
