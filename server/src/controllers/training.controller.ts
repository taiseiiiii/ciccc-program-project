import type { Request, Response } from "express";
import { trainingRepository } from "../repositories/training.repository";
import { statsRepository } from "../repositories/stats.repository";
import { goalRepository, type GoalWithGrade } from "../repositories/goal.repository";
import { aiService, type GoalSummary } from "../services/ai.service";
import { env } from "../config/env";
import { HttpError } from "../utils/HttpError";
import { daysBefore, isDateString, todayString } from "../utils/period";

// A training plan looks at a rolling window of recent climbing rather than a
// calendar period — long enough to see patterns, short enough to stay current.
const TRAINING_WINDOW_DAYS = 30;

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
 * HTTP layer for AI training plans. POST aggregates the last 30 days of
 * climbing, asks the AI coach for a plan and stores the result as an
 * immutable snapshot; the GETs just read those snapshots back.
 * All routes sit behind requireAuth, so req.user is always set; the owner is
 * taken from the token, never the body. A row owned by someone else is
 * indistinguishable from a missing one (404).
 */
export const trainingController = {
  // GET /api/v1/trainings?limit=n
  async list(req: Request, res: Response): Promise<void> {
    const { limit } = req.query;
    let parsedLimit: number | undefined;
    if (limit !== undefined) {
      parsedLimit = Number(limit);
      if (!Number.isInteger(parsedLimit) || parsedLimit <= 0 || parsedLimit > 100) {
        throw HttpError.badRequest("limit must be an integer between 1 and 100");
      }
    }

    const trainings = await trainingRepository.findAll(
      req.user!.user_id,
      parsedLimit,
    );
    res.json({ data: trainings });
  },

  // GET /api/v1/trainings/:id
  async get(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const training = await trainingRepository.findById(id, req.user!.user_id);
    if (!training) {
      throw HttpError.notFound(`Training ${id} not found`);
    }
    res.json({ data: training });
  },

  // POST /api/v1/trainings
  // Body: { date?: 'YYYY-MM-DD' } — the end of the 30-day window the plan is
  // based on, defaulting to today. Generation is synchronous.
  async create(req: Request, res: Response): Promise<void> {
    const { date } = req.body ?? {};
    if (date !== undefined && !isDateString(date)) {
      throw HttpError.badRequest("date must be a YYYY-MM-DD date");
    }

    const end = date ?? todayString();
    const start = daysBefore(end, TRAINING_WINDOW_DAYS - 1);

    const userId = req.user!.user_id;
    const stats = await statsRepository.forPeriod(userId, start, end);
    if (stats.total_attempts === 0) {
      throw HttpError.unprocessable(
        `No climbing data in the last ${TRAINING_WINDOW_DAYS} days — log a session first`,
      );
    }

    const goals = toGoalSummaries(await goalRepository.findAllWithGrade(userId));
    const { report, ...plan } = await aiService.generateTrainingPlan(
      stats,
      goals,
    );

    const training = await trainingRepository.create({
      user_id: userId,
      training_report: report,
      ai_model: env.openaiModel,
      // The structured plan plus the exact stats it was computed from, so the
      // plan stays interpretable even after sessions are edited.
      analysis_data: { ...plan, stats },
    });
    res.status(201).json({ data: training });
  },

  // DELETE /api/v1/trainings/:id
  async remove(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const deleted = await trainingRepository.remove(id, req.user!.user_id);
    if (!deleted) {
      throw HttpError.notFound(`Training ${id} not found`);
    }
    res.status(204).send();
  },
};
