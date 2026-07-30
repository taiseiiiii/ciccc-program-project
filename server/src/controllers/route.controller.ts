import type { Request, Response } from 'express';
import { routeRepository } from '../repositories/route.repository';
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
 * HTTP layer for routes (climbing problems). Keeps validation + status codes
 * here and delegates all persistence to the repository.
 */
export const routeController = {
  // GET /api/v1/routes
  async list(_req: Request, res: Response): Promise<void> {
    const routes = await routeRepository.findAll();
    res.json({ data: routes });
  },

  // GET /api/v1/routes/:id
  async get(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const route = await routeRepository.findById(id);
    if (!route) {
      throw HttpError.notFound(`Route ${id} not found`);
    }
    res.json({ data: route });
  },

  // POST /api/v1/routes
  async create(req: Request, res: Response): Promise<void> {
    const { grade_id, route_name } = req.body ?? {};

    if (!Number.isInteger(grade_id) || grade_id <= 0) {
      throw HttpError.badRequest('grade_id is required and must be a positive integer');
    }
    if (route_name !== undefined && route_name !== null && typeof route_name !== 'string') {
      throw HttpError.badRequest('route_name must be a string');
    }

    const route = await routeRepository.create({ grade_id, route_name });
    res.status(201).json({ data: route });
  },

  // PATCH /api/v1/routes/:id
  async update(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const { grade_id, route_name } = req.body ?? {};

    if (grade_id !== undefined && (!Number.isInteger(grade_id) || grade_id <= 0)) {
      throw HttpError.badRequest('grade_id must be a positive integer');
    }
    if (route_name !== undefined && route_name !== null && typeof route_name !== 'string') {
      throw HttpError.badRequest('route_name must be a string');
    }

    const route = await routeRepository.update(id, { grade_id, route_name });
    if (!route) {
      throw HttpError.notFound(`Route ${id} not found`);
    }
    res.json({ data: route });
  },

  // DELETE /api/v1/routes/:id
  async remove(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const deleted = await routeRepository.remove(id);
    if (!deleted) {
      throw HttpError.notFound(`Route ${id} not found`);
    }
    res.status(204).send();
  },
};
