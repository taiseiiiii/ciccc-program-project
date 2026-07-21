import { Router } from 'express';
import { attemptController } from '../controllers/attempt.controller';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/', asyncHandler(attemptController.list));
router.post('/', asyncHandler(attemptController.create));
router.get('/:id', asyncHandler(attemptController.get));
router.patch('/:id', asyncHandler(attemptController.update));
router.delete('/:id', asyncHandler(attemptController.remove));

export default router;
