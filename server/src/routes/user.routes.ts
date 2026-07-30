import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Profile of the authenticated caller. No /users/:id — users can only see themselves.
router.get('/me', asyncHandler(userController.me));

export default router;
