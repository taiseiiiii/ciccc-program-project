import { Router } from "express";
import { shareEventController } from "../controllers/shareEvent.controller";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Write-only by design. Nothing in the app reads these back — the question
// they answer ("which template is used?") is asked with SQL, not by a screen,
// and a read endpoint would be a surface with no caller.
router.post("/", asyncHandler(shareEventController.create));

export default router;
