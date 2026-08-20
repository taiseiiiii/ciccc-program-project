import type { Request, Response } from "express";
import { goalRepository } from "../repositories/goal.repository";
import { gradeRepository } from "../repositories/grade.repository";
import { HttpError } from "../utils/HttpError";
import {
  optionalBoolean,
  optionalDate,
  optionalInt,
  optionalString,
  parseId,
  requireInt,
} from "../utils/validate";

// Long enough for a real note about a project, short enough that the column is
// not an open-ended text field the UI has to defend against.
const MAX_DESCRIPTION = 2000;

/** Reject a grade_id that does not exist, so the FK never surfaces as a 409. */
async function assertGradeExists(id: number): Promise<void> {
  const grade = await gradeRepository.findById(id);
  if (!grade) {
    throw HttpError.badRequest(`grade_id ${id} does not reference a known grade`);
  }
}

/**
 * HTTP layer for goals. Keeps validation + status codes here and delegates all
 * persistence to the repository. All routes sit behind requireAuth, so
 * req.user is always set; the owner is taken from the token, never the body.
 * A row owned by someone else is indistinguishable from a missing one (404).
 */
export const goalController = {
  // GET /api/v1/goals
  async list(req: Request, res: Response): Promise<void> {
    const goals = await goalRepository.findAll(req.user!.user_id);
    res.json({ data: goals });
  },

  // GET /api/v1/goals/:id
  async get(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const goal = await goalRepository.findById(id, req.user!.user_id);
    if (!goal) {
      throw HttpError.notFound(`Goal ${id} not found`);
    }
    res.json({ data: goal });
  },

  // POST /api/v1/goals
  // Body: { grade_id, goal_description?, target_date? }
  async create(req: Request, res: Response): Promise<void> {
    const { grade_id, goal_description, target_date } = req.body ?? {};

    const gradeId = requireInt(grade_id, "grade_id");
    await assertGradeExists(gradeId);

    const goal = await goalRepository.create({
      user_id: req.user!.user_id,
      grade_id: gradeId,
      goal_description: optionalString(
        goal_description,
        "goal_description",
        MAX_DESCRIPTION,
      ),
      target_date: optionalDate(target_date, "target_date"),
    });
    res.status(201).json({ data: goal });
  },

  // PATCH /api/v1/goals/:id
  // Body: { grade_id?, goal_description?, is_achieved?, target_date? }
  async update(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const { grade_id, goal_description, is_achieved, target_date } =
      req.body ?? {};

    const gradeId = optionalInt(grade_id, "grade_id", { min: 1 });
    if (gradeId === null) {
      throw HttpError.badRequest("grade_id cannot be cleared");
    }
    if (gradeId !== undefined) {
      await assertGradeExists(gradeId);
    }

    const goal = await goalRepository.update(id, req.user!.user_id, {
      grade_id: gradeId,
      goal_description: optionalString(
        goal_description,
        "goal_description",
        MAX_DESCRIPTION,
      ),
      is_achieved: optionalBoolean(is_achieved, "is_achieved"),
      target_date: optionalDate(target_date, "target_date"),
    });
    if (!goal) {
      throw HttpError.notFound(`Goal ${id} not found`);
    }
    res.json({ data: goal });
  },

  // DELETE /api/v1/goals/:id
  async remove(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const deleted = await goalRepository.remove(id, req.user!.user_id);
    if (!deleted) {
      throw HttpError.notFound(`Goal ${id} not found`);
    }
    res.status(204).send();
  },
};
