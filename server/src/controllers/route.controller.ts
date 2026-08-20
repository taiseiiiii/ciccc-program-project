import type { Request, Response } from 'express';
import { routeRepository } from '../repositories/route.repository';
import { HttpError } from '../utils/HttpError';
import { parseId } from '../utils/validate';

/**
 * HTTP layer for routes (climbing problems). Read-only.
 *
 * `routes` has no owner column of its own — see route.repository.ts — so both
 * reads are scoped through the caller's attempts, and a route behind somebody
 * else's climb is a 404 rather than a row.
 *
 * There is no POST: routes are created with their attempt by POST /sessions,
 * inside one transaction. There is deliberately no PATCH or DELETE either.
 * Editing a route is editing the grade and name of an already-logged climb, so
 * it belongs to PATCH /attempts where ownership is actually checked; the
 * previous unscoped versions here let any authenticated caller re-grade or
 * delete any other climber's logged route.
 */
export const routeController = {
  // GET /api/v1/routes
  async list(req: Request, res: Response): Promise<void> {
    const routes = await routeRepository.findAllForUser(req.user!.user_id);
    res.json({ data: routes });
  },

  // GET /api/v1/routes/:id
  async get(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const route = await routeRepository.findByIdForUser(id, req.user!.user_id);
    if (!route) {
      throw HttpError.notFound(`Route ${id} not found`);
    }
    res.json({ data: route });
  },
};
