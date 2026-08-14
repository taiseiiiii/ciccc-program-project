import type { Request, Response } from "express";
import {
  statsRepository,
  type GradeBreakdown,
} from "../repositories/stats.repository";
import { HttpError } from "../utils/HttpError";

const MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;

/** A grade as reported to the client — the label plus its position on the scale. */
interface GradeRef {
  grade_name: string;
  level: number;
}

/**
 * 'YYYY-MM' -> ['YYYY-MM-01', first day of the next month).
 *
 * Deliberately string/integer math instead of `new Date()`: `visit_date` is a
 * plain DATE, and building the boundaries from a Date would apply the server's
 * timezone and could shift them by a day.
 */
function monthRange(month: string): { start: string; end: string } {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  return {
    start: `${month}-01`,
    end: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
  };
}

/** 'YYYY-MM' -> the month before it. */
function previousMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const prevYear = monthNumber === 1 ? year - 1 : year;
  const prevMonth = monthNumber === 1 ? 12 : monthNumber - 1;
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
}

/**
 * The `?month=` value, or the current UTC month when it is omitted. Clients
 * should send their own local month — the server has no way to know the
 * caller's timezone, and around midnight the two can differ by a day.
 */
function parseMonth(raw: unknown): string {
  if (raw === undefined) {
    return new Date().toISOString().slice(0, 7);
  }
  if (typeof raw !== "string" || !MONTH_PATTERN.test(raw)) {
    throw HttpError.badRequest("month must be a YYYY-MM value, e.g. 2026-08");
  }
  return raw;
}

/** The hardest grade the user actually sent, or null if they sent nothing. */
function highestSentGrade(byGrade: GradeBreakdown[]): GradeRef | null {
  const sent = byGrade.filter((g) => g.sends > 0);
  const hardest = sent[sent.length - 1]; // findGradeBreakdown orders by level
  return hardest ? { grade_name: hardest.grade_name, level: hardest.level } : null;
}

/**
 * The easiest grade above `highest` that the user tried but has not sent —
 * i.e. what they are currently projecting. Null when they sent everything they
 * touched (or logged nothing at all).
 */
function nextProjectGrade(
  byGrade: GradeBreakdown[],
  highest: GradeRef | null,
): GradeRef | null {
  const floor = highest ? highest.level : -1;
  const project = byGrade.find((g) => g.level > floor && g.sends === 0);
  return project ? { grade_name: project.grade_name, level: project.level } : null;
}

/**
 * HTTP layer for the Progress screen's aggregates. Read-only, and behind
 * requireAuth like everything else, so req.user is always set and the numbers
 * are always scoped to the token's owner.
 */
export const statsController = {
  // GET /api/v1/stats?month=YYYY-MM
  async monthly(req: Request, res: Response): Promise<void> {
    const month = parseMonth(req.query.month);
    const userId = req.user!.user_id;

    const current = monthRange(month);
    const previous = monthRange(previousMonth(month));

    // Independent queries — run them concurrently rather than in series.
    const [daily, byGrade, previousTotals] = await Promise.all([
      statsRepository.findDailyActivity(userId, current.start, current.end),
      statsRepository.findGradeBreakdown(userId, current.start, current.end),
      statsRepository.findPeriodTotals(userId, previous.start, previous.end),
    ]);

    const sessions = daily.reduce((total, day) => total + day.sessions, 0);
    const attempts = daily.reduce((total, day) => total + day.attempts, 0);
    const sends = byGrade.reduce((total, grade) => total + grade.sends, 0);
    const highestGrade = highestSentGrade(byGrade);

    let cumulativeSessions = 0;

    res.json({
      data: {
        month,
        summary: {
          sessions,
          attempts,
          sends,
          sessionsChange: sessions - previousTotals.sessions,
          sendsChange: sends - previousTotals.sends,
          // One decimal is enough here, and guards against dividing by zero in
          // a month with no logged sessions.
          avgAttemptsPerSession:
            sessions === 0 ? 0 : Math.round((attempts / sessions) * 10) / 10,
          highestGrade,
          nextGrade: nextProjectGrade(byGrade, highestGrade),
        },
        daily: daily.map((day) => {
          cumulativeSessions += day.sessions;
          return { ...day, cumulativeSessions };
        }),
        byGrade: byGrade.map((grade) => ({
          ...grade,
          successRate: Math.round((grade.sends / grade.attempts) * 100),
        })),
      },
    });
  },
};
