import type { Request, Response } from 'express';
import { attemptRepository } from '../repositories/attempt.repository';
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
 * HTTP layer for attempts. Keeps validation + status codes here and delegates
 * all persistence to the repository.
 */
export const attemptController = {
  // GET /api/v1/attempts        (optionally ?session_id=123)
  async list(req: Request, res: Response): Promise<void> {
    let sessionId: number | undefined;
    const raw = req.query.session_id;
    if (raw !== undefined) {
      sessionId = Number(raw);
      if (!Number.isInteger(sessionId) || sessionId <= 0) {
        throw HttpError.badRequest('session_id query param must be a positive integer');
      }
    }
    const attempts = await attemptRepository.findAll(sessionId);
    res.json({ data: attempts });
  },

  // GET /api/v1/attempts/:id
  async get(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const attempt = await attemptRepository.findById(id);
    if (!attempt) {
      throw HttpError.notFound(`Attempt ${id} not found`);
    }
    res.json({ data: attempt });
  },

  // POST /api/v1/attempts
  async create(req: Request, res: Response): Promise<void> {
    const { session_id, route_id, is_success, note } = req.body ?? {};

    if (!Number.isInteger(session_id) || session_id <= 0) {
      throw HttpError.badRequest('session_id is required and must be a positive integer');
    }
    if (!Number.isInteger(route_id) || route_id <= 0) {
      throw HttpError.badRequest('route_id is required and must be a positive integer');
    }
    if (is_success !== undefined && typeof is_success !== 'boolean') {
      throw HttpError.badRequest('is_success must be a boolean');
    }
    if (note !== undefined && note !== null && typeof note !== 'string') {
      throw HttpError.badRequest('note must be a string');
    }

    const attempt = await attemptRepository.create({ session_id, route_id, is_success, note });
    res.status(201).json({ data: attempt });
  },

  // PATCH /api/v1/attempts/:id
  async update(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const { route_id, is_success, note } = req.body ?? {};

    if (route_id !== undefined && (!Number.isInteger(route_id) || route_id <= 0)) {
      throw HttpError.badRequest('route_id must be a positive integer');
    }
    if (is_success !== undefined && typeof is_success !== 'boolean') {
      throw HttpError.badRequest('is_success must be a boolean');
    }
    if (note !== undefined && note !== null && typeof note !== 'string') {
      throw HttpError.badRequest('note must be a string');
    }

    const attempt = await attemptRepository.update(id, { route_id, is_success, note });
    if (!attempt) {
      throw HttpError.notFound(`Attempt ${id} not found`);
    }
    res.json({ data: attempt });
  },

  // DELETE /api/v1/attempts/:id
  async remove(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const deleted = await attemptRepository.remove(id);
    if (!deleted) {
      throw HttpError.notFound(`Attempt ${id} not found`);
    }
    res.status(204).send();
  },
};
