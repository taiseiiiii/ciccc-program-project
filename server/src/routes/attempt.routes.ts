import { Router } from 'express';
import { attemptController } from '../controllers/attempt.controller';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// No POST here: attempts are created with their session via POST /sessions
// (nested `attempts`), inside one transaction.
router.get('/', asyncHandler(attemptController.list));
router.get('/:id', asyncHandler(attemptController.get));
router.patch('/:id', asyncHandler(attemptController.update));
router.delete('/:id', asyncHandler(attemptController.remove));

export default router;
