import type { Request, Response } from "express";
import { performanceRepository } from "../repositories/performance.repository";
import { statsRepository } from "../repositories/stats.repository";
import { goalRepository, type GoalWithGrade } from "../repositories/goal.repository";
import { aiService, type GoalSummary } from "../services/ai.service";
import { env } from "../config/env";
import { HttpError } from "../utils/HttpError";
import { isDateString, monthBounds, todayString } from "../utils/period";

/** Parse and validate a numeric route param (e.g. :id). */
function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw HttpError.badRequest(`Invalid id: ${raw}`);
  }
  return id;
}

function toGoalSummaries(goals: GoalWithGrade[]): GoalSummary[] {
  return goals.map((g) => ({
    target_grade: g.grade_name,
    description: g.goal_description,
    target_date: g.target_date,
    is_achieved: g.is_achieved,
  }));
}

/**
 * HTTP layer for AI performance reports. POST aggregates the period's
 * sessions/attempts, asks the AI coach for an analysis and stores the result
 * as an immutable snapshot; the GETs just read those snapshots back.
 * All routes sit behind requireAuth, so req.user is always set; the owner is
 * taken from the token, never the body. A row owned by someone else is
 * indistinguishable from a missing one (404).
 */
export const performanceController = {
  // GET /api/v1/performances?period_type=daily|monthly&limit=n
  async list(req: Request, res: Response): Promise<void> {
    const { period_type, limit } = req.query;

    if (
      period_type !== undefined &&
      period_type !== "daily" &&
      period_type !== "monthly"
    ) {
      throw HttpError.badRequest("period_type must be 'daily' or 'monthly'");
    }
    let parsedLimit: number | undefined;
    if (limit !== undefined) {
      parsedLimit = Number(limit);
      if (!Number.isInteger(parsedLimit) || parsedLimit <= 0 || parsedLimit > 100) {
        throw HttpError.badRequest("limit must be an integer between 1 and 100");
      }
    }

    const performances = await performanceRepository.findAll(
      req.user!.user_id,
      { periodType: period_type as "daily" | "monthly" | undefined, limit: parsedLimit },
    );
    res.json({ data: performances });
  },

  // GET /api/v1/performances/:id
  async get(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const performance = await performanceRepository.findById(
      id,
      req.user!.user_id,
    );
    if (!performance) {
      throw HttpError.notFound(`Performance ${id} not found`);
    }
    res.json({ data: performance });
  },

  // POST /api/v1/performances
  // Body: { period_type: 'daily' | 'monthly', date?: 'YYYY-MM-DD' }
  // `date` anchors the period (any day of the target day/month) and defaults
  // to today. Generation is synchronous — the AI round-trip takes seconds.
  async create(req: Request, res: Response): Promise<void> {
    const { period_type, date } = req.body ?? {};

    if (period_type !== "daily" && period_type !== "monthly") {
      throw HttpError.badRequest(
        "period_type is required and must be 'daily' or 'monthly'",
      );
    }
    if (date !== undefined && !isDateString(date)) {
      throw HttpError.badRequest("date must be a YYYY-MM-DD date");
    }

    const anchor = date ?? todayString();
    const { start, end } =
      period_type === "daily"
        ? { start: anchor, end: anchor }
        : monthBounds(anchor);

    const userId = req.user!.user_id;
    const stats = await statsRepository.forPeriod(userId, start, end);
    if (stats.total_attempts === 0) {
      throw HttpError.unprocessable(
        `No climbing data between ${start} and ${end} — log a session first`,
      );
    }

    const goals = toGoalSummaries(await goalRepository.findAllWithGrade(userId));
    const { report, ...analysis } = await aiService.generatePerformanceAnalysis(
      period_type,
      stats,
      goals,
    );

    const performance = await performanceRepository.create({
      user_id: userId,
      period_type,
      period_start: start,
      period_end: end,
      performance_report: report,
      ai_model: env.openaiModel,
      // The structured analysis plus the exact stats it was computed from, so
      // the report stays interpretable even after sessions are edited.
      analysis_data: { ...analysis, stats },
    });
    res.status(201).json({ data: performance });
  },

  // DELETE /api/v1/performances/:id
  async remove(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const deleted = await performanceRepository.remove(id, req.user!.user_id);
    if (!deleted) {
      throw HttpError.notFound(`Performance ${id} not found`);
    }
    res.status(204).send();
  },
};
