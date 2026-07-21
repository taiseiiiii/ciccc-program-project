import { Router } from 'express';
import { routeController } from '../controllers/route.controller';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/', asyncHandler(routeController.list));
router.post('/', asyncHandler(routeController.create));
router.get('/:id', asyncHandler(routeController.get));
router.patch('/:id', asyncHandler(routeController.update));
router.delete('/:id', asyncHandler(routeController.remove));

export default router;
