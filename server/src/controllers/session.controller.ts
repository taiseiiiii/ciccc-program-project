import type { Request, Response } from 'express';
import { sessionRepository } from '../repositories/session.repository';
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
 * HTTP layer for sessions. Keeps validation + status codes here and delegates
 * all persistence to the repository. All routes sit behind requireAuth, so
 * req.user is always set; the owner is taken from the token, never the body.
 * A row owned by someone else is indistinguishable from a missing one (404).
 */
export const sessionController = {
  // GET /api/v1/sessions
  async list(req: Request, res: Response): Promise<void> {
    const sessions = await sessionRepository.findAll(req.user!.user_id);
    res.json({ data: sessions });
  },

  // GET /api/v1/sessions/:id
  async get(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const session = await sessionRepository.findById(id, req.user!.user_id);
    if (!session) {
      throw HttpError.notFound(`Session ${id} not found`);
    }
    res.json({ data: session });
  },

  // POST /api/v1/sessions
  async create(req: Request, res: Response): Promise<void> {
    const { visit_date, gym_name } = req.body ?? {};

    if (typeof visit_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(visit_date)) {
      throw HttpError.badRequest('visit_date is required and must be a YYYY-MM-DD date');
    }
    if (gym_name !== undefined && gym_name !== null && typeof gym_name !== 'string') {
      throw HttpError.badRequest('gym_name must be a string');
    }

    const session = await sessionRepository.create({
      user_id: req.user!.user_id,
      visit_date,
      gym_name,
    });
    res.status(201).json({ data: session });
  },

  // PATCH /api/v1/sessions/:id
  async update(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const { visit_date, gym_name } = req.body ?? {};

    if (visit_date !== undefined && (typeof visit_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(visit_date))) {
      throw HttpError.badRequest('visit_date must be a YYYY-MM-DD date');
    }
    if (gym_name !== undefined && gym_name !== null && typeof gym_name !== 'string') {
      throw HttpError.badRequest('gym_name must be a string');
    }

    const session = await sessionRepository.update(id, req.user!.user_id, { visit_date, gym_name });
    if (!session) {
      throw HttpError.notFound(`Session ${id} not found`);
    }
    res.json({ data: session });
  },

  // DELETE /api/v1/sessions/:id
  async remove(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const deleted = await sessionRepository.remove(id, req.user!.user_id);
    if (!deleted) {
      throw HttpError.notFound(`Session ${id} not found`);
    }
    res.status(204).send();
  },
};
