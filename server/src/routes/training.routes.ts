import { Router } from "express";
import { trainingController } from "../controllers/training.controller";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.get("/", asyncHandler(trainingController.list));
router.post("/", asyncHandler(trainingController.create));
router.get("/:id", asyncHandler(trainingController.get));
// PATCH reaches only title / user_note / is_pinned — the generated plan and
// its stats snapshot are immutable.
router.patch("/:id", asyncHandler(trainingController.update));
router.delete("/:id", asyncHandler(trainingController.remove));

export default router;
