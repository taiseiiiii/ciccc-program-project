import { Router } from "express";
import { statsController } from "../controllers/stats.controller";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// One aggregated payload for the Dashboard and Progress screens.
// GET /api/v1/stats?month=YYYY-MM&today=YYYY-MM-DD
router.get("/", asyncHandler(statsController.get));

export default router;
