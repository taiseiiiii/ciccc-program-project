import type { Request, Response } from 'express';
import { gradeRepository } from '../repositories/grade.repository';
import { HttpError } from '../utils/HttpError';

/** Parse and validate a numeric route param (e.g. :id). */
function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw HttpError.badRequest(`Invalid id: ${raw}`);
  }
  return id;
}

/**
 * HTTP layer for grades. Grades are read-only master data (the V0–V17 scale is
 * created by the seed), so only list/get are exposed.
 */
export const gradeController = {
  // GET /api/v1/grades
  async list(_req: Request, res: Response): Promise<void> {
    const grades = await gradeRepository.findAll();
    res.json({ data: grades });
  },

  // GET /api/v1/grades/:id
  async get(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const grade = await gradeRepository.findById(id);
    if (!grade) {
      throw HttpError.notFound(`Grade ${id} not found`);
    }
    res.json({ data: grade });
  },
};
