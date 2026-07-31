import { Router } from 'express';
import { sessionController } from '../controllers/session.controller';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/', asyncHandler(sessionController.list));
router.post('/', asyncHandler(sessionController.create));
router.get('/:id', asyncHandler(sessionController.get));
router.patch('/:id', asyncHandler(sessionController.update));
router.delete('/:id', asyncHandler(sessionController.remove));

export default router;
