import { Router } from 'express';
import { routeController } from '../controllers/route.controller';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Read-only, and scoped to the caller's own climbs.
//
// No POST: routes are created together with their attempt by POST /sessions,
// inside one transaction. No PATCH or DELETE either — `routes` carries no owner
// column, so those could not tell whose logged climb they were rewriting.
// Editing a climb's grade or name goes through PATCH /attempts.
router.get('/', asyncHandler(routeController.list));
router.get('/:id', asyncHandler(routeController.get));

export default router;
