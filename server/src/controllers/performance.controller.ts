import type { Request, Response } from "express";
import { performanceRepository } from "../repositories/performance.repository";
import { statsRepository } from "../repositories/stats.repository";
import { goalRepository } from "../repositories/goal.repository";
import { aiService, toGoalSummaries } from "../services/ai.service";
import { env } from "../config/env";
import { HttpError } from "../utils/HttpError";
import { isDateString, monthBounds, todayString } from "../utils/period";
import {
  optionalBoolean,
  optionalString,
  parseId,
  parseLimit,
  parseOffset,
  parseQueryBoolean,
} from "../utils/validate";

/**
 * HTTP layer for AI performance reports. POST aggregates the period's
 * sessions/attempts, asks the AI coach for an analysis and stores the result
 * as an immutable snapshot; the GETs just read those snapshots back.
 * All routes sit behind requireAuth, so req.user is always set; the owner is
 * taken from the token, never the body. A row owned by someone else is
 * indistinguishable from a missing one (404).
 */
export const performanceController = {
  // GET /api/v1/performances?period_type=daily|monthly&is_pinned=&limit=&offset=
  async list(req: Request, res: Response): Promise<void> {
    const { period_type, limit, offset, is_pinned } = req.query;

    if (
      period_type !== undefined &&
      period_type !== "daily" &&
      period_type !== "monthly"
    ) {
      throw HttpError.badRequest("period_type must be 'daily' or 'monthly'");
    }
    const parsedLimit = parseLimit(limit);
    const parsedOffset = parseOffset(offset);

    const page = await performanceRepository.findPage(req.user!.user_id, {
      periodType: period_type as "daily" | "monthly" | undefined,
      isPinned: parseQueryBoolean(is_pinned, "is_pinned"),
      limit: parsedLimit,
      offset: parsedOffset,
    });

    res.json({
      data: page.rows,
      meta: { total: page.total, limit: parsedLimit, offset: parsedOffset },
    });
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
    // `detail` is the long-form text and lands in the TEXT column; everything
    // else — including the two-line `summary` the screen leads with — is
    // structured and lands in analysis_data.
    const { detail, ...analysis } = await aiService.generatePerformanceAnalysis(
      period_type,
      stats,
      goals,
    );

    const performance = await performanceRepository.create({
      user_id: userId,
      period_type,
      period_start: start,
      period_end: end,
      performance_report: detail,
      ai_model: env.openaiModel,
      // The structured analysis plus the exact stats it was computed from, so
      // the report stays interpretable even after sessions are edited.
      analysis_data: { ...analysis, stats },
    });
    res.status(201).json({ data: performance });
  },

  // PATCH /api/v1/performances/:id
  // Body: { title?, user_note?, is_pinned? }
  //
  // Only the climber's own layer. The AI text and the stats snapshot are not
  // editable: a report is worth reviewing precisely because it still says what
  // it said when it was generated.
  async update(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const { title, user_note, is_pinned } = req.body ?? {};

    for (const frozen of ["performance_report", "analysis_data", "period_type"]) {
      if (req.body?.[frozen] !== undefined) {
        throw HttpError.badRequest(
          `${frozen} cannot be edited — it is the generated snapshot`,
        );
      }
    }

    const performance = await performanceRepository.update(id, req.user!.user_id, {
      title: optionalString(title, "title", 120),
      user_note: optionalString(user_note, "user_note", 4000),
      is_pinned: optionalBoolean(is_pinned, "is_pinned"),
    });
    if (!performance) {
      throw HttpError.notFound(`Performance ${id} not found`);
    }
    res.json({ data: performance });
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
