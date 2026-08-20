import { Router } from 'express';
import { sessionController } from '../controllers/session.controller';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/', asyncHandler(sessionController.list));
router.post('/', asyncHandler(sessionController.create));
router.get('/:id', asyncHandler(sessionController.get));
// Nested under the session rather than POST /attempts: a climb only exists
// within a visit, and the session in the path is what ownership is checked
// against — there is no id a caller could supply to reach someone else's.
router.post('/:id/attempts', asyncHandler(sessionController.addAttempt));
router.patch('/:id', asyncHandler(sessionController.update));
router.delete('/:id', asyncHandler(sessionController.remove));

export default router;
