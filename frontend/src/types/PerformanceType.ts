import type ClimbingStats from "./ClimbingStatsType";

/** The structured analysis stored in a performance's `analysis_data`. */
export interface PerformanceAnalysisData {
  headline: string;
  /** The V-grade the climber is trending toward, e.g. "V5". */
  grade_projection: string;
  strengths: string[];
  weaknesses: string[];
  focus_advice: string;
  stats: ClimbingStats;
}

export default interface Performance {
  performance_id: number;
  user_id: number;
  period_type: "daily" | "monthly";
  period_start: string; // YYYY-MM-DD
  period_end: string; // YYYY-MM-DD
  performance_report: string | null;
  ai_model: string | null;
  analysis_data: PerformanceAnalysisData | null;
  created_at: string;
  updated_at: string;
}
