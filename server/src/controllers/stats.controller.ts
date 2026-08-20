import type { Request, Response } from "express";
import { statsRepository } from "../repositories/stats.repository";
import { sessionRepository } from "../repositories/session.repository";
import { HttpError } from "../utils/HttpError";
import {
  addMonths,
  dayAfter,
  daysBefore,
  isDateString,
  isMonthString,
  monthRange,
  todayString,
} from "../utils/period";

/**
 * Everything the Dashboard and Progress screens display, counted in SQL.
 *
 * Both screens used to fetch `GET /sessions` and `GET /attempts` — the
 * climber's entire history, unpaginated — and derive every figure in
 * JavaScript. That is fine for a demo account and untenable for someone two
 * years in: thousands of rows over mobile data, on every open, to render about
 * forty numbers.
 *
 * So this endpoint answers with the forty numbers. One response serves both
 * screens rather than one endpoint each: what they show overlaps heavily, and
 * splitting it would mean two round trips to draw one page.
 *
 * `month` and `today` both come from the client. The server's own date can be a
 * different day in the climber's timezone, and "this month" and "streak" are
 * exactly the figures a reader notices being off by one.
 */

// The dashboard's bar and line charts show the current month plus four back.
const MONTHS_SHOWN = 5;
// The heatmap's window. Not a calendar month — it always ends today.
const ACTIVITY_DAYS = 30;
// "Recent activity" on the dashboard. Two was short enough that a week of
// climbing looked like most of it had failed to save.
const RECENT_SESSIONS = 5;
const PERSONAL_RECORDS = 3;

/** Sends / attempts as a percentage (0–100, one decimal). 0 when no attempts. */
function successRate(sends: number, attempts: number): number {
  return attempts === 0 ? 0 : Math.round((sends / attempts) * 1000) / 10;
}

/** Totals plus the derived rate, which is the shape every card wants. */
function withRate<T extends { sends: number; attempts: number }>(totals: T) {
  return { ...totals, success_rate: successRate(totals.sends, totals.attempts) };
}

export const statsController = {
  // GET /api/v1/stats?month=YYYY-MM&today=YYYY-MM-DD
  async get(req: Request, res: Response): Promise<void> {
    const { month, today } = req.query;

    if (month !== undefined && !isMonthString(month)) {
      throw HttpError.badRequest("month must be a YYYY-MM value");
    }
    if (today !== undefined && !isDateString(today)) {
      throw HttpError.badRequest("today must be a YYYY-MM-DD date");
    }

    const anchor = today ?? todayString();
    const targetMonth = month ?? anchor.slice(0, 7);
    const userId = req.user!.user_id;

    const thisMonth = monthRange(targetMonth);
    const lastMonth = monthRange(addMonths(targetMonth, -1));
    // The heatmap window is half-open like everything else, so its end is the
    // day after today — otherwise today's own sessions fall outside it.
    const activity = {
      start: daysBefore(anchor, ACTIVITY_DAYS - 1),
      end: dayAfter(anchor),
    };

    const [
      lifetime,
      current,
      previous,
      months,
      daily,
      gradeBreakdown,
      wallBreakdown,
      holdBreakdown,
      streakWeeks,
      personalRecords,
      recentSessions,
    ] = await Promise.all([
      statsRepository.findTotals(userId, null, null),
      statsRepository.findTotals(userId, thisMonth.start, thisMonth.end),
      statsRepository.findTotals(userId, lastMonth.start, lastMonth.end),
      statsRepository.findMonthlySeries(
        userId,
        addMonths(targetMonth, -(MONTHS_SHOWN - 1)),
        targetMonth,
      ),
      statsRepository.findDailyActivity(userId, activity.start, activity.end),
      statsRepository.findGradeBreakdown(userId, thisMonth.start, thisMonth.end),
      statsRepository.findWallBreakdown(userId, thisMonth.start, thisMonth.end),
      statsRepository.findHoldBreakdown(userId, thisMonth.start, thisMonth.end),
      statsRepository.findStreakWeeks(userId, anchor),
      statsRepository.findPersonalRecords(userId, PERSONAL_RECORDS),
      sessionRepository.findAll(userId, RECENT_SESSIONS),
    ]);

    res.json({
      data: {
        month: targetMonth,
        today: anchor,
        lifetime: withRate(lifetime),
        current_month: withRate(current),
        previous_month: withRate(previous),
        months,
        daily,
        grade_breakdown: gradeBreakdown,
        wall_breakdown: wallBreakdown,
        hold_breakdown: holdBreakdown,
        streak_weeks: streakWeeks,
        personal_records: personalRecords,
        recent_sessions: recentSessions,
      },
    });
  },
};
