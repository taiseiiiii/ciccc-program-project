import type { Request, Response } from "express";
import { trainingRepository } from "../repositories/training.repository";
import { statsRepository } from "../repositories/stats.repository";
import { goalRepository, type GoalWithGrade } from "../repositories/goal.repository";
import { injuryRepository } from "../repositories/injury.repository";
import {
  aiService,
  filterUnsafeDrills,
  type GoalSummary,
} from "../services/ai.service";
import { env } from "../config/env";
import { HttpError } from "../utils/HttpError";
import { daysBefore, isDateString, todayString } from "../utils/period";
import { optionalBoolean, optionalString, parseId } from "../utils/validate";

// A training plan looks at a rolling window of recent climbing rather than a
// calendar period — long enough to see patterns, short enough to stay current.
const TRAINING_WINDOW_DAYS = 30;

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
    const { detail, ...plan } = await aiService.generateTrainingPlan(stats, goals);

    // Second line of defence on the injury guardrail. The prompt already tells
    // the model not to load an injured body part; this checks that it did not,
    // because "the model was instructed to" is not a control and a hangboard
    // drill handed to someone with a torn pulley is the one failure here that
    // does real harm. What was dropped is reported, not hidden.
    const injuredParts = await injuryRepository.findActiveBodyParts(userId);
    const { drills, removed } = filterUnsafeDrills(
      plan.drills,
      stats.active_injuries,
      injuredParts.map((p) => p.code),
    );

    const training = await trainingRepository.create({
      user_id: userId,
      training_report: detail,
      ai_model: env.openaiModel,
      // The structured plan plus the exact stats it was computed from, so the
      // plan stays interpretable even after sessions are edited.
      analysis_data: {
        ...plan,
        drills,
        removed_for_injury: removed,
        stats,
      },
    });
    res.status(201).json({ data: training });
  },

  // PATCH /api/v1/trainings/:id
  // Body: { title?, user_note?, is_pinned? } — the climber's own layer only.
  // The generated plan itself is frozen so a review can compare what was
  // prescribed with what actually happened.
  async update(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const { title, user_note, is_pinned } = req.body ?? {};

    for (const frozen of ["training_report", "analysis_data"]) {
      if (req.body?.[frozen] !== undefined) {
        throw HttpError.badRequest(
          `${frozen} cannot be edited — it is the generated snapshot`,
        );
      }
    }

    const training = await trainingRepository.update(id, req.user!.user_id, {
      title: optionalString(title, "title", 120),
      user_note: optionalString(user_note, "user_note", 4000),
      is_pinned: optionalBoolean(is_pinned, "is_pinned"),
    });
    if (!training) {
      throw HttpError.notFound(`Training ${id} not found`);
    }
    res.json({ data: training });
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
