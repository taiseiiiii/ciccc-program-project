import type ClimbingStats from "./ClimbingStatsType";

/**
 * The structured analysis stored in a performance's `analysis_data`.
 *
 * `summary` is the two lines the card leads with; the long-form text lives in
 * `performance_report` and stays collapsed until asked for. `headline` is what
 * `summary` replaced — reports generated before the change still have it, so
 * the UI falls back to it rather than rendering an empty card.
 */
export interface PerformanceAnalysisData {
  summary?: string;
  /** @deprecated Superseded by `summary`. Kept for reports saved before it. */
  headline?: string;
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
  /** The long-form report. Immutable — the AI's words are never rewritten. */
  performance_report: string | null;
  ai_model: string | null;
  analysis_data: PerformanceAnalysisData | null;
  /** The climber's own layer, and the only editable part of a report. */
  title: string | null;
  user_note: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

/** What PATCH /performances/:id accepts. */
export interface PerformanceUpdate {
  title?: string | null;
  user_note?: string | null;
  is_pinned?: boolean;
}
