import { Router } from "express";
import { statsController } from "../controllers/stats.controller";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Read-only aggregates for the Progress screen. Derived on every request —
// there is nothing to create, update or delete here.
router.get("/", asyncHandler(statsController.monthly));

export default router;
