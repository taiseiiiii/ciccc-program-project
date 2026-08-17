/**
 * An injury the climber is tracking.
 *
 * Scope note that the shape reflects: the app records injuries and manages
 * load. It holds no diagnosis and no treatment plan — what is stored is what
 * the climber can observe, and what the AI coach needs in order to route a
 * training plan around the hurt body part.
 */
export default interface Injury {
  injury_id: number;
  user_id: number;
  body_part_id: number;
  side: "left" | "right" | "both" | null;
  occurred_on: string; // YYYY-MM-DD
  /** active = limits climbing · recovering = returning to load · healed = history */
  status: "active" | "recovering" | "healed";
  severity: number | null; // 1..5
  description: string | null;
  resolved_on: string | null;
  body_part_code: string;
  body_part_label: string;
  /** Most recent check-in, joined in so a list needs no extra request. */
  latest_pain_level: number | null;
  latest_logged_on: string | null;
  created_at: string;
  updated_at: string;
}

/** One daily pain check-in. At most one per injury per day. */
export interface InjuryLog {
  injury_log_id: number;
  injury_id: number;
  logged_on: string; // YYYY-MM-DD
  pain_level: number; // 0..10
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface InjuryCreate {
  body_part_id: number;
  occurred_on: string;
  side?: "left" | "right" | "both" | null;
  severity?: number | null;
  description?: string | null;
}

export interface InjuryUpdate {
  body_part_id?: number;
  occurred_on?: string;
  side?: "left" | "right" | "both" | null;
  status?: "active" | "recovering" | "healed";
  severity?: number | null;
  description?: string | null;
}
