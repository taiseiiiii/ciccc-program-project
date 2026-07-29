import { Router } from 'express';
import { goalController } from '../controllers/goal.controller';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/', asyncHandler(goalController.list));
router.post('/', asyncHandler(goalController.create));
router.get('/:id', asyncHandler(goalController.get));
router.patch('/:id', asyncHandler(goalController.update));
router.delete('/:id', asyncHandler(goalController.remove));

export default router;
