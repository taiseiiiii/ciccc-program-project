import { Router } from 'express';
import { gradeController } from '../controllers/grade.controller';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Grades are read-only reference data.
router.get('/', asyncHandler(gradeController.list));
router.get('/:id', asyncHandler(gradeController.get));

export default router;
