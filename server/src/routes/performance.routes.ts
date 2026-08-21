import { Router } from "express";
import { performanceController } from "../controllers/performance.controller";
import { asyncHandler } from "../utils/asyncHandler";
import { aiQuota } from "../middleware/aiQuota";

const router = Router();

router.get("/", asyncHandler(performanceController.list));
// One paid model call per request — the only endpoint here that is
// rate-limited, counted per climber against the rows already generated.
router.post("/", aiQuota, asyncHandler(performanceController.create));
router.get("/:id", asyncHandler(performanceController.get));
// PATCH reaches only title / user_note / is_pinned — the generated report and
// its stats snapshot are immutable.
router.patch("/:id", asyncHandler(performanceController.update));
router.delete("/:id", asyncHandler(performanceController.remove));

export default router;
