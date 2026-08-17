import type ClimbingStats from "./ClimbingStatsType";

/** One recommended exercise inside a training plan. */
export interface TrainingDrill {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  /** How often, e.g. "2x per week, 20 min". */
  frequency: string;
}

/**
 * The structured plan stored in a training's `analysis_data`.
 *
 * `removed_for_injury` lists drills the server dropped because they would have
 * loaded an injured body part. It is surfaced in the UI rather than hidden —
 * a plan that quietly got shorter reads as a worse plan.
 */
export interface TrainingPlanData {
  summary?: string;
  /** @deprecated Superseded by `summary`. Kept for plans saved before it. */
  headline?: string;
  focus: string;
  /** Ordered most important first. */
  drills: TrainingDrill[];
  removed_for_injury?: string[];
  stats: ClimbingStats;
}

export default interface Training {
  training_id: number;
  user_id: number;
  /** The long-form narrative. Immutable — the AI's words are never rewritten. */
  training_report: string | null;
  ai_model: string | null;
  analysis_data: TrainingPlanData | null;
  /** The climber's own layer, and the only editable part of a plan. */
  title: string | null;
  user_note: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

/** What PATCH /trainings/:id accepts. */
export interface TrainingUpdate {
  title?: string | null;
  user_note?: string | null;
  is_pinned?: boolean;
}
