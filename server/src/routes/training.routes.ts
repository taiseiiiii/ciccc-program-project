import { Router } from "express";
import { trainingController } from "../controllers/training.controller";
import { asyncHandler } from "../utils/asyncHandler";
import { aiLimiter } from "../middleware/rateLimit";

const router = Router();

router.get("/", asyncHandler(trainingController.list));
// One paid model call per request — the only endpoint here that is
// rate-limited, keyed by the authenticated climber.
router.post("/", aiLimiter, asyncHandler(trainingController.create));
router.get("/:id", asyncHandler(trainingController.get));
// PATCH reaches only title / user_note / is_pinned — the generated plan and
// its stats snapshot are immutable.
router.patch("/:id", asyncHandler(trainingController.update));
router.delete("/:id", asyncHandler(trainingController.remove));

export default router;
