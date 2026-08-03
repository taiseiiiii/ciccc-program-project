import { Router } from 'express';
import { routeController } from '../controllers/route.controller';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// No POST here: routes are created together with their attempt via
// POST /sessions (nested `attempts`), inside one transaction.
router.get('/', asyncHandler(routeController.list));
router.get('/:id', asyncHandler(routeController.get));
router.patch('/:id', asyncHandler(routeController.update));
router.delete('/:id', asyncHandler(routeController.remove));

export default router;
