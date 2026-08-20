import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Profile of the authenticated caller. No /users/:id — users can only see
// themselves, so the id is always the token's.
router.get('/me', asyncHandler(userController.me));
router.patch('/me', asyncHandler(userController.update));
// Closes the account (status -> withdrawn). Does not erase the climbing log.
router.delete('/me', asyncHandler(userController.withdraw));

export default router;
