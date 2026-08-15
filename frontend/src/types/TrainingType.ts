import type ClimbingStats from "./ClimbingStatsType";

/** One recommended exercise inside a training plan. */
export interface TrainingDrill {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  /** How often, e.g. "2x per week, 20 min". */
  frequency: string;
}

/** The structured plan stored in a training's `analysis_data`. */
export interface TrainingPlanData {
  headline: string;
  focus: string;
  /** Ordered most important first. */
  drills: TrainingDrill[];
  stats: ClimbingStats;
}

export default interface Training {
  training_id: number;
  user_id: number;
  training_report: string | null;
  ai_model: string | null;
  analysis_data: TrainingPlanData | null;
  created_at: string;
  updated_at: string;
}
