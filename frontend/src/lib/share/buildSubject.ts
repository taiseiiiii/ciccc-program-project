import { totalSends, totalTries, type AttemptRecord } from "../../types/AttemptType";
import type SessionType from "../../types/SessionType";
import type Stats from "../../types/StatsType";
import type {
  ClimbSubject,
  GradeTally,
  MonthSubject,
  SessionSubject,
} from "./types";

/**
 * Turning what a screen already has into what a card is allowed to show.
 *
 * The parameters are deliberately `Pick`ed down to the exact fields a card
 * uses, rather than taking `AttemptRecord` whole. Callers still pass the whole
 * row — TypeScript accepts that — but inside these functions the private
 * fields do not exist.
 *
 * That is doing real work. Writing each result as an explicit object literal
 * would already make TypeScript reject a stray `note:` through its excess
 * property check, but that check has a hole: it does not apply to spreads. A
 * later `return { ...climb, template: "climb" }` would compile happily and put
 * a climber's private reflection — their note, their "fear of falling" tag —
 * onto an image bound for Instagram. With the input narrowed, the same spread
 * can only ever produce fields that were already cleared for publication.
 *
 * No requests are made here either. The three cards are built from data the
 * calling screen has already fetched — the climb list, the visit, the stats
 * response — so opening the share sheet costs nothing.
 */

/** Exactly what a climb card reads. Notably not `note` or `weaknesses`. */
type ShareableClimb = Pick<
  AttemptRecord,
  | "grade_name"
  | "grade_level"
  | "route_name"
  | "attempt_count"
  | "send_count"
  | "wall_types"
  | "hold_types"
>;

/** Exactly what the visit itself contributes. */
type ShareableSession = Pick<
  SessionType,
  "gym_name" | "visit_date" | "duration_minutes"
>;

/** Exactly what the month card reads out of the stats response. */
type ShareableStats = Pick<Stats, "month" | "current_month" | "grade_breakdown">;

/** Sort hardest first, which is the order a climber reads their own card in. */
function byLevelDesc<T extends { level: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.level - a.level);
}

/** One logged route, from the climb list on a visit. */
export function climbSubject(
  climb: ShareableClimb,
  session: Pick<ShareableSession, "gym_name" | "visit_date">,
): ClimbSubject {
  return {
    template: "climb",
    grade: climb.grade_name,
    routeName: climb.route_name,
    attemptCount: climb.attempt_count,
    sendCount: climb.send_count,
    wallLabels: climb.wall_types.map((tag) => tag.label),
    holdLabels: climb.hold_types.map((tag) => tag.label),
    gymName: session.gym_name,
    date: session.visit_date,
  };
}

/**
 * One visit, from its climbs.
 *
 * The grade tallies are folded up here rather than asked of the server: the
 * climb list is already on screen, and a visit holds a dozen rows at most.
 */
export function sessionSubject(
  session: ShareableSession,
  climbs: ShareableClimb[],
): SessionSubject {
  const byGrade = new Map<string, GradeTally & { level: number }>();
  for (const climb of climbs) {
    const tally = byGrade.get(climb.grade_name) ?? {
      grade: climb.grade_name,
      level: climb.grade_level,
      attempts: 0,
      sends: 0,
    };
    tally.attempts += climb.attempt_count;
    tally.sends += climb.send_count;
    byGrade.set(climb.grade_name, tally);
  }

  // The hardest grade *sent*, not the hardest tried. A card that celebrates a
  // V7 nobody topped out would be read as a lie by the only audience that
  // matters — the climbers who were there.
  const sent = climbs.filter((climb) => climb.send_count > 0);
  const best = sent.reduce<ShareableClimb | null>(
    (hardest, climb) =>
      hardest === null || climb.grade_level > hardest.grade_level ? climb : hardest,
    null,
  );

  return {
    template: "session",
    date: session.visit_date,
    gymName: session.gym_name,
    climbCount: climbs.length,
    totalAttempts: totalTries(climbs),
    totalSends: totalSends(climbs),
    highestGrade: best?.grade_name ?? null,
    grades: byLevelDesc([...byGrade.values()]).map(({ grade, attempts, sends }) => ({
      grade,
      attempts,
      sends,
    })),
    durationMinutes: session.duration_minutes,
  };
}

/**
 * One calendar month, straight off the stats response the Progress screen
 * already holds. `GET /stats?month=` counts all of this in SQL.
 */
export function monthSubject(stats: ShareableStats): MonthSubject {
  const totals = stats.current_month;
  return {
    template: "month",
    month: stats.month,
    sessions: totals.sessions,
    climbingDays: totals.climbing_days,
    routes: totals.routes,
    attempts: totals.attempts,
    sends: totals.sends,
    flashes: totals.flashes,
    highestGrade: totals.highest_sent_grade,
    grades: byLevelDesc(stats.grade_breakdown)
      // Grades nobody touched this month would draw as empty columns.
      .filter((row) => row.attempts > 0)
      .map((row) => ({ grade: row.grade_name, attempts: row.attempts, sends: row.sends })),
  };
}
