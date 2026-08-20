import type SessionType from "./SessionType";
import type { TagBreakdown } from "./ClimbingStatsType";

/**
 * What `GET /stats` returns — every figure the Dashboard and Progress screens
 * display, counted in SQL.
 *
 * Both screens used to fetch the climber's entire unpaginated history and
 * derive all of this in JavaScript. The shapes below mirror the server's
 * `PeriodTotals` / `MonthlyActivity` / `PersonalRecord`; see
 * server/src/repositories/stats.repository.ts.
 */

/** Headline figures for one range — a month, or all of time. */
export interface PeriodTotals {
  sessions: number;
  /** Distinct visit dates. Two sessions in one day are one climbing day. */
  climbing_days: number;
  /** Minutes on the wall. 0 when nobody recorded a duration. */
  minutes: number;
  /** Rows in `attempts` — routes touched, not tries. */
  routes: number;
  /** Tries across every route. */
  attempts: number;
  sends: number;
  /** Routes sent first try. */
  flashes: number;
  /** Sends / attempts as a percentage (0–100, one decimal). */
  success_rate: number;
  highest_sent_grade: string | null;
  highest_sent_level: number | null;
}

/** One calendar month, for the multi-month charts. */
export interface MonthlyActivity {
  month: string; // 'YYYY-MM'
  sessions: number;
  attempts: number;
  sends: number;
  /** Null for a month with no sends, so the line shows a gap rather than V0. */
  max_sent_level: number | null;
}

/** One day inside the heatmap window. Empty days are present, with zeros. */
export interface DailyActivity {
  date: string; // 'YYYY-MM-DD'
  sessions: number;
  attempts: number;
}

/** Attempt/send counts for one grade inside the reported month. */
export interface MonthlyGradeBreakdown {
  grade_id: number;
  grade_name: string;
  level: number;
  attempts: number;
  sends: number;
  fails: number;
}

/** A hard send, with the context needed to display it. */
export interface PersonalRecord {
  attempt_id: number;
  grade_name: string;
  grade_level: number;
  route_name: string | null;
  gym_name: string | null;
  visit_date: string;
}

export default interface Stats {
  month: string; // 'YYYY-MM'
  today: string; // 'YYYY-MM-DD'
  lifetime: PeriodTotals;
  current_month: PeriodTotals;
  previous_month: PeriodTotals;
  /** The reported month plus the four before it, oldest first. */
  months: MonthlyActivity[];
  /** The 30 days ending on `today`. */
  daily: DailyActivity[];
  grade_breakdown: MonthlyGradeBreakdown[];
  /**
   * By wall angle. A route tagged with two angles contributes its full try
   * count to each, so each bar's own rate is meaningful but the sum across
   * bars is not the month's total.
   */
  wall_breakdown: TagBreakdown[];
  hold_breakdown: TagBreakdown[];
  /** Consecutive weeks up to `today` containing a session. */
  streak_weeks: number;
  /** The three hardest sends of all time, hardest first. */
  personal_records: PersonalRecord[];
  /** The five most recent visits. */
  recent_sessions: SessionType[];
}
