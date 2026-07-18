import type { Request, Response } from 'express';
import { goalRepository } from '../repositories/goal.repository';
import { HttpError } from '../utils/HttpError';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse and validate a numeric route param (e.g. :id). */
function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw HttpError.badRequest(`Invalid id: ${raw}`);
  }
  return id;
}

/**
 * HTTP layer for goals. Keeps validation + status codes here and delegates all
 * persistence to the repository.
 */
export const goalController = {
  // GET /api/v1/goals        (optionally ?user_id=123)
  async list(req: Request, res: Response): Promise<void> {
    let userId: number | undefined;
    const raw = req.query.user_id;
    if (raw !== undefined) {
      userId = Number(raw);
      if (!Number.isInteger(userId) || userId <= 0) {
        throw HttpError.badRequest('user_id query param must be a positive integer');
      }
    }
    const goals = await goalRepository.findAll(userId);
    res.json({ data: goals });
  },

  // GET /api/v1/goals/:id
  async get(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const goal = await goalRepository.findById(id);
    if (!goal) {
      throw HttpError.notFound(`Goal ${id} not found`);
    }
    res.json({ data: goal });
  },

  // POST /api/v1/goals
  async create(req: Request, res: Response): Promise<void> {
    const { user_id, grade_id, goal_description, target_date } = req.body ?? {};

    if (!Number.isInteger(user_id) || user_id <= 0) {
      throw HttpError.badRequest('user_id is required and must be a positive integer');
    }
    if (!Number.isInteger(grade_id) || grade_id <= 0) {
      throw HttpError.badRequest('grade_id is required and must be a positive integer');
    }
    if (goal_description !== undefined && goal_description !== null && typeof goal_description !== 'string') {
      throw HttpError.badRequest('goal_description must be a string');
    }
    if (target_date !== undefined && target_date !== null && (typeof target_date !== 'string' || !DATE_RE.test(target_date))) {
      throw HttpError.badRequest('target_date must be a YYYY-MM-DD date');
    }

    const goal = await goalRepository.create({ user_id, grade_id, goal_description, target_date });
    res.status(201).json({ data: goal });
  },

  // PATCH /api/v1/goals/:id
  async update(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const { grade_id, goal_description, is_achieved, target_date } = req.body ?? {};

    if (grade_id !== undefined && (!Number.isInteger(grade_id) || grade_id <= 0)) {
      throw HttpError.badRequest('grade_id must be a positive integer');
    }
    if (goal_description !== undefined && goal_description !== null && typeof goal_description !== 'string') {
      throw HttpError.badRequest('goal_description must be a string');
    }
    if (is_achieved !== undefined && typeof is_achieved !== 'boolean') {
      throw HttpError.badRequest('is_achieved must be a boolean');
    }
    if (target_date !== undefined && target_date !== null && (typeof target_date !== 'string' || !DATE_RE.test(target_date))) {
      throw HttpError.badRequest('target_date must be a YYYY-MM-DD date');
    }

    const goal = await goalRepository.update(id, { grade_id, goal_description, is_achieved, target_date });
    if (!goal) {
      throw HttpError.notFound(`Goal ${id} not found`);
    }
    res.json({ data: goal });
  },

  // DELETE /api/v1/goals/:id
  async remove(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const deleted = await goalRepository.remove(id);
    if (!deleted) {
      throw HttpError.notFound(`Goal ${id} not found`);
    }
    res.status(204).send();
  },
};
